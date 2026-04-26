import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const RULES = [
  { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number', test: (p: string) => /\d/.test(p) },
  {
    label: 'Special character',
    test: (p: string) => /[!@#$%^&*()\-_=+[\]{}|;:'",.<>?/~]/.test(p),
  },
]

export function allRulesPassed(password: string): boolean {
  return RULES.every((r) => r.test(password))
}

interface PasswordStrengthChecklistProps {
  password: string
  className?: string
}

export function PasswordStrengthChecklist({ password, className }: PasswordStrengthChecklistProps) {
  return (
    <ul className={cn('space-y-1 mt-2', className)}>
      {RULES.map((rule) => {
        const passed = rule.test(password)
        return (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            {passed ? (
              <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
            ) : (
              <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
            )}
            <span className={cn(passed ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400')}>
              {rule.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
