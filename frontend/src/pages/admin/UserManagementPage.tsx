import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, parseISO } from 'date-fns'
import { KeyRound } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PasswordStrengthChecklist, allRulesPassed } from '@/components/ui/password-strength'
import { getUsers, updateUser, resetUserPassword } from '@/api/users'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { UserRead } from '@/types'

const resetSchema = z.object({
  new_password: z.string().min(1),
  confirm_password: z.string().min(1),
})
type ResetForm = z.infer<typeof resetSchema>

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'read_only', label: 'Read Only' },
]

function roleBadge(role: string) {
  const map: Record<string, string> = {
    admin: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    read_only: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  const labels: Record<string, string> = { admin: 'Admin', member: 'Member', read_only: 'Read Only' }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', map[role] ?? map.member)}>
      {labels[role] ?? role}
    </span>
  )
}

function statusBadge(active: boolean) {
  return active ? (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Active
    </span>
  ) : (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      Inactive
    </span>
  )
}

function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: UserRead
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  })
  const watchedPassword = watch('new_password')

  const mutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      resetUserPassword(id, password),
    onSuccess: () => {
      toast({ title: 'Password reset — user will be prompted to change on next login' })
      void qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err: unknown) => {
      const e = err as { detail?: { message?: string } | string }
      const detail = e?.detail
      if (detail && typeof detail === 'object' && detail.message) {
        setSubmitError(detail.message)
      } else {
        setSubmitError('Failed to reset password')
      }
    },
  })

  const onSubmit = (data: ResetForm) => {
    if (!allRulesPassed(data.new_password)) return
    if (data.new_password !== data.confirm_password) {
      setSubmitError('Passwords do not match')
      return
    }
    setSubmitError(null)
    mutation.mutate({ id: target.id, password: data.new_password })
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Reset Password</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-3 mb-2">
        Resetting password for <span className="font-medium text-gray-700 dark:text-gray-300">{target.first_name} {target.last_name}</span>
      </p>
      <form onSubmit={(e) => { void handleSubmit(onSubmit)(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            New Password
          </label>
          <Input {...register('new_password')} type="password" placeholder="••••••••••••" />
          {watchedPassword !== '' && <PasswordStrengthChecklist password={watchedPassword} />}
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
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            disabled={isSubmitting || !allRulesPassed(watchedPassword)}
          >
            Reset Password
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth()
  const qc = useQueryClient()
  const [resetTarget, setResetTarget] = useState<UserRead | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { role?: string; is_active?: boolean } }) =>
      updateUser(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: () => {
      toast({ title: 'Failed to update user', variant: 'destructive' })
    },
  })

  return (
    <AppShell>
      <TopBar title="Users" />
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-gray-500 dark:text-gray-400 text-sm">Loading users…</div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Last Login</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {u.first_name} {u.last_name}
                        {u.must_change_password && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(must change pw)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.email}</td>
                      <td className="px-4 py-3">{roleBadge(u.role)}</td>
                      <td className="px-4 py-3">{statusBadge(u.is_active)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {u.last_login_at
                          ? format(parseISO(u.last_login_at), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {/* Role select */}
                          <select
                            className={cn(
                              'text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
                              'text-gray-700 dark:text-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gold/50',
                              isSelf && 'opacity-40 cursor-not-allowed',
                            )}
                            value={u.role}
                            disabled={isSelf}
                            onChange={(e) => {
                              updateMutation.mutate({ id: u.id, data: { role: e.target.value } })
                            }}
                          >
                            {ROLE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>

                          {/* Activate / deactivate */}
                          <Button
                            size="sm"
                            variant={u.is_active ? 'ghost' : 'ghost'}
                            className={cn(
                              'text-xs h-7 px-2',
                              u.is_active
                                ? 'text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : 'text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20',
                              isSelf && 'opacity-40 cursor-not-allowed pointer-events-none',
                            )}
                            disabled={isSelf}
                            onClick={() => {
                              updateMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })
                            }}
                          >
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </Button>

                          {/* Reset password */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            title="Reset password"
                            onClick={() => setResetTarget(u)}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={resetTarget !== null} onOpenChange={(open) => { if (!open) setResetTarget(null) }}>
        {resetTarget && (
          <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />
        )}
      </Dialog>
    </AppShell>
  )
}
