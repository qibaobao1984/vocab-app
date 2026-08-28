import { useEffect, useState } from 'react'
import { repoLogsByWord } from '../lib/repo'
import { formatDueLabel } from '../lib/sm2'
import { getCategoryNamePath } from '../lib/tree'
import { wordPhonetic } from '../lib/word'
import clsx from 'clsx'
import type { WordEntry, SrsCard, Category, ReviewLog } from '../types'

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  new: { text: '新词', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  learning: { text: '学习中', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  review: { text: '复习中', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' },
  mastered: { text: '已掌握', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
}

const QUALITY_LABELS: { q: number; label: string }[] = [
  { q: 5, label: '简单' },
  { q: 4, label: '良好' },
  { q: 3, label: '困难' },
  { q: 2, label: '模糊' },
  { q: 0, label: '不会' },
]

interface Analysis {
  level: 'good' | 'unstable' | 'stubborn' | 'learning'
  text: string
  cls: string
}

function analyze(qualities: number[], card: SrsCard | undefined): Analysis {
  if (qualities.length === 0 || !card) {
    return { level: 'learning', text: '该词尚未复习，开始学习以积累曲线数据', cls: 'text-gray-500' }
  }
  const last = qualities[qualities.length - 1]
  const last3 = qualities.slice(-3)
  let reversals = 0
  let prevDiff = 0
  for (let i = 1; i < qualities.length; i++) {
    const d = qualities[i] - qualities[i - 1]
    if (d !== 0) {
      if (prevDiff !== 0 && Math.sign(d) !== Math.sign(prevDiff)) reversals++
      prevDiff = d
    }
  }
  const range = Math.max(...qualities) - Math.min(...qualities)
  if (qualities.length >= 3 && (reversals >= 2 || range >= 3)) {
    return { level: 'unstable', text: '该词记忆不稳定，评分波动大，建议重点关注', cls: 'text-amber-600 dark:text-amber-400' }
  }
  if (card.interval >= 21 && last >= 4) {
    return { level: 'good', text: '已稳定掌握，间隔较长且近期评分良好', cls: 'text-green-600 dark:text-green-400' }
  }
  if (last3.length >= 3 && last3.every((q) => q <= 3)) {
    return { level: 'stubborn', text: '顽固词，连续多次评分偏低，建议增加复习频率', cls: 'text-red-600 dark:text-red-400' }
  }
  return { level: 'learning', text: '记忆正在巩固中，继续保持复习', cls: 'text-brand-600 dark:text-brand-400' }
}

export function WordDetail({
  word,
  card,
  categories,
  onClose,
}: {
  word: WordEntry
  card: SrsCard | undefined
  categories: Category[]
  onClose: () => void
}) {
  const [logs, setLogs] = useState<ReviewLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void repoLogsByWord(word.id!)
      .then((l) => {
        if (!active) return
        setLogs(l)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [word])

  const qualities = logs.map((l) => l.quality)
  const N = qualities.length
  const status = card?.status ?? 'new'
  const sLabel = STATUS_LABELS[status] ?? STATUS_LABELS.new
  const analysis = analyze(qualities, card)

  // chart geometry
  const VW = 340
  const VH = 210
  const padL = 40
  const padR = 14
  const padT = 14
  const padB = 28
  const plotW = VW - padL - padR
  const plotH = VH - padT - padB
  const xOf = (k: number) => (N > 1 ? padL + ((k - 1) / (N - 1)) * plotW : padL + plotW / 2)
  const yOf = (q: number) => padT + (1 - q / 5) * plotH
  const pts = qualities.map((q, i) => `${xOf(i + 1)},${yOf(q)}`).join(' ')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-screen sm:max-h-[92vh] overflow-y-auto rounded-none sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">单词详情</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="关闭">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* basic info */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">{word.text}</p>
              {wordPhonetic(word) && <span className="text-sm text-gray-400">/{wordPhonetic(word)}/</span>}
            </div>
            <span className={clsx('inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full', sLabel.cls)}>{sLabel.text}</span>
          </div>

          {/* meanings */}
          <div className="space-y-2">
            {word.meanings.map((m, mi) => (
              <div key={mi} className="text-sm">
                <p className="text-[11px] text-brand-500 dark:text-brand-400 font-medium">
                  {getCategoryNamePath(categories, m.categoryId) || '未分类'}
                </p>
                <p className="text-gray-700 dark:text-gray-200 leading-relaxed">{m.meaning || '(无释义)'}</p>
                {m.example && <p className="text-xs text-gray-500 dark:text-gray-400 italic">{m.example}</p>}
              </div>
            ))}
          </div>

          {/* curve */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">遗忘曲线</h4>
              <span className="text-[11px] text-gray-400">{N} 次复习</span>
            </div>

            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : N === 0 ? (
              <p className="text-center text-xs text-gray-400 py-12">暂无复习记录，复习后这里会显示评分曲线</p>
            ) : (
              <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full">
                {/* y gridlines + labels */}
                {QUALITY_LABELS.map((ql) => {
                  const y = yOf(ql.q)
                  return (
                    <g key={ql.q}>
                      <line x1={padL} y1={y} x2={VW - padR} y2={y} stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth={1} />
                      <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-gray-400 dark:fill-gray-500" fontSize={9}>
                        {ql.label}
                      </text>
                    </g>
                  )
                })}
                {/* ideal reference line (q=4) */}
                <line x1={padL} y1={yOf(4)} x2={VW - padR} y2={yOf(4)} stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={VW - padR} y={yOf(4) - 4} textAnchor="end" className="fill-violet-400" fontSize={8}>
                  理想(4)
                </text>
                {/* actual curve */}
                <polyline points={pts} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {qualities.map((q, i) => (
                  <circle key={i} cx={xOf(i + 1)} cy={yOf(q)} r={3} fill="#22c55e" />
                ))}
                {/* x labels */}
                {qualities.map((_, i) => (
                  <text key={i} x={xOf(i + 1)} y={VH - 8} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize={9}>
                    {i + 1}
                  </text>
                ))}
                <text x={VW / 2} y={VH - 0} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize={8} />
              </svg>
            )}
          </div>

          {/* annotations */}
          {card && N > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-2">
                <p className="text-gray-400">当前间隔</p>
                <p className="text-gray-700 dark:text-gray-200 font-medium">{card.interval} 天</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-2">
                <p className="text-gray-400">下次到期</p>
                <p className="text-gray-700 dark:text-gray-200 font-medium">{formatDueLabel(card.dueDate)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-2">
                <p className="text-gray-400">连续答对</p>
                <p className="text-gray-700 dark:text-gray-200 font-medium">{card.repetitions} 次</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-2">
                <p className="text-gray-400">错题次数</p>
                <p className="text-gray-700 dark:text-gray-200 font-medium">{card.quizWrongCount ?? 0}</p>
              </div>
            </div>
          )}

          {/* analysis */}
          <div className={clsx('rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3 text-sm', analysis.cls)}>
            <span className="font-medium">分析：</span>
            {analysis.text}
          </div>
        </div>
      </div>
    </div>
  )
}
