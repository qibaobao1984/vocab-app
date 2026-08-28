import { useState } from 'react'
import clsx from 'clsx'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (n: number) => void
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const [input, setInput] = useState('')
  if (totalPages <= 1) return null

  const go = (n: number) => {
    const clamped = Math.max(1, Math.min(totalPages, n))
    if (clamped !== currentPage) onPageChange(clamped)
  }

  const btnCls = (disabled: boolean) =>
    clsx(
      'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
      disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
    )

  const start = Math.max(1, currentPage - 2)
  const end = Math.min(totalPages, currentPage + 2)
  const btns: React.ReactNode[] = []
  if (start > 1) btns.push(<span key="e1" className="text-gray-400 px-1">…</span>)
  for (let i = start; i <= end; i++) {
    btns.push(
      <button
        key={i}
        onClick={() => go(i)}
        className={clsx(
          'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors',
          i === currentPage ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        )}
      >
        {i}
      </button>,
    )
  }
  if (end < totalPages) btns.push(<span key="e2" className="text-gray-400 px-1">…</span>)

  return (
    <div className="flex items-center justify-center gap-1 mt-6 flex-wrap">
      <button onClick={() => go(1)} disabled={currentPage <= 1} className={clsx(btnCls(currentPage <= 1), 'text-xs')} title="首页">
        «
      </button>
      <button onClick={() => go(currentPage - 1)} disabled={currentPage <= 1} className={btnCls(currentPage <= 1)}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      {btns}
      <button onClick={() => go(currentPage + 1)} disabled={currentPage >= totalPages} className={btnCls(currentPage >= totalPages)}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button onClick={() => go(totalPages)} disabled={currentPage >= totalPages} className={clsx(btnCls(currentPage >= totalPages), 'text-xs')} title="末页">
        »
      </button>
      <div className="flex items-center gap-1 ml-2">
        <span className="text-xs text-gray-400">跳至</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = parseInt(input, 10)
              if (!Number.isNaN(n)) go(n)
              setInput('')
            }
          }}
          placeholder={String(currentPage)}
          className="w-12 text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <span className="text-xs text-gray-400">页</span>
      </div>
    </div>
  )
}
