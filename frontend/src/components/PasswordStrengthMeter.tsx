import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const RULES = [
  { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { label: 'Contains uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Contains lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Contains a number', test: (p: string) => /\d/.test(p) },
  {
    label: 'Contains a special character',
    test: (p: string) => /[!@#$%^&*()\-_=+[\]{}|;:'",.<>?/~]/.test(p),
  },
]

export function allRulesPassed(password: string): boolean {
  return RULES.every((r) => r.test(password))
}

function strengthMeta(passed: number): { label: string; segmentColor: string; labelColor: string } {
  if (passed === 0) return { label: '', segmentColor: '', labelColor: '' }
  if (passed <= 2) return { label: 'Weak', segmentColor: 'bg-red-500', labelColor: 'text-red-500' }
  if (passed === 3) return { label: 'Fair', segmentColor: 'bg-amber-500', labelColor: 'text-amber-500' }
  if (passed === 4) return { label: 'Good', segmentColor: 'bg-yellow-500', labelColor: 'text-yellow-600 dark:text-yellow-400' }
  return { label: 'Strong', segmentColor: 'bg-green-500', labelColor: 'text-green-600 dark:text-green-400' }
}

interface PasswordStrengthMeterProps {
  password: string
  className?: string
}

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  const passed = RULES.filter((r) => r.test(password)).length
  const { label, segmentColor, labelColor } = strengthMeta(passed)

  return (
    <div className={cn('mt-2 space-y-2', className)}>
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 h-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className={cn(
                'flex-1 rounded-full transition-colors duration-150',
                n <= passed ? segmentColor : 'bg-gray-200 dark:bg-gray-700',
              )}
            />
          ))}
        </div>
        <span className={cn('text-xs font-medium w-12 text-right', labelColor)}>
          {label}
        </span>
      </div>

      {/* Rule checklist */}
      <ul className="space-y-1">
        {RULES.map((rule) => {
          const ok = rule.test(password)
          return (
            <li key={rule.label} className="flex items-center gap-2 text-xs">
              {ok ? (
                <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
              )}
              <span className={cn(ok ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400')}>
                {rule.label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
