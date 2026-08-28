import { db } from '../db'
import { supabase, supabaseEnabled } from './supabase'
import { useAuth } from '../store/useAuth'
import { createNewCard, statusForReviewed } from './sm2'
import type { WordEntry, WordMeaning, SrsCard, ReviewLog, SessionStat, Category, Mistake, QuizSession, WrongRecord, DailySettings, StudyPlan } from '../types'

interface CategoryRow {
  id: number
  name: string
  parent_id: number | null
  created_at: number
}
interface WordRow {
  id: number
  text: string
  meanings: WordMeaning[]
  created_at: number
  starred?: boolean
}
interface CardRow {
  id: number
  word_id: number
  ease_factor: number
  interval: number
  repetitions: number
  due_date: number
  last_reviewed: number | null
  last_quality: number | null
  total_reviews: number
  correct_reviews: number
  quiz_wrong_count: number
  status: string
}
interface LogRow {
  id: number
  card_id: number
  word_id: number
  quality: number
  was_correct: boolean
  ts: number
}
interface SessionRow {
  id: number
  date: string
  reviewed: number
  correct: number
  learned: number
}
interface MistakeRow {
  id: number
  word_id: number
  category_id: number
  user_answer: string
  correct_answer: string
  mode: Mistake['mode']
  timed_out: boolean
  resolved: boolean
  created_at: number
}
interface QuizRow {
  id: number
  date: number
  mode: QuizSession['mode']
  total: number
  correct: number
  score: number
  label: string
  size: number
  duration: number
  wrongs: WrongRecord[]
  is_retest?: boolean
}

export interface MigrationResult {
  categories: number
  words: number
  cards: number
  logs: number
  sessions: number
  mistakes: number
  quizSessions: number
}

function remoteActive(): boolean {
  return supabaseEnabled && supabase !== null && useAuth.getState().session !== null
}

async function withFallback<T>(remote: () => Promise<T>, _local: () => Promise<T>): Promise<T> {
  if (!remoteActive()) {
    throw new Error('Supabase 未连接，请先登录')
  }
  try {
    return await remote()
  } catch (e) {
    console.error('[repo] Supabase 操作失败：', e)
    throw e
  }
}

const SELECT_PAGE_SIZE = 1000
const DELETE_CHUNK_SIZE = 500
const IN_CHUNK_SIZE = 500

async function selectAll<T>(table: string): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase!.from(table).select('*').range(from, from + SELECT_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    rows.push(...chunk)
    if (chunk.length < SELECT_PAGE_SIZE) break
    from += SELECT_PAGE_SIZE
  }
  return rows
}

async function deleteAll(table: string): Promise<void> {
  const { error } = await supabase!.from(table).delete().gt('id', 0)
  if (error) throw new Error(error.message)
}

async function insertMapped(table: string, rows: Record<string, unknown>[], concurrency = 8): Promise<number[]> {
  const ids: number[] = new Array(rows.length)
  let i = 0
  const worker = async () => {
    while (i < rows.length) {
      const idx = i++
      const { data, error } = await supabase!.from(table).insert(rows[idx]).select('id').single()
        if (error) throw new Error(error.message)
        ids[idx] = toNum((data as { id: number }).id)
    }
  }
  const n = Math.min(concurrency, Math.max(1, rows.length))
  await Promise.all(Array.from({ length: n }, worker))
  return ids
}

const toNum = (v: unknown): number => Number(v)

const fromCategoryRow = (r: CategoryRow): Category => ({
  id: toNum(r.id),
  name: r.name,
  parentId: r.parent_id == null ? null : toNum(r.parent_id),
  createdAt: toNum(r.created_at),
})
const fromWordRow = (r: WordRow): WordEntry => ({
  id: toNum(r.id),
  text: r.text,
  meanings: (r.meanings ?? []).map((m) => ({ ...m, categoryId: toNum(m.categoryId) })),
  createdAt: toNum(r.created_at),
  starred: r.starred ?? false,
})
const fromCardRow = (r: CardRow): SrsCard => ({
  id: toNum(r.id),
  wordId: toNum(r.word_id),
  easeFactor: r.ease_factor,
  interval: r.interval,
  repetitions: r.repetitions,
  dueDate: toNum(r.due_date),
  lastReviewed: r.last_reviewed == null ? null : toNum(r.last_reviewed),
  lastQuality: r.last_quality == null ? null : toNum(r.last_quality),
  totalReviews: r.total_reviews,
  correctReviews: r.correct_reviews,
  quizWrongCount: r.quiz_wrong_count,
  status: r.status as SrsCard['status'],
})
const fromLogRow = (r: LogRow): ReviewLog => ({
  id: toNum(r.id),
  cardId: toNum(r.card_id),
  wordId: toNum(r.word_id),
  quality: r.quality,
  wasCorrect: r.was_correct,
  timestamp: toNum(r.ts),
})
const fromSessionRow = (r: SessionRow): SessionStat => ({
  id: toNum(r.id),
  date: r.date,
  reviewed: r.reviewed,
  correct: r.correct,
  learned: r.learned,
})
const fromMistakeRow = (r: MistakeRow): Mistake => ({
  id: toNum(r.id),
  wordId: toNum(r.word_id),
  categoryId: toNum(r.category_id),
  userAnswer: r.user_answer,
  correctAnswer: r.correct_answer,
  mode: r.mode,
  timedOut: r.timed_out,
  resolved: r.resolved,
  createdAt: toNum(r.created_at),
})
const fromQuizRow = (r: QuizRow): QuizSession => ({
  id: toNum(r.id),
  date: toNum(r.date),
  mode: r.mode,
  total: r.total,
  correct: r.correct,
  score: r.score,
  label: r.label,
  size: r.size,
  duration: toNum(r.duration),
  wrongs: (r.wrongs ?? []).map((w) => ({ ...w, wordId: toNum(w.wordId), categoryId: toNum(w.categoryId) })),
  isRetest: !!r.is_retest,
})

