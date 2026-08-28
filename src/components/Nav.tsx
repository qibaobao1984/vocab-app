import { useState } from 'react'
import clsx from 'clsx'
import { useStore, type Tab } from '../store/useStore'
import { useAuth } from '../store/useAuth'
import { supabaseEnabled } from '../lib/supabase'
import { ChangePasswordDialog } from './ChangePasswordDialog'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: '首页', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { id: 'upload', label: '导入', icon: 'M12 4v16m8-8H4' },
  { id: 'cards', label: '卡片', icon: 'M4 4h16v16H4z' },
  { id: 'review', label: '复习', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'quiz', label: '测验', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'mistakes', label: '错题', icon: 'M6 3h12a2 2 0 012 2v16l-8-4-8 4V5a2 2 0 012-2z' },
  { id: 'history', label: '记录', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z M3 3l4 4M3 3v4M3 3h4' },
  { id: 'stats', label: '统计', icon: 'M3 3v18h18M7 14l4-4 4 4 5-5' },
]

export function Nav() {
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const session = useAuth((s) => s.session)
  const signOut = useAuth((s) => s.signOut)
  const changePassword = useAuth((s) => s.changePassword)
  const [showChangePwd, setShowChangePwd] = useState(false)

  return (
    <>
      <nav className="relative border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto w-full overflow-x-auto px-4 sm:px-6 py-2">
          <div className="flex items-center justify-center gap-1 w-max min-w-full mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
              )}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
          </div>
        </div>
        {supabaseEnabled && session && (
          <div className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-2">
            <span className="text-xs text-gray-400 max-w-32 truncate" title={session.user.email ?? ''}>
              {session.user.email}
            </span>
            <button
              onClick={() => setShowChangePwd(true)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-brand-500 transition-colors"
            >
              改密
            </button>
            <button
              onClick={() => void signOut()}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
            >
              退出
            </button>
          </div>
        )}
      </nav>

      <ChangePasswordDialog
        open={showChangePwd}
        onClose={() => setShowChangePwd(false)}
        onChangePassword={changePassword}
      />
    </>
  )
}
