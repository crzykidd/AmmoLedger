import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordStrengthMeter, allRulesPassed } from '@/components/PasswordStrengthMeter'
import { useAuth } from '@/contexts/AuthContext'
import { changeMyPassword } from '@/api/users'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const ROLE_META: Record<string, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-gold/20 text-gold' },
  member: { label: 'Member', className: 'bg-blue-500/20 text-blue-400' },
  read_only: { label: 'Read Only', className: 'bg-gray-500/20 text-gray-400' },
}

const schema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(1),
  confirm_password: z.string().min(1),
})
type FormData = z.infer<typeof schema>

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

interface UserProfileDrawerProps {
  open: boolean
  onClose: () => void
}

export function UserProfileDrawer({ open, onClose }: UserProfileDrawerProps) {
  const { user, refetch } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const watchedPassword = watch('new_password')

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Reset form when drawer closes
  useEffect(() => {
    if (!open) {
      reset()
      setSubmitError(null)
    }
  }, [open, reset])

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

  if (!open) return null

  const initials = user
    ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase()
    : '?'
  const roleMeta = ROLE_META[user?.role ?? 'member'] ?? ROLE_META.member

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Dark overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="relative z-10 w-80 bg-navy border-r border-white/10 flex flex-col overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Profile
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center px-5 py-6 border-b border-white/10">
          <div className="h-16 w-16 rounded-full bg-gold flex items-center justify-center mb-3">
            <span className="text-xl font-bold text-white">{initials}</span>
          </div>
          <p className="text-white font-semibold text-base">
            {user?.first_name} {user?.last_name}
          </p>
          {user?.email && (
            <p className="text-white/50 text-sm mt-0.5">{user.email}</p>
          )}
          <span
            className={cn(
              'inline-block text-xs px-2 py-0.5 rounded-full mt-2',
              roleMeta.className,
            )}
          >
            {roleMeta.label}
          </span>
        </div>

        {/* Account info */}
        <div className="px-5 py-4 border-b border-white/10 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">
            Account
          </h3>
          <div>
            <p className="text-xs text-white/40 mb-0.5">Email</p>
            <p className="text-sm text-white/80">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 mb-0.5">Member since</p>
            <p className="text-sm text-white/80">{formatDate(user?.created_at)}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 mb-0.5">Last login</p>
            <p className="text-sm text-white/80">{formatDate(user?.last_login_at)}</p>
          </div>
        </div>

        {/* Change password */}
        <div className="px-5 py-4 flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">
            Change Password
          </h3>
          <form
            onSubmit={(e) => { void handleSubmit(onSubmit)(e) }}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">
                Current Password
              </label>
              <Input
                {...register('current_password')}
                type="password"
                placeholder="••••••••••••"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
              />
              {errors.current_password && (
                <p className="text-xs text-red-400 mt-1">{errors.current_password.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">
                New Password
              </label>
              <Input
                {...register('new_password')}
                type="password"
                placeholder="••••••••••••"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
              />
              <PasswordStrengthMeter password={watchedPassword} />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">
                Confirm New Password
              </label>
              <Input
                {...register('confirm_password')}
                type="password"
                placeholder="••••••••••••"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
              />
            </div>

            {submitError && (
              <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
                {submitError}
              </p>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !allRulesPassed(watchedPassword)}
              className="w-full"
            >
              {isSubmitting ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </div>

        {/* Footer close */}
        <div className="px-5 py-4 border-t border-white/10">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full border-white/20 text-white/60 hover:text-white hover:border-white/40 bg-transparent"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