function cardPatchRow(patch: Partial<SrsCard>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.easeFactor !== undefined) row.ease_factor = patch.easeFactor
  if (patch.interval !== undefined) row.interval = patch.interval
  if (patch.repetitions !== undefined) row.repetitions = patch.repetitions
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate
  if (patch.lastReviewed !== undefined) row.last_reviewed = patch.lastReviewed
  if (patch.lastQuality !== undefined) row.last_quality = patch.lastQuality
  if (patch.totalReviews !== undefined) row.total_reviews = patch.totalReviews
  if (patch.correctReviews !== undefined) row.correct_reviews = patch.correctReviews
  if (patch.quizWrongCount !== undefined) row.quiz_wrong_count = patch.quizWrongCount
  if (patch.status !== undefined) row.status = patch.status
  return row
}

export function repoCategories(): Promise<Category[]> {
  return withFallback(
    async () => (await selectAll<CategoryRow>('categories')).map(fromCategoryRow).sort((a, b) => a.createdAt - b.createdAt || a.id! - b.id!),
    () => db.categories.orderBy('createdAt').toArray(),
  )
}

export function repoWords(): Promise<WordEntry[]> {
  return withFallback(
    async () => (await selectAll<WordRow>('words')).map(fromWordRow),
    async () => (await db.words.toArray()).map((w) => ({ ...w, starred: w.starred ?? false })),
  )
}

export async function repoRandomWord(): Promise<WordEntry | null> {
  if (!remoteActive()) throw new Error('Supabase 未连接，请先登录')
  const { count, error } = await supabase!.from('words').select('*', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  if (!count || count === 0) return null
  const r = Math.floor(Math.random() * count)
  const { data, error: e2 } = await supabase!.from('words').select('*').range(r, r)
  if (e2) throw new Error(e2.message)
  const row = (data ?? [])[0] as WordRow | undefined
  return row ? fromWordRow(row) : null
}

export function repoWordCount(): Promise<number> {
  return withFallback(
    async () => {
      const { count, error } = await supabase!.from('words').select('*', { count: 'exact', head: true })
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    () => db.words.count(),
  )
}

export async function repoWordsByIds(ids: number[]): Promise<Map<number, WordEntry>> {
  if (ids.length === 0) return new Map()
  if (remoteActive()) {
    const chunks: number[][] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) chunks.push(ids.slice(i, i + IN_CHUNK_SIZE))
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase!.from('words').select('*').in('id', chunk)
        if (error) throw new Error(error.message)
        return (data ?? []) as WordRow[]
      }),
    )
    const map = new Map<number, WordEntry>()
    for (const rows of results) {
      for (const r of rows) {
        const w = fromWordRow(r)
        if (w.id !== undefined) map.set(w.id, w)
      }
    }
    return map
  }
  const idSet = new Set(ids)
  const all = await db.words.toArray()
  return new Map(all.filter((w) => w.id !== undefined && idSet.has(w.id)).map((w) => [w.id!, w]))
}

export async function repoCardsByWordIds(ids: number[]): Promise<Map<number, SrsCard>> {
  if (ids.length === 0) return new Map()
  if (remoteActive()) {
    const chunks: number[][] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) chunks.push(ids.slice(i, i + IN_CHUNK_SIZE))
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase!.from('cards').select('*').in('word_id', chunk)
        if (error) throw new Error(error.message)
        return (data ?? []) as CardRow[]
      }),
    )
    const map = new Map<number, SrsCard>()
    for (const rows of results) {
      for (const r of rows) {
        const c = fromCardRow(r)
        map.set(c.wordId, c)
      }
    }
    return map
  }
  const cards = await db.cards.where('wordId').anyOf(ids).toArray()
  return new Map(cards.map((c) => [c.wordId, c]))
}

export function repoCards(): Promise<SrsCard[]> {
  return withFallback(
    async () => (await selectAll<CardRow>('cards')).map(fromCardRow),
    () => db.cards.toArray(),
  )
}

export function repoMistakes(): Promise<Mistake[]> {
  return withFallback(
    async () => (await selectAll<MistakeRow>('mistakes')).map(fromMistakeRow).sort((a, b) => b.createdAt - a.createdAt),
    () => db.mistakes.orderBy('createdAt').reverse().toArray(),
  )
}

