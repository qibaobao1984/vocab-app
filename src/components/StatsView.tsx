import { useEffect, useMemo, useState } from 'react'
import { repoCards, repoSessions, repoQuizSessions, repoWordCount, repoWords, repoCategories, repoGetLearningDays } from '../lib/repo'
import { useStore } from '../store/useStore'
import { getDescendantIds } from '../lib/tree'
import { QUALITY_MARK } from '../lib/sm2'
import { wordPhonetic } from '../lib/word'
import { Page } from './Page'
import { EmptyState } from './EmptyState'
import { WordDetail } from './WordDetail'
import { Pagination } from './Pagination'
import type { SrsCard, SessionStat, QuizSession, CardStatus, Category, WordEntry } from '../types'
import clsx from 'clsx'

const STATUS_META: { key: CardStatus; label: string; color: string }[] = [
  { key: 'new', label: '新词', color: 'bg-blue-500' },
  { key: 'learning', label: '学习中', color: 'bg-amber-500' },
  { key: 'review', label: '复习中', color: 'bg-brand-500' },
  { key: 'mastered', label: '已掌握', color: 'bg-green-500' },
]

type Range = 'week' | 'month' | 'year'

const RANGES: { id: Range; label: string; days: number }[] = [
  { id: 'week', label: '最近一周', days: 7 },
  { id: 'month', label: '最近一月', days: 30 },
  { id: 'year', label: '最近一年', days: 365 },
]

