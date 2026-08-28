import clsx from 'clsx'
import { getTreeNodes, indentLabel } from '../lib/tree'
import type { Category } from '../types'

interface CategorySelectProps {
  categories: Category[]
  value: string
  onChange: (value: string) => void
  firstOption?: { value: string; label: string }
  className?: string
}

export function CategorySelect({
  categories,
  value,
  onChange,
  firstOption,
  className,
}: CategorySelectProps) {
  const nodes = getTreeNodes(categories)

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx(
        'rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500',
        className,
      )}
    >
      {firstOption && <option value={firstOption.value}>{firstOption.label}</option>}
      {nodes.map(({ cat, depth }) => (
        <option key={cat.id} value={String(cat.id)}>
          {indentLabel(cat.name, depth)}
        </option>
      ))}
    </select>
  )
}
