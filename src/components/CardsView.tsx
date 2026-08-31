import { useEffect, useMemo, useRef, useState } from 'react'
import { repoWords, repoCards, repoCategories } from '../lib/repo'
import { useStore } from '../store/useStore'
import { speak } from '../lib/tts'
import { formatDueLabel, QUALITY_MARK } from '../lib/sm2'
import { getDescendantIds, getCategoryNamePath } from '../lib/tree'
import { PasswordDialog } from './PasswordDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { EditWordDialog } from './EditWordDialog'
import { CategoryMultiSelect } from './CategoryMultiSelect'
import { Page } from './Page'
import { EmptyState } from './EmptyState'
import { WordDetail } from './WordDetail'
import { Pagination } from './Pagination'
import type { WordEntry, SrsCard, Category } from '../types'
import clsx from 'clsx'

interface JoinedWord {
  word: WordEntry
  card: SrsCard | undefined
  categories: { categoryId: number; path: string }[]
}

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  new: { text: '新词', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  learning: { text: '学习中', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  review: { text: '复习中', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' },
  mastered: { text: '已掌握', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
}

type DeleteTarget =
  | { kind: 'word'; word: WordEntry }
  | { kind: 'words'; words: WordEntry[] }
  | { kind: 'category'; categoryIds: number[]; label: string; count: number }
  | { kind: 'all'; count: number }

export function CardsView() {
  const refreshKey = useStore((s) => s.refreshKey)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const deleteWord = useStore((s) => s.deleteWord)
  const deleteWords = useStore((s) => s.deleteWords)
  const deleteWordsInCategories = useStore((s) => s.deleteWordsInCategories)
  const deleteAllWords = useStore((s) => s.deleteAllWords)
  const updateWord = useStore((s) => s.updateWord)
  const setStarred = useStore((s) => s.setStarred)
  const renameCategory = useStore((s) => s.renameCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const launchQuizFromWords = useStore((s) => s.launchQuizFromWords)
  const [items, setItems] = useState<JoinedWord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [qualityFilter, setQualityFilter] = useState<string>('all')
  const [sortMode, setSortMode] = useState<'default' | 'asc' | 'desc' | 'starred' | 'errors'>('default')
  const [starFilter, setStarFilter] = useState<'all' | 'starred' | 'unstarred'>('all')
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set())
  const catInitRef = useRef(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [editTarget, setEditTarget] = useState<WordEntry | null>(null)
  const [deleteCatTarget, setDeleteCatTarget] = useState<Category | null>(null)
  const [deleteCatError, setDeleteCatError] = useState('')
  const [page, setPage] = useState(1)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detailWord, setDetailWord] = useState<WordEntry | null>(null)
  const PAGE_SIZE = 12

  useEffect(() => {
    let active = true
    ;(async () => {
      const [words, cards, cats] = await Promise.all([
        repoWords(),
        repoCards(),
        repoCategories(),
      ])
      if (!active) return
      const cardMap = new Map(cards.map((c) => [c.wordId, c]))
      const catPathMap = new Map<number, string>()
      for (const c of cats) {
        if (c.id !== undefined) catPathMap.set(c.id, getCategoryNamePath(cats, c.id))
      }
      const joined: JoinedWord[] = words
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((w) => ({
          word: w,
          card: cardMap.get(w.id!),
          categories: w.meanings.map((m) => ({
            categoryId: m.categoryId,
            path: catPathMap.get(m.categoryId) || '未分类',
          })),
        }))
      setCategories(cats)
      setItems(joined)
      if (!catInitRef.current && cats.length > 0) {
        catInitRef.current = true
        setSelectedCats(new Set(cats.map((c) => c.id!)))
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [refreshKey])

  const subtreeIds = useMemo(() => {
    if (selectedCats.size === 0) return null
    const ids = new Set<number>()
    selectedCats.forEach((id) => {
      getDescendantIds(categories, id).forEach((x) => ids.add(x))
    })
    return ids
  }, [categories, selectedCats])

  const filtered = useMemo(() => {
    let result = items
    if (subtreeIds) {
      result = result.filter((i) => i.word.meanings.some((m) => subtreeIds.has(m.categoryId)))
    }
    if (filter !== 'all') {
      result = result.filter((i) => (i.card?.status ?? 'new') === filter)
    }
    if (qualityFilter !== 'all') {
      if (qualityFilter === 'none') {
        result = result.filter((i) => i.card?.lastQuality == null)
      } else {
        const q = Number(qualityFilter)
        result = result.filter((i) => i.card?.lastQuality === q)
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(
        (i) =>
          i.word.text.toLowerCase().includes(q) ||
          i.word.meanings.some((m) => m.meaning.toLowerCase().includes(q)),
      )
    }
    if (starFilter === 'starred') {
      result = result.filter((i) => i.word.starred)
    } else if (starFilter === 'unstarred') {
      result = result.filter((i) => !i.word.starred)
    }
    if (sortMode === 'asc') {
      result = [...result].sort((a, b) => a.word.text.localeCompare(b.word.text, undefined, { sensitivity: 'base' }))
    } else if (sortMode === 'desc') {
      result = [...result].sort((a, b) => b.word.text.localeCompare(a.word.text, undefined, { sensitivity: 'base' }))
    } else if (sortMode === 'starred') {
      result = [...result].sort(
        (a, b) => Number(b.word.starred) - Number(a.word.starred) || b.word.createdAt - a.word.createdAt,
      )
    } else if (sortMode === 'errors') {
      result = [...result].sort(
        (a, b) => (b.card?.quizWrongCount ?? 0) - (a.card?.quizWrongCount ?? 0) || b.word.createdAt - a.word.createdAt,
      )
    }
    return result
  }, [items, search, filter, qualityFilter, sortMode, starFilter, subtreeIds])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const pageIds = pagedItems.map((i) => i.word.id!)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPageSelected = !allOnPageSelected && pageIds.some((id) => selected.has(id))

  useEffect(() => {
    setPage(1)
  }, [search, filter, qualityFilter, sortMode, starFilter, subtreeIds])

  const toggleFlip = (id: number) => {
    setFlipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleStar = (word: WordEntry) => {
    const next = !word.starred
    setItems((prev) => prev.map((i) => (i.word.id === word.id ? { ...i, word: { ...i.word, starred: next } } : i)))
    void setStarred(word.id!, next)
  }

  const resetFilters = () => {
    setSearch('')
    setFilter('all')
    setQualityFilter('all')
    setStarFilter('all')
    setSortMode('default')
    setSelectedCats(new Set(categories.map((c) => c.id!)))
    setFlipped(new Set())
  }

  const categoryFiltered = selectedCats.size > 0 && selectedCats.size < categories.length
  const hasActiveFilter =
    search.trim() !== '' ||
    filter !== 'all' ||
    qualityFilter !== 'all' ||
    starFilter !== 'all' ||
    sortMode !== 'default' ||
    categoryFiltered

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllOnPage = (ids: number[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (ids.length > 0 && ids.every((id) => next.has(id))) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const selectedWords = useMemo(
    () => items.filter((i) => i.word.id !== undefined && selected.has(i.word.id!)).map((i) => i.word),
    [items, selected],
  )

  const dueCount = items.filter((i) => i.card && i.card.dueDate <= Date.now()).length

  const selectedCatCount = useMemo(() => {
    if (!subtreeIds) return 0
    return items.filter((i) => i.word.meanings.some((m) => subtreeIds.has(m.categoryId))).length
  }, [items, subtreeIds])

  const selectedCatLabel = useMemo(() => {
    if (selectedCats.size === 0) return ''
    if (selectedCats.size >= categories.length) return '全部类别'
    const names = categories.filter((c) => selectedCats.has(c.id!)).map((c) => c.name)
    if (names.length <= 3) return names.join('、')
    return `${names.length}个类别`
  }, [selectedCats, categories])

  const requestDeleteCategory = (id: number) => {
    const cat = categories.find((c) => c.id === id)
    if (!cat) return
    if (categories.some((c) => c.parentId === id)) {
      setDeleteCatError(`「${cat.name}」下还有子类别，请先删除所有子类别`)
      setDeleteCatTarget(null)
      return
    }
    if (items.some((i) => i.word.meanings.some((m) => m.categoryId === id))) {
      setDeleteCatError(`「${cat.name}」下还有单词，无法删除`)
      setDeleteCatTarget(null)
      return
    }
    setDeleteCatError('')
    setDeleteCatTarget(cat)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.kind === 'word') {
        await deleteWord(deleteTarget.word.id!)
      } else if (deleteTarget.kind === 'words') {
        await deleteWords(deleteTarget.words.map((w) => w.id!))
      } else if (deleteTarget.kind === 'category') {
        await deleteWordsInCategories(deleteTarget.categoryIds)
        catInitRef.current = false
      } else {
        await deleteAllWords()
      }
      setDeleteTarget(null)
      setDeleteCatError('')
      if (deleteTarget.kind === 'words') {
        setSelected(new Set())
        setSelectMode(false)
      }
    } catch (e) {
      setDeleteTarget(null)
      setDeleteCatError(e instanceof Error ? e.message : '删除失败')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (items.length === 0 && categories.length === 0) {
    return <EmptyState title="还没有单词" description="先导入一个单词文件吧" actionLabel="去导入" onAction={() => setActiveTab('upload')} />
  }

  const dialogProps = deleteTarget
    ? deleteTarget.kind === 'word'
      ? {
          title: '删除单词',
          message: (
            <>
              确定删除单词 <b className="text-gray-700 dark:text-gray-200">{deleteTarget.word.text}</b> 吗？该单词的卡片和学习记录将一并删除，此操作不可撤销。
            </>
          ),
        }
      : deleteTarget.kind === 'words'
        ? {
            title: '删除选中单词',
            message: (
              <>
                确定删除选中的 <b className="text-red-600">{deleteTarget.words.length}</b> 个单词吗？这些单词的卡片、学习记录、错题与考试记录将一并删除，此操作不可撤销。
              </>
            ),
          }
        : deleteTarget.kind === 'category'
          ? {
              title: `清空所选类别`,
              message: (
                <>
                  将删除所选类别（{deleteTarget.label}）下共 <b className="text-red-600">{deleteTarget.count}</b> 个词的释义，无其他类别释义的词将整体删除（含卡片与记录），此操作不可撤销。
                </>
              ),
            }
          : {
              title: '清空全部单词',
              message: (
                <>
                将删除词库中全部 <b className="text-red-600">{deleteTarget.count}</b> 个单词及其卡片、学习记录、错题与考试记录，此操作不可撤销！类别会保留。
                </>
              ),
            }
    : null

  return (
    <Page
      title="单词卡片"
      icon="M4 4h16v16H4z"
      description="浏览词库，点击卡片翻面查看释义"
    >
      {dueCount > 0 && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setActiveTab('review')} className="btn-primary text-xs">
            {dueCount} 词待复习 →
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索单词或释义..."
            className="flex-1 min-w-[140px] rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">全部状态</option>
            <option value="new">新词</option>
            <option value="learning">学习中</option>
            <option value="review">复习中</option>
            <option value="mastered">已掌握</option>
          </select>
          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">全部复习情况</option>
            <option value="none">未复习</option>
            <option value="0">不会</option>
            <option value="2">模糊</option>
            <option value="3">困难</option>
            <option value="4">良好</option>
            <option value="5">简单</option>
          </select>
          <select
            value={starFilter}
            onChange={(e) => setStarFilter(e.target.value as 'all' | 'starred' | 'unstarred')}
            className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">全部星标</option>
            <option value="starred">星标词</option>
            <option value="unstarred">非星标词</option>
          </select>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'default' | 'asc' | 'desc' | 'starred' | 'errors')}
            className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="default">默认排序</option>
            <option value="asc">A→Z</option>
            <option value="desc">Z→A</option>
            <option value="starred">星标优先</option>
            <option value="errors">错题优先</option>
          </select>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl px-3 py-2 text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400 transition-colors whitespace-nowrap flex items-center gap-1"
              title="重置所有筛选条件"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              重置
            </button>
          )}
        </div>
        <CategoryMultiSelect
          categories={categories}
          selected={selectedCats}
          onChange={setSelectedCats}
          className="w-full"
          editable
          onRename={renameCategory}
          onDelete={requestDeleteCategory}
        />
        {deleteCatError && (
          <p className="text-xs text-red-500 dark:text-red-400 animate-slide-up">{deleteCatError}</p>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-400">共 {filtered.length} 词</p>
          {selectMode && (
            <button
              type="button"
              onClick={() => toggleSelectAllOnPage(pageIds)}
              className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none"
            >
              <span
                className={clsx(
                  'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                  allOnPageSelected
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : someOnPageSelected
                      ? 'bg-brand-100 dark:bg-brand-900/40 border-brand-400 text-brand-600 dark:text-brand-300'
                      : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800',
                )}
              >
                {(allOnPageSelected || someOnPageSelected) && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              全选本页
            </button>
          )}
          {selectMode && <span className="text-xs text-gray-400">已选 {selected.size} 项</span>}
        </div>
        <div className="flex gap-2 items-center">
          {selectMode ? (
            <>
              <button
                onClick={() => launchQuizFromWords(selectedWords, 'spell')}
                disabled={selected.size === 0}
                className="text-xs text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg transition-colors font-medium"
              >
                去拼写测试（{selected.size}）
              </button>
              <button
                onClick={() => setDeleteTarget({ kind: 'words', words: selectedWords })}
                disabled={selected.size === 0}
                className="text-xs text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg transition-colors font-medium"
              >
                删除所选（{selected.size}）
              </button>
              <button
                onClick={exitSelectMode}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded-lg transition-colors"
              >
                取消
              </button>
            </>
          ) : (
            <>
              {items.length > 0 && (
                <button
                  onClick={() => setSelectMode(true)}
                  className="text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded-lg transition-colors"
                >
                  多选
                </button>
              )}
              {selectedCats.size > 0 && selectedCats.size < categories.length && selectedCatCount > 0 && (
                <button
                  onClick={() =>
                    setDeleteTarget({
                      kind: 'category',
                      categoryIds: [...selectedCats],
                      label: selectedCatLabel,
                      count: selectedCatCount,
                    })
                  }
                  className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
                >
                  清空所选类别（{selectedCatCount}）
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={() => setDeleteTarget({ kind: 'all', count: items.length })}
                  className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
                >
                  清空全部
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {pagedItems.map(({ word, card, categories }) => {
          const isFlipped = flipped.has(word.id!)
          const status = card?.status ?? 'new'
          const label = STATUS_LABELS[status]
          const catLabel =
            categories.length <= 1
              ? categories[0]?.path ?? '未分类'
              : `${categories.length}个类别`
          const phonetic = word.meanings.map((m) => m.phonetic).find(Boolean)
          const isSelected = selectMode && selected.has(word.id!)
          return (
            <div
              key={word.id}
              className={clsx(
                'flip-card h-40 cursor-pointer rounded-2xl transition-all',
                selectMode && isSelected && 'ring-2 ring-brand-500',
              )}
              onClick={() => (selectMode ? toggleSelect(word.id!) : toggleFlip(word.id!))}
            >
              <div className={clsx('flip-inner relative w-full h-full', isFlipped && 'flipped')}>
                <div className="flip-face card absolute inset-0 flex flex-col items-center justify-center p-4">
                  {selectMode ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelect(word.id!)
                      }}
                      className={clsx(
                        'absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                        isSelected
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'border-gray-300 dark:border-gray-500 bg-white/80 dark:bg-gray-800/80 text-transparent hover:border-brand-400',
                      )}
                      title={isSelected ? '取消选择' : '选择'}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  ) : (
                    <span className="absolute top-2 left-2 max-w-[60%] truncate text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="truncate">{catLabel}</span>
                    </span>
                  )}
                  <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleStar(word)
                      }}
                      className={clsx(
                        'w-7 h-7 rounded-full flex items-center justify-center transition-colors z-10',
                        word.starred
                          ? 'text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                          : 'text-gray-300 dark:text-gray-600 hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30',
                      )}
                      title={word.starred ? '取消星标' : '加星标'}
                    >
                      <svg
                        className="w-4 h-4"
                        fill={word.starred ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.5.5 0 01.94 0l2.1 4.26a.5.5 0 00.42.3l4.7.36c.43.03.6.58.27.86l-3.6 3.1a.5.5 0 00-.16.5l1.1 4.6a.5.5 0 01-.74.54l-4.04-2.46a.5.5 0 00-.5 0l-4.04 2.46a.5.5 0 01-.74-.54l1.1-4.6a.5.5 0 00-.16-.5l-3.6-3.1a.5.5 0 01.27-.86l4.7-.36a.5.5 0 00.42-.3L11.48 3.5z" />
                      </svg>
                    </button>
                    <span className={clsx('text-[10px] px-2 py-0.5 rounded-full', label.cls)}>
                      {label.text}
                    </span>
                    {card?.lastQuality != null && QUALITY_MARK[card.lastQuality] ? (
                      <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full', QUALITY_MARK[card.lastQuality].cls)}>
                        上次: {QUALITY_MARK[card.lastQuality].label}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400">
                        未复习
                      </span>
                    )}
                    {(card?.quizWrongCount ?? 0) > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                        错 {card!.quizWrongCount} 次
                      </span>
                    )}
                  </div>
                  {!selectMode && (
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailWord(word)
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                        title="查看遗忘曲线"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h3l3-8 4 16 3-8h5" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditTarget(word)
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                        title="编辑此单词"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget({ kind: 'word', word })
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        title="删除此单词"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{word.text}</p>
                    {phonetic && (
                      <p className="text-sm text-gray-400 mt-1">/{phonetic}/</p>
                    )}
                    <p className="text-xs text-gray-400 mt-3">{selectMode ? (isSelected ? '已选择，再次点击取消' : '点击选择') : '点击翻面查看释义'}</p>
                  </div>
                  {!selectMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        speak(word.text)
                      }}
                      className="absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="flip-face flip-back card absolute inset-0 flex flex-col p-4 bg-brand-50 dark:bg-gray-800 overflow-hidden">
                  <span className="absolute top-2 left-2 max-w-[60%] truncate text-[10px] px-2 py-0.5 rounded-full bg-white/70 dark:bg-gray-700/70 text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="truncate">{catLabel}</span>
                  </span>
                  <div className="flex-1 overflow-y-auto mt-6 space-y-2">
                    {word.meanings.map((m, mi) => {
                      const path = categories.find((c) => c.categoryId === m.categoryId)?.path ?? '未分类'
                      return (
                        <div key={mi} className="text-left">
                          <p className="text-[10px] text-brand-500 dark:text-brand-400 font-medium">{path}</p>
                          <p className="text-sm text-gray-700 dark:text-gray-200 leading-snug">
                            {m.meaning || '(无释义)'}
                          </p>
                          {m.example && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed">
                              {m.example}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      {card && <span>{formatDueLabel(card.dueDate)}</span>}
                      {(card?.quizWrongCount ?? 0) > 0 && (
                        <span className="text-red-500 dark:text-red-400">· 错 {card!.quizWrongCount} 次</span>
                      )}
                    </span>
                    {card?.lastQuality != null && QUALITY_MARK[card.lastQuality] && (
                      <span className={clsx('px-1.5 py-0.5 rounded-full', QUALITY_MARK[card.lastQuality].cls)}>
                        上次: {QUALITY_MARK[card.lastQuality].label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(n) => {
          setPage(n)
          setFlipped(new Set())
        }}
      />

      {dialogProps && (
        <PasswordDialog
          open
          title={dialogProps.title}
          message={dialogProps.message}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <ConfirmDialog
        open={deleteCatTarget !== null}
        title="删除类别"
        confirmText="确认删除"
        message={
          <>
            确定删除类别 <b className="text-gray-700 dark:text-gray-200">{deleteCatTarget?.name}</b> 吗？该类别下没有单词和子类别，删除后不可恢复。
          </>
        }
        onConfirm={async () => {
          const target = deleteCatTarget
          if (!target) return
          try {
            await deleteCategory(target.id!)
            setDeleteCatTarget(null)
            setDeleteCatError('')
            setSelectedCats((prev) => {
              const next = new Set(prev)
              next.delete(target.id!)
              return next
            })
          } catch (e) {
            setDeleteCatTarget(null)
            setDeleteCatError(e instanceof Error ? e.message : '删除失败')
          }
        }}
        onCancel={() => setDeleteCatTarget(null)}
      />

      <EditWordDialog
        word={editTarget}
        categories={categories}
        onSave={async (wordId, data) => {
          await updateWord(wordId, data)
          setEditTarget(null)
        }}
        onClose={() => setEditTarget(null)}
      />

      {detailWord && (
        <WordDetail
          word={detailWord}
          card={items.find((i) => i.word.id === detailWord.id)?.card}
          categories={categories}
          onClose={() => setDetailWord(null)}
        />
      )}
    </Page>
  )
}
