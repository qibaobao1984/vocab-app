import { useEffect, useState } from 'react'

interface ChangePasswordDialogProps {
  open: boolean
  onClose: () => void
  onChangePassword: (newPassword: string) => Promise<void>
}

export function ChangePasswordDialog({ open, onClose, onChangePassword }: ChangePasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirm('')
      setError('')
      setSuccess(false)
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async () => {
    if (busy || success) return
    setError('')
    if (password.length < 6) {
      setError('密码长度至少 6 位')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setBusy(true)
    try {
      await onChangePassword(password)
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改失败，请重试')
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
        className="card w-full max-w-sm p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 10-12 0v1a8 8 0 00-2 7m10-8H7m10 0v1a8 8 0 01-2 7M7 7v6a6 6 0 006 6" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">修改密码</h3>
          </div>
        </div>

        {success ? (
          <div className="text-center py-4">
            <p className="text-sm text-green-600 dark:text-green-400 mb-4">密码修改成功！</p>
            <button onClick={onClose} className="btn-primary">确定</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">新密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                autoFocus
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">确认密码</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再次输入新密码"
                autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSubmit() } }}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {error && <p className="text-xs text-red-500 animate-slide-up">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1" disabled={busy}>
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={busy}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {busy ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
