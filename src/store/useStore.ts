import { create } from 'zustand'
import { sm2, QUALITY, type Quality } from '../lib/sm2'
import { parseFile, type ParseResult } from '../lib/parser'
import { getDescendantIds } from '../lib/tree'
import * as repo from '../lib/repo'
import { useDailyGoal } from './dailyGoalStore'
import type { WordEntry, WordMeaning, ReviewLog, Mistake, QuizSession } from '../types'

function localYMD(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Tab = 'home' | 'upload' | 'cards' | 'review' | 'quiz' | 'mistakes' | 'history' | 'stats'

interface QuizSeed {
  words: WordEntry[]
  mode: 'choice' | 'spell' | 'posconv' | 'mixed'
  mixedModes?: Mistake['mode'][]
  retest?: boolean
}

interface StoreState {
  activeTab: Tab
  loading: boolean
  error: string | null
  lastParseResult: ParseResult | null
  refreshKey: number
  quizSeed: QuizSeed | null

  setActiveTab: (tab: Tab) => void
  importFile: (file: File, categoryId: number) => Promise<number>
  createCategory: (name: string, parentId: number | null) => Promise<number>
  renameCategory: (categoryId: number, newName: string) => Promise<void>
  deleteCategory: (categoryId: number) => Promise<void>
  updateWord: (wordId: number, data: { text: string; meanings: WordMeaning[] }) => Promise<void>
  setStarred: (wordId: number, starred: boolean) => Promise<void>
  deleteWord: (wordId: number) => Promise<void>
  deleteWords: (wordIds: number[]) => Promise<void>
  deleteCategoryWords: (categoryId: number) => Promise<number>
  deleteWordsInCategories: (categoryIds: number[]) => Promise<number>
  deleteAllWords: () => Promise<number>
  reviewCard: (cardId: number, wordId: number, quality: Quality) => Promise<void>
  markQuizResult: (wordId: number, correct: boolean, mode: 'choice' | 'spell' | 'posconv') => Promise<void>
  recordMistake: (data: Omit<Mistake, 'id' | 'resolved' | 'createdAt'>) => Promise<void>
  resolveMistake: (wordId: number, mode: Mistake['mode']) => Promise<void>
  saveQuizSession: (session: Omit<QuizSession, 'id'>) => Promise<number>
  deleteQuizSession: (id: number) => Promise<void>
  clearQuizSessions: () => Promise<number>
  exportData: () => Promise<unknown>
  importData: (data: unknown) => Promise<void>
  launchQuizFromWords: (words: WordEntry[], mode: 'choice' | 'spell' | 'posconv' | 'mixed', mixedModes?: Mistake['mode'][], retest?: boolean) => void
  clearQuizSeed: () => void
  reviewSeed: { categoryIds: number[]; planId?: number } | null
  launchReviewFromPlan: (categoryIds: number[], planId?: number) => void
  clearReviewSeed: () => void
  refresh: () => void
  clearError: () => void
  reset: () => void
}

export type { Tab }

export const useStore = create<StoreState>((set, get) => ({
  activeTab: 'home',
  loading: false,
  error: null,
  lastParseResult: null,
  refreshKey: 0,
  quizSeed: null,
  reviewSeed: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  clearQuizSeed: () => set({ quizSeed: null }),
  clearReviewSeed: () => set({ reviewSeed: null }),

  launchQuizFromWords: (words, mode, mixedModes, retest) => {
    set({ quizSeed: { words, mode, mixedModes, retest }, activeTab: 'quiz' })
    get().refresh()
  },

  launchReviewFromPlan: (categoryIds, planId) => {
    set({ reviewSeed: { categoryIds, planId }, activeTab: 'review' })
    get().refresh()
  },

  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),

  clearError: () => set({ error: null }),

  reset: () =>
    set((s) => ({
      activeTab: 'home',
      loading: false,
      error: null,
      lastParseResult: null,
      quizSeed: null,
      reviewSeed: null,
      refreshKey: s.refreshKey + 1,
    })),

  createCategory: async (name, parentId) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('类别名称不能为空')
    const cats = await repo.repoCategories()
    const existing = cats.find((c) => c.name === trimmed && (c.parentId ?? null) === (parentId ?? null))
    if (existing && existing.id) return existing.id
    const id = await repo.repoCreateCategory(trimmed, parentId)
    get().refresh()
    return id
  },

  renameCategory: async (categoryId, newName) => {
    const trimmed = newName.trim()
    if (!trimmed) throw new Error('类别名称不能为空')
    const cat = await repo.repoGetCategory(categoryId)
    if (!cat) throw new Error('类别不存在')
    if (cat.name === trimmed) return
    await repo.repoUpdateCategoryName(categoryId, trimmed)
    get().refresh()
  },

  deleteCategory: async (categoryId) => {
    const cats = await repo.repoCategories()
    if (cats.some((c) => c.parentId === categoryId)) {
      throw new Error('该类别下还有子类别，请先删除所有子类别')
    }
    const words = await repo.repoWords()
    if (words.some((w) => w.meanings.some((m) => m.categoryId === categoryId))) {
      throw new Error('该类别下还有单词，无法删除')
    }
    await repo.repoDeleteCategory(categoryId)
    get().refresh()
  },

  updateWord: async (wordId, data) => {
    const text = data.text.trim()
    if (!text) throw new Error('单词不能为空')
    const meanings = data.meanings
      .filter((m) => m.meaning.trim() || true)
      .map((m) => ({
        categoryId: m.categoryId,
        meaning: m.meaning.trim(),
        phonetic: m.phonetic?.trim() || undefined,
        example: m.example?.trim() || undefined,
        source: m.source,
      }))
    await repo.repoUpdateWord(wordId, { text, meanings })
    get().refresh()
  },

  setStarred: async (wordId, starred) => {
    await repo.repoSetStarred(wordId, starred)
    get().refresh()
  },

  deleteWord: async (wordId) => {
    await repo.repoDeleteWordCascade(wordId)
    get().refresh()
  },

  deleteWords: async (wordIds) => {
    await repo.repoDeleteWordsCascade(wordIds)
    get().refresh()
  },

  deleteCategoryWords: async (categoryId) => {
    return get().deleteWordsInCategories([categoryId])
  },

  deleteWordsInCategories: async (categoryIds) => {
    let count = 0
    const cats = await repo.repoCategories()
    const idSet = new Set<number>()
    for (const cid of categoryIds) {
      getDescendantIds(cats, cid).forEach((x) => idSet.add(x))
    }
    const words = await repo.repoWords()
    const toDelete: number[] = []
    const toUpdate: { id: number; meanings: WordMeaning[] }[] = []
    for (const w of words) {
      const remaining = w.meanings.filter((m) => !idSet.has(m.categoryId))
      const removed = w.meanings.length - remaining.length
      if (removed === 0) continue
      count += remaining.length === 0 ? 1 : 0
      if (remaining.length === 0) {
        toDelete.push(w.id!)
      } else {
        toUpdate.push({ id: w.id!, meanings: remaining })
      }
    }
    for (const u of toUpdate) {
      await repo.repoUpdateWordMeanings(u.id, u.meanings)
    }
    if (toDelete.length > 0) {
      await repo.repoDeleteWordsCascade(toDelete)
    }
    get().refresh()
    return count
  },

  deleteAllWords: async () => {
    const count = await repo.repoClearVocabulary()
    get().refresh()
    return count
  },

  importFile: async (file, categoryId) => {
    set({ loading: true, error: null })
    try {
      const result = await parseFile(file)
      set({ lastParseResult: result })
      if (result.words.length === 0) {
        throw new Error('未能从文件中解析出任何单词，请检查文件格式')
      }

      const now = Date.now()
      const source = file.name
      let imported = 0

      const allWords = await repo.repoWords()
      const byKey = new Map<string, WordEntry>()
      for (const w of allWords) byKey.set(w.text.toLowerCase(), w)

      const toInsert: WordEntry[] = []
      const toUpdate: { word: WordEntry; meaning: WordMeaning }[] = []

      for (const pw of result.words) {
        const key = pw.text.toLowerCase()
        const meaning: WordMeaning = {
          categoryId,
          meaning: pw.meaning,
          phonetic: pw.phonetic,
          example: pw.example,
          source,
        }
        const existing = byKey.get(key)
        if (existing) {
          const already = existing.meanings.find((m) => m.categoryId === categoryId)
          if (already) continue
          toUpdate.push({ word: existing, meaning })
        } else {
          const newWord: WordEntry = {
            text: pw.text,
            meanings: [meaning],
            createdAt: now,
            starred: false,
          }
          byKey.set(key, newWord)
          toInsert.push(newWord)
        }
      }

      if (toInsert.length > 0) {
        await repo.repoAddWordsWithCards(toInsert)
        imported += toInsert.length
      }
      for (const { word, meaning } of toUpdate) {
        await repo.repoUpdateWordMeanings(word.id!, [...word.meanings, meaning])
        imported++
      }
      const healed = await repo.repoCreateMissingCards()

      set({ loading: false })
      if (imported > 0 || healed > 0) get().refresh()
      return imported
    } catch (e) {
      const msg = e instanceof Error ? e.message : '导入失败'
      set({ loading: false, error: msg })
      throw e
    }
  },

  reviewCard: async (cardId, wordId, quality) => {
    const card = await repo.repoGetCard(cardId)
    if (!card) return

    const result = sm2(card, quality)
    const wasCorrect = quality >= 3

    await repo.repoUpdateCard(cardId, {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      dueDate: result.dueDate,
      lastReviewed: Date.now(),
      lastQuality: quality,
      totalReviews: card.totalReviews + 1,
      correctReviews: card.correctReviews + (wasCorrect ? 1 : 0),
      status: result.status,
    })

    const log: ReviewLog = {
      cardId,
      wordId,
      quality,
      wasCorrect,
      timestamp: Date.now(),
    }
    await repo.repoAddLog(log)

    await repo.repoBumpSession(localYMD(), wasCorrect ? 1 : 0, wasCorrect && card.status === 'new' ? 1 : 0)
    if (wasCorrect && (card.correctReviews ?? 0) === 0) {
      useDailyGoal.getState().incrementNew(1)
    }
    get().refresh()
  },

  markQuizResult: async (wordId, correct, _mode) => {
    void _mode
    const card = await repo.repoCardByWord(wordId)
    if (!card || !card.id) return

    const quality = correct ? 4 : 1
    const result = sm2(card, quality)

    let nextLastQuality = card.lastQuality ?? null
    if (!correct) {
      const cur = card.lastQuality
      if (cur !== QUALITY.BLACKOUT && cur !== QUALITY.WRONG_FAMILIAR) {
        nextLastQuality = QUALITY.WRONG_FAMILIAR
      }
    } else {
      const upgradeMap: Record<number, number> = {
        [QUALITY.BLACKOUT]: QUALITY.WRONG_FAMILIAR,
        [QUALITY.WRONG]: QUALITY.WRONG_FAMILIAR,
        [QUALITY.WRONG_FAMILIAR]: QUALITY.CORRECT_HARD,
        [QUALITY.CORRECT_HARD]: QUALITY.CORRECT,
        [QUALITY.CORRECT]: QUALITY.PERFECT,
        [QUALITY.PERFECT]: QUALITY.PERFECT,
      }
      const cur = card.lastQuality
      if (cur == null) {
        nextLastQuality = QUALITY.CORRECT
      } else {
        nextLastQuality = upgradeMap[cur] ?? QUALITY.CORRECT
      }
    }

    await repo.repoUpdateCard(card.id, {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      dueDate: result.dueDate,
      lastReviewed: Date.now(),
      lastQuality: nextLastQuality,
      totalReviews: card.totalReviews + 1,
      correctReviews: card.correctReviews + (correct ? 1 : 0),
      quizWrongCount: (card.quizWrongCount ?? 0) + (correct ? 0 : 1),
      status: result.status,
    })

    const log: ReviewLog = {
      cardId: card.id,
      wordId,
      quality,
      wasCorrect: correct,
      timestamp: Date.now(),
    }
    await repo.repoAddLog(log)

    await repo.repoBumpSession(localYMD(), correct ? 1 : 0, 0)
    if (correct && (card.correctReviews ?? 0) === 0) {
      useDailyGoal.getState().incrementNew(1)
    }
    get().refresh()
  },

  recordMistake: async (data) => {
    await repo.repoUpsertMistake(data)
    get().refresh()
  },

  resolveMistake: async (wordId, mode) => {
    await repo.repoResolveMistakesByWord(wordId, mode)
    get().refresh()
  },

  saveQuizSession: async (session) => {
    const id = await repo.repoAddQuizSession(session)
    get().refresh()
    return id
  },

  deleteQuizSession: async (id) => {
    await repo.repoDeleteQuizSession(id)
    get().refresh()
  },

  clearQuizSessions: async () => {
    const count = await repo.repoClearQuizSessions()
    get().refresh()
    return count
  },

  exportData: async () => {
    return repo.repoExportAll()
  },

  importData: async (raw) => {
    const data = raw as repo.BackupData
    if (!data || typeof data !== 'object') throw new Error('备份文件格式不正确')
    const hasAny = data.words || data.cards || data.categories
    if (!hasAny) throw new Error('备份文件中没有可导入的数据')
    await repo.repoImportAll({
      app: data.app ?? 'vocab-app',
      version: data.version ?? 6,
      exportedAt: data.exportedAt ?? Date.now(),
      words: Array.isArray(data.words) ? data.words : [],
      cards: Array.isArray(data.cards) ? data.cards : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      mistakes: Array.isArray(data.mistakes) ? data.mistakes : [],
      quizSessions: Array.isArray(data.quizSessions) ? data.quizSessions : [],
      logs: Array.isArray(data.logs) ? data.logs : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    })
    get().refresh()
  },
}))
