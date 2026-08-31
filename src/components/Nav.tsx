import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Home,
  FileInput,
  LayoutGrid,
  Repeat,
  ClipboardCheck,
  CircleX,
  ClipboardList,
  BarChart3,
  User,
  KeyRound,
  LogOut,
} from 'lucide-react'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        (btnRef.current && btnRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
      ) {
        return
      }
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setMenuOpen(true)
  }

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
            {supabaseEnabled && session && (
              <button
                ref={btnRef}
                onClick={toggleMenu}
                className="ml-1 w-9 h-9 rounded-full flex items-center justify-center bg-brand-100 text-brand-600 hover:bg-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:hover:bg-brand-900/60 transition-colors"
                title={session.user.email ?? ''}
                aria-label="账号菜单"
              >
                <User size={18} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </nav>

      {menuOpen && menuPos && (
        <div
          ref={menuRef}
          className="fixed w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 z-50 animate-slide-up"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-[10px] text-gray-400">当前账号</p>
            <p className="text-xs text-gray-700 dark:text-gray-200 truncate" title={session?.user.email ?? ''}>
              {session?.user.email}
            </p>
          </div>
          <button
            onClick={() => {
              setMenuOpen(false)
              setShowChangePwd(true)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <KeyRound size={16} strokeWidth={1.75} />
            修改密码
          </button>
          <button
            onClick={() => {
              setMenuOpen(false)
              void signOut()
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={16} strokeWidth={1.75} />
            退出登录
          </button>
        </div>
      )}

      <ChangePasswordDialog
        open={showChangePwd}
        onClose={() => setShowChangePwd(false)}
        onChangePassword={changePassword}
      />
    </>
  )
}