export function repoQuizSessions(): Promise<QuizSession[]> {
  return withFallback(
    async () => (await selectAll<QuizRow>('quiz_sessions')).map(fromQuizRow).sort((a, b) => b.date - a.date),
    () => db.quizSessions.orderBy('date').reverse().toArray(),
  )
}

export function repoQuizSessionList(): Promise<QuizSession[]> {
  return withFallback(
    async () => {
      const fetchPages = async (cols: string): Promise<QuizSession[]> => {
        const rows: QuizSession[] = []
        let from = 0
        for (;;) {
          const { data, error } = await supabase!
            .from('quiz_sessions')
            .select(cols)
            .order('date', { ascending: false })
            .range(from, from + SELECT_PAGE_SIZE - 1)
          if (error) throw new Error(error.message)
          const chunk = (data ?? []) as unknown as QuizRow[]
          for (const r of chunk) {
            rows.push(fromQuizRow(r))
          }
          if (chunk.length < SELECT_PAGE_SIZE) break
          from += SELECT_PAGE_SIZE
        }
        return rows
      }
      try {
        return await fetchPages('id,date,mode,total,correct,score,label,size,duration,is_retest')
      } catch {
        return fetchPages('id,date,mode,total,correct,score,label,size,duration')
      }
    },
    () => db.quizSessions.orderBy('date').reverse().toArray(),
  )
}

export function repoQuizSessionWrongs(id: number): Promise<WrongRecord[]> {
  const normalize = (ws: WrongRecord[]): WrongRecord[] => ws.map((w) => ({ ...w, wordId: toNum(w.wordId), categoryId: toNum(w.categoryId) }))
  return withFallback(
    async () => {
      const { data, error } = await supabase!.from('quiz_sessions').select('wrongs').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return normalize(((data as { wrongs?: WrongRecord[] } | null)?.wrongs) ?? [])
    },
    async () => {
      const s = await db.quizSessions.get(id)
      return normalize(s?.wrongs ?? [])
    },
  )
}

export function repoSessions(): Promise<SessionStat[]> {
  return withFallback(
    async () => (await selectAll<SessionRow>('sessions')).map(fromSessionRow).sort((a, b) => a.date.localeCompare(b.date)),
    () => db.sessions.orderBy('date').toArray(),
  )
}

export function repoCreateCategory(name: string, parentId: number | null): Promise<number> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!
        .from('categories')
        .insert({ name, parent_id: parentId, created_at: Date.now() })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return toNum((data as { id: number }).id)
    },
    async () => (await db.categories.add({ name, parentId, createdAt: Date.now() })) as number,
  )
}

export function repoGetCategory(id: number): Promise<Category | undefined> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!.from('categories').select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? fromCategoryRow(data as CategoryRow) : undefined
    },
    () => db.categories.get(id),
  )
}

export function repoUpdateCategoryName(id: number, name: string): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('categories').update({ name }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.categories.update(id, { name })
    },
  )
}

export function repoDeleteCategory(id: number): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('categories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.categories.delete(id)
    },
  )
}

export function repoUpdateWord(wordId: number, data: { text: string; meanings: WordMeaning[] }): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('words').update({ text: data.text, meanings: data.meanings }).eq('id', wordId)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.words.update(wordId, { text: data.text, meanings: data.meanings })
    },
  )
}

export function repoUpdateWordMeanings(wordId: number, meanings: WordMeaning[]): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('words').update({ meanings }).eq('id', wordId)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.words.update(wordId, { meanings })
    },
  )
}

export function repoSetStarred(wordId: number, starred: boolean): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('words').update({ starred }).eq('id', wordId)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.words.update(wordId, { starred })
    },
  )
}

interface SettingsRow {
  id: number
  daily_goal: { newWords: number; reviews: number }
  streak_days: number
  last_checkin_date: string
  today_stats: { newLearned: number; reviewed: number }
  today_date: string
}
function fromSettingsRow(r: SettingsRow): DailySettings {
  return {
    dailyGoal: r.daily_goal ?? { newWords: 10, reviews: 30 },
    streakDays: r.streak_days ?? 0,
    lastCheckinDate: r.last_checkin_date ?? '',
    todayStats: r.today_stats ?? { newLearned: 0, reviewed: 0 },
    todayDate: r.today_date ?? '',
  }
}

export function repoGetDailySettings(): Promise<DailySettings | null> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!.from('user_settings').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return data ? fromSettingsRow(data as SettingsRow) : null
    },
    async () => (await db.userSettings.get(1)) ?? null,
  )
}

export function repoSaveDailySettings(s: DailySettings): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!
        .from('user_settings')
        .upsert(
          {
            daily_goal: s.dailyGoal,
            streak_days: s.streakDays,
            last_checkin_date: s.lastCheckinDate,
            today_stats: s.todayStats,
            today_date: s.todayDate,
          },
          { onConflict: 'user_id' },
        )
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.userSettings.put({ id: 1, ...s })
    },
  )
}

