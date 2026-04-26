import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrengthChecklist, allRulesPassed } from '@/components/ui/password-strength'
import { useAuth } from '@/contexts/AuthContext'
import { changeMyPassword } from '@/api/users'
import { toast } from '@/hooks/use-toast'

const schema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(1),
  confirm_password: z.string().min(1),
})
type FormData = z.infer<typeof schema>

export default function ProfilePage() {
  const { user, mustChangePassword, refetch } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const watchedPassword = watch('new_password')

  const onSubmit = async (data: FormData) => {
    if (!allRulesPassed(data.new_password)) return
    if (data.new_password !== data.confirm_password) {
      setSubmitError('New passwords do not match')
      return
    }
    setSubmitError(null)
    try {
      await changeMyPassword(data)
      toast({ title: 'Password changed successfully' })
      reset()
      await refetch()
    } catch (err: unknown) {
      const e = err as { detail?: { message?: string; code?: string } | string }
      const detail = e?.detail
      if (detail && typeof detail === 'object') {
        if (detail.code === 'INVALID_PASSWORD') {
          setSubmitError('Current password is incorrect')
        } else if (detail.code === 'PASSWORD_HISTORY') {
          setSubmitError('Password was used recently — choose a different one')
        } else {
          setSubmitError(detail.message ?? 'Failed to change password')
        }
      } else {
        setSubmitError('Failed to change password')
      }
    }
  }

  return (
    <AppShell>
      <TopBar title="Profile" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-6">

          {mustChangePassword && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-500/30 px-4 py-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                An admin has reset your password. Please set a new password to continue.
              </p>
            </div>
          )}

          {/* Account info */}
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-4">
              Account
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Name</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {user?.first_name} {user?.last_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Email</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Role</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                  {user?.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
          </section>

          {/* Change password */}
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-4">
              Change Password
            </h2>
            <form onSubmit={(e) => { void handleSubmit(onSubmit)(e) }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Password
                </label>
                <Input {...register('current_password')} type="password" placeholder="••••••••••••" />
                {errors.current_password && (
                  <p className="text-xs text-red-500 mt-1">{errors.current_password.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <Input {...register('new_password')} type="password" placeholder="••••••••••••" />
                {watchedPassword !== '' && (
                  <PasswordStrengthChecklist password={watchedPassword} />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirm New Password
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
                disabled={isSubmitting || !allRulesPassed(watchedPassword)}
              >
                {isSubmitting ? 'Saving…' : 'Change password'}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
