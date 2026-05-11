import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  Crosshair,
  MapPin,
  Package,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import LogRangeDayDialog from '@/components/range/LogRangeDayDialog'
import { deleteRangeSession, getRangeSession } from '@/api/rangeSessions'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { RangeSessionLineRead, RangeSessionRead, User } from '@/types'

type DetailMode = 'flat' | 'by_firearm' | 'by_box'
const DETAIL_MODE_KEY = 'range_day_detail_mode'

function loadDetailMode(): DetailMode {
  if (typeof window === 'undefined') return 'flat'
  const raw = window.localStorage.getItem(DETAIL_MODE_KEY)
  return raw === 'by_firearm' || raw === 'by_box' ? raw : 'flat'
}

function canModify(session: RangeSessionRead, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'member') return !session.is_shared && session.owner_id === user.id
  return false
}

export default function RangeSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const sessionId = id ? parseInt(id) : NaN
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [viewMode, setViewMode] = useState<DetailMode>(() => loadDetailMode())
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DETAIL_MODE_KEY, viewMode)
    }
  }, [viewMode])

  const {
    data: session,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['range-session', sessionId],
    queryFn: () => getRangeSession(sessionId),
    enabled: !isNaN(sessionId),
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRangeSession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['range-sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      toast({ title: 'Range session deleted' })
      navigate('/range')
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Delete failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  // Grouped view of the session lines for By Firearm / By Box modes.
  const groupedLines = useMemo(() => {
    if (!session || viewMode === 'flat') return null
    type Group = {
      key: string
      title: string
      to: string | null
      total: number
      lines: RangeSessionLineRead[]
    }
    const groups = new Map<string, Group>()
    for (const ln of session.lines) {
      const id = viewMode === 'by_firearm' ? ln.firearm_id : ln.ammo_box_id
      const display = viewMode === 'by_firearm' ? ln.firearm_display : ln.ammo_box_display
      const fallback = viewMode === 'by_firearm'
        ? id != null ? `Firearm #${id}` : 'Unassigned (no firearm)'
        : id != null ? `Box #${id}` : 'Unassigned (no box)'
      const to = id != null
        ? viewMode === 'by_firearm'
          ? `/firearms/${id}`
          : `/ammo?statusFilter=&emptyFilter=`
        : null
      const key = `${viewMode}:${id == null ? 'null' : id}`
      const existing = groups.get(key)
      if (existing) {
        existing.total += ln.rounds_fired
        existing.lines.push(ln)
      } else {
        groups.set(key, {
          key,
          title: display ?? fallback,
          to,
          total: ln.rounds_fired,
          lines: [ln],
        })
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.total - a.total)
  }, [session, viewMode])

  // Reversal preview computed from session lines
  const reversalPreview = useMemo(() => {
    if (!session) return { boxes: [], firearms: [] }
    const boxAgg = new Map<number, { display: string | null; rounds: number }>()
    const firearmAgg = new Map<number, { display: string | null; rounds: number }>()
    for (const ln of session.lines) {
      if (ln.ammo_box_id != null && ln.rounds_fired > 0) {
        const cur = boxAgg.get(ln.ammo_box_id) ?? { display: ln.ammo_box_display, rounds: 0 }
        boxAgg.set(ln.ammo_box_id, {
          display: ln.ammo_box_display,
          rounds: cur.rounds + ln.rounds_fired,
        })
      }
      if (ln.firearm_id != null && ln.rounds_fired > 0) {
        const cur = firearmAgg.get(ln.firearm_id) ?? { display: ln.firearm_display, rounds: 0 }
        firearmAgg.set(ln.firearm_id, {
          display: ln.firearm_display,
          rounds: cur.rounds + ln.rounds_fired,
        })
      }
    }
    return {
      boxes: Array.from(boxAgg.entries()).map(([id, v]) => ({ id, ...v })),
      firearms: Array.from(firearmAgg.entries()).map(([id, v]) => ({ id, ...v })),
    }
  }, [session])

  if (isNaN(sessionId)) {
    return (
      <AppShell>
        <TopBar title="Session Not Found" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-gray-600 dark:text-gray-400">Invalid session ID.</p>
          <Button onClick={() => navigate('/range')}>Back to Range</Button>
        </div>
      </AppShell>
    )
  }

  if (isError) {
    const detail = (error as { detail?: string })?.detail ?? 'Could not load session.'
    return (
      <AppShell>
        <TopBar title="Session Not Found" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="font-medium text-gray-700 dark:text-gray-300">
            Session not found or you don&apos;t have access.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{detail}</p>
          <Button onClick={() => navigate('/range')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Range
          </Button>
        </div>
      </AppShell>
    )
  }

  if (isLoading || !session) {
    return (
      <AppShell>
        <TopBar title="Loading…" />
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    )
  }

  const editable = canModify(session, user ?? null)
  const dateObj = parseISO(session.date)
  const heroTitle = `Range Day — ${format(dateObj, 'EEE, MMM d, yyyy')}`
  const isOwn = user != null && session.owner_id === user.id

  return (
    <AppShell>
      <TopBar
        title={heroTitle}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/range')}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            {editable && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="hover:bg-red-500/10 hover:text-red-500"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        {/* Hero */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{heroTitle}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                {session.location_name && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {session.location_name}
                  </span>
                )}
                {session.is_shared && !isOwn && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">
                    <Users className="w-3 h-3" />
                    Shared session by {session.owner_name}
                  </span>
                )}
                {session.is_shared && isOwn && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">
                    <Users className="w-3 h-3" />
                    Shared
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBlock
              label="Total Rounds"
              value={session.total_rounds.toLocaleString()}
              icon={<Crosshair className="w-4 h-4 text-gold" />}
            />
            <StatBlock label="Distinct Firearms" value={String(session.distinct_firearms)} />
            <StatBlock label="Distinct Boxes" value={String(session.distinct_boxes)} />
            <StatBlock label="Lines" value={String(session.lines.length)} />
          </div>

          {/* Session notes */}
          {session.notes && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Session Notes
              </p>
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {session.notes}
              </p>
            </div>
          )}

          {/* Lines header + view toggle */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Lines ({session.lines.length})
            </h3>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium transition-colors',
                  viewMode === 'flat'
                    ? 'bg-gold/20 text-gold'
                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
                )}
                title="Flat table of every line"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by_firearm')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1 border-l border-gray-200 dark:border-gray-700',
                  viewMode === 'by_firearm'
                    ? 'bg-gold/20 text-gold'
                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
                )}
                title="Group by firearm"
              >
                <Crosshair className="w-3 h-3" />
                By Firearm
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by_box')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1 border-l border-gray-200 dark:border-gray-700',
                  viewMode === 'by_box'
                    ? 'bg-gold/20 text-gold'
                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
                )}
                title="Group by ammo box"
              >
                <Package className="w-3 h-3" />
                By Box
              </button>
            </div>
          </div>

          {/* Grouped view */}
          {groupedLines && (
            <div className="space-y-3">
              {groupedLines.map((g) => (
                <div
                  key={g.key}
                  className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                    <div className="flex items-center gap-2 min-w-0">
                      {viewMode === 'by_firearm' ? (
                        <Crosshair className="w-4 h-4 text-gold shrink-0" />
                      ) : (
                        <Package className="w-4 h-4 text-gold shrink-0" />
                      )}
                      {g.to ? (
                        <Link to={g.to} className="text-gold hover:underline font-semibold truncate">
                          {g.title}
                        </Link>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 italic truncate">{g.title}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white shrink-0 tabular-nums">
                      {g.total.toLocaleString()} rds
                    </p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                        <th className="text-left px-4 py-2 font-medium">
                          {viewMode === 'by_firearm' ? 'Ammo Box' : 'Firearm'}
                        </th>
                        <th className="text-right px-4 py-2 font-medium">Rounds</th>
                        <th className="text-left px-4 py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map((ln, i) => {
                        const counterpartId = viewMode === 'by_firearm' ? ln.ammo_box_id : ln.firearm_id
                        const counterpartDisplay = viewMode === 'by_firearm' ? ln.ammo_box_display : ln.firearm_display
                        const counterpartTo = counterpartId != null
                          ? viewMode === 'by_firearm'
                            ? '/ammo?statusFilter=&emptyFilter='
                            : `/firearms/${counterpartId}`
                          : null
                        const fallback = viewMode === 'by_firearm'
                          ? counterpartId != null ? `Box #${counterpartId}` : '—'
                          : counterpartId != null ? `Firearm #${counterpartId}` : '—'
                        return (
                          <tr
                            key={ln.id}
                            className={cn(
                              'border-b border-gray-100 dark:border-gray-800 last:border-0',
                              i % 2 === 0 ? '' : 'bg-gray-50/40 dark:bg-gray-800/20',
                            )}
                          >
                            <td className="px-4 py-2">
                              {counterpartTo ? (
                                <Link to={counterpartTo} className="text-gold hover:underline">
                                  {counterpartDisplay ?? fallback}
                                </Link>
                              ) : (
                                <span className="text-gray-400">{fallback}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white tabular-nums">
                              {ln.rounds_fired.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300 max-w-md">
                              {ln.notes ? (
                                <span className="whitespace-pre-wrap">{ln.notes}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* Flat view (original layout) */}
          {!groupedLines && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Firearm
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Ammo Box
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Rounds
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.lines.map((ln, i) => (
                  <tr
                    key={ln.id}
                    className={cn(
                      'border-b border-gray-100 dark:border-gray-800 last:border-0',
                      i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/20',
                    )}
                  >
                    <td className="px-4 py-3">
                      {ln.firearm_id != null ? (
                        <Link
                          to={`/firearms/${ln.firearm_id}`}
                          className="text-gold hover:underline font-medium"
                        >
                          {ln.firearm_display ?? `Firearm #${ln.firearm_id}`}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ln.ammo_box_id != null ? (
                        <Link
                          to={`/ammo?statusFilter=&emptyFilter=`}
                          className="text-gold hover:underline font-medium"
                          title="Open Ammo (deep-link to single box not yet supported — see Ammo page)"
                        >
                          {ln.ammo_box_display ?? `Box #${ln.ammo_box_id}`}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white tabular-nums">
                      {ln.rounds_fired.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-md">
                      {ln.notes ? (
                        <span className="whitespace-pre-wrap">{ln.notes}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {session.lines.map((ln) => (
                <div key={ln.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-semibold text-gray-900 dark:text-white">
                      {ln.rounds_fired.toLocaleString()} rounds
                    </p>
                  </div>
                  {ln.firearm_id != null && (
                    <p className="text-sm">
                      <Link
                        to={`/firearms/${ln.firearm_id}`}
                        className="text-gold hover:underline"
                      >
                        {ln.firearm_display ?? `Firearm #${ln.firearm_id}`}
                      </Link>
                    </p>
                  )}
                  {ln.ammo_box_id != null && (
                    <p className="text-sm">
                      <Link
                        to={`/ammo?statusFilter=&emptyFilter=`}
                        className="text-gold hover:underline"
                      >
                        {ln.ammo_box_display ?? `Box #${ln.ammo_box_id}`}
                      </Link>
                    </p>
                  )}
                  {ln.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {ln.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
            These rounds were also recorded as expenditures on each ammo box&apos;s history.
            Editing or deleting this session will reverse those expenditures.
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <LogRangeDayDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editSession={session}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this range session?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will permanently delete the session and all its lines.</p>

                {reversalPreview.boxes.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Ammo box quantities will be restored:
                    </p>
                    <ul className="mt-1 ml-4 list-disc text-sm text-gray-600 dark:text-gray-400 space-y-0.5">
                      {reversalPreview.boxes.map((b) => (
                        <li key={b.id}>
                          {b.display ?? `Box #${b.id}`}{' '}
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            (+{b.rounds.toLocaleString()})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reversalPreview.firearms.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Firearm round counts will be decremented:
                    </p>
                    <ul className="mt-1 ml-4 list-disc text-sm text-gray-600 dark:text-gray-400 space-y-0.5">
                      {reversalPreview.firearms.map((f) => (
                        <li key={f.id}>
                          {f.display ?? `Firearm #${f.id}`}{' '}
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            (-{f.rounds.toLocaleString()})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-sm">This cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Session'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

function StatBlock({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1 flex items-center gap-1.5">
        {icon}
        {value}
      </p>
    </div>
  )
}
