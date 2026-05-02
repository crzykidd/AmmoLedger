import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronRight, Crosshair, DollarSign, Layers, Package } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import { useAuth } from '@/contexts/AuthContext'
import { listAmmo } from '@/api/ammo'
import { getInvites } from '@/api/invites'
import { getUsers } from '@/api/users'
import { fetchLowStock, fetchDefaultThreshold } from '@/api/thresholds'
import { cn } from '@/lib/utils'
import iconInventory from '@/assets/brand/icon-inventory-dark.png'

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
  const items = [
    { label: 'Create your account', done: true, path: null },
    { label: 'Add your first ammo box', done: hasBoxes, path: '/inventory' },
    { label: 'Set stock thresholds', done: thresholdsCustomized, path: '/settings/thresholds' },
    ...(isAdmin
      ? [{ label: 'Invite a family member', done: hasInvitedUsers, path: '/admin/invites' }]
      : []),
  ]

  const allDone = items.every((i) => i.done)

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
          items.map((item) => (
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
          ))
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
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

  const { calibers, isLoading: lookupsLoading } = useInventoryLookups()

  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ['ammo', 'dashboard'],
    queryFn: () => listAmmo(),
  })

  const { data: lowStockData } = useQuery({
    queryKey: ['thresholds', 'low-stock'],
    queryFn: fetchLowStock,
  })

  const { data: defaultThreshold } = useQuery({
    queryKey: ['thresholds', 'default'],
    queryFn: fetchDefaultThreshold,
    enabled: !dismissed,
  })

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
  const boxes = data?.boxes ?? []

  const caliberMap = useMemo(
    () => new Map(calibers.map((c) => [c.id, c.name])),
    [calibers],
  )

  const calibersTracked = useMemo(
    () => new Set(boxes.map((b) => b.caliber_id)).size,
    [boxes],
  )

  const totalValue = useMemo(() => {
    if (data?.total_value != null) return { amount: data.total_value, partial: false }
    // API returns null when any box lacks cost_per_round — compute partial sum from boxes that have it
    const partial = boxes.reduce(
      (sum, b) => (b.cost_per_round != null ? sum + b.qty_remaining * b.cost_per_round : sum),
      0,
    )
    return { amount: partial, partial: true }
  }, [data?.total_value, boxes])

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
    () => new Set((lowStockData?.calibers ?? []).map((c) => c.caliber_id)),
    [lowStockData],
  )

  const totalInventoryRounds = caliberSummary.reduce((sum, cs) => sum + cs.total_rounds, 0)

  const recentActivity = useMemo(
    () =>
      [...boxes]
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        .slice(0, 5),
    [boxes],
  )

  const thresholdsCustomized = (defaultThreshold?.rounds ?? 200) !== 200

  const hasInvitedUsers =
    (allUsers?.length ?? 0) > 1 ||
    (invites?.some((i) => i.used_at !== null) ?? false)

  const lowCalibersCount = lowStockData?.calibers.length ?? 0
  const lowLocationsCount = lowStockData?.locations.length ?? 0
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
            <Button size="sm" onClick={() => navigate('/inventory')}>
              <Package className="h-4 w-4 mr-1.5" />
              Add Ammo Box
            </Button>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Layers}
            label="Total Rounds"
            value={(data?.total_rounds ?? 0).toLocaleString()}
          />
          <StatCard
            icon={DollarSign}
            label="Total Value"
            value={
              totalValue.amount > 0
                ? `${formatCurrency(totalValue.amount)}${totalValue.partial ? '*' : ''}`
                : '—'
            }
            subtitle={
              totalValue.partial && totalValue.amount > 0
                ? 'Some boxes have no cost set'
                : undefined
            }
          />
          <StatCard
            icon={Crosshair}
            label="Calibers Tracked"
            value={calibersTracked.toString()}
          />
          <StatCard
            icon={AlertTriangle}
            label="Low Stock Items"
            value={lowStockCount.toString()}
            accent={lowStockCount > 0}
          />
        </div>

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
                  {(lowStockData?.calibers ?? []).map((item) => (
                    <button
                      key={item.caliber_id}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
                      onClick={() => navigate('/inventory')}
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
                  {(lowStockData?.locations ?? []).map((item) => (
                    <button
                      key={item.location_id}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-left transition-colors"
                      onClick={() => navigate('/inventory')}
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
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
            By Caliber
          </h2>
          <Card>
            <CardContent className="py-4 px-4 space-y-4">
              {caliberSummary.map((cs) => {
                const pct =
                  totalInventoryRounds > 0
                    ? (cs.total_rounds / totalInventoryRounds) * 100
                    : 0
                const isLow = lowCaliberIds.has(cs.caliber_id)
                return (
                  <div key={cs.caliber_id}>
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
                        className={cn(
                          'h-full rounded-full transition-all',
                          isLow ? 'bg-amber-400' : 'bg-gold',
                        )}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                  </div>
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
            {recentActivity.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-gray-400">
                No recent activity
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentActivity.map((box) => {
                    const caliberName = caliberMap.get(box.caliber_id) ?? '—'
                    const diffMs = Math.abs(
                      new Date(box.updated_at).getTime() -
                        new Date(box.created_at).getTime(),
                    )
                    const action = diffMs < 60_000 ? 'Added' : 'Updated'
                    return (
                      <div key={box.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {caliberName}
                          </span>
                          {box.product_name && (
                            <span className="text-sm text-gray-500 ml-1.5">
                              {box.product_name}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full shrink-0',
                            action === 'Added'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                          )}
                        >
                          {action}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 w-12 text-right">
                          {format(parseISO(box.updated_at), 'MMM d')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        </section>

      </div>
    </AppShell>
  )
}
