import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, PackageOpen, AlertTriangle, ChevronDown, ChevronUp, X, CheckSquare } from 'lucide-react'
import { HelpTip } from '@/components/HelpTip'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import InventoryTable from '@/components/inventory/InventoryTable'
import type { GroupByField, ColumnFilters } from '@/components/inventory/InventoryTable'
import { DEFAULT_COLUMN_FILTERS } from '@/components/inventory/InventoryTable'
import InventoryCardList from '@/components/inventory/InventoryCardList'
import AmmoFormPanel from '@/components/inventory/AmmoFormPanel'
import BulkEditPanel from '@/components/inventory/BulkEditPanel'
import DeleteAmmoDialog from '@/components/inventory/DeleteAmmoDialog'
import ExpendDialog from '@/components/inventory/ExpendDialog'
import { useAuth } from '@/contexts/AuthContext'
import { listAmmo, updateAmmo } from '@/api/ammo'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import { useThresholds } from '@/hooks/useThresholds'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { AmmoBoxRead } from '@/types'

const BANNER_DISMISS_KEY = 'low_stock_banner_dismissed'

// ---------------------------------------------------------------------------
// Numeric filter helper — supports <N, >N, N-M, and exact N
// ---------------------------------------------------------------------------

function matchNumericFilter(val: number, filter: string): boolean {
  const f = filter.trim()
  if (!f) return true
  const rangeMatch = f.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
  if (rangeMatch) return val >= Number(rangeMatch[1]) && val <= Number(rangeMatch[2])
  if (f.startsWith('<')) return val < Number(f.slice(1))
  if (f.startsWith('>')) return val > Number(f.slice(1))
  return val === Number(f)
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({
  totalBoxes,
  totalRounds,
  totalValue,
}: {
  totalBoxes: number
  totalRounds: number
  totalValue: number | null
}) {
  return (
    <div className="flex gap-4 text-sm">
      <div>
        <span className="text-gray-500 dark:text-gray-400">Boxes </span>
        <span className="font-semibold text-gray-900 dark:text-white">{totalBoxes}</span>
      </div>
      <div>
        <span className="text-gray-500 dark:text-gray-400">Rounds </span>
        <span className="font-semibold text-gray-900 dark:text-white">
          {totalRounds.toLocaleString()}
        </span>
      </div>
      {totalValue != null && (
        <div>
          <span className="text-gray-500 dark:text-gray-400">Value </span>
          <span className="font-semibold text-gray-900 dark:text-white">
            ${totalValue.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group By options
// ---------------------------------------------------------------------------

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'caliber', label: 'Caliber' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'category', label: 'Category' },
  { value: 'type', label: 'Type' },
  { value: 'location', label: 'Location' },
  { value: 'container', label: 'Container' },
  { value: 'condition', label: 'Condition' },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  // Global search / view state
  const [search, setSearch] = useState('')
  const [showEmpty, setShowEmpty] = useState(
    () => localStorage.getItem('inventory_show_empty') === 'true',
  )
  const [showArchived, setShowArchived] = useState(false)
  const [conditionFilter, setConditionFilter] = useState<string>('')

  // Group By — persisted to localStorage
  const [groupBy, setGroupBy] = useState<GroupByField>(
    () => (localStorage.getItem('inventory_group_by') as GroupByField) ?? 'none',
  )

  // Column filters — reset on page refresh
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(DEFAULT_COLUMN_FILTERS)

  // Collapse / Expand All signals (increment to trigger)
  const [collapseSignal, setCollapseSignal] = useState(0)
  const [expandSignal, setExpandSignal] = useState(0)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  // Panel / dialog state
  const [panelOpen, setPanelOpen] = useState(false)
  const [editBox, setEditBox] = useState<AmmoBoxRead | null>(null)
  const [deleteBox, setDeleteBox] = useState<AmmoBoxRead | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expendBox, setExpendBox] = useState<AmmoBoxRead | null>(null)
  const [expendOpen, setExpendOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISS_KEY) === '1',
  )
  const [summaryOpen, setSummaryOpen] = useState(false)

  // Clear selection when filters or groupBy change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [columnFilters, groupBy, conditionFilter, search, showEmpty, showArchived])

  const lookups = useInventoryLookups()
  const { getLowItems, getCaliberSummary } = useThresholds()

  // Lookup maps used for column filtering
  const caliberMap = useMemo(
    () => new Map(lookups.calibers.map((c) => [c.id, c.name])),
    [lookups.calibers],
  )
  const manufacturerMap = useMemo(
    () => new Map(lookups.manufacturers.map((m) => [m.id, m.name])),
    [lookups.manufacturers],
  )
  const typeMap = useMemo(
    () => new Map(lookups.ammoTypes.map((t) => [t.id, t.name])),
    [lookups.ammoTypes],
  )
  const categoryMap = useMemo(
    () => new Map(lookups.categories.map((c) => [c.id, c.name])),
    [lookups.categories],
  )

  const archiveMutation = useMutation({
    mutationFn: (box: AmmoBoxRead) =>
      updateAmmo(box.id, { is_archived: true, archive_reason: 'manual' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ammo'] })
      toast({ title: 'Box archived' })
    },
    onError: () => {
      toast({ title: 'Failed to archive box', variant: 'destructive' })
    },
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ammo', { search, showEmpty, showArchived }],
    queryFn: () => listAmmo({ search: search || undefined, show_empty: showEmpty, show_archived: showArchived }),
  })

  const allBoxes = data?.boxes ?? []
  // Apply the condition toolbar filter
  const boxes = conditionFilter
    ? allBoxes.filter(
        (b) => b.ammo_condition_id != null && String(b.ammo_condition_id) === conditionFilter,
      )
    : allBoxes

  const canAdd = user?.role !== 'read_only'

  // Low-stock computed from all boxes (inventory health indicator, not filtered)
  const lowItems = useMemo(
    () => getLowItems(boxes, lookups.calibers),
    [boxes, lookups.calibers, getLowItems],
  )
  const lowSet = useMemo(() => new Set(lowItems.map((b) => b.id)), [lowItems])

  const caliberSummary = useMemo(
    () => getCaliberSummary(boxes, lookups.calibers),
    [boxes, lookups.calibers, getCaliberSummary],
  )

  // Apply column filters — AND logic with the global search + condition filter above
  const filteredBoxes = useMemo(() => {
    const cf = columnFilters
    const hasAny = Object.values(cf).some((v) => v !== '')
    if (!hasAny) return boxes

    return boxes.filter((box) => {
      // ID — partial match on numeric id or legacy_id string
      if (cf.id) {
        const q = cf.id.toLowerCase()
        if (!String(box.id).includes(q) && !(box.legacy_id ?? '').toLowerCase().includes(q))
          return false
      }
      // Caliber
      if (cf.caliber) {
        const name = caliberMap.get(box.caliber_id) ?? ''
        if (!name.toLowerCase().includes(cf.caliber.toLowerCase())) return false
      }
      // Manufacturer — also matches product_name
      if (cf.manufacturer) {
        const q = cf.manufacturer.toLowerCase()
        const mfg = (manufacturerMap.get(box.manufacturer_id) ?? '').toLowerCase()
        const prod = (box.product_name ?? '').toLowerCase()
        if (!mfg.includes(q) && !prod.includes(q)) return false
      }
      // Gr/Oz
      if (cf.grOz) {
        const val = box.gr_oz != null ? String(box.gr_oz) : ''
        if (!val.includes(cf.grOz)) return false
      }
      // Type
      if (cf.type) {
        const name = box.type_id != null ? (typeMap.get(box.type_id) ?? '') : ''
        if (!name.toLowerCase().includes(cf.type.toLowerCase())) return false
      }
      // Category
      if (cf.category) {
        const name = box.category_id != null ? (categoryMap.get(box.category_id) ?? '') : ''
        if (!name.toLowerCase().includes(cf.category.toLowerCase())) return false
      }
      // Remaining — operator filter
      if (cf.remaining) {
        if (!matchNumericFilter(box.qty_remaining, cf.remaining)) return false
      }
      // Value — operator filter; skip boxes with no cost set
      if (cf.value) {
        const val =
          box.cost_per_round != null ? box.qty_remaining * box.cost_per_round : null
        if (val == null) return false
        if (!matchNumericFilter(val, cf.value)) return false
      }
      // Shared — "shared" or "private" prefix matching
      if (cf.shared) {
        const q = cf.shared.toLowerCase()
        const matchesShared = 'shared'.startsWith(q)
        const matchesPrivate = 'private'.startsWith(q)
        if (matchesShared && !matchesPrivate && !box.is_shared) return false
        if (matchesPrivate && !matchesShared && box.is_shared) return false
      }
      return true
    })
  }, [boxes, columnFilters, caliberMap, manufacturerMap, typeMap, categoryMap])

  // Boxes currently selected (intersection with visible filtered set)
  const selectedBoxes = useMemo(
    () => filteredBoxes.filter((b) => selectedIds.has(b.id)),
    [filteredBoxes, selectedIds],
  )

  // Stats from filtered rows only
  const filteredStats = useMemo(() => {
    const totalBoxes = filteredBoxes.length
    const totalRounds = filteredBoxes.reduce((sum, b) => sum + b.qty_remaining, 0)
    const hasValue = filteredBoxes.some((b) => b.cost_per_round != null)
    const totalValue = hasValue
      ? filteredBoxes.reduce(
          (sum, b) =>
            sum + (b.cost_per_round != null ? b.qty_remaining * b.cost_per_round : 0),
          0,
        )
      : null
    return { totalBoxes, totalRounds, totalValue }
  }, [filteredBoxes])

  // Active column filter count
  const activeFilterCount = useMemo(
    () => Object.values(columnFilters).filter((v) => v !== '').length,
    [columnFilters],
  )

  function handleColumnFilterChange(key: keyof ColumnFilters, value: string) {
    setColumnFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearColumnFilters() {
    setColumnFilters(DEFAULT_COLUMN_FILTERS)
  }

  function handleGroupByChange(value: GroupByField) {
    setGroupBy(value)
    localStorage.setItem('inventory_group_by', value)
  }

  function dismissBanner() {
    sessionStorage.setItem(BANNER_DISMISS_KEY, '1')
    setBannerDismissed(true)
  }

  function openAdd() {
    setEditBox(null)
    setPanelOpen(true)
  }

  function openEdit(box: AmmoBoxRead) {
    setEditBox(box)
    setPanelOpen(true)
  }

  function openDelete(box: AmmoBoxRead) {
    setDeleteBox(box)
    setDeleteOpen(true)
  }

  function openExpend(box: AmmoBoxRead) {
    setExpendBox(box)
    setExpendOpen(true)
  }

  function openArchive(box: AmmoBoxRead) {
    archiveMutation.mutate(box)
  }

  const selectClass =
    'h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-2 focus:outline-none focus:ring-2 focus:ring-gold'

  return (
    <AppShell>
      <TopBar title="Inventory" />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Toolbar ── */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
          {/* Row 1: Group By | Search | Archived | Condition | Add Box */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Group By */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                Group By
              </label>
              <HelpTip text="Organize your inventory into collapsible groups by caliber, manufacturer, location, or other fields" />
              <select
                value={groupBy}
                onChange={(e) => handleGroupByChange(e.target.value as GroupByField)}
                className={selectClass}
                aria-label="Group by field"
              >
                {GROUP_BY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search caliber, manufacturer, product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
              />
            </div>

            {/* Show Empty toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={showEmpty}
                onChange={(e) => {
                  setShowEmpty(e.target.checked)
                  localStorage.setItem('inventory_show_empty', String(e.target.checked))
                }}
                className="accent-gold"
              />
              Show Empty
              <HelpTip text="Show boxes with zero rounds remaining" />
            </label>

            {/* Archived toggle */}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="accent-gold"
              />
              Archived
              <HelpTip text="Show boxes that have been archived and removed from active tracking" />
            </label>

            {/* Condition filter */}
            {lookups.ammoConditions.length > 0 && (
              <select
                value={conditionFilter}
                onChange={(e) => setConditionFilter(e.target.value)}
                className={selectClass}
                aria-label="Filter by condition"
              >
                <option value="">All Conditions</option>
                {lookups.ammoConditions.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {/* Add Box — pushed to the right */}
            {canAdd && (
              <Button onClick={openAdd} size="sm" className="ml-auto shrink-0">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Box
              </Button>
            )}
          </div>

          {/* Row 2: filter controls + stats */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Active filter count + Clear */}
              {activeFilterCount > 0 && (
                <>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
                  </span>
                  <button
                    onClick={clearColumnFilters}
                    className="flex items-center gap-1 text-xs text-gold hover:text-gold/80 font-medium"
                  >
                    <X className="h-3 w-3" />
                    Clear Filters
                  </button>
                </>
              )}

              {/* Collapse / Expand All — only when grouped */}
              {groupBy !== 'none' && (
                <>
                  {activeFilterCount > 0 && (
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                  )}
                  <button
                    onClick={() => setCollapseSignal((s) => s + 1)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Collapse All
                  </button>
                  <button
                    onClick={() => setExpandSignal((s) => s + 1)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Expand All
                  </button>
                </>
              )}
            </div>

            {/* Stats — reflect filtered rows */}
            <StatsBar
              totalBoxes={filteredStats.totalBoxes}
              totalRounds={filteredStats.totalRounds}
              totalValue={filteredStats.totalValue}
            />
          </div>
        </div>

        {/* ── Bulk action toolbar ── */}
        {selectedIds.size > 0 && (
          <div className="px-4 sm:px-6 py-2 border-b border-amber-300 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 flex items-center gap-3">
            <CheckSquare className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
            >
              Clear
            </button>
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => setBulkEditOpen(true)}>
                Edit Selected
              </Button>
            </div>
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Low-stock alert banner */}
          {!bannerDismissed && lowItems.length > 0 && (
            <Alert variant="warning" className="flex items-start gap-3 pr-10 relative">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <AlertTitle>
                  Low stock on {lowItems.length} item{lowItems.length !== 1 ? 's' : ''}
                </AlertTitle>
                <AlertDescription>
                  Some calibers are below your configured thresholds.{' '}
                  <button
                    className="underline hover:no-underline font-medium"
                    onClick={() => setSummaryOpen(true)}
                  >
                    View summary
                  </button>
                </AlertDescription>
              </div>
              <button
                className="absolute right-3 top-3 text-amber-600 dark:text-amber-400 hover:opacity-70"
                onClick={dismissBanner}
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </Alert>
          )}

          {/* Caliber summary */}
          {caliberSummary.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setSummaryOpen((v) => !v)}
              >
                <span>Caliber Summary</span>
                {summaryOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {summaryOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-gray-200 dark:bg-gray-800">
                  {caliberSummary.map((cs) => (
                    <div
                      key={cs.caliber_id}
                      className={cn(
                        'px-4 py-3 bg-white dark:bg-gray-900',
                        cs.is_low && 'bg-amber-50 dark:bg-amber-950/20',
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {cs.is_low && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {cs.caliber_name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {cs.total_rounds.toLocaleString()} rds · {cs.box_count} box
                        {cs.box_count !== 1 ? 'es' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoading || lookups.isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-red-500 font-medium">Failed to load inventory.</p>
              <p className="text-gray-500 text-sm mt-1">Check your connection and try again.</p>
            </div>
          ) : boxes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
              <PackageOpen className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {search || conditionFilter
                  ? 'No results match your search.'
                  : !showEmpty
                    ? 'No boxes with rounds remaining. Check "Show Empty" to see empty boxes.'
                    : 'No ammo boxes yet.'}
              </p>
              {canAdd && !search && !conditionFilter && showEmpty && (
                <Button onClick={openAdd} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add your first box
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <InventoryTable
                  boxes={filteredBoxes}
                  user={user!}
                  calibers={lookups.calibers}
                  manufacturers={lookups.manufacturers}
                  ammoTypes={lookups.ammoTypes}
                  ammoConditions={lookups.ammoConditions}
                  categories={lookups.categories}
                  dealers={lookups.dealers}
                  containers={lookups.containers}
                  locations={lookups.locations}
                  lowSet={lowSet}
                  groupBy={groupBy}
                  collapseSignal={collapseSignal}
                  expandSignal={expandSignal}
                  columnFilters={columnFilters}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  onColumnFilterChange={handleColumnFilterChange}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onArchive={openArchive}
                />
              </div>
              {/* Mobile cards */}
              <div className="md:hidden">
                <InventoryCardList
                  boxes={filteredBoxes}
                  user={user!}
                  calibers={lookups.calibers}
                  manufacturers={lookups.manufacturers}
                  containers={lookups.containers}
                  lowSet={lowSet}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onExpend={openExpend}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bulk edit panel */}
      <BulkEditPanel
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedBoxes={selectedBoxes}
        user={user!}
        manufacturers={lookups.manufacturers}
        ammoTypes={lookups.ammoTypes}
        ammoConditions={lookups.ammoConditions}
        categories={lookups.categories}
        dealers={lookups.dealers}
        containers={lookups.containers}
        locations={lookups.locations}
        onSaved={() => setSelectedIds(new Set())}
      />

      {/* Form panel */}
      <AmmoFormPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        editBox={editBox}
        user={user!}
        calibers={lookups.calibers}
        manufacturers={lookups.manufacturers}
        ammoTypes={lookups.ammoTypes}
        ammoConditions={lookups.ammoConditions}
        categories={lookups.categories}
        locations={lookups.locations}
        containers={lookups.containers}
      />

      {/* Delete confirmation */}
      <DeleteAmmoDialog
        box={deleteBox}
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o)
          if (!o) setDeleteBox(null)
        }}
      />

      {/* Expenditure dialog */}
      <ExpendDialog
        box={expendBox}
        open={expendOpen}
        onOpenChange={(o) => {
          setExpendOpen(o)
          if (!o) setExpendBox(null)
        }}
        calibers={lookups.calibers}
      />
    </AppShell>
  )
}
