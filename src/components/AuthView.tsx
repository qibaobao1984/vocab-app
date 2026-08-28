import { useState } from 'react'
import { useAuth } from '../store/useAuth'
import clsx from 'clsx'

type Mode = 'login' | 'register'

const INVITE_CODE = '0326'

export function AuthView() {
  const signIn = useAuth((s) => s.signIn)
  const signUp = useAuth((s) => s.signUp)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setInfo('')
    setConfirm('')
    setInvite('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError('')
    setInfo('')
    const mail = email.trim()
    if (!mail) {
      setError('请输入邮箱')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    if (mode === 'register') {
      if (password.length < 6) {
        setError('密码长度至少 6 位')
        return
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致')
        return
      }
      if (!invite.trim()) {
        setError('请输入注册邀请码')
        return
      }
      if (invite.trim() !== INVITE_CODE) {
        setError('注册邀请码错误')
        return
      }
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(mail, password)
      } else {
        const { needConfirm } = await signUp(mail, password)
        if (needConfirm) {
          setInfo('注册成功！请前往邮箱点击验证链接后再登录。')
          setMode('login')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-100 dark:bg-brand-900/40 mb-3">
            <span className="text-3xl">📚</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">快乐背单词</h1>
          <p className="text-xs text-gray-400 mt-1">登录后词库与进度将同步到云端</p>
        </div>

        <div className="card p-6">
          <div className="flex rounded-xl bg-gray-100 dark:bg-gray-700 p-1 mb-5">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={clsx(
                  'flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors',
                  mode === m
                    ? 'bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-300 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400',
                )}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? '至少 6 位' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {mode === 'register' && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">确认密码</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
            {mode === 'register' && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">注册邀请码</label>
                <input
                  type="text"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="请输入邀请码"
                  autoComplete="off"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500 animate-slide-up">{error}</p>}
            {info && <p className="text-xs text-green-600 dark:text-green-400 animate-slide-up">{info}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          云端同步基于 Supabase，密码仅用于账号认证
        </p>
      </div>
    </div>
  )
}
