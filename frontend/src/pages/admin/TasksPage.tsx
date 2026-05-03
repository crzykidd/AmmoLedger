import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Circle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getTasks, getTaskHistory, runTask, updateTask } from '@/api/tasks'
import type { TaskHistory, TaskRegistry } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatInterval(task: TaskRegistry): string {
  if (task.interval_type === 'hours') {
    const h = parseInt(task.interval_value, 10)
    return `Every ${h} hour${h !== 1 ? 's' : ''}`
  }
  if (task.interval_type === 'daily') {
    const [hh, mm] = task.interval_value.split(':').map(Number)
    const ampm = hh < 12 ? 'AM' : 'PM'
    const h12 = hh % 12 === 0 ? 12 : hh % 12
    return `Daily at ${h12}:${String(mm).padStart(2, '0')} ${ampm}`
  }
  return task.interval_value
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatRelative(isoStr: string | null, future = false): string {
  if (!isoStr) return future ? '—' : 'Never'
  const date = new Date(isoStr)
  const now = Date.now()
  const diff = date.getTime() - now
  const absDiff = Math.abs(diff)
  const sign = diff > 0 ? 'in ' : ''
  const suffix = diff < 0 ? ' ago' : ''

  if (absDiff < 60_000) return diff > 0 ? 'in a moment' : 'just now'
  if (absDiff < 3_600_000) {
    const m = Math.round(absDiff / 60_000)
    return `${sign}${m} minute${m !== 1 ? 's' : ''}${suffix}`
  }
  if (absDiff < 86_400_000) {
    const h = Math.round(absDiff / 3_600_000)
    return `${sign}${h} hour${h !== 1 ? 's' : ''}${suffix}`
  }
  const d = Math.round(absDiff / 86_400_000)
  return `${sign}${d} day${d !== 1 ? 's' : ''}${suffix}`
}

function formatDateTime(isoStr: string | null): string {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="flex items-center gap-1 text-white/30 text-xs">
        <Circle className="w-3.5 h-3.5" />
        Never run
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1 text-amber-400 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Running
      </span>
    )
  }
  if (status === 'ok') {
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <CheckCircle2 className="w-3.5 h-3.5" />
        OK
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-red-400 text-xs">
      <XCircle className="w-3.5 h-3.5" />
      Failed
    </span>
  )
}

