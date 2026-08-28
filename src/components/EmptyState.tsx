interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon = '📭', title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center animate-fade-in">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4 text-3xl">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
      {description && <p className="text-sm text-gray-400 mt-1 mb-6">{description}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary">{actionLabel}</button>
      )}
    </div>
  )
}
