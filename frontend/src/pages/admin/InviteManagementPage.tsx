import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, differenceInDays } from 'date-fns'
import { Copy, Check } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createInvite, getInvites, revokeInvite } from '@/api/invites'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { InviteCreate, InviteRead } from '@/types'

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'read_only', label: 'Read Only' },
  { value: 'admin', label: 'Admin' },
]

const EXPIRY_OPTIONS = [
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '72 hours (default)' },
  { value: 168, label: '7 days' },
]

function statusBadge(status: InviteRead['status']) {
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

const THIRTY_DAYS_AGO = Date.now() - 30 * 24 * 60 * 60 * 1000

export default function InviteManagementPage() {
  const qc = useQueryClient()
  const [role, setRole] = useState('member')
  const [emailHint, setEmailHint] = useState('')
  const [expiresHours, setExpiresHours] = useState(72)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['invites'],
    queryFn: getInvites,
  })

  const createMutation = useMutation({
    mutationFn: (data: InviteCreate) => createInvite(data),
    onSuccess: (invite) => {
      setGeneratedUrl(invite.invite_url ?? null)
      void qc.invalidateQueries({ queryKey: ['invites'] })
    },
    onError: () => {
      toast({ title: 'Failed to create invitation', variant: 'destructive' })
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Copy failed — select and copy manually', variant: 'destructive' })
    }
  }

  const handleGenerate = () => {
    setGeneratedUrl(null)
    createMutation.mutate({
      role,
      email_hint: emailHint || undefined,
      expires_hours: expiresHours,
    })
  }

  const visibleInvites = showAll
    ? invites
    : invites.filter((inv) => {
        if (inv.status === 'valid') return true
        return new Date(inv.created_at).getTime() > THIRTY_DAYS_AGO
      })

  const hiddenCount = invites.length - visibleInvites.length

  return (
    <AppShell>
      <TopBar title="Invitations" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Create form */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-4">
            Generate Invitation
          </h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role</label>
              <select
                className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/50"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Email hint (for your reference)
              </label>
              <Input
                value={emailHint}
                onChange={(e) => setEmailHint(e.target.value)}
                placeholder="jane@example.com (optional)"
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Expires in</label>
              <select
                className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/50"
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleGenerate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Generating…' : 'Generate Invite'}
            </Button>
          </div>

          {generatedUrl && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Invite link (share this):</p>
              <div className="flex gap-2">
                <Input
                  value={generatedUrl}
                  readOnly
                  className="font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-3"
                  onClick={() => void copyToClipboard(generatedUrl)}
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Invites table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {isLoading ? 'Loading…' : `${visibleInvites.length} invitation${visibleInvites.length !== 1 ? 's' : ''}`}
            </h2>
            {hiddenCount > 0 && (
              <button
                className="text-xs text-gold hover:underline"
                onClick={() => setShowAll(true)}
              >
                Show {hiddenCount} older invite{hiddenCount !== 1 ? 's' : ''}
              </button>
            )}
            {showAll && invites.length > visibleInvites.length && (
              <button
                className="text-xs text-gold hover:underline"
                onClick={() => setShowAll(false)}
              >
                Hide older
              </button>
            )}
          </div>

          {!isLoading && visibleInvites.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-600 py-12 text-sm">
              No invitations yet — generate one above.
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {visibleInvites.map((inv) => (
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
                        {inv.status === 'valid' && (
                          <span className="ml-1 text-xs text-gray-400">
                            ({differenceInDays(parseISO(inv.expires_at), new Date())}d left)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                      <td className="px-4 py-3 text-right">
                        {inv.status === 'valid' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(inv.token)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