interface StudyPlanRow {
  id: number
  name: string
  category_ids: number[]
  days_of_week: number[]
  time: string
  enabled: boolean
  created_at: number
}
function fromPlanRow(r: StudyPlanRow): StudyPlan {
  return {
    id: toNum(r.id),
    name: r.name,
    categoryIds: Array.isArray(r.category_ids) ? r.category_ids.map(toNum) : [],
    daysOfWeek: Array.isArray(r.days_of_week) ? r.days_of_week.map(toNum) : [],
    time: r.time ?? '09:00',
    enabled: r.enabled ?? true,
    createdAt: toNum(r.created_at),
  }
}

export function repoGetStudyPlans(): Promise<StudyPlan[]> {
  return withFallback(
    async () => (await selectAll<StudyPlanRow>('study_plan')).map(fromPlanRow).sort((a, b) => a.createdAt - b.createdAt),
    async () => (await db.studyPlans.orderBy('createdAt').toArray()),
  )
}

export function repoSaveStudyPlan(plan: StudyPlan): Promise<number> {
  return withFallback(
    async () => {
      if (plan.id) {
        const { error } = await supabase!
          .from('study_plan')
          .update({ name: plan.name, category_ids: plan.categoryIds, days_of_week: plan.daysOfWeek, time: plan.time, enabled: plan.enabled })
          .eq('id', plan.id)
        if (error) throw new Error(error.message)
        return plan.id
      }
      const { data, error } = await supabase!
        .from('study_plan')
        .insert({ name: plan.name, category_ids: plan.categoryIds, days_of_week: plan.daysOfWeek, time: plan.time, enabled: plan.enabled, created_at: plan.createdAt })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return toNum((data as { id: number }).id)
    },
    async () => {
      if (plan.id) {
        await db.studyPlans.put(plan)
        return plan.id
      }
      return (await db.studyPlans.add(plan)) as number
    },
  )
}

export function repoDeleteStudyPlan(id: number): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('study_plan').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.studyPlans.delete(id)
    },
  )
}

export function repoDeleteWordCascade(wordId: number): Promise<void> {
  return withFallback(
    async () => {
      for (const t of ['cards', 'review_logs', 'mistakes'] as const) {
        const { error } = await supabase!.from(t).delete().eq('word_id', wordId)
        if (error) throw new Error(error.message)
      }
      const { error } = await supabase!.from('words').delete().eq('id', wordId)
      if (error) throw new Error(error.message)
    },
    () =>
      db.transaction('rw', db.words, db.cards, db.logs, db.mistakes, async () => {
        await db.cards.where('wordId').equals(wordId).delete()
        await db.logs.where('wordId').equals(wordId).delete()
        await db.mistakes.where('wordId').equals(wordId).delete()
        await db.words.delete(wordId)
      }),
  )
}

export function repoDeleteWordsCascade(wordIds: number[]): Promise<void> {
  if (wordIds.length === 0) return Promise.resolve()
  return withFallback(
    async () => {
      for (let i = 0; i < wordIds.length; i += DELETE_CHUNK_SIZE) {
        const chunk = wordIds.slice(i, i + DELETE_CHUNK_SIZE)
        for (const t of ['cards', 'review_logs', 'mistakes'] as const) {
          const { error } = await supabase!.from(t).delete().in('word_id', chunk)
          if (error) throw new Error(error.message)
        }
        const { error } = await supabase!.from('words').delete().in('id', chunk)
        if (error) throw new Error(error.message)
      }
    },
    async () => {
      await db.cards.where('wordId').anyOf(wordIds).delete()
      await db.logs.where('wordId').anyOf(wordIds).delete()
      await db.mistakes.where('wordId').anyOf(wordIds).delete()
      await db.words.bulkDelete(wordIds)
    },
  )
}

export function repoClearVocabulary(): Promise<number> {
  return withFallback(
    async () => {
      const { count, error: countErr } = await supabase!.from('words').select('*', { count: 'exact', head: true })
      if (countErr) throw new Error(countErr.message)
      for (const t of ['cards', 'review_logs', 'mistakes', 'quiz_sessions', 'quiz_progress', 'words'] as const) {
        await deleteAll(t)
      }
      return count ?? 0
    },
    async () => {
      let count = 0
      await db.transaction('rw', db.words, db.cards, db.logs, db.mistakes, db.quizSessions, async () => {
        count = await db.words.count()
        await db.cards.clear()
        await db.logs.clear()
        await db.mistakes.clear()
        await db.quizSessions.clear()
        await db.words.clear()
      })
      try {
        localStorage.removeItem('vocab-quiz-progress')
      } catch {
        // ignore
      }
      return count
    },
  )
}

export function repoAddWordsWithCards(words: WordEntry[]): Promise<void> {
  if (words.length === 0) return Promise.resolve()
  return withFallback(
    async () => {
      const rows = words.map((w) => ({ text: w.text, meanings: w.meanings, created_at: w.createdAt, starred: w.starred ?? false }))
      const ids = await insertMapped('words', rows)
      const cardRows = ids.map((id) => cardToRow(createNewCard(id)))
      await insertMapped('cards', cardRows)
    },
    async () => {
      const ids = (await db.words.bulkAdd(words, { allKeys: true })) as number[]
      const cards = ids.map((id) => createNewCard(id))
      await db.cards.bulkAdd(cards)
    },
  )
}

