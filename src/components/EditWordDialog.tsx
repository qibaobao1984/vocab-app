import { useEffect, useState } from 'react'
import { getCategoryNamePath } from '../lib/tree'
import type { WordEntry, WordMeaning, Category } from '../types'

interface EditWordDialogProps {
  word: WordEntry | null
  categories: Category[]
  onSave: (wordId: number, data: { text: string; meanings: WordMeaning[] }) => Promise<void>
  onClose: () => void
}

export function EditWordDialog({ word, categories, onSave, onClose }: EditWordDialogProps) {
  const [text, setText] = useState('')
  const [meanings, setMeanings] = useState<WordMeaning[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (word) {
      setText(word.text)
      setMeanings(word.meanings.map((m) => ({ ...m })))
      setBusy(false)
    }
  }, [word])

  if (!word || word.id === undefined) return null

  const updateMeaning = (i: number, patch: Partial<WordMeaning>) => {
    setMeanings((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }
  const removeMeaning = (i: number) => {
    setMeanings((prev) => prev.filter((_, idx) => idx !== i))
  }

  const handleSave = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await onSave(word.id!, { text, meanings })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">编辑单词</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">单词 *</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">释义（按类别）</p>
            {meanings.map((m, i) => {
              const path = getCategoryNamePath(categories, m.categoryId) || '未分类'
              return (
                <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300">
                      {path}
                    </span>
                    <button
                      onClick={() => removeMeaning(i)}
                      className="text-xs text-red-500 hover:text-red-600"
                      title="删除该类别释义"
                    >
                      移除
                    </button>
                  </div>
                  <input
                    type="text"
                    value={m.phonetic ?? ''}
                    onChange={(e) => updateMeaning(i, { phonetic: e.target.value })}
                    placeholder="音标 /əˈbændən/"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <textarea
                    value={m.meaning}
                    onChange={(e) => updateMeaning(i, { meaning: e.target.value })}
                    rows={2}
                    placeholder="释义"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                  <textarea
                    value={m.example ?? ''}
                    onChange={(e) => updateMeaning(i, { example: e.target.value })}
                    rows={2}
                    placeholder="例句（可选）"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                </div>
              )
            })}
            {meanings.length === 0 && (
              <p className="text-xs text-amber-500 text-center py-2">该单词已无任何类别释义，保存将删除此单词</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={busy}>
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!text.trim() || busy}
            className="btn-primary flex-1"
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
