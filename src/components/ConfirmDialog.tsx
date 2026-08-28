import { useEffect, useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  checkboxLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认删除',
  cancelText = '取消',
  checkboxLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setChecked(false)
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const requireCheck = !!checkboxLabel
  const canConfirm = !requireCheck || checked

  const handleConfirm = async () => {
    if (!canConfirm || busy) return
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{title}</h3>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        {checkboxLabel && (
          <label className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-red-600"
            />
            <span className="text-xs text-red-600 dark:text-red-300 leading-relaxed">{checkboxLabel}</span>
          </label>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="btn-secondary flex-1" disabled={busy}>
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || busy}
            className="btn flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? '删除中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