export function repoCreateMissingCards(): Promise<number> {
  return withFallback(
    async () => {
      const wordIds: number[] = []
      let from = 0
      for (;;) {
        const { data, error } = await supabase!.from('words').select('id').range(from, from + SELECT_PAGE_SIZE - 1)
        if (error) throw new Error(error.message)
        const chunk = (data ?? []) as { id: number | string }[]
        for (const r of chunk) wordIds.push(toNum(r.id))
        if (chunk.length < SELECT_PAGE_SIZE) break
        from += SELECT_PAGE_SIZE
      }
      const have = new Set<number>()
      from = 0
      for (;;) {
        const { data, error } = await supabase!.from('cards').select('word_id').range(from, from + SELECT_PAGE_SIZE - 1)
        if (error) throw new Error(error.message)
        const chunk = (data ?? []) as { word_id: number | string }[]
        for (const r of chunk) have.add(toNum(r.word_id))
        if (chunk.length < SELECT_PAGE_SIZE) break
        from += SELECT_PAGE_SIZE
      }
      const missing = wordIds.filter((id) => !have.has(id))
      for (let i = 0; i < missing.length; i += IN_CHUNK_SIZE) {
        const chunk = missing.slice(i, i + IN_CHUNK_SIZE).map((id) => cardToRow(createNewCard(id)))
        const { error } = await supabase!.from('cards').insert(chunk)
        if (error) throw new Error(error.message)
      }
      return missing.length
    },
    async () => {
      const [words, cards] = await Promise.all([db.words.toArray(), db.cards.toArray()])
      const have = new Set(cards.map((c) => c.wordId))
      const missing = words.filter((w) => w.id !== undefined && !have.has(w.id)).map((w) => createNewCard(w.id!))
      if (missing.length > 0) await db.cards.bulkAdd(missing)
      return missing.length
    },
  )
}

function deriveCardStatus(c: SrsCard): SrsCard['status'] | null {
  if ((c.totalReviews ?? 0) === 0) return null
  return statusForReviewed(c.repetitions ?? 0, c.interval ?? 0)
}

export async function repoRecomputeCardStatuses(): Promise<number> {
  const cards = await repoCards()
  const updated: SrsCard[] = []
  const remotePatches: { id: number; status: SrsCard['status'] }[] = []
  for (const c of cards) {
    if (c.id === undefined) continue
    const s = deriveCardStatus(c)
    if (s === null || s === c.status) continue
    updated.push({ ...c, status: s })
    remotePatches.push({ id: c.id, status: s })
  }
  if (updated.length === 0) return 0
  if (remoteActive()) {
    let i = 0
    const worker = async () => {
      while (i < remotePatches.length) {
        const idx = i++
        const { error } = await supabase!.from('cards').update({ status: remotePatches[idx].status }).eq('id', remotePatches[idx].id)
        if (error) throw new Error(error.message)
      }
    }
    await Promise.all(Array.from({ length: Math.min(8, remotePatches.length) }, worker))
  } else {
    await db.cards.bulkPut(updated)
  }
  return updated.length
}

function cardToRow(c: SrsCard): Record<string, unknown> {
  return {
    word_id: c.wordId,
    ease_factor: c.easeFactor,
    interval: c.interval,
    repetitions: c.repetitions,
    due_date: c.dueDate,
    last_reviewed: c.lastReviewed,
    last_quality: c.lastQuality,
    total_reviews: c.totalReviews,
    correct_reviews: c.correctReviews,
    quiz_wrong_count: c.quizWrongCount,
    status: c.status,
  }
}

export function repoGetCard(cardId: number): Promise<SrsCard | undefined> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!.from('cards').select('*').eq('id', cardId).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? fromCardRow(data as CardRow) : undefined
    },
    () => db.cards.get(cardId),
  )
}

export function repoCardByWord(wordId: number): Promise<SrsCard | undefined> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!.from('cards').select('*').eq('word_id', wordId).limit(1).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? fromCardRow(data as CardRow) : undefined
    },
    () => db.cards.where('wordId').equals(wordId).first(),
  )
}

export function repoUpdateCard(cardId: number, patch: Partial<SrsCard>): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('cards').update(cardPatchRow(patch)).eq('id', cardId)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.cards.update(cardId, patch)
    },
  )
}

export function repoAddLog(log: ReviewLog): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!
        .from('review_logs')
        .insert({ card_id: log.cardId, word_id: log.wordId, quality: log.quality, was_correct: log.wasCorrect, ts: log.timestamp })
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.logs.add(log)
    },
  )
}

export function repoLogsByWord(wordId: number): Promise<ReviewLog[]> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!
        .from('review_logs')
        .select('*')
        .eq('word_id', wordId)
        .order('ts', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []).map(fromLogRow)
    },
    async () => (await db.logs.where('wordId').equals(wordId).sortBy('timestamp')),
  )
}

export function repoAllLogs(): Promise<ReviewLog[]> {
  return withFallback(
    async () => (await selectAll<LogRow>('review_logs')).map(fromLogRow),
    async () => (await db.logs.toArray()).sort((a, b) => a.timestamp - b.timestamp),
  )
}

