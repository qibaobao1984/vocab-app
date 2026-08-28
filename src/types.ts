export type CardStatus = 'new' | 'learning' | 'review' | 'mastered'

export interface Category {
  id?: number
  name: string
  parentId: number | null
  createdAt: number
}

export interface WordMeaning {
  categoryId: number
  meaning: string
  phonetic?: string
  example?: string
  source: string
}

export interface WordEntry {
  id?: number
  text: string
  meanings: WordMeaning[]
  createdAt: number
  starred: boolean
}

export interface SrsCard {
  id?: number
  wordId: number
  easeFactor: number
  interval: number
  repetitions: number
  dueDate: number
  lastReviewed: number | null
  lastQuality: number | null
  totalReviews: number
  correctReviews: number
  quizWrongCount: number
  status: CardStatus
}

export interface ReviewLog {
  id?: number
  cardId: number
  wordId: number
  quality: number
  wasCorrect: boolean
  timestamp: number
}

export interface SessionStat {
  id?: number
  date: string
  reviewed: number
  correct: number
  learned: number
}

export interface ParsedWord {
  text: string
  meaning: string
  phonetic?: string
  example?: string
}

export interface Mistake {
  id?: number
  wordId: number
  categoryId: number
  userAnswer: string
  correctAnswer: string
  mode: 'choice' | 'spell' | 'posconv'
  timedOut: boolean
  resolved: boolean
  createdAt: number
}

export interface WrongRecord {
  wordId: number
  wordText: string
  meaning: string
  categoryId: number
  correctAnswer: string
  userAnswer: string
  mode: 'choice' | 'spell' | 'posconv'
  timedOut: boolean
}

export interface QuizSession {
  id?: number
  date: number
  mode: 'choice' | 'spell' | 'posconv' | 'mixed'
  total: number
  correct: number
  score: number
  label: string
  size: number
  duration: number
  wrongs: WrongRecord[]
  isRetest?: boolean
}

export interface DailySettings {
  dailyGoal: { newWords: number; reviews: number }
  streakDays: number
  lastCheckinDate: string
  todayStats: { newLearned: number; reviewed: number }
  todayDate: string
}

export interface StudyPlan {
  id?: number
  name: string
  categoryIds: number[]
  daysOfWeek: number[]
  time: string
  enabled: boolean
  createdAt: number
}

export interface LearningDay {
  id?: number
  date: string
  createdAt: number
}
