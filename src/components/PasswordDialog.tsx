import { useEffect, useState } from 'react'

interface PasswordDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  password?: string
  confirmText?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function PasswordDialog({
  open,
  title,
  message,
  password = '000000',
  confirmText = '确认删除',
  onConfirm,
  onCancel,
}: PasswordDialogProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setValue('')
      setError('')
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const handleConfirm = async () => {
    if (busy) return
    if (value !== password) {
      setError('密码错误，无法删除')
      return
    }
    setError('')
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{title}</h3>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">请输入删除密码</label>
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
            autoFocus
            inputMode="numeric"
            placeholder="••••"
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && (
            <p className="text-xs text-red-500 mt-1.5 animate-slide-up">{error}</p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="btn-secondary flex-1" disabled={busy}>
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? '删除中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
