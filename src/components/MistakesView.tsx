import { useEffect, useMemo, useRef, useState } from 'react'
import { repoMistakes, repoCategories, repoWordsByIds, repoCardsByWordIds } from '../lib/repo'
import { useStore } from '../store/useStore'
import { getDescendantIds, getCategoryNamePath, getTreeNodes } from '../lib/tree'
import { wordDisplayMeaning, wordPhonetic } from '../lib/word'
import { CategoryMultiSelect } from './CategoryMultiSelect'
import { Page } from './Page'
import { EmptyState } from './EmptyState'
import { WrongCard } from './WrongCard'
import type { Mistake, Category, WordEntry } from '../types'
import clsx from 'clsx'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}天前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}-${d.getDate()}`
}

const MODE_LABELS: Record<string, string> = { choice: '选择题', spell: '拼写', posconv: '词性转换', mixed: '原题型' }
const PREVIEW_COUNT = 3
const CAT_PAGE_SIZE = 5
const ITEM_PAGE_SIZE = 12

function MistakeCard({ m, words, wrongCount, wordsLoading }: { m: Mistake; words: Map<number, WordEntry>; wrongCount: number; wordsLoading: boolean }) {
  const word = words.get(m.wordId)
  if (!word && wordsLoading) {
    return (
      <div className="card p-3 animate-pulse">
        <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded mt-2.5" />
        <div className="h-3 w-2/3 bg-gray-100 dark:bg-gray-800 rounded mt-1.5" />
      </div>
    )
  }
  return (
    <WrongCard
      text={word?.text ?? '（已删除）'}
      phonetic={word ? wordPhonetic(word) : undefined}
      meaning={word ? wordDisplayMeaning(word) : undefined}
      mode={m.mode}
      timedOut={m.timedOut}
      correctAnswer={m.correctAnswer}
      userAnswer={m.userAnswer}
      footer={timeAgo(m.createdAt)}
      wrongCount={wrongCount}
    />
  )
}

export function MistakesView() {
  const refreshKey = useStore((s) => s.refreshKey)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const launchQuizFromWords = useStore((s) => s.launchQuizFromWords)
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [tab, setTab] = useState<'current' | 'history'>('current')
  const [categories, setCategories] = useState<Category[]>([])
  const [words, setWords] = useState<Map<number, WordEntry>>(new Map())
  const [wrongCounts, setWrongCounts] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [wordsLoading, setWordsLoading] = useState(true)
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set())
  const catInitRef = useRef(false)
  const [testMode, setTestMode] = useState<'choice' | 'spell' | 'posconv' | 'mixed'>('mixed')
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [detailCatId, setDetailCatId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('')
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageInput, setDetailPageInput] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const [all, cats] = await Promise.all([
        repoMistakes(),
        repoCategories(),
      ])
      if (!active) return
      setMistakes(all)
      setCategories(cats)
      if (!catInitRef.current && cats.length > 0) {
        catInitRef.current = true
        setSelectedCats(new Set(cats.map((c) => c.id!)))
      }
      setLoading(false)
      const wordIds = [...new Set(all.map((m) => m.wordId))]
      if (wordIds.length === 0) {
        setWordsLoading(false)
        return
      }
      setWordsLoading(true)
      const [map, cardMap] = await Promise.all([repoWordsByIds(wordIds), repoCardsByWordIds(wordIds)])
      if (!active) return
      setWords(map)
      const wcMap = new Map<number, number>()
      cardMap.forEach((c, wordId) => wcMap.set(wordId, c.quizWrongCount))
      setWrongCounts(wcMap)
      setWordsLoading(false)
    })()
    return () => {
      active = false
    }
  }, [refreshKey])

  const currentMistakes = useMemo(() => mistakes.filter((m) => !m.resolved), [mistakes])
  const historyMistakes = useMemo(() => mistakes.filter((m) => m.resolved), [mistakes])
  const activeMistakes = tab === 'current' ? currentMistakes : historyMistakes

  const subtreeIds = useMemo(() => {
    const ids = new Set<number>()
    selectedCats.forEach((id) => getDescendantIds(categories, id).forEach((x) => ids.add(x)))
    return ids
  }, [categories, selectedCats])

  const filtered = useMemo(() => {
    if (selectedCats.size === 0) return []
    return activeMistakes.filter((m) => subtreeIds.has(m.categoryId))
  }, [activeMistakes, subtreeIds, selectedCats])

  const groups = useMemo(() => {
    const map = new Map<number, Mistake[]>()
    for (const m of filtered) {
      const arr = map.get(m.categoryId) ?? []
      arr.push(m)
      map.set(m.categoryId, arr)
    }
    const nodes = getTreeNodes(categories)
    const order = new Map(nodes.map((n, i) => [n.cat.id!, i]))
    return [...map.entries()].sort((a, b) => {
      const oa = order.get(a[0]) ?? 999
      const ob = order.get(b[0]) ?? 999
      return oa - ob
    })
  }, [filtered, categories])

  const groupItemsByCat = useMemo(
    () => new Map(groups.map(([id, items]) => [id, items])),
    [groups],
  )

  const totalPages = Math.max(1, Math.ceil(groups.length / CAT_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedGroups = groups.slice((currentPage - 1) * CAT_PAGE_SIZE, currentPage * CAT_PAGE_SIZE)

  const startTest = async (list: Mistake[]) => {
    const wordIds = [...new Set(list.map((m) => m.wordId))]
    const wordMap = await repoWordsByIds(wordIds)
    if (wordMap.size === 0) return
    if (testMode === 'mixed') {
      const words: WordEntry[] = []
      const modes: ('choice' | 'spell' | 'posconv')[] = []
      for (const m of list) {
        const w = wordMap.get(m.wordId)
        if (!w) continue
        words.push(w)
        modes.push(m.mode)
      }
      if (words.length === 0) return
      launchQuizFromWords(words, 'mixed', modes, true)
      return
    }
    launchQuizFromWords([...wordMap.values()], testMode, undefined, true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (mistakes.length === 0) {
    return (
      <EmptyState icon="✅" title="错题本是空的" description="测验中答错的单词会自动收录到这里" actionLabel="去测验" onAction={() => setActiveTab('quiz')} />
    )
  }

  return (
    <Page title="错题本" icon="M6 3h12a2 2 0 012 2v16l-8-4-8 4V5a2 2 0 012-2z" description="回顾答错的单词，重点突破">
      {view === 'list' ? (
        <>
          <div className="flex rounded-xl bg-gray-100 dark:bg-gray-700 p-0.5 mb-3">
            {(['current', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setPage(1) }}
                className={clsx(
                  'flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === t
                    ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400',
                )}
              >
                {t === 'current' ? `当前错题（${currentMistakes.length}）` : `历史错题（${historyMistakes.length}）`}
              </button>
            ))}
          </div>
          {tab === 'history' && (
            <p className="text-xs text-gray-400 mb-3 px-1">错过之后又答对的单词会归档到这里，记录与错误次数永久保留</p>
          )}
          <div className="card p-4 mb-4">
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">按类别筛选（可多选）</label>
            <CategoryMultiSelect
              categories={categories}
              selected={selectedCats}
              onChange={(s) => { setSelectedCats(s); setView('list'); setPage(1) }}
              className="w-full mb-3"
            />
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">测试模式</label>
              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-700 p-0.5">
                  {(['choice', 'spell', 'posconv', 'mixed'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTestMode(m)}
                    className={clsx(
                      'flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      testMode === m
                        ? 'bg-white dark:bg-gray-800 text-brand-600 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {MODE_LABELS[m]}
                  </button>
                  ))}
                </div>
              </div>
            <button
              onClick={() => startTest(filtered)}
              disabled={filtered.length === 0}
              className="btn-primary w-full mt-3"
            >
              {tab === 'current' ? '测试这些错题' : '重测这些单词'}（{filtered.length} 词）
            </button>
          </div>

          <div className="space-y-6">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-10">
                {tab === 'current' ? '当前没有错题，继续保持！' : '所选类别下暂无历史错题'}
              </p>
            )}
            {pagedGroups.map(([categoryId, items]) => {
              const path = getCategoryNamePath(categories, categoryId)
              const preview = items.slice(0, PREVIEW_COUNT)
              const hasMore = items.length > PREVIEW_COUNT
              return (
                <div key={categoryId}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {path} <span className="text-gray-400 font-normal">({items.length})</span>
                    </h3>
                    <button
                      onClick={() => startTest(items)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      测试该类
                    </button>
                  </div>
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {preview.map((m) => (
                      <MistakeCard key={m.id} m={m} words={words} wrongCount={wrongCounts.get(m.wordId) ?? 0} wordsLoading={wordsLoading} />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="mt-3 flex justify-center">
                      <button
                        onClick={() => { setDetailCatId(categoryId); setView('detail'); setDetailPage(1) }}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                      >
                        显示更多（共 {items.length} 个）→
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
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
          )}
        </>
      ) : (
        (() => {
          if (detailCatId == null) return null
          const items = groupItemsByCat.get(detailCatId) ?? []
          const path = getCategoryNamePath(categories, detailCatId)
          const detailTotalPages = Math.max(1, Math.ceil(items.length / ITEM_PAGE_SIZE))
          const detailCurrentPage = Math.min(detailPage, detailTotalPages)
          const pagedDetailItems = items.slice((detailCurrentPage - 1) * ITEM_PAGE_SIZE, detailCurrentPage * ITEM_PAGE_SIZE)
          return (
            <>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setView('list')}
                  className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 font-medium px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  返回错题列表
                </button>
                <button
                  onClick={() => startTest(items)}
                  disabled={items.length === 0}
                  className="btn-primary text-xs"
                >
                  测试该类（{items.length}）
                </button>
              </div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 px-1">
                {path} <span className="text-gray-400 font-normal">({items.length})</span>
              </h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {pagedDetailItems.map((m) => (
                  <MistakeCard key={m.id} m={m} words={words} wrongCount={wrongCounts.get(m.wordId) ?? 0} wordsLoading={wordsLoading} />
                ))}
              </div>
              {detailTotalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mt-6 flex-wrap">
                  <button onClick={() => setDetailPage(1)} disabled={detailCurrentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', detailCurrentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="首页">«</button>
                  <button onClick={() => setDetailPage((p) => Math.max(1, p - 1))} disabled={detailCurrentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', detailCurrentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  {(() => {
                    const btns: React.ReactNode[] = []
                    const start = Math.max(1, detailCurrentPage - 2)
                    const end = Math.min(detailTotalPages, detailCurrentPage + 2)
                    if (start > 1) btns.push(<span key="e1" className="text-gray-400 px-1">…</span>)
                    for (let i = start; i <= end; i++) {
                      btns.push(<button key={i} onClick={() => setDetailPage(i)} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors', i === detailCurrentPage ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>{i}</button>)
                    }
                    if (end < detailTotalPages) btns.push(<span key="e2" className="text-gray-400 px-1">…</span>)
                    return btns
                  })()}
                  <button onClick={() => setDetailPage((p) => Math.min(detailTotalPages, p + 1))} disabled={detailCurrentPage >= detailTotalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', detailCurrentPage >= detailTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button onClick={() => setDetailPage(detailTotalPages)} disabled={detailCurrentPage >= detailTotalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', detailCurrentPage >= detailTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="末页">»</button>
                  <div className="flex items-center gap-1 ml-2">
                    <span className="text-xs text-gray-400">跳至</span>
                    <input type="number" min={1} max={detailTotalPages} value={detailPageInput} onChange={(e) => setDetailPageInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(detailPageInput, 10); if (!Number.isNaN(n) && n >= 1 && n <= detailTotalPages) setDetailPage(n); setDetailPageInput('') } }} placeholder={String(detailCurrentPage)} className="w-12 text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <span className="text-xs text-gray-400">页</span>
                  </div>
                </div>
              )}
            </>
          )
        })()
      )}
    </Page>
  )
}
