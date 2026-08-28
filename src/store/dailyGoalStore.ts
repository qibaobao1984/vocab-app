import { create } from 'zustand'
import { repoGetDailySettings, repoSaveDailySettings } from '../lib/repo'
import type { DailySettings } from '../types'

interface DailyGoalState extends DailySettings {
  loaded: boolean
  load: () => Promise<void>
  setGoal: (newWords: number, reviews: number) => Promise<void>
  checkin: () => Promise<void>
  resetTodayStats: () => Promise<void>
  incrementNew: (n: number) => void
  incrementReview: (n: number) => void
  persist: () => Promise<void>
}

const DEFAULT_GOAL = { newWords: 10, reviews: 30 }

export function localYMD(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function yesterdayYMD(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localYMD(d)
}

function snapshot(s: DailySettings): DailySettings {
  return {
    dailyGoal: s.dailyGoal,
    streakDays: s.streakDays,
    lastCheckinDate: s.lastCheckinDate,
    todayStats: s.todayStats,
    todayDate: s.todayDate,
  }
}

export const useDailyGoal = create<DailyGoalState>((set, get) => ({
  dailyGoal: DEFAULT_GOAL,
  streakDays: 0,
  lastCheckinDate: '',
  todayStats: { newLearned: 0, reviewed: 0 },
  todayDate: '',
  loaded: false,

  load: async () => {
    const today = localYMD()
    const yest = yesterdayYMD()
    const s = await repoGetDailySettings()
    if (!s) {
      const init: DailySettings = {
        dailyGoal: DEFAULT_GOAL,
        streakDays: 0,
        lastCheckinDate: '',
        todayStats: { newLearned: 0, reviewed: 0 },
        todayDate: today,
      }
      await repoSaveDailySettings(init)
      set({ ...init, loaded: true })
      return
    }
    let { dailyGoal, streakDays, lastCheckinDate, todayStats, todayDate } = s
    if (todayDate !== today) {
      todayStats = { newLearned: 0, reviewed: 0 }
      todayDate = today
    }
    if (lastCheckinDate !== today && lastCheckinDate !== yest) {
      streakDays = 0
    }
    const next = { dailyGoal, streakDays, lastCheckinDate, todayStats, todayDate }
    await repoSaveDailySettings(next)
    set({ ...next, loaded: true })
  },

  setGoal: async (newWords, reviews) => {
    const dailyGoal = { newWords, reviews }
    set({ dailyGoal })
    await repoSaveDailySettings(snapshot(get()))
  },

  checkin: async () => {
    const today = localYMD()
    const { lastCheckinDate, streakDays } = get()
    if (lastCheckinDate === today) return
    const nextStreak = lastCheckinDate === yesterdayYMD() ? streakDays + 1 : 1
    set({ streakDays: nextStreak, lastCheckinDate: today })
    await repoSaveDailySettings(snapshot(get()))
  },

  resetTodayStats: async () => {
    const today = localYMD()
    const todayStats = { newLearned: 0, reviewed: 0 }
    set({ todayStats, todayDate: today })
    await repoSaveDailySettings(snapshot(get()))
  },

  incrementNew: (n) => {
    const today = localYMD()
    const { todayStats, todayDate } = get()
    const base = todayDate === today ? todayStats : { newLearned: 0, reviewed: 0 }
    set({ todayStats: { ...base, newLearned: base.newLearned + n }, todayDate: today })
  },

  incrementReview: (n) => {
    const today = localYMD()
    const { todayStats, todayDate } = get()
    const base = todayDate === today ? todayStats : { newLearned: 0, reviewed: 0 }
    set({ todayStats: { ...base, reviewed: base.reviewed + n }, todayDate: today })
  },

  persist: async () => {
    await repoSaveDailySettings(snapshot(get()))
  },
}))
