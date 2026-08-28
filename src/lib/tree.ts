import type { Category } from '../types'

export interface TreeNode {
  cat: Category
  depth: number
  path: string
}

export function getTreeNodes(categories: Category[]): TreeNode[] {
  const byParent = new Map<number | null, Category[]>()
  for (const c of categories) {
    if (c.id === undefined) continue
    const key = c.parentId ?? null
    const arr = byParent.get(key) ?? []
    arr.push(c)
    byParent.set(key, arr)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  }

  const result: TreeNode[] = []
  const walk = (parentId: number | null, depth: number, parentPath: string) => {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      const path = parentPath ? `${parentPath} / ${child.name}` : child.name
      result.push({ cat: child, depth, path })
      walk(child.id!, depth + 1, path)
    }
  }
  walk(null, 0, '')
  return result
}

export function getDescendantIds(categories: Category[], rootId: number): number[] {
  const byParent = new Map<number, number[]>()
  for (const c of categories) {
    if (c.id === undefined || c.parentId === null || c.parentId === undefined) continue
    const arr = byParent.get(c.parentId) ?? []
    arr.push(c.id)
    byParent.set(c.parentId, arr)
  }

  const result: number[] = [rootId]
  const stack = [rootId]
  while (stack.length) {
    const current = stack.pop()!
    const children = byParent.get(current) ?? []
    for (const childId of children) {
      result.push(childId)
      stack.push(childId)
    }
  }
  return result
}

export function indentLabel(name: string, depth: number): string {
  if (depth === 0) return name
  return '\u3000'.repeat(depth) + '└ ' + name
}

export function getCategoryNamePath(categories: Category[], id: number): string {
  const byId = new Map(categories.map((c) => [c.id!, c]))
  const path: string[] = []
  let current: Category | undefined = byId.get(id)
  let guard = 0
  while (current && guard < 100) {
    path.unshift(current.name)
    current = current.parentId !== null ? byId.get(current.parentId) : undefined
    guard++
  }
  return path.join(' / ')
}
