import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { getDescendantIds } from '../lib/tree'
import type { Category } from '../types'

interface CategoryMultiSelectProps {
  categories: Category[]
  selected: Set<number>
  onChange: (selected: Set<number>) => void
  className?: string
  editable?: boolean
  onRename?: (id: number, newName: string) => Promise<void>
  onDelete?: (id: number) => void
}

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 accent-brand-600"
    />
  )
}

export function CategoryMultiSelect({
  categories,
  selected,
  onChange,
  className,
  editable,
  onRename,
  onDelete,
}: CategoryMultiSelectProps) {
  const childrenMap = useMemo(() => {
    const m = new Map<number | null, Category[]>()
    for (const c of categories) {
      const key = c.parentId ?? null
      const arr = m.get(key) ?? []
      arr.push(c)
      m.set(key, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    }
    return m
  }, [categories])

  const descendantMap = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const c of categories) {
      if (c.id !== undefined) m.set(c.id, getDescendantIds(categories, c.id))
    }
    return m
  }, [categories])

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const startEdit = (cat: Category) => {
    setEditingId(cat.id!)
    setEditName(cat.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
  }

  const saveEdit = async () => {
    if (editingId === null || !onRename) return
    const trimmed = editName.trim()
    if (!trimmed || trimmed === categories.find((c) => c.id === editingId)?.name) {
      cancelEdit()
      return
    }
    try {
      await onRename(editingId, trimmed)
    } catch {
      // keep editing on error
      return
    }
    cancelEdit()
  }

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getState = (id: number): 'checked' | 'indeterminate' | 'unchecked' => {
    const desc = descendantMap.get(id) ?? [id]
    const count = desc.reduce((acc, x) => acc + (selected.has(x) ? 1 : 0), 0)
    if (count === desc.length) return 'checked'
    if (count === 0) return 'unchecked'
    return 'indeterminate'
  }

  const toggle = (id: number) => {
    const desc = descendantMap.get(id) ?? [id]
    const state = getState(id)
    const next = new Set(selected)
    if (state === 'checked') {
      desc.forEach((x) => next.delete(x))
    } else {
      desc.forEach((x) => next.add(x))
    }
    onChange(next)
  }

  const allChecked = categories.length > 0 && selected.size >= categories.length
  const noneChecked = selected.size === 0
  const masterState: 'checked' | 'indeterminate' | 'unchecked' = allChecked
    ? 'checked'
    : noneChecked
      ? 'unchecked'
      : 'indeterminate'

  const toggleAll = () => {
    if (masterState === 'checked') onChange(new Set())
    else onChange(new Set(categories.map((c) => c.id!)))
  }

  const expandAll = () => setExpanded(new Set(categories.map((c) => c.id!)))
  const collapseAll = () => setExpanded(new Set())

  const renderNode = (cat: Category, depth: number): React.ReactNode => {
    const children = childrenMap.get(cat.id!) ?? []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(cat.id!)
    const state = getState(cat.id!)
    const isEditing = editingId === cat.id
    return (
      <div key={cat.id}>
        <div
          className="group flex items-center gap-1.5 py-1.5 pr-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
          style={{ paddingLeft: `${0.5 + depth * 0.5}rem` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(cat.id!)
              }}
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
              title={isExpanded ? '收起' : '展开'}
            >
              <svg
                className={clsx('w-3 h-3 transition-transform', isExpanded && 'rotate-90')}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={editInputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void saveEdit() }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                }}
                className="flex-1 min-w-0 rounded border border-brand-400 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                onClick={(e) => { e.stopPropagation(); void saveEdit() }}
                className="w-5 h-5 flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded flex-shrink-0"
                title="保存"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); cancelEdit() }}
                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex-shrink-0"
                title="取消"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <TriCheckbox
                checked={state === 'checked'}
                indeterminate={state === 'indeterminate'}
                onChange={() => toggle(cat.id!)}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">{cat.name}</span>
              {hasChildren && (
                <span className="text-[10px] text-gray-400 flex-shrink-0">{children.length}</span>
              )}
              {editable && onRename && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); startEdit(cat) }}
                  className="flex-shrink-0 ml-auto px-1.5 py-0.5 rounded text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition-colors"
                  title="重命名"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              {editable && onDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(cat.id!) }}
                  className={clsx(
                    'flex-shrink-0 px-1.5 py-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors',
                    !(editable && onRename) && 'ml-auto',
                  )}
                  title="删除类别"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>{children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div className={clsx('rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-2">
        <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-1 px-1 py-0.5 rounded">
          <TriCheckbox
            checked={masterState === 'checked'}
            indeterminate={masterState === 'indeterminate'}
            onChange={toggleAll}
          />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">全部类别</span>
          {noneChecked && (
            <span className="text-xs text-amber-500 dark:text-amber-400">请至少选一个</span>
          )}
          {allChecked && <span className="text-xs text-gray-400">已选全部</span>}
        </label>
        <div className="flex gap-1 text-[10px] text-gray-400">
          <button onClick={expandAll} className="hover:text-brand-600 px-1">全展开</button>
          <span>·</span>
          <button onClick={collapseAll} className="hover:text-brand-600 px-1">全收起</button>
        </div>
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {(childrenMap.get(null) ?? []).map((c) => renderNode(c, 0))}
      </div>
    </div>
  )
}
