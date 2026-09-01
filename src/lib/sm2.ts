import type { SrsCard, CardStatus } from '../types'

export const QUALITY = {
  BLACKOUT: 0,
  WRONG: 1,
  WRONG_FAMILIAR: 2,
  CORRECT_HARD: 3,
  CORRECT: 4,
  PERFECT: 5,
} as const

export type Quality = (typeof QUALITY)[keyof typeof QUALITY]

export interface Sm2Result {
  easeFactor: number
  interval: number
  repetitions: number
  dueDate: number
  status: CardStatus
}

export const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_INTERVAL = 365
export const MAX_EASE = 3.0
const MIN_EASE = 1.3

export function statusForReviewed(repetitions: number, interval: number): CardStatus {
  if (repetitions === 0) return 'learning'
  if (interval >= 3) return 'mastered'
  return 'review'
}

export function sm2(card: SrsCard, quality: number): Sm2Result {
  const q = Math.max(0, Math.min(5, quality))
  const wasCorrect = q >= 3
  let { easeFactor, repetitions } = card

  if (easeFactor > MAX_EASE) easeFactor = MAX_EASE
  if (easeFactor < MIN_EASE) easeFactor = MIN_EASE

  if (wasCorrect) {
    repetitions += 1
  } else {
    repetitions = 0
  }

  let interval: number
  if (repetitions <= 0) {
    interval = 1
  } else if (repetitions === 1) {
    interval = 1
  } else if (repetitions === 2) {
    interval = 3
  } else {
    interval = Math.round(card.interval * easeFactor)
  }

  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  if (easeFactor < MIN_EASE) easeFactor = MIN_EASE
  if (easeFactor > MAX_EASE) easeFactor = MAX_EASE

  if (interval > MAX_INTERVAL) interval = MAX_INTERVAL

  let fuzz = 0
  if (interval >= 3) {
    const range = Math.max(1, Math.round(interval * 0.1))
    fuzz = Math.round((Math.random() * 2 - 1) * range)
  }
  const dueDate = Date.now() + (interval + fuzz) * DAY_MS

  const status = statusForReviewed(repetitions, interval)

  return { easeFactor, interval, repetitions, dueDate, status }
}

export function createNewCard(wordId: number): SrsCard {
  return {
    wordId,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    dueDate: Date.now(),
    lastReviewed: null,
    lastQuality: null,
    totalReviews: 0,
    correctReviews: 0,
    quizWrongCount: 0,
    status: 'new',
  }
}

export const QUALITY_MARK: Record<number, { label: string; cls: string }> = {
  0: { label: '不会', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  2: { label: '模糊', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  3: { label: '困难', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  4: { label: '良好', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' },
  5: { label: '简单', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
}

export function formatDueLabel(dueDate: number): string {
  const diff = dueDate - Date.now()
  if (diff <= 0) return '待复习'
  const hours = Math.floor(diff / (60 * 60 * 1000))
  if (hours < 24) return `${hours}小时后`
  const days = Math.floor(diff / DAY_MS)
  return `${days}天后`
}
