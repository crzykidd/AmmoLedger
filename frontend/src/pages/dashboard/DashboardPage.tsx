import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronRight, Crosshair, DollarSign, Layers, Package, Upload } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { HelpTip } from '@/components/HelpTip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CaliberThresholdDrawer } from '@/components/CaliberThresholdDrawer'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import { useAuth } from '@/contexts/AuthContext'
import { listAmmo, getRecentExpenditure } from '@/api/ammo'
import { getInvites } from '@/api/invites'
import { getUsers } from '@/api/users'
import { useThresholdStatus } from '@/hooks/useThresholdStatus'
import { cn } from '@/lib/utils'
import iconInventory from '@/assets/brand/icon-inventory-dark.png'
import type { CaliberStatus } from '@/types'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  accent = false,
}: {
  icon: React.ElementType
  label: string
  value: string
  subtitle?: string
  accent?: boolean
}) {
  return (
    <Card className={cn(accent && 'border-amber-400/60 dark:border-amber-500/40')}>
      <CardContent className="p-4 flex items-center gap-4">
        <div
          className={cn(
            'shrink-0 h-10 w-10 rounded-lg flex items-center justify-center',
            accent
              ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div
            className={cn(
              'text-2xl font-bold tabular-nums leading-none',
              accent
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-900 dark:text-white',
            )}
          >
            {value}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
          {subtitle && (
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

// ---------------------------------------------------------------------------
// Getting started panel
// ---------------------------------------------------------------------------

type WizardItem = {
  label: string
  done: boolean
  path: string | null
  optional?: boolean
  subButtons?: { label: string; path: string }[]
}

function GettingStartedCard({
  hasBoxes,
  thresholdsCustomized,
  hasInvitedUsers,
  isAdmin,
  onDismiss,
  onNavigate,
}: {
  hasBoxes: boolean
  thresholdsCustomized: boolean
  hasInvitedUsers: boolean
  isAdmin: boolean
  onDismiss: () => void
  onNavigate: (path: string) => void
}) {
  const items: WizardItem[] = [
    { label: 'Create your account', done: true, path: null },
    { label: 'Add your first ammo box', done: hasBoxes, path: '/inventory' },
    {
      label: 'Import your existing data',
      done: false,
      optional: true,
      path: null,
      subButtons: [
        { label: 'Import CSV', path: '/import' },
        { label: 'Restore Backup', path: '/admin/backup' },
      ],
    },
    { label: 'Set stock thresholds', done: thresholdsCustomized, path: '/settings/thresholds' },
    ...(isAdmin
      ? [{ label: 'Invite a family member', done: hasInvitedUsers, path: '/admin/users' }]
      : []),
  ]

  const allDone = items.filter((i) => !i.optional).every((i) => i.done)

  return (
    <Card className="border-gold/30">
      <CardHeader className="pb-2">
        <CardTitle>Getting Started</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Complete these steps to set up AmmoLedger.
        </p>
      </CardHeader>
      <CardContent className="pt-2 space-y-1">
        {allDone ? (
          <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400">
            <Check className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              You're all set! AmmoLedger is ready.
            </span>
          </div>
        ) : (
          items.map((item) =>
            item.subButtons ? (
              <div key={item.label} className="flex items-start gap-3 px-3 py-2 rounded-lg">
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                    <span className="text-xs text-gray-400">(optional)</span>
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    {item.subButtons.map((btn) => (
                      <Button
                        key={btn.label}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2.5"
                        onClick={() => onNavigate(btn.path)}
                      >
                        {btn.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={item.label}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                  !item.done && item.path
                    ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
                    : '',
                )}
                onClick={() => {
                  if (!item.done && item.path) onNavigate(item.path)
                }}
              >
                <div
                  className={cn(
                    'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                    item.done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-gray-300 dark:border-gray-600',
                  )}
                >
                  {item.done && <Check className="h-3 w-3" />}
                </div>
                <span
                  className={cn(
                    'text-sm flex-1',
                    item.done
                      ? 'line-through text-gray-400'
                      : 'text-gray-700 dark:text-gray-300',
                  )}
                >
                  {item.label}
                </span>
                {!item.done && item.path && (
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                )}
              </div>
            ),
          )
        )}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onDismiss}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            {allDone ? 'Dismiss' : "Don't show again"}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('getting_started_dismissed') === 'true',
  )
  const [drawerCaliber, setDrawerCaliber] = useState<CaliberStatus | null>(null)
  const [caliberView, setCaliberView] = useState<'mix' | 'threshold'>(
    () => (localStorage.getItem('dashboard_caliber_view') as 'mix' | 'threshold') || 'mix',
  )
  const [statsScope, setStatsScope] = useState<'current' | 'all'>(() => {
    const v = localStorage.getItem('dashboard_stats_scope')
    return v === 'all' ? 'all' : 'current'
  })

  const { calibers, isLoading: lookupsLoading } = useInventoryLookups()

  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ['ammo', 'dashboard'],
    queryFn: () => listAmmo({ show_empty: true, show_archived: true }),
  })

  const { status: thresholdStatus } = useThresholdStatus()

  // Admin-only queries for getting-started wizard
  const { data: invites } = useQuery({
    queryKey: ['invites'],
    queryFn: getInvites,
    enabled: isAdmin && !dismissed,
  })

  const { data: allUsers } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: isAdmin && !dismissed,
  })

  const loading = dataLoading || lookupsLoading
  const allBoxes = data?.boxes ?? []
  const currentBoxes = useMemo(
    () => allBoxes.filter((b) => !b.is_archived && b.qty_remaining > 0),
    [allBoxes],
  )
  const boxes = currentBoxes  // downstream sections (By Caliber, Running Low, Recent Activity) always use current

  const caliberMap = useMemo(
    () => new Map(calibers.map((c) => [c.id, c.name])),
    [calibers],
  )

  const stats = useMemo(() => {
    // Lifetime totals: count parent boxes only (split_from_id IS NULL).
    // Children of a split represent the same physical rounds as their parent's
    // qty_original, so counting both would double-count. See PRD §6.13 / §9.2.4.
    const allRootBoxes = allBoxes.filter((b) => b.split_from_id === null)
    const source = statsScope === 'current' ? currentBoxes : allRootBoxes
    const useOriginal = statsScope === 'all'
    const totalBoxes = source.length
    const totalRounds = source.reduce(
      (sum, b) => sum + (useOriginal ? b.qty_original : b.qty_remaining),
      0,
    )
    const allHaveCost = source.every((b) => b.cost_per_round != null)
    const valueSum = source.reduce(
      (sum, b) => sum + ((b.cost_per_round ?? 0) * (useOriginal ? b.qty_original : b.qty_remaining)),
      0,
    )
    const calibersTracked = new Set(source.map((b) => b.caliber_id)).size
    return {
      totalBoxes,
      totalRounds,
      totalValue: allHaveCost ? valueSum : null,
      totalValuePartial: !allHaveCost ? valueSum : null,
      calibersTracked,
    }
  }, [allBoxes, currentBoxes, statsScope])

  // Caliber summary for By Caliber section
  const caliberSummary = useMemo(() => {
    const byId = new Map<number, { caliber_id: number; caliber_name: string; total_rounds: number; box_count: number }>()
    for (const box of boxes) {
      if (!byId.has(box.caliber_id)) {
        byId.set(box.caliber_id, {
          caliber_id: box.caliber_id,
          caliber_name: caliberMap.get(box.caliber_id) ?? 'Unknown',
          total_rounds: 0,
          box_count: 0,
        })
      }
      const entry = byId.get(box.caliber_id)!
      entry.total_rounds += box.qty_remaining
      entry.box_count += 1
    }
    return [...byId.values()].sort((a, b) => b.total_rounds - a.total_rounds)
  }, [boxes, caliberMap])

  const lowCaliberIds = useMemo(
    () => new Set(thresholdStatus.calibers.filter((c) => c.is_low).map((c) => c.caliber_id)),
    [thresholdStatus],
  )

  const caliberStatusMap = useMemo(
    () => new Map(thresholdStatus.calibers.map((c) => [c.caliber_id, c])),
    [thresholdStatus],
  )

  const totalInventoryRounds = caliberSummary.reduce((sum, cs) => sum + cs.total_rounds, 0)

  const { data: recentActivity } = useQuery({
    queryKey: ['expenditures', 'recent'],
    queryFn: getRecentExpenditure,
  })

  const thresholdsCustomized =
    thresholdStatus.default_rounds !== 200 ||
    thresholdStatus.calibers.length > 0 ||
    thresholdStatus.locations.length > 0

  const hasInvitedUsers =
    (allUsers?.length ?? 0) > 1 ||
    (invites?.some((i) => i.used_at !== null) ?? false)

  const lowCalibersCount = thresholdStatus.calibers.filter((c) => c.is_low).length
  const lowLocationsCount = thresholdStatus.locations.filter((l) => l.is_low).length
  const lowStockCount = lowCalibersCount + lowLocationsCount

  function dismiss() {
    localStorage.setItem('getting_started_dismissed', 'true')
    setDismissed(true)
  }

  // ---- render ----

  if (loading) {
    return (
      <AppShell>
        <TopBar title="Dashboard" />
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-6">
          <DashboardSkeleton />
        </div>
      </AppShell>
    )
  }

  if (boxes.length === 0) {
    return (
      <AppShell>
        <TopBar title="Dashboard" />
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-6 space-y-6">
          {!dismissed && (
            <div className="max-w-md mx-auto">
              <GettingStartedCard
                hasBoxes={false}
                thresholdsCustomized={thresholdsCustomized}
                hasInvitedUsers={hasInvitedUsers}
                isAdmin={isAdmin}
                onDismiss={dismiss}
                onNavigate={navigate}
              />
            </div>
          )}
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <img src={iconInventory} alt="No inventory" className="w-24 h-24 opacity-30 dark:opacity-20" />
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">
                No ammo inventory yet
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Add your first box to see dashboard stats.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => navigate('/inventory')}>
                <Package className="h-4 w-4 mr-1.5" />
                Add Ammo Box
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/import')}>
                <Upload className="h-4 w-4 mr-1.5" />
                Import from CSV
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <TopBar title="Dashboard" />
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Getting started wizard */}
        {!dismissed && (
          <GettingStartedCard
            hasBoxes={(data?.total_boxes ?? 0) > 0}
            thresholdsCustomized={thresholdsCustomized}
            hasInvitedUsers={hasInvitedUsers}
            isAdmin={isAdmin}
            onDismiss={dismiss}
            onNavigate={navigate}
          />
        )}

        {/* Stats row */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Inventory Stats
              </h2>
              <HelpTip text="Current shows your active inventory. All includes every box ever tracked — archived, empty, and expended rounds — based on original purchase quantities." />
            </div>
            <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(['current', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setStatsScope(mode)
                    localStorage.setItem('dashboard_stats_scope', mode)
                  }}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium transition-colors',
                    statsScope === mode
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                  )}
                >
                  {mode === 'current' ? 'Current' : 'All'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              icon={Package}
              label="Total Boxes"
              value={stats.totalBoxes.toLocaleString()}
            />
            <StatCard
              icon={Layers}
              label="Total Rounds"
              value={stats.totalRounds.toLocaleString()}
            />
            <StatCard
              icon={DollarSign}
              label="Total Value"
              value={
                (stats.totalValue ?? stats.totalValuePartial ?? 0) > 0
                  ? `${formatCurrency(stats.totalValue ?? stats.totalValuePartial ?? 0)}${stats.totalValue == null ? '*' : ''}`
                  : '—'
              }
              subtitle={
                stats.totalValue == null && (stats.totalValuePartial ?? 0) > 0
                  ? 'Some boxes have no cost set'
                  : undefined
              }
            />
            <StatCard
              icon={Crosshair}
              label="Calibers Tracked"
              value={stats.calibersTracked.toString()}
            />
            <StatCard
              icon={AlertTriangle}
              label="Low Stock Items"
              value={lowStockCount.toString()}
              accent={lowStockCount > 0}
            />
          </div>
        </section>

        {/* Running Low */}
        {lowStockCount > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
              Running Low
            </h2>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lowCalibersCount > 0 && (
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/40">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        By Caliber
                      </span>
                    </div>
                  )}
                  {thresholdStatus.calibers.filter((c) => c.is_low).map((item) => (
                    <button
                      key={item.caliber_id}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
                      onClick={() => setDrawerCaliber(item)}
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {item.caliber_name}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                          {item.rounds_on_hand.toLocaleString()} rds
                        </div>
                        <div className="text-xs text-gray-400">
                          threshold: {item.threshold.toLocaleString()}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                    </button>
                  ))}
                  {lowLocationsCount > 0 && (
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/40">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        By Location
                      </span>
                    </div>
                  )}
                  {thresholdStatus.locations.filter((l) => l.is_low).map((item) => (
                    <button
                      key={item.location_id}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
                      onClick={() => navigate(`/inventory?searchField=location&search=${encodeURIComponent(item.location_name)}`)}
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {item.location_name}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                          {item.rounds_on_hand.toLocaleString()} rds
                        </div>
                        <div className="text-xs text-gray-400">
                          threshold: {item.threshold.toLocaleString()}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* By Caliber */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              By Caliber
            </h2>
            {/* View toggle */}
            <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(['mix', 'threshold'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setCaliberView(mode)
                    localStorage.setItem('dashboard_caliber_view', mode)
                  }}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium transition-colors',
                    caliberView === mode
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                  )}
                >
                  {mode === 'mix' ? 'Mix' : 'Stock'}
                </button>
              ))}
            </div>
          </div>
          <Card>
            <CardContent className="py-4 px-4 space-y-4">
              {caliberSummary.map((cs) => {
                const statusEntry = caliberStatusMap.get(cs.caliber_id)
                const isLow = lowCaliberIds.has(cs.caliber_id)

                if (caliberView === 'threshold') {
                  const threshold = statusEntry?.threshold ?? thresholdStatus.default_rounds
                  const ratio = threshold > 0 ? cs.total_rounds / threshold : Infinity
                  const barPct = threshold > 0 ? Math.min((cs.total_rounds / threshold) * 100, 100) : 100
                  const barColor = ratio >= 1.1 ? 'bg-emerald-500' : ratio >= 0.9 ? 'bg-amber-400' : 'bg-red-500'
                  const textColor = ratio >= 1.1
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : ratio >= 0.9
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-red-500 dark:text-red-400'

                  return (
                    <button
                      key={cs.caliber_id}
                      className="w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 rounded-lg px-1 -mx-1 transition-colors"
                      onClick={() => statusEntry && setDrawerCaliber(statusEntry)}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {cs.caliber_name}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">
                            {cs.box_count} {cs.box_count === 1 ? 'box' : 'boxes'}
                          </span>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <span className={cn('text-sm tabular-nums font-semibold', textColor)}>
                            {cs.total_rounds.toLocaleString()} rds
                          </span>
                          {threshold > 0 && (
                            <span className="text-xs text-gray-400 ml-1">
                              / {threshold.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', barColor)}
                          style={{ width: `${Math.max(barPct, 1)}%` }}
                        />
                      </div>
                    </button>
                  )
                }

                // Mix mode
                const pct = totalInventoryRounds > 0
                  ? (cs.total_rounds / totalInventoryRounds) * 100
                  : 0
                return (
                  <button
                    key={cs.caliber_id}
                    className="w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 rounded-lg px-1 -mx-1 transition-colors"
                    onClick={() => statusEntry && setDrawerCaliber(statusEntry)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {isLow && (
                          <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {cs.caliber_name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {cs.box_count} {cs.box_count === 1 ? 'box' : 'boxes'}
                        </span>
                      </div>
                      <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300 ml-4 shrink-0">
                        {cs.total_rounds.toLocaleString()} rds
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', isLow ? 'bg-amber-400' : 'bg-gold')}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </section>

        {/* Recent Activity */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
            Recent Activity
          </h2>
          <Card>
            {!recentActivity || recentActivity.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-gray-400">
                No rounds logged yet. Use the inventory to log your first range session.
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentActivity.map((entry) => (
                    <button
                      key={entry.id}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
                      onClick={() => navigate('/inventory')}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {entry.caliber_name}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {entry.product_name
                              ? `${entry.manufacturer_name} / ${entry.product_name}`
                              : entry.manufacturer_name}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Logged by {entry.logged_by_name}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-red-500 dark:text-red-400">
                          -{entry.rounds_used.toLocaleString()} rds
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {format(parseISO(entry.date), 'MMM d')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </section>

      </div>

      <CaliberThresholdDrawer
        open={drawerCaliber !== null}
        onOpenChange={(o) => { if (!o) setDrawerCaliber(null) }}
        caliber={drawerCaliber}
        isAdmin={isAdmin}
        defaultRounds={thresholdStatus.default_rounds}
      />
    </AppShell>
  )
}
