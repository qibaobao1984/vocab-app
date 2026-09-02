import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { repoWords, repoCards, repoCategories, repoMarkLearnedToday } from '../lib/repo'
import { useStore } from '../store/useStore'
import { useDailyGoal } from '../store/dailyGoalStore'
import { useStudyPlan } from '../store/studyPlanStore'
import { speak } from '../lib/tts'
import { QUALITY, formatDueLabel, type Quality } from '../lib/sm2'
import { getCategoryNamePath } from '../lib/tree'
import { wordPhonetic } from '../lib/word'
import { CategoryMultiSelect } from './CategoryMultiSelect'
import { Page } from './Page'
import { ReadingMode } from './ReadingMode'
import type { WordEntry, SrsCard, Category } from '../types'

interface ReviewItem {
  word: WordEntry
  card: SrsCard
}

const BUTTONS: { label: string; quality: Quality; cls: string; hint: string }[] = [
  { label: '不会', quality: QUALITY.BLACKOUT, cls: 'bg-red-500 hover:bg-red-600 text-white', hint: '重新学习' },
  { label: '模糊', quality: QUALITY.WRONG_FAMILIAR, cls: 'bg-orange-500 hover:bg-orange-600 text-white', hint: '稍后重试' },
  { label: '困难', quality: QUALITY.CORRECT_HARD, cls: 'bg-amber-500 hover:bg-amber-600 text-white', hint: '回想困难' },
  { label: '良好', quality: QUALITY.CORRECT, cls: 'bg-brand-500 hover:bg-brand-600 text-white', hint: '正常回忆' },
  { label: '简单', quality: QUALITY.PERFECT, cls: 'bg-green-500 hover:bg-green-600 text-white', hint: '毫不费力' },
]

