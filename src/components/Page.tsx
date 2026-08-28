import clsx from 'clsx'

interface PageProps {
  title?: string
  icon?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Page({ title, icon, description, actions, children, className }: PageProps) {
  const hasCenteredHeader = icon && title
  return (
    <div className={clsx('max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-6 animate-fade-in', className)}>
      {hasCenteredHeader ? (
        <div className="text-center mb-8">
          <div className="flex items-center justify-end mb-1">
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-100 dark:bg-brand-900/40 mb-4">
            <svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{title}</h1>
          {description && (
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">{description}</p>
          )}
        </div>
      ) : (
        (title || actions) && (
          <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
            {title && <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{title}</h1>}
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )
      )}
      {children}
    </div>
  )
}
