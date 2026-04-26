import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'rounded-xl border px-4 py-3 shadow-lg pointer-events-auto',
            'animate-in slide-in-from-bottom-2 fade-in-0 duration-200',
            t.variant === 'destructive'
              ? 'bg-red-600 border-red-500 text-white'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
          )}
        >
          <p
            className={cn(
              'text-sm font-medium',
              t.variant === 'destructive'
                ? 'text-white'
                : 'text-gray-900 dark:text-white',
            )}
          >
            {t.title}
          </p>
          {t.description && (
            <p
              className={cn(
                'text-sm mt-0.5',
                t.variant === 'destructive'
                  ? 'text-red-100'
                  : 'text-gray-500 dark:text-gray-400',
              )}
            >
              {t.description}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
