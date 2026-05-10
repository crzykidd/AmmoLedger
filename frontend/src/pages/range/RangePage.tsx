import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import {
  CalendarIcon,
  Crosshair,
  Download,
  MapPin,
  Plus,
  Target,
  Users,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import LogRangeDayDialog from '@/components/range/LogRangeDayDialog'
import { listFirearms } from '@/api/firearms'
import {
  listRangeSessions,
  getRangeSession,
  exportRangeSessionsCsvUrl,
} from '@/api/rangeSessions'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type { RangeSessionListItem } from '@/types'

type SortDir = 'newest' | 'oldest'
const PAGE_SIZE = 50
const NONE = '__none__'

const inputCls =
  'flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent'

export default function RangePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canLog = user?.role !== 'read_only'

  const [logOpen, setLogOpen] = useState(false)
  const [firearmFilter, setFirearmFilter] = useState<string>('')
  const [afterDate, setAfterDate] = useState<string>('')
  const [beforeDate, setBeforeDate] = useState<string>('')
  const [sortDir, setSortDir] = useState<SortDir>('newest')
  const [pageLimit, setPageLimit] = useState<number>(PAGE_SIZE)

  // Reset pagination if filters change
  useEffect(() => {
    setPageLimit(PAGE_SIZE)
  }, [firearmFilter, afterDate, beforeDate, sortDir])

  const filterFirearmId =
    firearmFilter && firearmFilter !== NONE ? parseInt(firearmFilter) : undefined

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['range-sessions', { firearmId: filterFirearmId, afterDate, beforeDate, pageLimit }],
    queryFn: () =>
      listRangeSessions({
        firearm_id: filterFirearmId,
        after: afterDate || undefined,
        before: beforeDate || undefined,
        limit: pageLimit,
      }),
  })

  // Load lifetime + 90-day stats from a separate, larger fetch (no filters)
  // so the stats bar always reflects the user's full activity, not the
  // currently-filtered view.
  const { data: statsSessions = [] } = useQuery({
    queryKey: ['range-sessions-stats'],
    queryFn: () => listRangeSessions({ limit: 200 }),
  })

  // Pull line-level data for the most-recent N sessions to compute
  // most-used firearm / caliber across the last 90 days. The list endpoint
  // doesn't include lines, so we fetch the detail for sessions in-window.
  const ninetyDaysAgo = useMemo(() => format(subDays(new Date(), 90), 'yyyy-MM-dd'), [])
  const recentForStats = useMemo<RangeSessionListItem[]>(
    () => statsSessions.filter((s) => s.date >= ninetyDaysAgo),
    [statsSessions, ninetyDaysAgo],
  )

  // Cap how many sessions we expand to avoid request storms when stats fetch
  // returns hundreds. 50 is more than enough for typical 90-day usage.
  const recentForStatsCapped = useMemo(
    () => recentForStats.slice(0, 50),
    [recentForStats],
  )

  const detailQueries = useQuery({
    queryKey: ['range-session-stats-bundle', recentForStatsCapped.map((s) => s.id)],
    queryFn: async () => {
      const results = await Promise.all(
        recentForStatsCapped.map((s) => getRangeSession(s.id)),
      )
      return results
    },
    enabled: recentForStatsCapped.length > 0,
    staleTime: 60_000,
  })

  // Firearms for the filter dropdown
  const { data: firearms = [] } = useQuery({
    queryKey: ['firearms'],
    queryFn: () => listFirearms(),
    staleTime: 60_000,
  })
  const firearmById = useMemo(() => {
    const m = new Map<number, string>()
    firearms.forEach((f) => {
      const title = `${f.manufacturer_name ?? ''} ${f.display_model}`.trim()
      m.set(f.id, title)
    })
    return m
  }, [firearms])

  // ---------------------------------------------------------------------------
  // Stats bar values
  // ---------------------------------------------------------------------------
  const sessionsLogged = statsSessions.length
  const totalRounds90 = recentForStats.reduce((sum, s) => sum + s.total_rounds, 0)
  const { mostUsedFirearmLabel, mostUsedCaliberLabel } = useMemo(() => {
    const detailList = detailQueries.data ?? []
    const firearmCount = new Map<number, number>()
    // ammo_box_display is "Box #N (Caliber Mfg Product)" — pull the caliber
    // token out so we can rank by total rounds per caliber over 90 days
    // without needing a dedicated endpoint or another lookup pass.
    const caliberCount = new Map<string, number>()
    for (const s of detailList) {
      for (const ln of s.lines) {
        if (ln.firearm_id != null && ln.rounds_fired > 0) {
          firearmCount.set(
            ln.firearm_id,
            (firearmCount.get(ln.firearm_id) ?? 0) + ln.rounds_fired,
          )
        }
        if (ln.ammo_box_id != null && ln.ammo_box_display && ln.rounds_fired > 0) {
          // ammo_box_display is "Box #N (Caliber Mfg Product)"
          const m = ln.ammo_box_display.match(/\(([^\s)]+)/)
          if (m) {
            const caliber = m[1]
            caliberCount.set(caliber, (caliberCount.get(caliber) ?? 0) + ln.rounds_fired)
          }
        }
      }
    }

    let topFirearmId: number | null = null
    let topFirearmCount = 0
    firearmCount.forEach((v, k) => {
      if (v > topFirearmCount) {
        topFirearmId = k
        topFirearmCount = v
      }
    })

    let topCaliber: string | null = null
    let topCaliberCount = 0
    caliberCount.forEach((v, k) => {
      if (v > topCaliberCount) {
        topCaliber = k
        topCaliberCount = v
      }
    })

    return {
      mostUsedFirearmLabel:
        topFirearmId != null
          ? `${firearmById.get(topFirearmId) ?? `Firearm #${topFirearmId}`} (${topFirearmCount.toLocaleString()})`
          : '—',
      mostUsedCaliberLabel:
        topCaliber != null
          ? `${topCaliber} (${topCaliberCount.toLocaleString()})`
          : '—',
    }
  }, [detailQueries.data, firearmById])

  // Client-side sort (server returns date desc by default; flip if user wants oldest)
  const sorted = useMemo<RangeSessionListItem[]>(() => {
    if (sortDir === 'newest') return sessions
    return [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  }, [sessions, sortDir])

  const hasFilters = !!filterFirearmId || !!afterDate || !!beforeDate
  const clearFilters = () => {
    setFirearmFilter('')
    setAfterDate('')
    setBeforeDate('')
    setSortDir('newest')
  }

  const afterObj = afterDate ? parseISO(afterDate) : undefined
  const beforeObj = beforeDate ? parseISO(beforeDate) : undefined

  return (
    <AppShell>
      <TopBar
        title="Range"
        subtitle="Log range days and review session history"
        actions={
          canLog ? (
            <Button size="sm" onClick={() => setLogOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Log Range Day
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBlock label="Sessions Logged" value={sessionsLogged.toLocaleString()} />
          <StatBlock
            label="Total Rounds (90d)"
            value={totalRounds90.toLocaleString()}
          />
          <StatBlock label="Most-used Firearm (90d)" value={mostUsedFirearmLabel} />
          <StatBlock label="Most-used Caliber (90d)" value={mostUsedCaliberLabel} />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="w-56">
            <Select
              value={firearmFilter || NONE}
              onValueChange={(v) => setFirearmFilter(v === NONE ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All firearms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All firearms</SelectItem>
                {firearms.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {`${f.manufacturer_name ?? ''} ${f.display_model}`.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    inputCls,
                    'flex items-center justify-start gap-2',
                    !afterObj && 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  <CalendarIcon className="h-4 w-4 shrink-0" />
                  {afterObj ? `From ${format(afterObj, 'MMM d, yyyy')}` : 'After date'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0 w-auto">
                <Calendar
                  mode="single"
                  selected={afterObj}
                  onSelect={(d) => setAfterDate(d ? format(d, 'yyyy-MM-dd') : '')}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-44">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    inputCls,
                    'flex items-center justify-start gap-2',
                    !beforeObj && 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  <CalendarIcon className="h-4 w-4 shrink-0" />
                  {beforeObj ? `To ${format(beforeObj, 'MMM d, yyyy')}` : 'Before date'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0 w-auto">
                <Calendar
                  mode="single"
                  selected={beforeObj}
                  onSelect={(d) => setBeforeDate(d ? format(d, 'yyyy-MM-dd') : '')}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="w-40">
            <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasFilters && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}

          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.href = exportRangeSessionsCsvUrl()
              }}
              title="Download all visible range sessions as CSV (one row per line)"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          hasFilters ? (
            <div className="flex flex-col items-center py-16 gap-4 text-center">
              <Target className="w-12 h-12 text-gray-300 dark:text-gray-600" />
              <div>
                <p className="font-medium text-gray-600 dark:text-gray-300">
                  No sessions match these filters
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Try adjusting the date range or firearm filter.
                </p>
              </div>
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 gap-4 text-center">
              <Target className="w-12 h-12 text-gray-300 dark:text-gray-600" />
              <div>
                <p className="font-medium text-gray-600 dark:text-gray-300">
                  No range sessions yet
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {canLog
                    ? 'Log your first range day to start tracking range performance and ammo usage.'
                    : 'No sessions have been logged yet.'}
                </p>
              </div>
              {canLog && (
                <Button onClick={() => setLogOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Log Your First Range Day
                </Button>
              )}
            </div>
          )
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sorted.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  isOwn={user != null && s.owner_id === user.id}
                  onClick={() => navigate(`/range-sessions/${s.id}`)}
                />
              ))}
            </div>
            {sessions.length === pageLimit && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setPageLimit((p) => p + PAGE_SIZE)}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <LogRangeDayDialog open={logOpen} onOpenChange={setLogOpen} />
    </AppShell>
  )
}

// ===========================================================================
function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1 truncate">
        {value}
      </p>
    </div>
  )
}

// ===========================================================================
interface SessionCardProps {
  session: RangeSessionListItem
  isOwn: boolean
  onClick: () => void
}

function SessionCard({ session, isOwn, onClick }: SessionCardProps) {
  const dateObj = parseISO(session.date)
  return (
    <Link
      to={`/range-sessions/${session.id}`}
      onClick={(e) => {
        // Use the click handler-provided navigate to keep keyboard nav consistent
        e.preventDefault()
        onClick()
      }}
      className="text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
            {format(dateObj, 'EEE, MMM d, yyyy')}
          </p>
          {session.location_name && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {session.location_name}
            </p>
          )}
        </div>
        {session.is_shared && !isOwn && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium">
            <Users className="w-3 h-3" />
            {session.owner_name}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2 mt-1">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none flex items-center gap-1">
            <Crosshair className="w-5 h-5 text-gold" />
            {session.total_rounds.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">rounds fired</p>
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
          <p>
            {session.distinct_firearms} {session.distinct_firearms === 1 ? 'firearm' : 'firearms'}
          </p>
          <p>
            {session.distinct_boxes} {session.distinct_boxes === 1 ? 'box' : 'boxes'}
          </p>
          <p>
            {session.line_count} {session.line_count === 1 ? 'line' : 'lines'}
          </p>
        </div>
      </div>
    </Link>
  )
}
