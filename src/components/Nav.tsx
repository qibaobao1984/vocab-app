import { useState } from 'react'
import clsx from 'clsx'
import { Home, FileInput, LayoutGrid, Repeat, ClipboardCheck, CircleX, ClipboardList, BarChart3 } from 'lucide-react'
import { useStore, type Tab } from '../store/useStore'
import { useAuth } from '../store/useAuth'
import { supabaseEnabled } from '../lib/supabase'
import { ChangePasswordDialog } from './ChangePasswordDialog'

const TABS: { id: Tab; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: '首页', Icon: Home },
  { id: 'upload', label: '导入', Icon: FileInput },
  { id: 'cards', label: '卡片', Icon: LayoutGrid },
  { id: 'review', label: '复习', Icon: Repeat },
  { id: 'quiz', label: '测验', Icon: ClipboardCheck },
  { id: 'mistakes', label: '错题', Icon: CircleX },
  { id: 'history', label: '记录', Icon: ClipboardList },
  { id: 'stats', label: '统计', Icon: BarChart3 },
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
          {TABS.map((tab) => {
            const Icon = tab.Icon
            return (
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
                <Icon size={20} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
                {tab.label}
              </button>
            )
          })}
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
