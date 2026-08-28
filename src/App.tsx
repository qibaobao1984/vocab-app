import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { useAuth } from './store/useAuth'
import { useDailyGoal, localYMD } from './store/dailyGoalStore'
import { useStudyPlan } from './store/studyPlanStore'
import { supabaseEnabled } from './lib/supabase'
import { repoCreateMissingCards, repoRecomputeCardStatuses } from './lib/repo'
import { Nav } from './components/Nav'
import { AuthView } from './components/AuthView'
import { UploadView } from './components/UploadView'
import { CardsView } from './components/CardsView'
import { ReviewView } from './components/ReviewView'
import { QuizView } from './components/QuizView'
import { MistakesView } from './components/MistakesView'
import { HistoryView } from './components/HistoryView'
import { StatsView } from './components/StatsView'
import { HomeView } from './components/HomeView'

function App() {
  const activeTab = useStore((s) => s.activeTab)
  const initializing = useAuth((s) => s.initializing)
  const session = useAuth((s) => s.session)
  const init = useAuth((s) => s.init)
  const userId = session?.user.id ?? null

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    useStore.getState().reset()
  }, [userId])

  useEffect(() => {
    if (initializing) return
    if (supabaseEnabled && !userId) return
    Promise.all([repoCreateMissingCards(), repoRecomputeCardStatuses()])
      .then(([missing, recomp]) => {
        if (missing > 0 || recomp > 0) useStore.getState().refresh()
      })
      .catch((e) => {
        console.warn('[app] 初始化失败：', e)
      })
  }, [initializing, userId])

  useEffect(() => {
    if (initializing) return
    if (supabaseEnabled && !userId) return
    void useDailyGoal.getState().load()
    void useStudyPlan.getState().load()
  }, [initializing, userId])

  useEffect(() => {
    if (initializing) return
    if (supabaseEnabled && !userId) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {})
    }
    const check = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = new Date()
      const weekday = now.getDay()
      const cur = now.getHours() * 60 + now.getMinutes()
      const ymd = localYMD()
      for (const p of useStudyPlan.getState().plans) {
        if (!p.enabled || p.id === undefined) continue
        if (!p.daysOfWeek.includes(weekday)) continue
        if (useStudyPlan.getState().isDoneToday(p.id)) continue
        const [th, tm] = p.time.split(':').map(Number)
        const target = (th || 0) * 60 + (tm || 0)
        if (Math.abs(cur - target) > 5) continue
        const firedKey = `plan-fired-${p.id}-${ymd}`
        try {
          if (localStorage.getItem(firedKey)) continue
          localStorage.setItem(firedKey, '1')
        } catch {
          continue
        }
        try {
          const n = new Notification(`复习提醒：${p.name}`, {
            body: '到点啦，开始今天的复习吧',
            tag: `plan-${p.id}-${ymd}`,
          })
          n.onclick = () => {
            window.focus()
            useStore.getState().launchReviewFromPlan(p.categoryIds, p.id)
          }
        } catch {
          /* ignore */
        }
      }
    }
    check()
    const t = window.setInterval(check, 60000)
    return () => window.clearInterval(t)
  }, [initializing, userId])

  useEffect(() => {
    const persist = () => {
      void useDailyGoal.getState().persist()
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('beforeunload', persist)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('beforeunload', persist)
    }
  }, [])

  if (supabaseEnabled && initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (supabaseEnabled && !session) {
    return <AuthView />
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Nav />
      <main>
        {activeTab === 'home' && <HomeView />}
        {activeTab === 'upload' && <UploadView />}
        {activeTab === 'cards' && <CardsView />}
        {activeTab === 'review' && <ReviewView />}
        <div className={activeTab === 'quiz' ? '' : 'hidden'}>
          <QuizView active={activeTab === 'quiz'} />
        </div>
        {activeTab === 'mistakes' && <MistakesView />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'stats' && <StatsView />}
      </main>
      <footer className="text-center text-xs text-gray-400 py-6">
        快乐背单词
      </footer>
    </div>
  )
}

export default App
