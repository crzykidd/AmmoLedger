import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, parseISO, differenceInDays } from 'date-fns'
import { KeyRound, Link2, UserPlus, Copy, Check } from 'lucide-react'
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
import { PasswordStrengthMeter, allRulesPassed } from '@/components/PasswordStrengthMeter'
import { getUsers, updateUser, resetUserPassword } from '@/api/users'
import { generateResetToken } from '@/api/auth'
import { createInvite, getInvites, revokeInvite } from '@/api/invites'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { UserRead, InviteCreate, InviteRead } from '@/types'

const resetSchema = z.object({
  new_password: z.string().min(1),
  confirm_password: z.string().min(1),
})
type ResetForm = z.infer<typeof resetSchema>

const USER_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'read_only', label: 'Read Only' },
]

const INVITE_ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'read_only', label: 'Read Only' },
  { value: 'admin', label: 'Admin' },
]

const INVITE_EXPIRY_OPTIONS = [
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '72 hours (default)' },
  { value: 168, label: '7 days' },
]

const THIRTY_DAYS_AGO = Date.now() - 30 * 24 * 60 * 60 * 1000

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

function userStatusBadge(active: boolean) {
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

function inviteStatusBadge(status: InviteRead['status']) {
  const map: Record<string, string> = {
    valid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    expired: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    used: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    revoked: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', map[status] ?? map.expired)}>
      {status}
    </span>
  )
}

// ─── Invite User Modal ────────────────────────────────────────────────────────

function InviteUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [role, setRole] = useState('member')
  const [emailHint, setEmailHint] = useState('')
  const [expiresHours, setExpiresHours] = useState(72)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteExpiry, setInviteExpiry] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const mutation = useMutation({
    mutationFn: (data: InviteCreate) => createInvite(data),
    onSuccess: (invite) => {
      setInviteUrl(invite.invite_url ?? null)
      setInviteExpiry(invite.expires_at)
      void qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError: () => {
      toast({ title: 'Failed to create invitation', variant: 'destructive' })
    },
  })

  const handleGenerate = () => {
    mutation.mutate({ role, email_hint: emailHint || undefined, expires_hours: expiresHours })
  }

  const copyUrl = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Copy failed — select and copy manually', variant: 'destructive' })
    }
  }

  const handleClose = () => {
    setRole('member')
    setEmailHint('')
    setExpiresHours(72)
    setInviteUrl(null)
    setInviteExpiry(null)
    setCopied(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
        </DialogHeader>

        {!inviteUrl ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role</label>
              <select
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/50"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {INVITE_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Email hint <span className="text-gray-400">(optional, for your reference)</span>
              </label>
              <Input
                value={emailHint}
                onChange={(e) => setEmailHint(e.target.value)}
                placeholder="jane@example.com"
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Expires in</label>
              <select
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/50"
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
              >
                {INVITE_EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button type="button" onClick={handleGenerate} disabled={mutation.isPending}>
                {mutation.isPending ? 'Generating…' : 'Generate Invite'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
              Invite link created. Share it with the user — it can only be used once.
            </p>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Invite link:</p>
              <div className="flex gap-2">
                <Input
                  value={inviteUrl}
                  readOnly
                  className="font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 px-3"
                  onClick={() => void copyUrl()}
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            {inviteExpiry && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Expires {format(parseISO(inviteExpiry), 'MMM d, yyyy h:mm a')}
              </p>
            )}
            <DialogFooter>
              <Button type="button" onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Generate Reset Link Dialog ───────────────────────────────────────────────

function GenerateResetLinkDialog({
  target,
  onClose,
}: {
  target: UserRead
  onClose: () => void
}) {
  const [resetUrl, setResetUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => generateResetToken(target.id),
    onSuccess: (data) => setResetUrl(data.reset_url),
    onError: (err: unknown) => {
      const e = err as { detail?: { message?: string } | string }
      const detail = e?.detail
      if (detail && typeof detail === 'object' && detail.message) {
        setError(detail.message)
      } else {
        setError('Failed to generate reset link')
      }
    },
  })

  useEffect(() => { mutation.mutate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const copyUrl = async () => {
    if (!resetUrl) return
    await navigator.clipboard.writeText(resetUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Password Reset Link</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-3 mb-2">
        For <span className="font-medium text-gray-700 dark:text-gray-300">{target.first_name} {target.last_name}</span>
      </p>
      {mutation.isPending ? (
        <div className="py-6 text-center text-sm text-gray-400">Generating link…</div>
      ) : error ? (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
      ) : resetUrl ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Send this link to the user. It expires in 24 hours and can only be used once.
          </p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 dark:text-gray-300 break-all select-all">
            {resetUrl}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => { void copyUrl() }}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ─── Reset Password Dialog ────────────────────────────────────────────────────

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const { user: currentUser } = useAuth()
  const qc = useQueryClient()
  const [resetTarget, setResetTarget] = useState<UserRead | null>(null)
  const [linkTarget, setLinkTarget] = useState<UserRead | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [showAllInvites, setShowAllInvites] = useState(false)

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })

  const { data: invites = [], isLoading: invitesLoading } = useQuery({
    queryKey: ['invites'],
    queryFn: getInvites,
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

  const revokeMutation = useMutation({
    mutationFn: (token: string) => revokeInvite(token),
    onSuccess: () => {
      toast({ title: 'Invitation revoked' })
      void qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError: () => {
      toast({ title: 'Failed to revoke invitation', variant: 'destructive' })
    },
  })

  const activeInvites = invites.filter((inv) => inv.status === 'valid')
  const recentInvites = invites.filter(
    (inv) => inv.status !== 'valid' && new Date(inv.created_at).getTime() > THIRTY_DAYS_AGO,
  )
  const olderInvites = invites.filter(
    (inv) => inv.status !== 'valid' && new Date(inv.created_at).getTime() <= THIRTY_DAYS_AGO,
  )

  const copyInviteUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copied to clipboard' })
    } catch {
      toast({ title: 'Copy failed — select and copy manually', variant: 'destructive' })
    }
  }

  return (
    <AppShell>
      <TopBar
        title="Users"
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            Invite User
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* ── Users ── */}
        <section>
          {usersLoading ? (
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
                        <td className="px-4 py-3">{userStatusBadge(u.is_active)}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                          {u.last_login_at
                            ? format(parseISO(u.last_login_at), 'MMM d, yyyy')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
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
                              {USER_ROLE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>

                            <Button
                              size="sm"
                              variant="ghost"
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

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                              title="Generate reset link"
                              onClick={() => setLinkTarget(u)}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </Button>

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
        </section>

        {/* ── Active Invitations ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Active Invitations
            {activeInvites.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">({activeInvites.length})</span>
            )}
          </h2>
          {invitesLoading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : activeInvites.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-600 py-8 text-sm bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              No active invitations — use <span className="font-medium">Invite User</span> above to generate one.
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email Hint</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Expires</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {activeInvites.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {inv.email_hint ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">
                        {inv.role.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {format(parseISO(inv.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {format(parseISO(inv.expires_at), 'MMM d, yyyy')}
                        <span className="ml-1 text-xs text-gray-400">
                          ({differenceInDays(parseISO(inv.expires_at), new Date())}d left)
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {inv.invite_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 px-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                              onClick={() => void copyInviteUrl(inv.invite_url!)}
                            >
                              <Copy className="w-3.5 h-3.5 mr-1" />
                              Copy Link
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(inv.token)}
                          >
                            Revoke
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Invitation History ── */}
        {(recentInvites.length > 0 || olderInvites.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Invitation History
              </h2>
              {olderInvites.length > 0 && !showAllInvites && (
                <button
                  className="text-xs text-gold hover:underline"
                  onClick={() => setShowAllInvites(true)}
                >
                  Show {olderInvites.length} older invite{olderInvites.length !== 1 ? 's' : ''}
                </button>
              )}
              {showAllInvites && olderInvites.length > 0 && (
                <button
                  className="text-xs text-gold hover:underline"
                  onClick={() => setShowAllInvites(false)}
                >
                  Hide older
                </button>
              )}
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email Hint</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentInvites.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {inv.email_hint ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">
                        {inv.role.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {format(parseISO(inv.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">{inviteStatusBadge(inv.status)}</td>
                    </tr>
                  ))}
                  {showAllInvites && olderInvites.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors opacity-60">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {inv.email_hint ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">
                        {inv.role.replace('_', ' ')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {format(parseISO(inv.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">{inviteStatusBadge(inv.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <InviteUserModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <Dialog open={resetTarget !== null} onOpenChange={(open) => { if (!open) setResetTarget(null) }}>
        {resetTarget && (
          <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />
        )}
      </Dialog>

      <Dialog open={linkTarget !== null} onOpenChange={(open) => { if (!open) setLinkTarget(null) }}>
        {linkTarget && (
          <GenerateResetLinkDialog target={linkTarget} onClose={() => setLinkTarget(null)} />
        )}
      </Dialog>
    </AppShell>
  )
}
