import { useEffect, useMemo, useRef, useState } from 'react'
import { repoMarkLearnedToday } from '../lib/repo'
import { speak } from '../lib/tts'
import { getCategoryNamePath } from '../lib/tree'
import { wordPhonetic } from '../lib/word'
import clsx from 'clsx'
import type { WordEntry, Category } from '../types'

interface ReadingModeProps {
  words: WordEntry[]
  categories: Category[]
  onExit: () => void
}

const INTERVAL_KEY = 'reading-interval'
const AUTOSPEAK_KEY = 'reading-autospeak'
const SESSION_KEY = 'reading-session'
const PRESETS = [
  { label: '快速', sec: 2 },
  { label: '标准', sec: 5 },
  { label: '慢速', sec: 8 },
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function meaningFontSize(text: string): string {
  const len = (text || '').length
  if (len <= 6) return 'text-5xl sm:text-6xl'
  if (len <= 12) return 'text-4xl sm:text-5xl'
  if (len <= 20) return 'text-3xl sm:text-4xl'
  if (len <= 40) return 'text-2xl sm:text-3xl'
  return 'text-xl sm:text-2xl'
}

function initSession(launch: WordEntry[]): { words: WordEntry[]; index: number } {
  const ids = launch
    .map((w) => w.id!)
    .filter((id) => id !== undefined)
    .sort((a, b) => a - b)
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as { wordIds?: number[]; index?: number } | null
    if (saved && Array.isArray(saved.wordIds)) {
      const savedIds = [...saved.wordIds].sort((a, b) => a - b)
      const sameSet = savedIds.length === ids.length && savedIds.every((id, i) => id === ids[i])
      if (sameSet) {
        const map = new Map(launch.map((w) => [w.id!, w]))
        const ordered = saved.wordIds.map((id) => map.get(id)).filter(Boolean) as WordEntry[]
        if (ordered.length === launch.length) {
          return { words: ordered, index: Math.min(saved.index ?? 0, ordered.length - 1) }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { words: shuffle(launch), index: 0 }
}

export function ReadingMode({ words, categories, onExit }: ReadingModeProps) {
  const init = useMemo(() => initSession(words), [words])
  const [list, setList] = useState<WordEntry[]>(init.words)
  const [index, setIndex] = useState(init.index)
  const [flipped, setFlipped] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [finished, setFinished] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [intervalSec, setIntervalSec] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(INTERVAL_KEY))
      return v >= 1 && v <= 30 ? v : 5
    } catch {
      return 5
    }
  })
  const [autoSpeak, setAutoSpeak] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTOSPEAK_KEY) !== '0'
    } catch {
      return true
    }
  })

  const word = list[index]
  const phonetic = word ? wordPhonetic(word) : undefined
  const total = list.length

  // latest state for stable keyboard handlers
  const stateRef = useRef({ index, flipped, finished, total })
  stateRef.current = { index, flipped, finished, total }

  const persistSession = (i: number) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ wordIds: list.map((w) => w.id!), index: i }))
    } catch {
      /* ignore */
    }
  }

  // persist position
  useEffect(() => {
    if (finished) return
    persistSession(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, finished])

  // persist interval preference
  useEffect(() => {
    try {
      localStorage.setItem(INTERVAL_KEY, String(intervalSec))
    } catch {
      /* ignore */
    }
  }, [intervalSec])

  // mark learning day when finished
  useEffect(() => {
    if (finished) void repoMarkLearnedToday()
  }, [finished])

  // persist autoSpeak preference
  useEffect(() => {
    try {
      localStorage.setItem(AUTOSPEAK_KEY, autoSpeak ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [autoSpeak])

  // auto pronounce when the word face is shown
  useEffect(() => {
    if (finished || flipped || !autoSpeak || !word) return
    speak(word.text)
  }, [index, flipped, autoSpeak, finished, word])

  const handleNext = () => {
    const s = stateRef.current
    if (s.finished) return
    if (s.index + 1 < s.total) {
      setIndex(s.index + 1)
      setFlipped(false)
    } else {
      setFinished(true)
      setPlaying(false)
      try {
        localStorage.removeItem(SESSION_KEY)
      } catch {
        /* ignore */
      }
    }
  }
  const handlePrev = () => {
    const s = stateRef.current
    if (s.finished || s.index <= 0) {
      setFlipped(false)
      return
    }
    setIndex(s.index - 1)
    setFlipped(false)
  }
  const toggleFlip = () => setFlipped((f) => !f)
  const restart = () => {
    setList((prev) => shuffle(prev))
    setIndex(0)
    setFlipped(false)
    setFinished(false)
    setPlaying(true)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'Escape') {
        onExit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // auto timer
  useEffect(() => {
    if (!playing || finished || total === 0) return
    const t = window.setTimeout(
      () => {
        if (!flipped) {
          setFlipped(true)
        } else if (index + 1 < total) {
          setIndex((i) => i + 1)
          setFlipped(false)
        } else {
          setFinished(true)
          setPlaying(false)
          try {
            localStorage.removeItem(SESSION_KEY)
          } catch {
            /* ignore */
          }
        }
      },
      intervalSec * 1000,
    )
    return () => window.clearTimeout(t)
  }, [playing, flipped, index, intervalSec, finished, total])

  if (total === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col items-center justify-center text-center px-6">
        <span className="text-4xl mb-3">📭</span>
        <p className="text-gray-500 dark:text-gray-400 mb-4">没有可阅读的单词</p>
        <button onClick={onExit} className="btn-secondary text-xs">返回</button>
      </div>
    )
  }

  const progressPct = total > 0 ? ((index + 1) / total) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="间隔设置"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {showSettings && (
            <div className="absolute left-0 top-11 z-10 card p-3 w-56 animate-slide-up">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">翻面间隔</p>
              <div className="flex gap-1 mb-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.sec}
                    onClick={() => setIntervalSec(p.sec)}
                    className={clsx(
                      'flex-1 rounded-lg py-1.5 text-xs transition-colors',
                      intervalSec === p.sec
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                    )}
                  >
                    {p.label}
                    <span className="block text-[10px] opacity-70">{p.sec}s</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                自定义
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={intervalSec}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (v >= 1 && v <= 30) setIntervalSec(v)
                  }}
                  className="w-16 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                秒
              </label>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3">
                <button
                  onClick={() => setAutoSpeak((v) => !v)}
                  className="flex items-center justify-between w-full text-xs text-gray-600 dark:text-gray-300"
                >
                  <span>自动发音</span>
                  <span
                    className={clsx(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      autoSpeak ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600',
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                        autoSpeak ? 'translate-x-4' : 'translate-x-1',
                      )}
                    />
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          {index + 1} / {total}
        </div>
      </div>

      {/* progress bar */}
      <div className="h-1 bg-gray-100 dark:bg-gray-800">
        <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
      </div>

      {/* center */}
      <div
        className="flex-1 flex items-center justify-center cursor-pointer px-4 select-none"
        onClick={toggleFlip}
      >
        {finished ? (
          <div className="text-center animate-fade-in">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 mb-1">已完成 {total} 词</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">沉浸式刷词结束，干得漂亮！</p>
            <div className="flex gap-2 justify-center">
              <button onClick={(e) => { e.stopPropagation(); restart() }} className="btn-primary text-sm">再来一次</button>
              <button onClick={(e) => { e.stopPropagation(); onExit() }} className="btn-secondary text-sm">退出</button>
            </div>
          </div>
        ) : word ? (
          <div className="flip-card w-full max-w-2xl h-[45vh] min-h-[260px]" >
            <div className={clsx('flip-inner relative w-full h-full', flipped && 'flipped')}>
              {/* front */}
              <div className="flip-face card absolute inset-0 flex flex-col items-center justify-center p-6">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(word.text)
                  }}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                  title="发音"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
                  </svg>
                </button>
                <div className="text-center">
                  <p className="text-5xl sm:text-6xl font-bold text-gray-900 dark:text-gray-50 tracking-wide">
                    {word.text}
                  </p>
                  {phonetic && <p className="text-lg text-gray-400 mt-3">/{phonetic}/</p>}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">点击翻面查看释义</p>
                </div>
              </div>
              {/* back */}
              <div className="flip-face flip-back card absolute inset-0 flex flex-col items-center justify-center p-6 overflow-hidden">
                <div className="flex-1 overflow-y-auto w-full flex flex-col items-center justify-center gap-4 mt-2">
                  {word.meanings.map((m, mi) => {
                    const path = getCategoryNamePath(categories, m.categoryId) || '未分类'
                    return (
                      <div key={mi} className="text-center max-w-full px-2">
                        <p className="text-[11px] text-brand-500 dark:text-brand-400 font-medium mb-1">{path}</p>
                        <p className={clsx('font-bold text-gray-900 dark:text-gray-50 leading-tight break-words', meaningFontSize(m.meaning))}>
                          {m.meaning || '(无释义)'}
                        </p>
                        {m.example && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic leading-relaxed mt-1.5 break-words">
                            {m.example}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-2">点击返回 · 自动进入下一词</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* bottom controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-4">
        <button
          onClick={handlePrev}
          disabled={index <= 0}
          className={clsx(
            'w-11 h-11 rounded-full flex items-center justify-center transition-colors',
            index <= 0 ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
          title="上一张"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 transition-colors"
          title={playing ? '暂停' : '继续'}
        >
          {playing ? (
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={handleNext}
          className="w-11 h-11 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="下一张"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1" />
        <button
          onClick={onExit}
          className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-500 transition-colors"
          title="退出 (Esc)"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
