import { useEffect, useState } from 'react'
import { repoGetLearningDays } from '../lib/repo'
import { useDailyGoal, localYMD } from '../store/dailyGoalStore'
import { useStore } from '../store/useStore'
import clsx from 'clsx'

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const set = new Set(dates)
  const d = new Date()
  if (!set.has(localYMD())) d.setDate(d.getDate() - 1)
  let streak = 0
  while (set.has(localYMD(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function DailyGoalCard() {
  const refreshKey = useStore((s) => s.refreshKey)
  const dailyGoal = useDailyGoal((s) => s.dailyGoal)
  const todayStats = useDailyGoal((s) => s.todayStats)
  const setGoal = useDailyGoal((s) => s.setGoal)
  const [streak, setStreak] = useState(0)
  const [editing, setEditing] = useState(false)
  const [nw, setNw] = useState(dailyGoal.newWords)
  const [rv, setRv] = useState(dailyGoal.reviews)

  useEffect(() => {
    void repoGetLearningDays().then((dates) => setStreak(computeStreak(dates)))
  }, [refreshKey])

  const newPct = dailyGoal.newWords > 0 ? Math.min(100, (todayStats.newLearned / dailyGoal.newWords) * 100) : 0
  const revPct = dailyGoal.reviews > 0 ? Math.min(100, (todayStats.reviewed / dailyGoal.reviews) * 100) : 0
  const newDone = dailyGoal.newWords > 0 && todayStats.newLearned >= dailyGoal.newWords
  const revDone = dailyGoal.reviews > 0 && todayStats.reviewed >= dailyGoal.reviews

  const startEdit = () => {
    setNw(dailyGoal.newWords)
    setRv(dailyGoal.reviews)
    setEditing(true)
  }
  const saveEdit = async () => {
    await setGoal(Math.max(0, Number(nw) || 0), Math.max(0, Number(rv) || 0))
    setEditing(false)
  }

  return (
    <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-4">
      <div className="card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">今日目标</span>
            <button onClick={startEdit} className="text-gray-400 hover:text-brand-600 dark:hover:text-brand-400" title="编辑目标">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
          <span className="text-xs text-orange-500 font-medium">🔥 连续学习 {streak} 天</span>
        </div>

        {editing ? (
          <div className="flex flex-wrap items-end gap-3 animate-slide-up">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              新学目标
              <input
                type="number"
                min={0}
                value={nw}
                onChange={(e) => setNw(Number(e.target.value))}
                className="block w-20 mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="text-xs text-gray-500 dark:text-gray-400">
              复习目标
              <input
                type="number"
                min={0}
                value={rv}
                onChange={(e) => setRv(Number(e.target.value))}
                className="block w-20 mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <button onClick={() => void saveEdit()} className="btn-primary text-xs px-3 py-1.5">保存</button>
            <button onClick={() => setEditing(false)} className="btn-secondary text-xs px-3 py-1.5">取消</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <GoalBar label="新学" cur={todayStats.newLearned} goal={dailyGoal.newWords} pct={newPct} done={newDone} color="bg-brand-500" />
            <GoalBar label="复习" cur={todayStats.reviewed} goal={dailyGoal.reviews} pct={revPct} done={revDone} color="bg-amber-500" />
          </div>
        )}
      </div>
    </div>
  )
}

function GoalBar({
  label,
  cur,
  goal,
  pct,
  done,
  color,
}: {
  label: string
  cur: number
  goal: number
  pct: number
  done: boolean
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className={clsx('font-medium', done ? 'text-green-500' : 'text-gray-400')}>
          {cur}/{goal}{done ? ' ✓' : ''}
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={clsx('h-full transition-all duration-300', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
