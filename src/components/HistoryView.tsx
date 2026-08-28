import { useEffect, useMemo, useState } from 'react'
import { repoQuizSessionList, repoQuizSessionWrongs, repoWordsByIds, repoCardsByWordIds } from '../lib/repo'
import { useStore } from '../store/useStore'
import { wordPhonetic } from '../lib/word'
import { PasswordDialog } from './PasswordDialog'
import { Page } from './Page'
import { EmptyState } from './EmptyState'
import { WrongCard } from './WrongCard'
import type { QuizSession, WordEntry, WrongRecord } from '../types'
import clsx from 'clsx'

interface ExpandedData {
  wrongs: WrongRecord[]
  words: Map<number, WordEntry>
  wrongCounts: Map<number, number>
}

const MODE_LABELS: Record<string, string> = { choice: '选择题', spell: '拼写', posconv: '词性转换' }

type SessionCategory = 'choice' | 'spell' | 'posconv' | 'retest'

function sessionCategory(s: QuizSession): SessionCategory {
  if (s.isRetest || s.mode === 'mixed' || s.label === '错题重测' || s.label === '错题重默') return 'retest'
  return s.mode
}

function scoreColor(score: number): string {
  if (score >= 95) return 'text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300'
  if (score >= 90) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300'
  if (score >= 80) return 'text-green-600 bg-green-100 dark:bg-green-900/40 dark:text-green-300'
  if (score >= 60) return 'text-gray-500 bg-gray-100 dark:bg-gray-700/40 dark:text-gray-300'
  return 'text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-300'
}

