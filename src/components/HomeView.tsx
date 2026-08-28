import { DailyGoalCard } from './DailyGoalCard'
import { TodayPlansCard } from './TodayPlansCard'
import { RandomWordCard } from './RandomWordCard'

export function HomeView() {
  return (
    <div className="pb-6">
      <DailyGoalCard />
      <TodayPlansCard />
      <RandomWordCard />
    </div>
  )
}