export function repoBumpSession(date: string, correct: number, learned: number): Promise<void> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!.from('sessions').select('*').eq('date', date).order('id')
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as SessionRow[]
      if (rows.length > 0) {
        const row = rows[0]
        const { error: upErr } = await supabase!
          .from('sessions')
          .update({ reviewed: row.reviewed + 1, correct: row.correct + correct, learned: row.learned + learned })
          .eq('id', row.id)
        if (upErr) throw new Error(upErr.message)
        if (rows.length > 1) {
          const extraIds = rows.slice(1).map((r) => r.id)
          const { error: delErr } = await supabase!.from('sessions').delete().in('id', extraIds)
          if (delErr) throw new Error(delErr.message)
        }
      } else {
        const { error: insErr } = await supabase!.from('sessions').insert({ date, reviewed: 1, correct, learned })
        if (insErr) throw new Error(insErr.message)
      }
    },
    async () => {
      const existing = await db.sessions.where('date').equals(date).first()
      if (existing && existing.id) {
        await db.sessions.update(existing.id, {
          reviewed: existing.reviewed + 1,
          correct: existing.correct + correct,
          learned: existing.learned + learned,
        })
      } else {
        await db.sessions.add({ date, reviewed: 1, correct, learned })
      }
    },
  )
}

export function repoUpsertMistake(data: Omit<Mistake, 'id' | 'resolved' | 'createdAt'>): Promise<void> {
  return withFallback(
    async () => {
      const { data: existing, error } = await supabase!
        .from('mistakes')
        .select('*')
        .eq('word_id', data.wordId)
        .eq('mode', data.mode)
        .eq('resolved', false)
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const row = {
        word_id: data.wordId,
        category_id: data.categoryId,
        user_answer: data.userAnswer,
        correct_answer: data.correctAnswer,
        mode: data.mode,
        timed_out: data.timedOut,
        created_at: Date.now(),
      }
      if (existing) {
        const { error: upErr } = await supabase!.from('mistakes').update(row).eq('id', (existing as MistakeRow).id)
        if (upErr) throw new Error(upErr.message)
      } else {
        const { error: insErr } = await supabase!.from('mistakes').insert({ ...row, resolved: false })
        if (insErr) throw new Error(insErr.message)
      }
    },
    () =>
      db.transaction('rw', db.mistakes, async () => {
        const existing = await db.mistakes
          .where('wordId')
          .equals(data.wordId)
          .filter((m) => m.resolved === false && m.mode === data.mode)
          .first()
        if (existing && existing.id) {
          await db.mistakes.update(existing.id, {
            userAnswer: data.userAnswer,
            correctAnswer: data.correctAnswer,
            mode: data.mode,
            timedOut: data.timedOut,
            categoryId: data.categoryId,
            createdAt: Date.now(),
          })
        } else {
          await db.mistakes.add({ ...data, resolved: false, createdAt: Date.now() })
        }
      }),
  )
}

export function repoResolveMistakesByWord(wordId: number, mode: Mistake['mode']): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('mistakes').update({ resolved: true }).eq('word_id', wordId).eq('mode', mode).eq('resolved', false)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.mistakes.where('wordId').equals(wordId).filter((m) => !m.resolved && m.mode === mode).modify({ resolved: true })
    },
  )
}

export function repoAddQuizSession(session: Omit<QuizSession, 'id'>): Promise<number> {
  return withFallback(
    async () => {
      const row: Record<string, unknown> = {
        date: session.date,
        mode: session.mode,
        total: session.total,
        correct: session.correct,
        score: session.score,
        label: session.label,
        size: session.size,
        duration: session.duration,
        wrongs: session.wrongs,
        is_retest: session.isRetest ?? false,
      }
      let { data, error } = await supabase!.from('quiz_sessions').insert(row).select('id').single()
      if (error) {
        delete row.is_retest
        ;({ data, error } = await supabase!.from('quiz_sessions').insert(row).select('id').single())
      }
      if (error) throw new Error(error.message)
      return toNum((data as { id: number }).id)
    },
    async () => (await db.quizSessions.add(session)) as number,
  )
}

export function repoDeleteQuizSession(id: number): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('quiz_sessions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    async () => {
      await db.quizSessions.delete(id)
    },
  )
}

export function repoClearQuizSessions(): Promise<number> {
  return withFallback(
    async () => {
      const { count, error } = await supabase!.from('quiz_sessions').select('*', { count: 'exact', head: true })
      if (error) throw new Error(error.message)
      await deleteAll('quiz_sessions')
      return count ?? 0
    },
    async () => {
      const count = await db.quizSessions.count()
      await db.quizSessions.clear()
      return count
    },
  )
}

const QUIZ_PROGRESS_KEY = 'vocab-quiz-progress'

export function repoSaveQuizProgress(state: unknown): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('quiz_progress').upsert({ state }, { onConflict: 'user_id' })
      if (error) throw new Error(error.message)
    },
    () => {
      try {
        localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(state))
      } catch {
        // ignore
      }
      return Promise.resolve()
    },
  )
}