function scoreLabel(score: number): string {
  if (score >= 95) return '夯爆了'
  if (score >= 90) return '顶级'
  if (score >= 80) return '人上人'
  if (score >= 60) return 'NPC'
  return '拉完了'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hms = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  if (sameDay) return `今天 ${hms}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hms}`
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${hms}`
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return '-'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0) return `${m}分${sec}秒`
  return `${sec}秒`
}

export function HistoryView() {
  const refreshKey = useStore((s) => s.refreshKey)
  const refresh = useStore((s) => s.refresh)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const launchQuizFromWords = useStore((s) => s.launchQuizFromWords)
  const deleteQuizSession = useStore((s) => s.deleteQuizSession)
  const clearQuizSessions = useStore((s) => s.clearQuizSessions)
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [modeFilter, setModeFilter] = useState<'all' | SessionCategory>('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [expandedData, setExpandedData] = useState<ExpandedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<QuizSession | null>(null)
  const [clearAll, setClearAll] = useState(false)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('')
  const [wrongPage, setWrongPage] = useState(1)
  const [wrongPageInput, setWrongPageInput] = useState('')
const PAGE_SIZE = 5
const WRONG_PAGE_SIZE = 12

  useEffect(() => {
    let active = true
    setLoadError(null)
    repoQuizSessionList().then((s) => {
      if (!active) return
      setSessions(s)
      setLoading(false)
    }).catch((e) => {
      if (!active) return
      setLoadError(e instanceof Error ? e.message : '加载考试记录失败')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey])

  useEffect(() => {
    if (expanded === null) {
      setExpandedData(null)
      return
    }
    const session = sessions.find((s) => s.id === expanded)
    if (session && session.total - session.correct === 0) {
      setExpandedData({ wrongs: [], words: new Map(), wrongCounts: new Map() })
      return
    }
    let active = true
    setExpandedData(null)
    void (async () => {
      const wrongs = await repoQuizSessionWrongs(expanded)
      if (!active) return
      const wordIds = [...new Set(wrongs.map((w) => w.wordId))]
      const [words, cardMap] = await Promise.all([repoWordsByIds(wordIds), repoCardsByWordIds(wordIds)])
      if (!active) return
      const wcMap = new Map<number, number>()
      cardMap.forEach((c, wid) => wcMap.set(wid, c.quizWrongCount))
      setExpandedData({ wrongs, words, wrongCounts: wcMap })
    })()
    return () => {
      active = false
    }
  }, [expanded, sessions])

  const modeCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of sessions) {
      const cat = sessionCategory(s)
      c[cat] = (c[cat] ?? 0) + 1
    }
    return c
  }, [sessions])

  const filteredSessions = useMemo(() => {
    if (modeFilter === 'all') return sessions
    return sessions.filter((s) => sessionCategory(s) === modeFilter)
  }, [sessions, modeFilter])

  const stats = useMemo(() => {
    if (filteredSessions.length === 0) return { count: 0, avg: 0, best: 0 }
    const scores = filteredSessions.map((s) => s.score)
    return {
      count: filteredSessions.length,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      best: Math.max(...scores),
    }
  }, [filteredSessions])

  const retestSession = async (session: QuizSession) => {
    let wrongs = expandedData?.wrongs
    if (!wrongs) {
      wrongs = await repoQuizSessionWrongs(session.id!)
    }
    if (!wrongs || wrongs.length === 0) return
    const wordMap = await repoWordsByIds(wrongs.map((w) => w.wordId))
    if (wordMap.size === 0) return
    if (session.mode === 'mixed') {
      const words: WordEntry[] = []
      const modes: ('choice' | 'spell' | 'posconv')[] = []
      for (const w of wrongs) {
        const word = wordMap.get(w.wordId)
        if (!word) continue
        words.push(word)
        modes.push(w.mode)
      }
      if (words.length === 0) return
      launchQuizFromWords(words, 'mixed', modes, true)
      return
    }
    launchQuizFromWords([...wordMap.values()], session.mode, undefined, true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return <EmptyState icon="⚠️" title="加载考试记录失败" description={loadError} actionLabel="重试" onAction={refresh} />
  }

  if (sessions.length === 0) {
    return <EmptyState icon="🕑" title="还没有考试记录" description="完成一次测验后这里会显示历史记录" actionLabel="去测验" onAction={() => setActiveTab('quiz')} />
  }

  return (
    <Page
      title="考试记录"
      icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z M3 3l4 4M3 3v4M3 3h4"
      description="查看历次测验成绩与错题明细"
    >
      <div className="flex rounded-xl bg-gray-100 dark:bg-gray-700 p-0.5 mb-4 overflow-x-auto">
        {(['all', 'choice', 'spell', 'posconv', 'retest'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setModeFilter(m); setPage(1) }}
            className={clsx(
              'flex-1 whitespace-nowrap px-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
              modeFilter === m
                ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm'
                : 'text-gray-500 dark:text-gray-400',
            )}
          >
            {m === 'all' ? `全部(${sessions.length})` : `${m === 'retest' ? '错题重默' : MODE_LABELS[m]}(${modeCounts[m] ?? 0})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-brand-600">{stats.count}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">考试次数</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-blue-600">{stats.avg}%</p>
          <p className="text-[10px] text-gray-400 mt-0.5">平均分</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-xl font-bold text-green-600">{stats.best}%</p>
          <p className="text-[10px] text-gray-400 mt-0.5">最高分</p>
        </div>
      </div>

      {filteredSessions.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-10">该题型暂无测验记录</p>
      )}

      <div className="space-y-2.5">
        {(() => {
          const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE))
          const currentPage = Math.min(page, totalPages)
          const pagedSessions = filteredSessions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
          return pagedSessions
        })().map((s) => {
          const isOpen = expanded === s.id
          return (
            <div key={s.id} className="card overflow-hidden">
              <div className="w-full flex items-center gap-2 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <button
                  onClick={() => { setExpanded(isOpen ? null : s.id!); setWrongPage(1); setWrongPageInput('') }}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className={clsx('w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0', scoreColor(s.score))}>
                    <span className="text-lg font-bold leading-none">{s.score}</span>
                    <span className="text-[9px] font-bold mt-0.5 leading-none">{scoreLabel(s.score)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {s.correct}/{s.total} 正确
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        {sessionCategory(s) === 'retest' ? '错题重默' : MODE_LABELS[s.mode]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{s.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(s.date)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">用时 {formatDuration(s.duration)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.total - s.correct > 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-300">
                        {s.total - s.correct} 错题
                      </span>
                    )}
                    <svg
                      className={clsx('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-180')}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <button
                  onClick={() => setDeleteTarget(s)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
                  title="删除此记录"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 animate-slide-up">
                  {s.total - s.correct === 0 ? (
                    <p className="text-sm text-center text-green-600 dark:text-green-400 py-4">
                      🎉 本次测验全对，没有错题！
                    </p>
                  ) : !expandedData ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">本次错题（{expandedData.wrongs.length}）</h3>
                        <button onClick={() => retestSession(s)} className="btn-primary text-xs px-3 py-1.5">
                          只测本次错题
                        </button>
                      </div>
                      {(() => {
                        const wrongTotalPages = Math.max(1, Math.ceil(expandedData.wrongs.length / WRONG_PAGE_SIZE))
                        const wrongCurrentPage = Math.min(wrongPage, wrongTotalPages)
                        const pagedWrongs = expandedData.wrongs.slice((wrongCurrentPage - 1) * WRONG_PAGE_SIZE, wrongCurrentPage * WRONG_PAGE_SIZE)
                        return (
                          <>
                            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                              {pagedWrongs.map((w, i) => {
                                const word = expandedData.words.get(w.wordId)
                                return (
                                  <WrongCard
                                    key={(wrongCurrentPage - 1) * WRONG_PAGE_SIZE + i}
                                    text={w.wordText}
                                    phonetic={word ? wordPhonetic(word) : undefined}
                                    meaning={w.meaning}
                                    mode={w.mode}
                                    timedOut={w.timedOut}
                                    correctAnswer={w.correctAnswer}
                                    userAnswer={w.userAnswer}
                                    wrongCount={expandedData.wrongCounts.get(w.wordId) ?? 0}
                                  />
                                )
                              })}
                            </div>
                            {wrongTotalPages > 1 && (
                              <div className="flex items-center justify-center gap-1 mt-4 flex-wrap">
                                <button onClick={() => setWrongPage(1)} disabled={wrongCurrentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', wrongCurrentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="首页">«</button>
                                <button onClick={() => setWrongPage((p) => Math.max(1, p - 1))} disabled={wrongCurrentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', wrongCurrentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                {(() => {
                                  const btns: React.ReactNode[] = []
                                  const start = Math.max(1, wrongCurrentPage - 2)
                                  const end = Math.min(wrongTotalPages, wrongCurrentPage + 2)
                                  if (start > 1) btns.push(<span key="e1" className="text-gray-400 px-1">…</span>)
                                  for (let i = start; i <= end; i++) {
                                    btns.push(<button key={i} onClick={() => setWrongPage(i)} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors', i === wrongCurrentPage ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>{i}</button>)
                                  }
                                  if (end < wrongTotalPages) btns.push(<span key="e2" className="text-gray-400 px-1">…</span>)
                                  return btns
                                })()}
                                <button onClick={() => setWrongPage((p) => Math.min(wrongTotalPages, p + 1))} disabled={wrongCurrentPage >= wrongTotalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', wrongCurrentPage >= wrongTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </button>
                                <button onClick={() => setWrongPage(wrongTotalPages)} disabled={wrongCurrentPage >= wrongTotalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', wrongCurrentPage >= wrongTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="末页">»</button>
                                <div className="flex items-center gap-1 ml-2">
                                  <span className="text-xs text-gray-400">跳至</span>
                                  <input type="number" min={1} max={wrongTotalPages} value={wrongPageInput} onChange={(e) => setWrongPageInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(wrongPageInput, 10); if (!Number.isNaN(n) && n >= 1 && n <= wrongTotalPages) setWrongPage(n); setWrongPageInput('') } }} placeholder={String(wrongCurrentPage)} className="w-12 text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                                  <span className="text-xs text-gray-400">页</span>
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end mt-4">
        <button
          onClick={() => setClearAll(true)}
          className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          清空全部
        </button>
      </div>

      {(() => {
        const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE))
        const currentPage = Math.min(page, totalPages)
        if (totalPages <= 1) return null
        return (
          <div className="flex items-center justify-center gap-1 mt-6 flex-wrap">
            <button onClick={() => setPage(1)} disabled={currentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', currentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="首页">«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', currentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            {(() => {
              const btns: React.ReactNode[] = []
              const start = Math.max(1, currentPage - 2)
              const end = Math.min(totalPages, currentPage + 2)
              if (start > 1) btns.push(<span key="e1" className="text-gray-400 px-1">…</span>)
              for (let i = start; i <= end; i++) {
                btns.push(<button key={i} onClick={() => setPage(i)} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors', i === currentPage ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>{i}</button>)
              }
              if (end < totalPages) btns.push(<span key="e2" className="text-gray-400 px-1">…</span>)
              return btns
            })()}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', currentPage >= totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            <button onClick={() => setPage(totalPages)} disabled={currentPage >= totalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', currentPage >= totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="末页">»</button>
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs text-gray-400">跳至</span>
              <input type="number" min={1} max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(pageInput, 10); if (!Number.isNaN(n) && n >= 1 && n <= totalPages) setPage(n); setPageInput('') } }} placeholder={String(currentPage)} className="w-12 text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <span className="text-xs text-gray-400">页</span>
            </div>
          </div>
        )
      })()}

      <PasswordDialog
        open={deleteTarget !== null}
        title="删除此考试记录"
        message={
          <>
            确定删除 {deleteTarget ? formatDate(deleteTarget.date) : ''} 的考试记录吗？该记录及其错题明细将被永久删除，此操作不可撤销。
          </>
        }
        onConfirm={async () => {
          if (deleteTarget && deleteTarget.id !== undefined) {
            await deleteQuizSession(deleteTarget.id)
            if (expanded === deleteTarget.id) setExpanded(null)
          }
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <PasswordDialog
        open={clearAll}
        title="清空全部考试记录"
        message={
          <>
            将删除全部 <b className="text-red-600">{sessions.length}</b> 条考试记录及其错题明细，此操作不可撤销。
          </>
        }
        onConfirm={async () => {
          await clearQuizSessions()
          setExpanded(null)
          setClearAll(false)
        }}
        onCancel={() => setClearAll(false)}
      />
    </Page>
  )
}
