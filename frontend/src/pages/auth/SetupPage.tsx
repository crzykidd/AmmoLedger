import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { setup } from '@/api/auth'
import type { ApiError } from '@/types'
import { PasswordStrengthMeter, allRulesPassed } from '@/components/PasswordStrengthMeter'
import logoFull from '@/assets/brand/logo-full-dark.png'

interface FormState {
  first_name: string
  last_name: string
  email: string
  password: string
  confirm: string
}

export default function SetupPage() {
  const { isFirstRun, loading, refetch } = useAuth()
  const [form, setForm] = useState<FormState>({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && !isFirstRun) return <Navigate to="/login" replace />

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }

    setSubmitting(true)
    try {
      await setup({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        password: form.password,
      })
      await refetch()
      // No navigate() call here — SetupRoute re-renders when user becomes
      // non-null and its own `if (user) return <Navigate to="/dashboard">` fires,
      // avoiding a race where navigate() runs before the state update commits.
    } catch (err) {
      const detail = (err as ApiError).detail
      setError(typeof detail === 'string' ? detail : (detail?.message ?? 'Setup failed. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold'
  const labelClass = 'block text-sm text-white/70 mb-1.5'

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="AmmoLedger" className="h-16 w-auto" />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <h2 className="text-white text-xl font-semibold mb-1">Set up AmmoLedger</h2>
          <p className="text-white/50 text-sm mb-6">Create your admin account to get started.</p>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>First name</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={setField('first_name')}
                  className={fieldClass}
                  placeholder="Jane"
                  autoComplete="given-name"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Last name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={setField('last_name')}
                  className={fieldClass}
                  placeholder="Smith"
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={setField('email')}
                className={fieldClass}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={setField('password')}
                className={fieldClass}
                placeholder="12+ characters"
                autoComplete="new-password"
                required
              />
              <PasswordStrengthMeter password={form.password} className="mt-2" />
            </div>

            <div>
              <label className={labelClass}>Confirm password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={setField('confirm')}
                className={fieldClass}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !allRulesPassed(form.password)}
              className="w-full py-2.5 bg-gold hover:bg-gold-light text-navy font-semibold rounded-lg transition-colors disabled:opacity-50 mt-2"
            >
              {submitting ? 'Creating account…' : 'Create admin account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