export function repoLoadQuizProgress(): Promise<unknown> {
  return withFallback(
    async () => {
      const { data, error } = await supabase!.from('quiz_progress').select('state').maybeSingle()
      if (error) throw new Error(error.message)
      return data ? ((data as { state: unknown }).state ?? null) : null
    },
    () => {
      try {
        const raw = localStorage.getItem(QUIZ_PROGRESS_KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
  )
}

export function repoClearQuizProgress(): Promise<void> {
  return withFallback(
    async () => {
      const { error } = await supabase!.from('quiz_progress').delete().gt('id', 0)
      if (error) throw new Error(error.message)
    },
    () => {
      try {
        localStorage.removeItem(QUIZ_PROGRESS_KEY)
      } catch {
        // ignore
      }
      return Promise.resolve()
    },
  )
}

export interface BackupData {
  app: string
  version: number
  exportedAt: number
  words: WordEntry[]
  cards: SrsCard[]
  categories: Category[]
  mistakes: Mistake[]
  quizSessions: QuizSession[]
  logs: ReviewLog[]
  sessions: SessionStat[]
}

export async function repoExportAll(): Promise<BackupData> {
  const [words, cards, categories, mistakes, quizSessions, logs, sessions] = await Promise.all([
    repoWords(),
    repoCards(),
    repoCategories(),
    repoMistakes(),
    repoQuizSessions(),
    withFallback(
      async () => (await selectAll<LogRow>('review_logs')).map(fromLogRow),
      () => db.logs.toArray(),
    ),
    repoSessions(),
  ])
  return {
    app: 'vocab-app',
    version: 6,
    exportedAt: Date.now(),
    words,
    cards,
    categories,
    mistakes,
    quizSessions,
    logs,
    sessions,
  }
}

export async function repoImportAll(data: BackupData): Promise<void> {
  if (remoteActive()) {
    try {
      for (const t of ['review_logs', 'quiz_sessions', 'mistakes', 'sessions', 'cards', 'words', 'categories']) {
        await deleteAll(t)
      }
      const sortedCats = [...data.categories].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      const catIds = await insertMapped(
        'categories',
        sortedCats.map((c) => ({ name: c.name, parent_id: null as number | null, created_at: c.createdAt })),
      )
      const catMap = new Map(sortedCats.map((c, i) => [c.id, catIds[i]]))
      for (let i = 0; i < sortedCats.length; i++) {
        const pid = sortedCats[i].parentId
        if (pid !== null && catMap.has(pid)) {
          const { error } = await supabase!.from('categories').update({ parent_id: catMap.get(pid) }).eq('id', catIds[i])
          if (error) throw new Error(error.message)
        }
      }
      const wordIds = await insertMapped(
        'words',
        data.words.map((w) => ({
          text: w.text,
          meanings: w.meanings.map((m) => ({ ...m, categoryId: catMap.get(m.categoryId) ?? m.categoryId })),
          created_at: w.createdAt,
          starred: w.starred ?? false,
        })),
      )
      const wordMap = new Map(data.words.map((w, i) => [w.id, wordIds[i]]))
      const cardIds = await insertMapped(
        'cards',
        data.cards
          .filter((c) => wordMap.has(c.wordId))
          .map((c) => cardToRow({ ...c, wordId: wordMap.get(c.wordId)! })),
      )
      const cardSrc = data.cards.filter((c) => wordMap.has(c.wordId))
      const cardMap = new Map(cardSrc.map((c, i) => [c.id, cardIds[i]]))
      if (data.logs.length > 0) {
        await insertMapped(
          'review_logs',
          data.logs
            .filter((l) => cardMap.has(l.cardId) && wordMap.has(l.wordId))
            .map((l) => ({
              card_id: cardMap.get(l.cardId)!,
              word_id: wordMap.get(l.wordId)!,
              quality: l.quality,
              was_correct: l.wasCorrect,
              ts: l.timestamp,
            })),
        )
      }
      if (data.sessions.length > 0) {
        await insertMapped(
          'sessions',
          data.sessions.map((s) => ({ date: s.date, reviewed: s.reviewed, correct: s.correct, learned: s.learned })),
        )
      }
      if (data.mistakes.length > 0) {
        await insertMapped(
          'mistakes',
          data.mistakes.map((m) => ({
            word_id: wordMap.get(m.wordId) ?? m.wordId,
            category_id: catMap.get(m.categoryId) ?? m.categoryId,
            user_answer: m.userAnswer,
            correct_answer: m.correctAnswer,
            mode: m.mode,
            timed_out: m.timedOut,
            resolved: m.resolved,
            created_at: m.createdAt,
          })),
        )
      }
      if (data.quizSessions.length > 0) {
        await insertMapped(
          'quiz_sessions',
          data.quizSessions.map((s) => ({
            date: s.date,
            mode: s.mode,
            total: s.total,
            correct: s.correct,
            score: s.score,
            label: s.label,
            size: s.size,
            duration: s.duration,
            is_retest: s.isRetest ?? false,
            wrongs: s.wrongs.map((w) => ({
              ...w,
              wordId: wordMap.get(w.wordId) ?? w.wordId,
              categoryId: catMap.get(w.categoryId) ?? w.categoryId,
            })),
          })),
        )
      }
      return
    } catch (e) {
      console.warn('[repo] Supabase 导入失败，回退到本地存储：', e)
    }
  }
  await db.transaction(
    'rw',
    [db.words, db.cards, db.categories, db.mistakes, db.quizSessions, db.logs, db.sessions],
    async () => {
      await Promise.all([
        db.words.clear(),
        db.cards.clear(),
        db.categories.clear(),
        db.mistakes.clear(),
        db.quizSessions.clear(),
        db.logs.clear(),
        db.sessions.clear(),
      ])
      await db.words.bulkAdd(data.words)
      await db.cards.bulkAdd(data.cards)
      await db.categories.bulkAdd(data.categories)
      await db.mistakes.bulkAdd(data.mistakes)
      await db.quizSessions.bulkAdd(data.quizSessions)
      await db.logs.bulkAdd(data.logs)
      await db.sessions.bulkAdd(data.sessions)
    },
  )
}

export async function repoMigrateLocalToRemote(): Promise<MigrationResult> {
  if (!remoteActive()) throw new Error('请先登录后再迁移')
  const [words, cards, categories, mistakes, quizSessions, logs, sessions] = await Promise.all([
    db.words.toArray(),
    db.cards.toArray(),
    db.categories.toArray(),
    db.mistakes.toArray(),
    db.quizSessions.toArray(),
    db.logs.toArray(),
    db.sessions.toArray(),
  ])
  const result: MigrationResult = {
    categories: categories.length,
    words: words.length,
    cards: cards.length,
    logs: logs.length,
    sessions: sessions.length,
    mistakes: mistakes.length,
    quizSessions: quizSessions.length,
  }
  try {
    for (const t of ['review_logs', 'quiz_sessions', 'mistakes', 'sessions', 'cards', 'words', 'categories']) {
      await deleteAll(t)
    }
    const sortedCats = [...categories].sort((a, b) => a.id! - b.id!)
    const catIds = await insertMapped(
      'categories',
      sortedCats.map((c) => ({ name: c.name, parent_id: null as number | null, created_at: c.createdAt })),
    )
    const catMap = new Map<number, number>()
    sortedCats.forEach((c, i) => catMap.set(c.id!, catIds[i]))
    for (let i = 0; i < sortedCats.length; i++) {
      const pid = sortedCats[i].parentId
      if (pid !== null && catMap.has(pid)) {
        const { error } = await supabase!.from('categories').update({ parent_id: catMap.get(pid) }).eq('id', catIds[i])
        if (error) throw new Error(error.message)
      }
    }
    const wordIds = await insertMapped(
      'words',
      words.map((w) => ({
        text: w.text,
        meanings: w.meanings.map((m) => ({ ...m, categoryId: catMap.get(m.categoryId) ?? m.categoryId })),
        created_at: w.createdAt,
        starred: w.starred ?? false,
      })),
    )
    const wordMap = new Map<number, number>()
    words.forEach((w, i) => wordMap.set(w.id!, wordIds[i]))
    const validCards = cards.filter((c) => wordMap.has(c.wordId))
    const cardIds = await insertMapped('cards', validCards.map((c) => cardToRow({ ...c, wordId: wordMap.get(c.wordId)! })))
    const cardMap = new Map<number, number>()
    validCards.forEach((c, i) => cardMap.set(c.id!, cardIds[i]))
    const validLogs = logs.filter((l) => cardMap.has(l.cardId) && wordMap.has(l.wordId))
    if (validLogs.length > 0) {
      await insertMapped(
        'review_logs',
        validLogs.map((l) => ({
          card_id: cardMap.get(l.cardId)!,
          word_id: wordMap.get(l.wordId)!,
          quality: l.quality,
          was_correct: l.wasCorrect,
          ts: l.timestamp,
        })),
      )
    }
    if (sessions.length > 0) {
      await insertMapped(
        'sessions',
        sessions.map((s) => ({ date: s.date, reviewed: s.reviewed, correct: s.correct, learned: s.learned })),
      )
    }
    if (mistakes.length > 0) {
      await insertMapped(
        'mistakes',
        mistakes.map((m) => ({
          word_id: wordMap.get(m.wordId) ?? m.wordId,
          category_id: catMap.get(m.categoryId) ?? m.categoryId,
          user_answer: m.userAnswer,
          correct_answer: m.correctAnswer,
          mode: m.mode,
          timed_out: m.timedOut,
          resolved: m.resolved,
          created_at: m.createdAt,
        })),
      )
    }
    if (quizSessions.length > 0) {
      await insertMapped(
        'quiz_sessions',
        quizSessions.map((s) => ({
          date: s.date,
          mode: s.mode,
          total: s.total,
          correct: s.correct,
          score: s.score,
          label: s.label,
          size: s.size,
          duration: s.duration,
          is_retest: s.isRetest ?? false,
          wrongs: s.wrongs.map((w) => ({
            ...w,
            wordId: wordMap.get(w.wordId) ?? w.wordId,
            categoryId: catMap.get(w.categoryId) ?? w.categoryId,
          })),
        })),
      )
    }
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`迁移失败：${msg}`)
  }
}
