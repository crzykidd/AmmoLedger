import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  StickyNote,
  Wrench,
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
import FirearmFormDrawer from '@/components/firearms/FirearmFormDrawer'
import DeleteFirearmDialog from '@/components/firearms/DeleteFirearmDialog'
import LogEventDialog from '@/components/firearms/LogEventDialog'
import { UserTagBadge } from '@/components/firearms/UserTagPicker'
import {
  deleteFirearmLog,
  getFirearm,
  listFirearmLog,
} from '@/api/firearms'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type {
  CleaningStatus,
  FirearmEventType,
  FirearmLogRead,
  FirearmRead,
  User,
} from '@/types'

type Tab = 'overview' | 'log' | 'sessions'

function canEdit(firearm: FirearmRead, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'member') return firearm.owner_id === user.id
  return false
}

function StatusPill({ status }: { status: CleaningStatus }) {
  const map: Record<CleaningStatus, { label: string; cls: string; Icon: React.ElementType }> = {
    ok: {
      label: 'Cleaning OK',
      cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      Icon: CheckCircle2,
    },
    due_soon: {
      label: 'Cleaning due soon',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      Icon: Clock,
    },
    overdue: {
      label: 'Cleaning overdue',
      cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      Icon: AlertTriangle,
    },
  }
  const { label, cls, Icon } = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', cls)}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}

function StatBlock({
  label,
  value,
  highlight,
  hint,
}: {
  label: string
  value: React.ReactNode
  highlight?: 'amber' | 'red' | null
  hint?: string
}) {
  const highlightCls =
    highlight === 'red'
      ? 'border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10'
      : highlight === 'amber'
        ? 'border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10'
        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
  return (
    <div className={cn('rounded-lg border p-4', highlightCls)}>
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 dark:text-white mt-0.5">{value || '—'}</p>
    </div>
  )
}

function eventIcon(type: FirearmEventType): React.ElementType {
  switch (type) {
    case 'cleaning':
      return Sparkles
    case 'service':
      return Wrench
    case 'note':
      return StickyNote
  }
}

function eventLabel(type: FirearmEventType): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

interface LogRowProps {
  log: FirearmLogRead
  canModify: boolean
  onEdit: () => void
  onDelete: () => void
}

function LogRow({ log, canModify, onEdit, onDelete }: LogRowProps) {
  const Icon = eventIcon(log.event_type)
  const eventDate = parseISO(log.event_date)
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-start gap-3">
      <div
        className={cn(
          'shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
          log.event_type === 'cleaning' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
          log.event_type === 'service' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
          log.event_type === 'note' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-semibold text-sm text-gray-900 dark:text-white">
            {eventLabel(log.event_type)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {format(eventDate, 'MMM d, yyyy')} ·{' '}
            <span title={format(eventDate, 'MMM d, yyyy')}>
              {formatDistanceToNow(eventDate, { addSuffix: true })}
            </span>
          </p>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {log.rounds_at_event.toLocaleString()} rounds at event · logged by {log.logged_by_name}
        </p>
        {log.notes && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap">
            {log.notes}
          </p>
        )}
      </div>
      {canModify && (
        <div className="flex flex-col gap-1 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 p-0"
            onClick={onEdit}
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-500"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

export default function FirearmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const firearmId = id ? parseInt(id) : NaN
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [tab, setTab] = useState<Tab>('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [editLog, setEditLog] = useState<FirearmLogRead | null>(null)
  const [deleteLog, setDeleteLog] = useState<FirearmLogRead | null>(null)

  const {
    data: firearm,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['firearm', firearmId],
    queryFn: () => getFirearm(firearmId),
    enabled: !isNaN(firearmId),
    retry: false,
  })

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['firearm-log', firearmId],
    queryFn: () => listFirearmLog(firearmId),
    enabled: !isNaN(firearmId) && firearm != null,
  })

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      // event_date desc, then created_at desc
      const da = a.event_date.localeCompare(b.event_date)
      if (da !== 0) return -da
      return b.created_at.localeCompare(a.created_at)
    })
  }, [logs])

  const deleteLogMutation = useMutation({
    mutationFn: (logId: number) => deleteFirearmLog(firearmId, logId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['firearm', firearmId] })
      void queryClient.invalidateQueries({ queryKey: ['firearm-log', firearmId] })
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      toast({ title: 'Log entry deleted' })
      setDeleteLog(null)
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Delete failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  if (isNaN(firearmId)) {
    return (
      <AppShell>
        <TopBar title="Firearm Not Found" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-gray-600 dark:text-gray-400">Invalid firearm ID.</p>
          <Button onClick={() => navigate('/firearms')}>Back to Firearms</Button>
        </div>
      </AppShell>
    )
  }

  if (isError) {
    const detail = (error as { detail?: string })?.detail ?? 'Could not load firearm.'
    return (
      <AppShell>
        <TopBar title="Firearm Not Found" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="font-medium text-gray-700 dark:text-gray-300">
            Firearm not found or you don&apos;t have access.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{detail}</p>
          <Button onClick={() => navigate('/firearms')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Firearms
          </Button>
        </div>
      </AppShell>
    )
  }

  if (isLoading || !firearm) {
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

  const editable = canEdit(firearm, user ?? null)
  const heroTitle = `${firearm.manufacturer_name ?? ''} ${firearm.display_model}`.trim()
  const lastCleaned = firearm.last_cleaned_at ? parseISO(firearm.last_cleaned_at) : null
  const isCleaningHighlighted = firearm.cleaning_status !== 'ok'
  const cleaningHighlight: 'amber' | 'red' | null =
    firearm.cleaning_status === 'overdue'
      ? 'red'
      : firearm.cleaning_status === 'due_soon'
        ? 'amber'
        : null

  const TabButton = ({ value, label, count }: { value: Tab; label: string; count?: number }) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={cn(
        'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
        tab === value
          ? 'border-gold text-gold'
          : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
      )}
    >
      {label}
      {count != null && (
        <span
          className={cn(
            'ml-2 px-1.5 py-0.5 text-xs rounded-full',
            tab === value
              ? 'bg-gold/20 text-gold'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )

  return (
    <AppShell>
      <TopBar
        title={heroTitle || 'Firearm'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/firearms')}>
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
              <div className="mt-2 flex flex-wrap gap-1.5">
                {firearm.caliber_name && (
                  <span className="inline-flex items-center rounded-full bg-gold/15 text-gold px-2.5 py-0.5 text-xs font-medium">
                    {firearm.caliber_name}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2.5 py-0.5 text-xs font-medium capitalize">
                  {firearm.firearm_type}
                </span>
                {firearm.action_type_name && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2.5 py-0.5 text-xs font-medium">
                    {firearm.action_type_name}
                  </span>
                )}
                {firearm.is_shared && (
                  <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs font-medium">
                    Shared
                  </span>
                )}
              </div>
            </div>
            <StatusPill status={firearm.cleaning_status} />
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-800 px-6 bg-white dark:bg-gray-900">
          <div className="flex">
            <TabButton value="overview" label="Overview" />
            <TabButton value="log" label="Log" count={logs.length} />
            <TabButton value="sessions" label="Sessions" />
          </div>
        </div>

        <div className="p-6">
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatBlock
                  label="Lifetime rounds"
                  value={firearm.rounds_lifetime.toLocaleString()}
                />
                <StatBlock
                  label="Rounds since clean"
                  value={firearm.rounds_since_clean.toLocaleString()}
                  highlight={cleaningHighlight}
                />
                <StatBlock
                  label="Last cleaned"
                  value={lastCleaned ? format(lastCleaned, 'MMM d, yyyy') : 'Never'}
                  hint={
                    lastCleaned
                      ? formatDistanceToNow(lastCleaned, { addSuffix: true })
                      : undefined
                  }
                  highlight={cleaningHighlight}
                />
                <StatBlock
                  label="Cleaning status"
                  value={
                    isCleaningHighlighted
                      ? firearm.cleaning_status === 'overdue'
                        ? 'Overdue'
                        : 'Due soon'
                      : 'OK'
                  }
                  highlight={cleaningHighlight}
                />
              </div>

              {/* Two-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                <DetailRow label="Serial" value={firearm.serial} />
                <DetailRow
                  label="Barrel length"
                  value={
                    firearm.barrel_length_in != null ? `${firearm.barrel_length_in}"` : null
                  }
                />
                <DetailRow label="Finish" value={firearm.finish} />
                <DetailRow label="Caliber notes" value={firearm.caliber_notes} />
                <DetailRow
                  label="Purchase date"
                  value={
                    firearm.purchase_date
                      ? format(parseISO(firearm.purchase_date), 'MMM d, yyyy')
                      : null
                  }
                />
                <DetailRow
                  label="Purchase price"
                  value={
                    firearm.purchase_price != null
                      ? `$${firearm.purchase_price.toFixed(2)}`
                      : null
                  }
                />
                <DetailRow label="Dealer" value={firearm.dealer_name} />
                <DetailRow
                  label="Service interval (rounds)"
                  value={
                    firearm.service_interval_rounds != null
                      ? `${firearm.service_interval_rounds.toLocaleString()} rounds`
                      : null
                  }
                />
                <DetailRow
                  label="Service interval (days)"
                  value={
                    firearm.service_interval_days != null
                      ? `${firearm.service_interval_days} days`
                      : null
                  }
                />
              </div>

              {/* Compliance tags */}
              {firearm.compliance_tags.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                    Compliance Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {firearm.compliance_tags.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2.5 py-0.5 text-xs font-medium"
                        title={t.description ?? undefined}
                      >
                        {t.jurisdiction && t.source !== 'user' && (
                          <span className="text-gray-400 dark:text-gray-500">
                            {t.jurisdiction}:
                          </span>
                        )}
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Personal tags */}
              {firearm.user_tags.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                    Personal Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {firearm.user_tags.map((t) => (
                      <UserTagBadge key={t.id} tag={t} />
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {firearm.notes && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Notes
                  </p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {firearm.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === 'log' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {logs.length === 0
                    ? 'No log entries yet.'
                    : `${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}, newest first`}
                </p>
                {editable && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditLog(null)
                      setLogDialogOpen(true)
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Log Event
                  </Button>
                )}
              </div>

              {logsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : sortedLogs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No cleaning, service, or note entries yet.
                  </p>
                  {editable && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setEditLog(null)
                        setLogDialogOpen(true)
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Log First Event
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedLogs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      canModify={editable}
                      onEdit={() => {
                        setEditLog(log)
                        setLogDialogOpen(true)
                      }}
                      onDelete={() => setDeleteLog(log)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'sessions' && (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                Range session history
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Range session history will appear here once you log range sessions involving
                this firearm.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit firearm drawer */}
      <FirearmFormDrawer
        open={editOpen}
        onOpenChange={setEditOpen}
        editFirearm={firearm}
      />

      {/* Delete firearm */}
      <DeleteFirearmDialog
        firearm={firearm}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate('/firearms')}
      />

      {/* Log dialog */}
      <LogEventDialog
        open={logDialogOpen}
        onOpenChange={(o) => {
          setLogDialogOpen(o)
          if (!o) setEditLog(null)
        }}
        firearm={firearm}
        editLog={editLog}
      />

      {/* Delete log confirm */}
      <AlertDialog open={deleteLog != null} onOpenChange={(o) => { if (!o) setDeleteLog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete log entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteLog?.event_type === 'cleaning'
                ? 'This will recompute the firearm’s last-cleaned date and rounds-since-clean from the remaining log entries.'
                : 'This entry will be permanently removed from the firearm log.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLogMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (deleteLog) deleteLogMutation.mutate(deleteLog.id)
              }}
              disabled={deleteLogMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLogMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