interface Bucket {
  reviewed: number
  correct: number
  label: string
  dateStr: string
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthBuckets(
  sessions: SessionStat[],
  fromY: number,
  fromM: number,
  toY: number,
  toM: number,
): Bucket[] {
  const monthMap = new Map<string, { reviewed: number; correct: number }>()
  for (const s of sessions) {
    const ym = s.date.slice(0, 7)
    const e = monthMap.get(ym) ?? { reviewed: 0, correct: 0 }
    e.reviewed += s.reviewed
    e.correct += s.correct
    monthMap.set(ym, e)
  }
  const buckets: Bucket[] = []
  let y = fromY
  let m = fromM
  while (y < toY || (y === toY && m <= toM)) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    const e = monthMap.get(key) ?? { reviewed: 0, correct: 0 }
    buckets.push({ reviewed: e.reviewed, correct: e.correct, label: key, dateStr: key })
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return buckets
}

function buildBuckets(sessions: SessionStat[], range: Range, page: number): Bucket[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (range === 'year') {
    const y = today.getFullYear() - page
    return monthBuckets(sessions, y, 0, y, 11)
  }

  const y = today.getFullYear()
  const m = today.getMonth()
  let start: Date
  let end: Date
  if (range === 'week') {
    const diff = (today.getDay() + 6) % 7
    start = new Date(today)
    start.setDate(today.getDate() - diff - page * 7)
    end = new Date(start)
    end.setDate(start.getDate() + 6)
  } else {
    start = new Date(y, m - page, 1)
    end = new Date(y, m - page + 1, 0)
  }

  const dayMap = new Map<string, { reviewed: number; correct: number }>()
  for (const s of sessions) {
    const d = new Date(s.date + 'T00:00:00')
    if (Number.isNaN(d.getTime())) continue
    const key = ymd(d)
    const e = dayMap.get(key) ?? { reviewed: 0, correct: 0 }
    e.reviewed += s.reviewed
    e.correct += s.correct
    dayMap.set(key, e)
  }

  const buckets: Bucket[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const key = ymd(cur)
    const e = dayMap.get(key) ?? { reviewed: 0, correct: 0 }
    let label: string
    if (range === 'week') {
      label = ['日', '一', '二', '三', '四', '五', '六'][cur.getDay()]
    } else {
      label = String(cur.getDate())
    }
    buckets.push({ reviewed: e.reviewed, correct: e.correct, label, dateStr: ymd(cur) })
    cur.setDate(cur.getDate() + 1)
  }
  return buckets
}

export function StatsView() {
  const refreshKey = useStore((s) => s.refreshKey)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const [cards, setCards] = useState<SrsCard[]>([])
  const [sessions, setSessions] = useState<SessionStat[]>([])
  const [quizSessions, setQuizSessions] = useState<QuizSession[]>([])
  const [totalWords, setTotalWords] = useState(0)
  const [starredCount, setStarredCount] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [words, setWords] = useState<WordEntry[]>([])
  const [view, setView] = useState<'trend' | 'forgetting' | 'calendar'>('trend')
  const [detailWord, setDetailWord] = useState<WordEntry | null>(null)
  const [learningDays, setLearningDays] = useState<string[]>([])
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [fp, setFp] = useState(0)
  const [catStats, setCatStats] = useState<Record<number, { total: number; mastered: number }>>({})
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('week')
  const [page, setPage] = useState(0)
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    let active = true
    Promise.all([
      repoCards(),
      repoSessions(),
      repoWordCount(),
      repoWords(),
      repoCategories(),
      repoQuizSessions(),
    ]).then(([c, s, w, words, cats, qs]) => {
      if (!active) return
      setCards(c)
      setSessions(s)
      setQuizSessions(qs)
      setTotalWords(w)
      setWords(words)
      setStarredCount(words.reduce((n, wd) => n + (wd.starred ? 1 : 0), 0))
      setCategories(cats)
      void repoGetLearningDays().then(setLearningDays)
      const cardMap = new Map(c.map((card) => [card.wordId, card]))
      const stats: Record<number, { total: number; mastered: number }> = {}
      for (const cat of cats) {
        if (cat.id === undefined) continue
        const ids = new Set(getDescendantIds(cats, cat.id))
        const catWords = words.filter((wd) => wd.meanings.some((m) => ids.has(m.categoryId)))
        const mastered = catWords.filter((wd) => cardMap.get(wd.id!)?.status === 'mastered').length
        stats[cat.id] = { total: catWords.length, mastered }
      }
      setCatStats(stats)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey])

  const statusCounts = useMemo(() => {
    const counts: Record<CardStatus, number> = { new: 0, learning: 0, review: 0, mastered: 0 }
    for (const c of cards) counts[c.status]++
    return counts
  }, [cards])

  const learningDaysCount = learningDays.length
  const streak = useMemo(() => {
    const set = new Set(learningDays)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cur = new Date(today)
    if (!set.has(ymd(cur))) {
      cur.setDate(cur.getDate() - 1)
      if (!set.has(ymd(cur))) return 0
    }
    let count = 0
    while (set.has(ymd(cur))) {
      count++
      cur.setDate(cur.getDate() - 1)
    }
    return count
  }, [learningDays])
  const quizTotal = useMemo(() => quizSessions.reduce((sum, q) => sum + q.total, 0), [quizSessions])
  const quizCorrect = useMemo(() => quizSessions.reduce((sum, q) => sum + q.correct, 0), [quizSessions])
  const accuracy = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0
  const masteredRate = totalWords > 0 ? Math.round((statusCounts.mastered / totalWords) * 100) : 0

  const buckets = useMemo(() => buildBuckets(sessions, range, page), [sessions, range, page])
  const maxReviewed = Math.max(1, ...buckets.map((b) => b.reviewed))
  const rangeReviewed = buckets.reduce((a, b) => a + b.reviewed, 0)
  const rangeCorrect = buckets.reduce((a, b) => a + b.correct, 0)
  const barMinW = range === 'week' ? 26 : range === 'month' ? 14 : 34

  // forgetting analysis: group reviewed words by last rating (0/2/3/4/5).
  const RATING_KEYS = [0, 2, 3, 4, 5] as const
  const Q_DOT: Record<number, string> = { 0: 'bg-red-500', 2: 'bg-orange-500', 3: 'bg-amber-500', 4: 'bg-brand-500', 5: 'bg-green-500' }
  const forgettingGroups = useMemo(() => {
    const cardMap = new Map(cards.map((c) => [c.wordId, c]))
    const groups: Record<number, { word: WordEntry; card: SrsCard | undefined; lastReviewed: number }[]> = {
      0: [],
      2: [],
      3: [],
      4: [],
      5: [],
    }
    for (const w of words) {
      if (w.id === undefined) continue
      const card = cardMap.get(w.id)
      const lq = card?.lastQuality
      if (lq == null || !(lq in groups)) continue
      groups[lq].push({ word: w, card, lastReviewed: card?.lastReviewed ?? 0 })
    }
    for (const k of RATING_KEYS) groups[k].sort((a, b) => a.lastReviewed - b.lastReviewed)
    return groups
  }, [words, cards])

  const [selQ, setSelQ] = useState<number>(0)
  const groupWords = forgettingGroups[selQ] ?? []
  const FP_SIZE = 12
  const fTotalPages = Math.max(1, Math.ceil(groupWords.length / FP_SIZE))
  const fCurrent = Math.min(fp, fTotalPages - 1)
  const fPage = groupWords.slice(fCurrent * FP_SIZE, (fCurrent + 1) * FP_SIZE)
  useEffect(() => {
    setFp(0)
  }, [view, selQ])
  useEffect(() => {
    if (view !== 'forgetting') return
    if ((forgettingGroups[selQ]?.length ?? 0) > 0) return
    const first = RATING_KEYS.find((q) => forgettingGroups[q].length > 0)
    if (first !== undefined) setSelQ(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, words, cards])

  const changeRange = (r: Range) => {
    setRange(r)
    setPage(0)
    setSelIdx(null)
  }
  const prevPage = () => {
    setPage((p) => p + 1)
    setSelIdx(null)
  }
  const nextPage = () => {
    setPage((p) => Math.max(0, p - 1))
    setSelIdx(null)
  }

  const periodLabel = useMemo(() => {
    const unit = range === 'week' ? '周' : range === 'month' ? '月' : '年'
    return page === 0 ? `本${unit}` : page === 1 ? `上${unit}` : `上${page}${unit}`
  }, [range, page])

  const periodRangeStr = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const y = today.getFullYear()
    const m = today.getMonth()
    let start: Date, end: Date
    if (range === 'year') {
      start = new Date(y - page, 0, 1)
      end = new Date(y - page, 11, 31)
    } else if (range === 'week') {
      const diff = (today.getDay() + 6) % 7
      start = new Date(today)
      start.setDate(today.getDate() - diff - page * 7)
      end = new Date(start)
      end.setDate(start.getDate() + 6)
    } else {
      start = new Date(y, m - page, 1)
      end = new Date(y, m - page + 1, 0)
    }
    if (range === 'year') return `${start.getFullYear()}年`
    return `${start.getMonth() + 1}/${start.getDate()} ~ ${end.getMonth() + 1}/${end.getDate()}`
  }, [range, page])

