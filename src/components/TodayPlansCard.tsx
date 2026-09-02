import { useEffect, useMemo, useState } from 'react'
import { repoWords } from '../lib/repo'
import { useStore } from '../store/useStore'
import { useStudyPlan } from '../store/studyPlanStore'
import { StudyPlanManager } from './StudyPlanManager'
import clsx from 'clsx'
import type { WordEntry, StudyPlan } from '../types'

export function TodayPlansCard() {
  const plans = useStudyPlan((s) => s.plans)
  const doneTick = useStudyPlan((s) => s.doneTick)
  const isDoneToday = useStudyPlan((s) => s.isDoneToday)
  const launchReviewFromPlan = useStore((s) => s.launchReviewFromPlan)
  const [words, setWords] = useState<WordEntry[]>([])
  const [showMgr, setShowMgr] = useState(false)

  useEffect(() => {
    if (plans.length === 0) return
    void repoWords().then((w) => {
      setWords(w)
    })
  }, [plans])

  const countFor = useMemo(() => {
    return (p: StudyPlan) => {
      const ids = new Set<number>(p.categoryIds)
      return words.filter((w) => w.meanings.some((m) => ids.has(m.categoryId))).length
    }
  }, [words])

  const today = new Date().getDay()
  const todays = plans.filter((p) => p.enabled && p.daysOfWeek.includes(today))
  // re-evaluate done status when doneTick changes
  void doneTick

  return (
    <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-3">
      <div className="card p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">今日计划</span>
          <button
            onClick={() => setShowMgr(true)}
            className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            管理
          </button>
        </div>

        {todays.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">
            今天没有复习计划，<button onClick={() => setShowMgr(true)} className="text-brand-600 hover:underline">去添加一个</button>
          </p>
        ) : (
          <div className="space-y-1.5">
            {todays.map((p) => {
              const done = p.id !== undefined && isDoneToday(p.id)
              const count = countFor(p)
              return (
                <button
                  key={p.id}
                  onClick={() => launchReviewFromPlan(p.categoryIds, p.id)}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {p.time} · {count} 词
                    </p>
                  </div>
                  <span
                    className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full flex-shrink-0',
                      done
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                    )}
                  >
                    {done ? '已完成' : '待复习'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <StudyPlanManager open={showMgr} onClose={() => setShowMgr(false)} />
    </div>
  )
}
