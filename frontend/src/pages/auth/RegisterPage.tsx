import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle } from 'lucide-react'
import { validateInviteToken } from '@/api/invites'
import { register as apiRegister } from '@/api/auth'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrengthChecklist, allRulesPassed } from '@/components/ui/password-strength'
import { cn } from '@/lib/utils'
import logoFull from '@/assets/brand/logo-full-dark.png'

const schema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(1),
  confirm_password: z.string().min(1),
})
type FormData = z.infer<typeof schema>

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  read_only: 'Read Only',
}

export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { refetch } = useAuth()

  const [inviteInfo, setInviteInfo] = useState<{ role: string; email_hint: string | null } | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { first_name: '', last_name: '', email: '', password: '', confirm_password: '' },
  })

  const watchedPassword = watch('password')

  useEffect(() => {
    if (!token) {
      setInviteError('No invitation token provided.')
      setInviteLoading(false)
      return
    }
    validateInviteToken(token)
      .then((info) => {
        setInviteInfo(info)
        if (info.email_hint) {
          setValue('email', info.email_hint)
        }
      })
      .catch((err: { detail?: { code?: string; message?: string } | string }) => {
        const detail = err?.detail
        if (detail && typeof detail === 'object' && detail.message) {
          setInviteError(detail.message)
        } else {
          setInviteError('This invitation is invalid or has expired.')
        }
      })
      .finally(() => setInviteLoading(false))
  }, [token, setValue])

  const onSubmit = async (data: FormData) => {
    if (!allRulesPassed(data.password)) return
    if (data.password !== data.confirm_password) {
      setSubmitError('Passwords do not match')
      return
    }
    setSubmitError(null)
    try {
      await apiRegister({ token, ...data })
      await refetch()
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const e = err as { detail?: { message?: string } | string }
      const detail = e?.detail
      if (detail && typeof detail === 'object' && detail.message) {
        setSubmitError(detail.message)
      } else {
        setSubmitError('Registration failed. Please try again.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="AmmoLedger" className="h-10 w-auto" />
        </div>

        {inviteLoading ? (
          <div className="text-center text-white/60 py-12">Validating invitation…</div>
        ) : inviteError ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Invitation Invalid</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{inviteError}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Create your account</h1>
            {inviteInfo && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                You've been invited as{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {ROLE_LABELS[inviteInfo.role] ?? inviteInfo.role}
                </span>
              </p>
            )}

            <form onSubmit={(e) => { void handleSubmit(onSubmit)(e) }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name
                  </label>
                  <Input {...register('first_name')} placeholder="Jane" />
                  {errors.first_name && (
                    <p className="text-xs text-red-500 mt-1">{errors.first_name.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name
                  </label>
                  <Input {...register('last_name')} placeholder="Smith" />
                  {errors.last_name && (
                    <p className="text-xs text-red-500 mt-1">{errors.last_name.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="jane@example.com"
                  readOnly={Boolean(inviteInfo?.email_hint)}
                  className={cn(
                    inviteInfo?.email_hint &&
                      'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-default select-none',
                  )}
                />
                {inviteInfo?.email_hint ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Email set by your administrator
                  </p>
                ) : (
                  errors.email && (
                    <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
                  )
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <Input {...register('password')} type="password" placeholder="••••••••••••" />
                {watchedPassword !== '' && (
                  <PasswordStrengthChecklist password={watchedPassword} />
                )}
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
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
