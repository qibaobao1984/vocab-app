import { useEffect, useState } from 'react'
import { repoCategories } from '../lib/repo'
import { useStudyPlan } from '../store/studyPlanStore'
import { CategoryMultiSelect } from './CategoryMultiSelect'
import clsx from 'clsx'
import type { Category, StudyPlan } from '../types'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

interface FormState {
  name: string
  categoryIds: Set<number>
  daysOfWeek: number[]
  time: string
  enabled: boolean
}

const emptyForm: FormState = {
  name: '',
  categoryIds: new Set(),
  daysOfWeek: [1, 2, 3, 4, 5],
  time: '09:00',
  enabled: true,
}

export function StudyPlanManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plans = useStudyPlan((s) => s.plans)
  const save = useStudyPlan((s) => s.save)
  const remove = useStudyPlan((s) => s.remove)
  const toggle = useStudyPlan((s) => s.toggle)
  const [categories, setCategories] = useState<Category[]>([])
  const [editing, setEditing] = useState<StudyPlan | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) void repoCategories().then(setCategories)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        categoryIds: new Set(editing.categoryIds),
        daysOfWeek: editing.daysOfWeek,
        time: editing.time,
        enabled: editing.enabled,
      })
    } else {
      setForm(emptyForm)
    }
  }, [editing, open])

  if (!open) return null

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter((x) => x !== d) : [...f.daysOfWeek, d],
    }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || form.categoryIds.size === 0 || form.daysOfWeek.length === 0) return
    setBusy(true)
    try {
      await save({
        id: editing?.id,
        name: form.name.trim(),
        categoryIds: [...form.categoryIds],
        daysOfWeek: [...form.daysOfWeek].sort(),
        time: form.time,
        enabled: form.enabled,
        createdAt: editing?.createdAt ?? Date.now(),
      })
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-screen sm:max-h-[90vh] overflow-y-auto rounded-none sm:rounded-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">复习计划</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="关闭">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {/* list */}
          {plans.length > 0 && (
            <div className="space-y-2 mb-5">
              {plans.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {p.daysOfWeek.map((d) => WEEKDAYS[d]).join('') || '每天'} · {p.time} · {p.categoryIds.length}类
                    </p>
                  </div>
                  <button
                    onClick={() => void toggle(p.id!, !p.enabled)}
                    className={clsx(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
                      p.enabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600',
                    )}
                    title={p.enabled ? '关闭' : '开启'}
                  >
                    <span className={clsx('inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform', p.enabled ? 'translate-x-4' : 'translate-x-1')} />
                  </button>
                  <button onClick={() => setEditing(p)} className="text-xs text-brand-600 hover:text-brand-700 flex-shrink-0" title="编辑">
                    编辑
                  </button>
                  <button
                    onClick={() => { if (p.id !== undefined) void remove(p.id) }}
                    className="text-xs text-red-500 hover:text-red-600 flex-shrink-0"
                    title="删除"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* form */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{editing ? '编辑计划' : '新建计划'}</h4>
              {editing && (
                <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">取消编辑</button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">计划名称</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="如：考研词汇每日复习"
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">复习类别（可多选，可跨类别）</label>
                <CategoryMultiSelect
                  categories={categories}
                  selected={form.categoryIds}
                  onChange={(s) => setForm((f) => ({ ...f, categoryIds: s }))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">复习星期</label>
                <div className="flex gap-1.5">
                  {WEEKDAYS.map((w, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={clsx(
                        'flex-1 rounded-lg py-2 text-xs font-medium transition-colors',
                        form.daysOfWeek.includes(idx)
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                      )}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">提醒时间</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  启用
                </label>
              </div>

              <button
                onClick={() => void handleSubmit()}
                disabled={busy || !form.name.trim() || form.categoryIds.size === 0 || form.daysOfWeek.length === 0}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? '保存中...' : editing ? '保存修改' : '创建计划'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
