import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { ApiError } from '@/types'
import logoFull from '@/assets/brand/logo-full-dark.png'

export default function LoginPage() {
  const { user, isFirstRun, loading, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/dashboard" replace />
  if (!loading && isFirstRun) return <Navigate to="/setup" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      setError((err as ApiError).detail ?? 'Login failed. Check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="AmmoLedger" className="h-16 w-auto" />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <h2 className="text-white text-xl font-semibold mb-6">Sign in</h2>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-gold hover:bg-gold-light text-navy font-semibold rounded-lg transition-colors disabled:opacity-50 mt-2"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {isFirstRun && (
            <p className="mt-5 text-center text-white/50 text-sm">
              No account yet —{' '}
              <Link to="/setup" className="text-gold hover:text-gold-light underline-offset-2 hover:underline">
                set up AmmoLedger
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
