import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function passwordsMatch(password: string, confirm: string): boolean {
  return password.length > 0 && password === confirm
}

interface PasswordMatchIndicatorProps {
  password: string
  confirm: string
  className?: string
}

export function PasswordMatchIndicator({
  password,
  confirm,
  className,
}: PasswordMatchIndicatorProps) {
  if (confirm.length === 0) return null

  const ok = password === confirm

  return (
    <div className={cn('mt-2', className)}>
      <div className="flex items-center gap-2 text-xs">
        {ok ? (
          <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
        ) : (
          <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
        )}
        <span
          className={cn(
            ok
              ? 'text-green-700 dark:text-green-400'
              : 'text-red-600 dark:text-red-400',
          )}
        >
          {ok ? 'Passwords match' : 'Passwords do not match'}
        </span>
      </div>
    </div>
  )
}
