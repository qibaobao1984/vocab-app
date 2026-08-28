import { speak } from '../lib/tts'

const MODE_LABELS: Record<string, string> = { choice: '选择题', spell: '拼写', posconv: '词性转换' }

export interface WrongCardProps {
  text: string
  phonetic?: string
  meaning?: string
  mode: string
  timedOut: boolean
  correctAnswer: string
  userAnswer: string
  footer?: string
  wrongCount?: number
}

export function WrongCard(props: WrongCardProps) {
  const { text, phonetic, meaning, mode, timedOut, correctAnswer, userAnswer, footer, wrongCount } = props
  return (
    <div className="card p-3 animate-slide-up">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-bold text-gray-900 dark:text-gray-50 truncate">{text}</span>
          {phonetic && <span className="text-xs text-gray-400">/{phonetic}/</span>}
          <button
            onClick={() => speak(text)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            {MODE_LABELS[mode]}
          </span>
          {(wrongCount ?? 0) > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
              错 {wrongCount} 次
            </span>
          )}
          {timedOut && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
              超时
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {meaning && (
          <p className="text-gray-600 dark:text-gray-300">
            <span className="text-gray-400">释义：</span>{meaning}
          </p>
        )}
        <p className="text-green-600 dark:text-green-400">
          <span className="text-gray-400">正确：</span>
          <b>{correctAnswer}</b>
        </p>
        <p className="text-red-500 dark:text-red-400">
          <span className="text-gray-400">你的回答：</span>{userAnswer}
        </p>
      </div>
      {footer && <p className="text-[10px] text-gray-400 mt-2">{footer}</p>}
    </div>
  )
}
