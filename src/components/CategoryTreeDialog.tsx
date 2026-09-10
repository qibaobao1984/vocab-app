import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { getTreeNodes, getDescendantIds, getCategoryNamePath } from '../lib/tree'
import type { Category } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { CategorySelect } from './CategorySelect'
import clsx from 'clsx'

interface CategoryTreeDialogProps {
  open: boolean
  onClose: () => void
}

export function CategoryTreeDialog({ open, onClose }: CategoryTreeDialogProps) {
  const refreshKey = useStore((s) => s.refreshKey)
  const moveCategory = useStore((s) => s.moveCategory)
  const swapCategoryOrder = useStore((s) => s.swapCategoryOrder)
  const mergeCategories = useStore((s) => s.mergeCategories)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; message: React.ReactNode; danger?: boolean; onConfirm: () => Promise<void> } | null>(null)
  const [mergeSource, setMergeSource] = useState<number | null>(null)
  const [mergeTarget, setMergeTarget] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    import('../lib/repo').then((m) => m.repoCategories()).then((cats) => {
      if (!active) return
      setCategories(cats)
      setLoading(false)
    })
    return () => { active = false }
  }, [open, refreshKey])

  const tree = useMemo(() => getTreeNodes(categories), [categories])

  const byId = useMemo(() => new Map(categories.map((c) => [c.id!, c])), [categories])

  const siblingsByParent = useMemo(() => {
    const m = new Map<number | null, number[]>()
    for (const node of tree) {
      const parent = node.cat.parentId ?? null
      const arr = m.get(parent) ?? []
      arr.push(node.cat.id!)
      m.set(parent, arr)
    }
    return m
  }, [tree])

  if (!open) return null

  const handleMoveUpDown = async (id: number, dir: -1 | 1) => {
    const cat = byId.get(id)
    if (!cat) return
    const parent = cat.parentId ?? null
    const siblings = siblingsByParent.get(parent) ?? []
    const idx = siblings.indexOf(id)
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= siblings.length) return
    await swapCategoryOrder(id, siblings[targetIdx])
  }

  const handleDrop = (targetId: number | null) => {
    if (dragId === null || dragId === targetId) return
    const sourceName = byId.get(dragId)?.name ?? ''
    const targetName = targetId === null ? '顶级' : byId.get(targetId)?.name ?? ''
    setDragId(null)
    setDragOverId(null)
    setConfirm({
      title: '移动词库',
      danger: false,
      message: (
        <>
          确定将 <b className="text-brand-600">{sourceName}</b> 移动到 <b className="text-brand-600">{targetName}</b> 下吗？该词库下的所有词汇会一起调整。
        </>
      ),
      onConfirm: async () => {
        await moveCategory(dragId, targetId)
        setConfirm(null)
      },
    })
  }

  const startMerge = (sourceId: number) => {
    setMergeSource(sourceId)
    setMergeTarget('')
    setError('')
  }

  const doMerge = async () => {
    if (mergeSource === null || !mergeTarget || mergeTarget === 'none') {
      setError('请选择目标词库')
      return
    }
    const targetId = Number(mergeTarget)
    if (targetId === mergeSource) {
      setError('不能合并到自身')
      return
    }
    const desc = getDescendantIds(categories, mergeSource)
    if (desc.includes(targetId)) {
      setError('不能合并到自身的子词库')
      return
    }
    const sourceName = byId.get(mergeSource)?.name ?? ''
    const targetName = getCategoryNamePath(categories, targetId)
    setConfirm({
      title: '合并词库',
      message: (
        <>
          确定将 <b className="text-red-600">{sourceName}</b> 合并到 <b className="text-brand-600">{targetName}</b> 吗？源词库下的所有词汇将转移到目标词库，源词库将被删除，此操作不可撤销。
        </>
      ),
      onConfirm: async () => {
        await mergeCategories(mergeSource, targetId)
        setMergeSource(null)
        setMergeTarget('')
        setConfirm(null)
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">整理词库</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {mergeSource !== null && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
              合并模式：将「{byId.get(mergeSource)?.name}」合并到 →
            </p>
            <div className="flex gap-2">
              <CategorySelect
                categories={categories}
                value={mergeTarget}
                onChange={setMergeTarget}
                firstOption={{ value: 'none', label: '— 选择目标词库 —' }}
                className="flex-1 text-sm"
              />
              <button onClick={doMerge} className="btn-primary text-xs px-3 py-1.5">确定合并</button>
              <button onClick={() => { setMergeSource(null); setMergeTarget(''); setError('') }} className="btn-ghost text-xs px-2 py-1.5">取消</button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">暂无词库</p>
          ) : (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverId(null) }}
                onDrop={(e) => { e.preventDefault(); handleDrop(null) }}
                className={clsx('rounded-lg border-2 border-dashed p-2 mb-2 text-center text-xs transition-colors', dragId !== null ? 'border-brand-400 text-brand-500 cursor-pointer' : 'border-gray-200 dark:border-gray-700 text-gray-400')}
              >
                设为顶级
              </div>
              {tree.map((node) => {
                const id = node.cat.id!
                const isDragOver = dragOverId === id
                const isMergeTarget = mergeSource !== null && mergeSource !== id
                const parent = node.cat.parentId ?? null
                const siblings = siblingsByParent.get(parent) ?? []
                const sibIdx = siblings.indexOf(id)
                const canUp = sibIdx > 0
                const canDown = sibIdx >= 0 && sibIdx < siblings.length - 1
                return (
                  <div
                    key={id}
                    draggable={mergeSource === null}
                    onDragStart={() => setDragId(id)}
                    onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                    onDragOver={(e) => { e.preventDefault(); if (dragId !== null && dragId !== id) setDragOverId(id) }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(id) }}
                    className={clsx(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                      isDragOver && 'bg-brand-50 dark:bg-brand-900/30 ring-2 ring-brand-400',
                      dragId === id && 'opacity-40',
                      isMergeTarget && 'hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer',
                    )}
                    style={{ paddingLeft: `${0.5 + node.depth * 1.2}rem` }}
                    onClick={() => { if (mergeSource !== null && isMergeTarget) { setMergeTarget(String(id)) } }}
                  >
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 cursor-grab" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
                      {node.depth > 0 && <span className="text-gray-400">└ </span>}
                      {node.cat.name}
                    </span>
                    {mergeSource === null && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (canUp) void handleMoveUpDown(id, -1) }}
                          disabled={!canUp}
                          className="text-gray-400 hover:text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 rounded transition-colors"
                          title="上移"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (canDown) void handleMoveUpDown(id, 1) }}
                          disabled={!canDown}
                          className="text-gray-400 hover:text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 rounded transition-colors"
                          title="下移"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); startMerge(id) }}
                          className="text-xs text-gray-400 hover:text-brand-500 px-1 py-0.5 rounded transition-colors"
                          title="合并到其他词库"
                        >
                          合并
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
          拖拽词库到另一个词库上可调整层级，点击「合并」可将词库合并到其他词库
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmText="确定"
        danger={confirm?.danger ?? true}
        onConfirm={async () => { if (confirm) await confirm.onConfirm() }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
