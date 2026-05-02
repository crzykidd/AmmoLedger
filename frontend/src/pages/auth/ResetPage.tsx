import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { validateResetToken, submitPasswordReset } from '@/api/auth'
import type { ResetTokenInfo } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrengthMeter, allRulesPassed } from '@/components/PasswordStrengthMeter'
import logoFull from '@/assets/brand/logo-full-dark.png'

const schema = z.object({
  email: z.string().optional(),
  new_password: z.string().min(1),
  confirm_password: z.string().min(1),
})
type FormData = z.infer<typeof schema>

export default function ResetPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()

  const [tokenInfo, setTokenInfo] = useState<ResetTokenInfo | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', new_password: '', confirm_password: '' },
  })
  const watchedPassword = watch('new_password')

  useEffect(() => {
    if (!token) {
      setTokenError('No reset token provided.')
      setTokenLoading(false)
      return
    }
    validateResetToken(token)
      .then((info) => {
        setTokenInfo(info)
        if (info.email) setValue('email', info.email)
      })
      .catch((err: { detail?: { code?: string; message?: string } | string }) => {
        const detail = err?.detail
        if (detail && typeof detail === 'object' && detail.message) {
          setTokenError(detail.message)
        } else {
          setTokenError('This reset link is invalid or has expired.')
        }
      })
      .finally(() => setTokenLoading(false))
  }, [token, setValue])

  const onSubmit = async (data: FormData) => {
    if (!allRulesPassed(data.new_password)) return
    if (data.new_password !== data.confirm_password) {
      setSubmitError('Passwords do not match')
      return
    }
    setSubmitError(null)
    try {
      await submitPasswordReset({
        token,
        new_password: data.new_password,
        email: tokenInfo?.source === 'config' ? data.email : undefined,
      })
      setSuccess(true)
    } catch (err: unknown) {
      const e = err as { detail?: { message?: string } | string }
      const detail = e?.detail
      if (detail && typeof detail === 'object' && detail.message) {
        setSubmitError(detail.message)
      } else {
        setSubmitError('Failed to reset password. Please try again.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="AmmoLedger" className="h-10 w-auto" />
        </div>

        {tokenLoading ? (
          <div className="text-center text-white/60 py-12">Validating reset link…</div>
        ) : tokenError ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Link Invalid</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{tokenError}</p>
          </div>
        ) : success ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Password Reset</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Your password has been updated. You can now sign in with your new password.
            </p>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Sign in
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Reset your password</h1>
            {tokenInfo?.first_name ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Resetting password for{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {tokenInfo.first_name} {tokenInfo.last_name}
                </span>
              </p>
            ) : tokenInfo?.source === 'config' ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Enter your admin account email to continue.
              </p>
            ) : null}

            <form onSubmit={(e) => { void handleSubmit(onSubmit)(e) }} className="space-y-4">
              {tokenInfo?.source === 'config' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <Input
                    {...register('email')}
                    type="email"
                    placeholder="admin@example.com"
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <Input {...register('new_password')} type="password" placeholder="••••••••••••" />
                <PasswordStrengthMeter password={watchedPassword} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirm Password
                </label>
                <Input {...register('confirm_password')} type="password" placeholder="••••••••••••" />
              </div>

              {submitError && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !allRulesPassed(watchedPassword)}
              >
                {isSubmitting ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
