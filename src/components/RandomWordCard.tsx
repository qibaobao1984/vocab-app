import { useCallback, useEffect, useState } from 'react'
import { repoCategories, repoRandomWord } from '../lib/repo'
import { useStore } from '../store/useStore'
import { speak } from '../lib/tts'
import { getCategoryNamePath } from '../lib/tree'
import { wordPhonetic } from '../lib/word'
import clsx from 'clsx'
import type { WordEntry, Category } from '../types'

export function RandomWordCard() {
  const setActiveTab = useStore((s) => s.setActiveTab)
  const [word, setWord] = useState<WordEntry | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)

  const pick = useCallback(async () => {
    setLoading(true)
    setFlipped(false)
    const w = await repoRandomWord()
    if (!w) {
      setEmpty(true)
      setWord(null)
    } else {
      setEmpty(false)
      setWord(w)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void repoCategories().then(setCategories)
    void pick()
  }, [pick])

  const phonetic = word ? wordPhonetic(word) : undefined
  const catPath = word && word.meanings[0]
    ? getCategoryNamePath(categories, word.meanings[0].categoryId) || '未分类'
    : '未分类'

  return (
    <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 pt-3">
      <div className="card p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">随机一词</span>
          <button
            onClick={() => void pick()}
            disabled={loading}
            className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            换一个
          </button>
        </div>

        {loading && !word ? (
          <div className="h-44 flex items-center justify-center">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : empty ? (
          <div className="h-44 flex flex-col items-center justify-center text-center">
            <span className="text-3xl mb-2">📭</span>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">暂无单词，快去导入吧</p>
            <button onClick={() => setActiveTab('upload')} className="btn-primary text-xs px-3 py-1.5">去导入</button>
          </div>
        ) : word ? (
          <div className="flip-card h-44 cursor-pointer select-none" onClick={() => setFlipped((f) => !f)}>
            <div className={clsx('flip-inner relative w-full h-full', flipped && 'flipped')}>
              <div className="flip-face card absolute inset-0 flex flex-col items-center justify-center p-4">
                <span className="absolute top-2 left-2 max-w-[60%] truncate text-[10px] text-gray-400">
                  {catPath}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(word.text)
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                  title="发音"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
                  </svg>
                </button>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">{word.text}</p>
                  {phonetic && <p className="text-sm text-gray-400 mt-1">/{phonetic}/</p>}
                  <p className="text-xs text-gray-400 mt-3">点击翻面查看释义</p>
                </div>
              </div>
              <div className="flip-face flip-back card absolute inset-0 flex flex-col p-4 overflow-hidden">
                <div className="flex-1 overflow-y-auto mt-4 space-y-2">
                  {word.meanings.map((m, mi) => {
                    const path = getCategoryNamePath(categories, m.categoryId) || '未分类'
                    return (
                      <div key={mi} className="text-left">
                        <p className="text-[10px] text-brand-500 dark:text-brand-400 font-medium">{path}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-200 leading-snug">
                          {m.meaning || '(无释义)'}
                        </p>
                        {m.example && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed">{m.example}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-1">点击翻面返回</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