  const childrenMap = useMemo(() => {
    const m = new Map<number | null, Category[]>()
    for (const c of categories) {
      const key = c.parentId ?? null
      const arr = m.get(key) ?? []
      arr.push(c)
      m.set(key, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    return m
  }, [categories])

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderCatNode = (cat: Category, depth: number): React.ReactNode => {
    const children = childrenMap.get(cat.id!) ?? []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(cat.id!)
    const stat = catStats[cat.id!] ?? { total: 0, mastered: 0 }
    const pct = stat.total > 0 ? Math.round((stat.mastered / stat.total) * 100) : 0
    return (
      <div key={cat.id}>
        <div className="py-1.5" style={{ paddingLeft: `${depth * 0.5}rem` }}>
          <div className="flex items-center gap-1.5 mb-1">
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(cat.id!)}
                className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
              >
                <svg
                  className={clsx('w-3 h-3 transition-transform', isExpanded && 'rotate-90')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}
            <span className="text-xs text-gray-600 dark:text-gray-300 font-medium flex-1 truncate">
              {cat.name}
              {hasChildren && <span className="text-gray-400"> · 含{children.length}个子类</span>}
            </span>
            <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">
              掌握 {stat.mastered}/{stat.total}（{pct}%）
            </span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden ml-5">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {hasChildren && isExpanded && children.map((c) => renderCatNode(c, depth + 1))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (totalWords === 0) {
    return <EmptyState title="暂无数据" description="导入单词开始学习后这里会显示进度" actionLabel="去导入" onAction={() => setActiveTab('upload')} />
  }

  return (
    <Page title="学习统计" icon="M3 3v18h18M7 14l4-4 4 4 5-5" description="词库进度、复习次数与测验成绩一览">
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="总单词数" value={totalWords} icon="📚" accent="text-brand-600" sub={starredCount > 0 ? `⭐ ${starredCount}` : undefined} />
        <StatCard label="已掌握" value={statusCounts.mastered} icon="✓" accent="text-green-600" sub={`${masteredRate}%`} />
        <StatCard label="累计学习天数" value={learningDaysCount} icon="📅" accent="text-amber-600" sub={streak > 0 ? `连续 ${streak} 天` : undefined} />
        <StatCard label="正确率" value={`${accuracy}%`} icon="🎯" accent="text-blue-600" sub={quizTotal > 0 ? `${quizCorrect}/${quizTotal}` : undefined} />
      </div>

      <div className="card p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">掌握进度</h2>
        <div className="flex h-6 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
          {STATUS_META.map((m) => {
            const count = statusCounts[m.key]
            if (count === 0) return null
            const pct = (count / totalWords) * 100
            return (
              <div
                key={m.key}
                className={clsx(m.color, 'flex items-center justify-center text-[10px] text-white font-medium transition-all')}
                style={{ width: `${pct}%` }}
                title={`${m.label}: ${count}`}
              >
                {pct > 8 ? count : ''}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {STATUS_META.map((m) => (
            <div key={m.key} className="flex items-center gap-1.5">
              <span className={clsx('w-3 h-3 rounded', m.color)} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {m.label} {statusCounts[m.key]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">词库类别</h2>
            <div className="flex gap-1 text-[10px] text-gray-400">
              <button onClick={() => setExpanded(new Set(categories.map((c) => c.id!)))} className="hover:text-brand-600 px-1">全展开</button>
              <span>·</span>
              <button onClick={() => setExpanded(new Set())} className="hover:text-brand-600 px-1">全收起</button>
            </div>
          </div>
          <div>
            {(childrenMap.get(null) ?? []).map((c) => renderCatNode(c, 0))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('trend')}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            view === 'trend' ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
          )}
        >
          复习趋势
        </button>
        <button
          onClick={() => setView('forgetting')}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            view === 'forgetting' ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
          )}
        >
          遗忘分析
        </button>
        <button
          onClick={() => setView('calendar')}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            view === 'calendar' ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
          )}
        >
          学习日历
        </button>
      </div>

      {view === 'trend' && (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">复习趋势</h2>
          <span className="text-xs text-gray-400">
            {RANGES.find((r) => r.id === range)!.label}：复习 {rangeReviewed} / 正确 {rangeCorrect}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => changeRange(r.id)}
              className={clsx(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                range === r.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mb-3">
            <button
              onClick={prevPage}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="上一期"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{periodLabel}</p>
              <p className="text-[10px] text-gray-400">{periodRangeStr}</p>
            </div>
            <button
              onClick={nextPage}
              disabled={page === 0}
              className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                page === 0 ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-700',
              )}
              title={page === 0 ? '已是当期' : '下一期'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex items-end gap-px h-32" style={{ minWidth: '100%' }}>
            {buckets.map((b, i) => {
              const total = b.reviewed
              const correctPct = total > 0 ? Math.round((b.correct / total) * 100) : 0
              const errorCount = b.reviewed - b.correct
              const errorPct = total > 0 ? 100 - correctPct : 0
              const isSel = selIdx === i
              return (
                <button
                  key={i}
                  onClick={() => setSelIdx(isSel ? null : i)}
                  className="flex flex-col items-center gap-1 cursor-pointer"
                  style={{ minWidth: `${barMinW}px`, flex: 1 }}
                  title={total > 0 ? `${b.dateStr}：正确 ${b.correct}（${correctPct}%）/ 错误 ${errorCount}（${errorPct}%）` : `${b.dateStr}：无记录`}
                >
                  <div className={clsx('w-full flex flex-col justify-end h-24 gap-px rounded-t transition-all', isSel && 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-gray-800')}>
                    <div
                      className="w-full rounded-t bg-green-400 dark:bg-green-500"
                      style={{ height: `${(b.correct / maxReviewed) * 100}%`, minHeight: b.correct > 0 ? '3px' : '0' }}
                    />
                    <div
                      className="w-full rounded-t bg-brand-300 dark:bg-brand-600"
                      style={{
                        height: `${(errorCount / maxReviewed) * 100}%`,
                        minHeight: errorCount > 0 ? '3px' : '0',
                      }}
                    />
                  </div>
                  <span className={clsx('text-[8px] whitespace-nowrap', isSel ? 'text-brand-600 dark:text-brand-300 font-bold' : 'text-gray-400')}>{b.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        {selIdx !== null && buckets[selIdx] && (
          <div className="mt-3 rounded-xl bg-brand-50 dark:bg-gray-800 border border-brand-200 dark:border-gray-700 p-3 animate-slide-up">
            {(() => {
              const b = buckets[selIdx]
              const total = b.reviewed
              const correctPct = total > 0 ? Math.round((b.correct / total) * 100) : 0
              const errorCount = b.reviewed - b.correct
              const errorPct = total > 0 ? 100 - correctPct : 0
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{b.dateStr}</span>
                    <button onClick={() => setSelIdx(null)} className="text-[10px] text-gray-400 hover:text-gray-600">关闭</button>
                  </div>
                  {total === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">该周期无复习记录</p>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-0.5">
                          <span className="text-green-600 dark:text-green-400">正确 {b.correct}</span>
                          <span className="text-gray-400">{correctPct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${correctPct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-0.5">
                          <span className="text-brand-600 dark:text-brand-400">错误 {errorCount}</span>
                          <span className="text-gray-400">{errorPct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500" style={{ width: `${errorPct}%` }} />
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 text-center pt-1">共复习 {total} 次</p>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
        <div className="flex gap-4 justify-center mt-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-brand-300 dark:bg-brand-600" />
            <span className="text-[10px] text-gray-400">错误</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-green-400 dark:bg-green-500" />
            <span className="text-[10px] text-gray-400">正确</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-2">点击柱子查看明细</p>
      </div>
      )}

      {view === 'forgetting' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">遗忘分析</h2>
            <span className="text-xs text-gray-400">按上次评分归类，点击查看</span>
          </div>

          {forgettingGroups[0].length === 0 && forgettingGroups[2].length === 0 && forgettingGroups[3].length === 0 && forgettingGroups[4].length === 0 && forgettingGroups[5].length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-8">暂无复习记录，复习后这里会按评分列出单词</p>
          ) : (
            <>
              {/* category buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {RATING_KEYS.map((q) => {
                  const m = QUALITY_MARK[q]
                  const count = forgettingGroups[q].length
                  if (!m) return null
                  return (
                    <button
                      key={q}
                      onClick={() => setSelQ(q)}
                      className={clsx(
                        'rounded-xl px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5',
                        selQ === q
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                      )}
                    >
                      <span className={clsx('w-2 h-2 rounded-full', Q_DOT[q])} />
                      {m.label}
                      <span className={clsx('px-1.5 py-0.5 rounded-full text-[10px]', selQ === q ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600')}>{count}</span>
                    </button>
                  )
                })}
              </div>

              {/* word cards */}
              {groupWords.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">该类别暂无单词</p>
              ) : (
                <>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                    {fPage.map((r) => {
                      const m = QUALITY_MARK[selQ]
                      const daysAgo = r.lastReviewed ? Math.floor((Date.now() - r.lastReviewed) / 86400000) : 0
                      return (
                        <button
                          key={r.word.id}
                          onClick={() => r.word.id !== undefined && setDetailWord(r.word)}
                          className="card p-3 text-left hover:border-brand-400 dark:hover:border-brand-600 transition-colors flex flex-col"
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <p className="font-bold text-gray-900 dark:text-gray-50 truncate text-sm">{r.word.text}</p>
                            {m && <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0', m.cls)}>{m.label}</span>}
                          </div>
                          {wordPhonetic(r.word) && <p className="text-[11px] text-gray-400 truncate">/{wordPhonetic(r.word)}/</p>}
                          <p className="text-[10px] text-gray-400 mt-auto pt-2">
                            间隔 {r.card?.interval ?? 0} 天 · {daysAgo < 1 ? '今天' : `${daysAgo}天前`}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                  <Pagination
                    currentPage={fCurrent + 1}
                    totalPages={fTotalPages}
                    onPageChange={(n) => setFp(n - 1)}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {view === 'calendar' && (() => {
        const learningSet = new Set(learningDays)
        const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
        const cells: (number | null)[] = []
        for (let i = 0; i < firstWeekday; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(d)
        while (cells.length % 7 !== 0) cells.push(null)
        const monthLabel = `${calYear}年${calMonth + 1}月`
        const today = new Date()
        const isCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth()
        const cellColor = (day: number) => {
          const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          if (!learningSet.has(ds)) return 'bg-gray-100 dark:bg-gray-700'
          return 'bg-green-500 text-white'
        }
        return (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => { if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) } else setCalMonth((m) => m - 1) }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{monthLabel}</span>
              <button
                onClick={() => { if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) } else setCalMonth((m) => m + 1) }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
                <div key={w} className="text-center text-[10px] text-gray-400 font-medium">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => (
                <div
                  key={i}
                  className={clsx(
                    'h-8 rounded-lg flex items-center justify-center text-[10px] transition-colors',
                    day === null ? 'bg-transparent' : cellColor(day),
                    day !== null && isCurrentMonth && day === today.getDate() && 'ring-2 ring-brand-500',
                  )}
                >
                  {day ?? ''}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              <span className="w-4 h-4 rounded bg-gray-100 dark:bg-gray-700" />
              <span className="text-[10px] text-gray-400">未学习</span>
              <span className="w-4 h-4 rounded bg-green-500" />
              <span className="text-[10px] text-gray-400">已学习</span>
            </div>
          </div>
        )
      })()}

      {detailWord && (
        <WordDetail
          word={detailWord}
          card={cards.find((c) => c.wordId === detailWord.id)}
          categories={categories}
          onClose={() => setDetailWord(null)}
        />
      )}
    </Page>
  )
}

function StatCard({
  label,
  value,
  icon,
  accent,
  sub,
}: {
  label: string
  value: number | string
  icon: string
  accent: string
  sub?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={clsx('text-2xl font-bold mt-1', accent)}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
