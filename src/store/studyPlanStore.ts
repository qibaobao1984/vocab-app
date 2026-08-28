import { create } from 'zustand'
import { repoGetStudyPlans, repoSaveStudyPlan, repoDeleteStudyPlan } from '../lib/repo'
import { localYMD } from './dailyGoalStore'
import type { StudyPlan } from '../types'

const DONE_PREFIX = 'plan-done-'

interface StudyPlanState {
  plans: StudyPlan[]
  loaded: boolean
  doneTick: number
  load: () => Promise<void>
  save: (plan: StudyPlan) => Promise<number>
  remove: (id: number) => Promise<void>
  toggle: (id: number, enabled: boolean) => Promise<void>
  isDoneToday: (id: number) => boolean
  markDoneToday: (id: number) => void
  todaysPlans: () => StudyPlan[]
}

export const useStudyPlan = create<StudyPlanState>((set, get) => ({
  plans: [],
  loaded: false,
  doneTick: 0,

  load: async () => {
    const plans = await repoGetStudyPlans()
    set({ plans, loaded: true })
  },

  save: async (plan) => {
    const id = await repoSaveStudyPlan(plan)
    await get().load()
    return id
  },

  remove: async (id) => {
    await repoDeleteStudyPlan(id)
    await get().load()
  },

  toggle: async (id, enabled) => {
    const p = get().plans.find((x) => x.id === id)
    if (!p) return
    await repoSaveStudyPlan({ ...p, enabled })
    await get().load()
  },

  isDoneToday: (id) => {
    try {
      return localStorage.getItem(DONE_PREFIX + id + '-' + localYMD()) === '1'
    } catch {
      return false
    }
  },

  markDoneToday: (id) => {
    try {
      localStorage.setItem(DONE_PREFIX + id + '-' + localYMD(), '1')
    } catch {
      /* ignore */
    }
    set((s) => ({ doneTick: s.doneTick + 1 }))
  },

  todaysPlans: () => {
    const today = new Date().getDay()
    return get().plans.filter((p) => p.enabled && p.daysOfWeek.includes(today))
  },
}))