function HistoryStatusIcon({ status }: { status: string }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
  if (status === 'running') return <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({
  task,
  onRun,
  onToggle,
  isRunning,
}: {
  task: TaskRegistry
  onRun: (key: string) => void
  onToggle: (key: string, enabled: boolean) => void
  isRunning: boolean
}) {
  return (
    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
      <td className="py-3 px-4">
        <p className="text-white text-sm font-medium">{task.name}</p>
        {task.description && (
          <p className="text-white/40 text-xs mt-0.5">{task.description}</p>
        )}
      </td>
      <td className="py-3 px-4 text-white/60 text-sm whitespace-nowrap">
        {formatInterval(task)}
      </td>
      <td className="py-3 px-4 text-white/60 text-sm whitespace-nowrap">
        {task.last_run_at ? formatRelative(task.last_run_at) : 'Never'}
      </td>
      <td className="py-3 px-4 text-white/60 text-sm whitespace-nowrap font-mono">
        {formatDuration(task.last_duration_ms)}
      </td>
      <td className="py-3 px-4">
        <StatusBadge status={task.last_status} />
      </td>
      <td className="py-3 px-4 text-white/60 text-sm whitespace-nowrap">
        {task.next_run_at ? formatRelative(task.next_run_at, true) : '—'}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs border-white/15 hover:border-gold/50 hover:text-gold"
            onClick={() => onRun(task.task_key)}
            disabled={isRunning || task.last_status === 'running'}
          >
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run Now
          </Button>
          <Switch
            checked={task.enabled}
            onCheckedChange={(checked) => onToggle(task.task_key, checked)}
            className="scale-90"
          />
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// History row
// ---------------------------------------------------------------------------

function HistoryRow({ entry }: { entry: TaskHistory }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = !!entry.error_message || !!entry.details

  return (
    <>
      <tr
        className={cn(
          'border-b border-white/5 transition-colors',
          hasDetail && 'cursor-pointer hover:bg-white/3',
        )}
        onClick={() => hasDetail && setExpanded((p) => !p)}
      >
        <td className="py-2.5 px-4">
          <HistoryStatusIcon status={entry.status} />
        </td>
        <td className="py-2.5 px-4 text-white/80 text-sm">{entry.task_name}</td>
        <td className="py-2.5 px-4 text-white/50 text-xs whitespace-nowrap">
          {formatDateTime(entry.started_at)}
        </td>
        <td className="py-2.5 px-4 text-white/50 text-xs whitespace-nowrap">
          {entry.ended_at ? formatDateTime(entry.ended_at) : '—'}
        </td>
        <td className="py-2.5 px-4 text-white/50 text-xs font-mono whitespace-nowrap">
          {formatDuration(entry.duration_ms)}
        </td>
        <td className="py-2.5 px-4">
          <span
            className={cn(
              'inline-block text-xs px-2 py-0.5 rounded-full',
              entry.triggered_by === 'manual'
                ? 'bg-gold/20 text-gold'
                : 'bg-white/10 text-white/50',
            )}
          >
            {entry.triggered_by}
          </span>
        </td>
        <td className="py-2.5 px-4 text-white/40 text-xs max-w-[200px] truncate">
          {entry.details ? (() => {
            try {
              const parsed = JSON.parse(entry.details)
              return Object.entries(parsed)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ')
            } catch {
              return entry.details
            }
          })() : '—'}
        </td>
        <td className="py-2.5 px-4 text-white/30">
          {hasDetail && (
            expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
          )}
        </td>
      </tr>
      {expanded && (entry.error_message || entry.details) && (
        <tr className="border-b border-white/5 bg-white/2">
          <td colSpan={8} className="px-4 pb-3 pt-1">
            {entry.error_message && (
              <pre className="text-red-400 text-xs bg-red-500/10 rounded p-2 whitespace-pre-wrap break-all">
                {entry.error_message}
              </pre>
            )}
            {entry.details && !entry.error_message && (
              <pre className="text-white/50 text-xs bg-white/5 rounded p-2 whitespace-pre-wrap break-all">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(entry.details), null, 2)
                  } catch {
                    return entry.details
                  }
                })()}
              </pre>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const qc = useQueryClient()
  const [runningKeys, setRunningKeys] = useState<Set<string>>(new Set())
  const [historyFilter, setHistoryFilter] = useState<string>('all')

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: getTasks,
    refetchInterval: 15_000,
  })

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['task-history', historyFilter],
    queryFn: () => getTaskHistory(historyFilter === 'all' ? undefined : historyFilter),
    refetchInterval: 10_000,
  })

  const runMutation = useMutation({
    mutationFn: (key: string) => runTask(key),
    onMutate: (key) => setRunningKeys((s) => new Set(s).add(key)),
    onSuccess: (result, key) => {
      setRunningKeys((s) => {
        const n = new Set(s)
        n.delete(key)
        return n
      })
      toast({
        title: result.status === 'ok' ? 'Task completed' : 'Task failed',
        description: result.status === 'ok'
          ? `${key} finished in ${formatDuration(result.duration_ms)}`
          : result.error_message ?? 'Check history for details',
        variant: result.status === 'ok' ? 'default' : 'destructive',
      })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['task-history'] })
    },
    onError: (err: { detail?: string }, key) => {
      setRunningKeys((s) => {
        const n = new Set(s)
        n.delete(key)
        return n
      })
      toast({
        title: 'Failed to run task',
        description: err?.detail ?? 'Unknown error',
        variant: 'destructive',
      })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      updateTask(key, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err: { detail?: string }) => {
      toast({
        title: 'Failed to update task',
        description: err?.detail ?? 'Unknown error',
        variant: 'destructive',
      })
    },
  })

  const handleRun = (key: string) => runMutation.mutate(key)
  const handleToggle = (key: string, enabled: boolean) =>
    toggleMutation.mutate({ key, enabled })

  return (
    <AppShell>
      <TopBar title="Scheduled Tasks" />
      <main className="flex-1 overflow-auto p-6 space-y-8">

        {/* Task Registry */}
        <section>
          <h2 className="text-white font-semibold text-base mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            Task Registry
          </h2>
          <div className="bg-navy-light border border-white/10 rounded-xl overflow-hidden">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-12 text-white/40">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-12 text-center text-white/30 text-sm">
                No tasks registered
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                      <th className="py-3 px-4 font-medium">Task</th>
                      <th className="py-3 px-4 font-medium">Interval</th>
                      <th className="py-3 px-4 font-medium">Last Run</th>
                      <th className="py-3 px-4 font-medium">Duration</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium">Next Run</th>
                      <th className="py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <TaskRow
                        key={task.task_key}
                        task={task}
                        onRun={handleRun}
                        onToggle={handleToggle}
                        isRunning={runningKeys.has(task.task_key)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Recent History */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-base">Recent History</h2>
            <Select value={historyFilter} onValueChange={setHistoryFilter}>
              <SelectTrigger className="w-44 h-8 text-xs border-white/15 bg-transparent text-white/70">
                <SelectValue placeholder="All Tasks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks</SelectItem>
                {tasks.map((t) => (
                  <SelectItem key={t.task_key} value={t.task_key}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-navy-light border border-white/10 rounded-xl overflow-hidden">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12 text-white/40">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : history.length === 0 ? (
              <div className="py-12 text-center text-white/30 text-sm">
                No history yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                      <th className="py-3 px-4 font-medium w-10" />
                      <th className="py-3 px-4 font-medium">Task</th>
                      <th className="py-3 px-4 font-medium">Started</th>
                      <th className="py-3 px-4 font-medium">Ended</th>
                      <th className="py-3 px-4 font-medium">Duration</th>
                      <th className="py-3 px-4 font-medium">Triggered By</th>
                      <th className="py-3 px-4 font-medium">Details</th>
                      <th className="py-3 px-4 font-medium w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <HistoryRow key={entry.id} entry={entry} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      </main>
    </AppShell>
  )
}
