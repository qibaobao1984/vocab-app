import Dexie, { type Table } from 'dexie'
import type { WordEntry, WordMeaning, SrsCard, ReviewLog, SessionStat, Category, Mistake, QuizSession, DailySettings, StudyPlan, LearningDay } from './types'

class VocabDB extends Dexie {
  words!: Table<WordEntry, number>
  cards!: Table<SrsCard, number>
  logs!: Table<ReviewLog, number>
  sessions!: Table<SessionStat, number>
  categories!: Table<Category, number>
  mistakes!: Table<Mistake, number>
  quizSessions!: Table<QuizSession, number>
  userSettings!: Table<DailySettings & { id: number }, number>
  studyPlans!: Table<StudyPlan, number>
  learningDays!: Table<LearningDay, number>

  constructor() {
    super('vocab-db')
    this.version(1).stores({
      words: '++id, text, source, createdAt',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
    })
    this.version(2).stores({
      words: '++id, text, source, categoryId, createdAt',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, &name, createdAt',
    })
    this.version(3).stores({
      words: '++id, text, source, categoryId, createdAt',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
    })
    this.version(3).upgrade((tx) => {
      return tx.table('categories').toCollection().modify((cat) => {
        const c = cat as Category
        if (c.parentId === undefined) c.parentId = null
      })
    })
    this.version(4).stores({
      words: '++id, text, source, categoryId, createdAt',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
      mistakes: '++id, wordId, categoryId, resolved, createdAt',
    })
    this.version(5).stores({
      words: '++id, text, source, categoryId, createdAt',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
      mistakes: '++id, wordId, categoryId, resolved, createdAt',
      quizSessions: '++id, date, mode',
    })
    this.version(6).stores({
      words: '++id, text, createdAt',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
      mistakes: '++id, wordId, categoryId, resolved, createdAt',
      quizSessions: '++id, date, mode',
    })
    this.version(6).upgrade(async (tx) => {
      const wordTable = tx.table('words')
      const cardTable = tx.table('cards')
      const mistakeTable = tx.table('mistakes')
      const all = (await wordTable.toArray()) as Array<
        WordEntry & { categoryId?: number; meaning?: string; phonetic?: string; example?: string; source?: string }
      >
      if (all.length === 0) return
      if (Array.isArray(all[0].meanings)) return
      const groups = new Map<string, typeof all>()
      for (const w of all) {
        const key = (w.text ?? '').toLowerCase()
        const arr = groups.get(key) ?? []
        arr.push(w)
        groups.set(key, arr)
      }

      for (const group of groups.values()) {
        const canonical = group.reduce((a, b) => (a.id! <= b.id! ? a : b))
        const meanings: WordMeaning[] = group.map((w) => ({
          categoryId: w.categoryId ?? 0,
          meaning: w.meaning ?? '',
          phonetic: w.phonetic,
          example: w.example,
          source: w.source ?? '',
        }))
        await wordTable.update(canonical.id!, { meanings })
        const dupIds = group.filter((w) => w.id !== canonical.id!).map((w) => w.id!)
        if (dupIds.length === 0) continue
        const dupCards = (await cardTable.where('wordId').anyOf(dupIds).toArray()) as SrsCard[]
        for (const dc of dupCards) {
          const canonCard = (await cardTable.where('wordId').equals(canonical.id!).first()) as SrsCard | undefined
          if (canonCard && canonCard.id !== undefined) {
            const newer = (dc.lastReviewed ?? 0) > (canonCard.lastReviewed ?? 0)
            const lastQuality =
              newer && dc.lastQuality != null ? dc.lastQuality : canonCard.lastQuality
            await cardTable.update(canonCard.id, {
              totalReviews: (canonCard.totalReviews ?? 0) + (dc.totalReviews ?? 0),
              correctReviews: (canonCard.correctReviews ?? 0) + (dc.correctReviews ?? 0),
              quizWrongCount: (canonCard.quizWrongCount ?? 0) + (dc.quizWrongCount ?? 0),
              lastReviewed: newer ? dc.lastReviewed : canonCard.lastReviewed,
              lastQuality,
              easeFactor: dc.easeFactor < canonCard.easeFactor ? dc.easeFactor : canonCard.easeFactor,
            })
            await cardTable.delete(dc.id!)
          } else {
            await cardTable.update(dc.id!, { wordId: canonical.id! })
          }
        }
        await mistakeTable.where('wordId').anyOf(dupIds).modify({ wordId: canonical.id! })
        await wordTable.bulkDelete(dupIds)
      }
    })
    this.version(7).stores({
      words: '++id, text, createdAt, starred',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
      mistakes: '++id, wordId, categoryId, resolved, createdAt',
      quizSessions: '++id, date, mode',
    })
    this.version(7).upgrade(async (tx) => {
      await tx
        .table('words')
        .toCollection()
        .modify((w: WordEntry) => {
          if (w.starred === undefined) w.starred = false
        })
    })
    this.version(8).stores({
      words: '++id, text, createdAt, starred',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
      mistakes: '++id, wordId, categoryId, resolved, createdAt',
      quizSessions: '++id, date, mode',
      userSettings: 'id',
    })
    this.version(9).stores({
      words: '++id, text, createdAt, starred',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
      mistakes: '++id, wordId, categoryId, resolved, createdAt',
      quizSessions: '++id, date, mode',
      userSettings: 'id',
      studyPlans: '++id, name, enabled',
    })
    this.version(10).stores({
      words: '++id, text, createdAt, starred',
      cards: '++id, wordId, status, dueDate',
      logs: '++id, cardId, wordId, timestamp',
      sessions: '++id, &date',
      categories: '++id, name, parentId, createdAt',
      mistakes: '++id, wordId, categoryId, resolved, createdAt',
      quizSessions: '++id, date, mode',
      userSettings: 'id',
      studyPlans: '++id, name, enabled',
      learningDays: '++id, &date',
    })
  }
}

export const db = new VocabDB()