export function ReviewView() {
  const reviewCard = useStore((s) => s.reviewCard)
  const refreshKey = useStore((s) => s.refreshKey)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const [queue, setQueue] = useState<ReviewItem[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ total: 0 })
  const [loading, setLoading] = useState(() => useStore.getState().reviewSeed != null)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set())
  const catInitRef = useRef(false)
  const planIdRef = useRef<number | undefined>(undefined)
  const completedRef = useRef(false)
  const [started, setStarted] = useState(false)
  const [readingWords, setReadingWords] = useState<WordEntry[] | null>(null)

  const loadQueue = useCallback(async (sel: Set<number>) => {
    setLoading(true)
    const now = Date.now()
    const [all, allCards] = await Promise.all([repoWords(), repoCards()])
    const words = sel.size > 0 ? all.filter((w) => w.meanings.some((m) => sel.has(m.categoryId))) : []
    const wordMap = new Map(words.map((w) => [w.id!, w]))
    const dueCards = allCards
      .filter((c) => c.dueDate <= now && wordMap.has(c.wordId))
      .sort((a, b) => a.dueDate - b.dueDate)

    const items: ReviewItem[] = dueCards.map((c) => ({ word: wordMap.get(c.wordId)!, card: c }))

    setQueue(items)
    setIndex(0)
    setRevealed(false)
    completedRef.current = items.length === 0
    setDone(items.length === 0)
    setStats({ total: 0 })
    setLoading(false)
  }, [])

  const startReading = useCallback(async () => {
    const all = await repoWords()
    const words = selectedCats.size > 0 ? all.filter((w) => w.meanings.some((m) => selectedCats.has(m.categoryId))) : all
    if (words.length === 0) return
    setReadingWords(words)
  }, [selectedCats])

  useEffect(() => {
    repoCategories().then((cats) => {
      setCategories(cats)
      const seed = useStore.getState().reviewSeed
      if (seed && seed.categoryIds.length > 0) {
        const sel = new Set(seed.categoryIds)
        planIdRef.current = seed.planId
        setSelectedCats(sel)
        setStarted(true)
        void loadQueue(sel)
        useStore.getState().clearReviewSeed()
      } else if (!catInitRef.current && cats.length > 0) {
        catInitRef.current = true
        setSelectedCats(new Set(cats.map((c) => c.id!)))
      }
    })
  }, [refreshKey, loadQueue])

  const reviewPersistedRef = useRef(false)
  useEffect(() => {
    if (done && !reviewPersistedRef.current) {
      reviewPersistedRef.current = true
      useDailyGoal.getState().incrementReview(stats.total)
      void useDailyGoal.getState().persist()
      void repoMarkLearnedToday()
      if (completedRef.current && planIdRef.current !== undefined) {
        useStudyPlan.getState().markDoneToday(planIdRef.current)
      }
    }
    if (!done) reviewPersistedRef.current = false
  }, [done, stats.total])

  const current = queue[index]

  const handleRate = useCallback(
    async (quality: Quality) => {
      if (!current) return
      try {
        await reviewCard(current.card.id!, current.word.id!, quality)
      } catch (e) {
        console.error('[review] 评分保存失败：', e)
      }
      setStats((s) => ({ total: s.total + 1 }))

      setRevealed(false)
      if (index + 1 >= queue.length) {
        completedRef.current = true
        setDone(true)
      } else {
        setIndex((i) => i + 1)
      }
    },
    [current, reviewCard, index, queue.length],
  )

  const progress = useMemo(() => {
    if (queue.length === 0) return 0
    return Math.round(((index + (done ? 1 : 0)) / queue.length) * 100)
  }, [index, queue.length, done])

  if (readingWords) {
    return (
      <ReadingMode
        words={readingWords}
        categories={categories}
        onExit={() => setReadingWords(null)}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!started) {
    return (
      <Page title="复习与记忆" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" description="复习到期单词，或沉浸式阅读词库" className="max-w-xl">
        <div className="card p-4 mb-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">选择词库类别（可多选）</label>
          <CategoryMultiSelect
            categories={categories}
            selected={selectedCats}
            onChange={setSelectedCats}
            className="w-full"
          />
          <p className="text-xs text-gray-400 mt-2">选择父类别将包含其所有子类别的单词</p>
        </div>
        <button
          onClick={() => {
            setStarted(true)
            void loadQueue(selectedCats)
          }}
          disabled={selectedCats.size === 0 || loading}
          className={selectedCats.size === 0 ? 'btn-primary w-full opacity-50 cursor-not-allowed' : 'btn-primary w-full'}
        >
          开始复习
        </button>
        <button
          onClick={() => void startReading()}
          disabled={selectedCats.size === 0 || loading}
          className={selectedCats.size === 0 ? 'btn-secondary w-full mt-2 opacity-50 cursor-not-allowed' : 'btn-secondary w-full mt-2'}
        >
          开始阅读
        </button>
      </Page>
    )
  }

  if (done || !current) {
    const reviewed = stats.total
    const remaining = queue.length - reviewed
    const empty = queue.length === 0
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/40 mb-4 text-3xl">
          {reviewed > 0 && remaining === 0 ? '🎉' : empty ? '📭' : '☕'}
        </div>
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
          {reviewed > 0 && remaining === 0 ? '复习完成!' : empty ? '暂无待复习单词' : '已结束复习'}
        </h2>
        <p className="text-sm text-gray-400 mt-1 mb-6">
          {reviewed > 0
            ? remaining > 0
              ? `本次复习 ${reviewed} 词，还剩 ${remaining} 词未复习，下次继续`
              : `本次共复习 ${reviewed} 词，到期单词全部搞定`
            : empty
              ? '所选类别中没有到期的单词'
              : '本次没有复习任何单词'}
        </p>
        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          <button onClick={() => setActiveTab('quiz')} className="btn-primary">去测验</button>
          <div className="flex gap-2">
            <button onClick={() => setStarted(false)} className="btn-secondary flex-1">换类别</button>
            <button onClick={() => setActiveTab('cards')} className="btn-secondary flex-1">查看卡片</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
          <span>{index + 1} / {queue.length}</span>
        </div>
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div
        className="card p-8 min-h-[300px] flex flex-col items-center justify-center text-center cursor-pointer"
        onClick={() => setRevealed((r) => !r)}
      >
        <div className="flex items-center gap-2 mb-3">
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{current.word.text}</p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              speak(current.word.text)
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
            </svg>
          </button>
        </div>
        {wordPhonetic(current.word) && (
          <p className="text-sm text-gray-400 mb-4">/{wordPhonetic(current.word)}/</p>
        )}

        {!revealed ? (
          <p className="text-sm text-gray-400 mt-4">点击卡片查看释义</p>
        ) : (
          <div className="mt-4 animate-fade-in w-full">
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
              {current.word.meanings.map((m, mi) => (
                <div key={mi} className="text-left">
                  <p className="text-[11px] text-brand-500 dark:text-brand-400 font-medium">
                    {getCategoryNamePath(categories, m.categoryId) || '未分类'}
                  </p>
                  <p className="text-base text-gray-700 dark:text-gray-200 leading-relaxed">
                    {m.meaning || '(无释义)'}
                  </p>
                  {m.example && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">{m.example}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-gray-400 flex gap-4 justify-center">
              <span>已复习 {current.card.totalReviews} 次</span>
              <span>下次: {formatDueLabel(Date.now())}</span>
            </div>
          </div>
        )}
      </div>

      {revealed && (
        <div className="mt-4 grid grid-cols-5 gap-2 animate-slide-up">
          {BUTTONS.map((b) => (
            <button
              key={b.label}
              onClick={() => handleRate(b.quality)}
              className={`${b.cls} rounded-xl py-2.5 text-sm font-medium transition-all active:scale-95`}
              title={b.hint}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-center gap-3">
        <button
          onClick={() => setRevealed((r) => !r)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          {revealed ? '隐藏' : '显示释义'}
        </button>
        <span className="text-gray-300">·</span>
        <button
          onClick={() => setDone(true)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          结束复习
        </button>
      </div>
    </div>
  )
}
