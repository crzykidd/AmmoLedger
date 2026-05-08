import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, PackageOpen, AlertTriangle, ChevronDown, ChevronUp, X, CheckSquare, Upload, Download } from 'lucide-react'
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
import SplitBoxDialog from '@/components/inventory/SplitBoxDialog'
import { useAuth } from '@/contexts/AuthContext'
import { listAmmo, exportAmmoCsv } from '@/api/ammo'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import { useThresholdStatus } from '@/hooks/useThresholdStatus'
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
  unfilteredTotal,
}: {
  totalBoxes: number
  totalRounds: number
  totalValue: number | null
  unfilteredTotal?: number
}) {
  const isFiltered = unfilteredTotal != null && unfilteredTotal !== totalBoxes
  return (
    <div className={cn(
      'flex gap-4 text-sm',
      isFiltered && 'bg-gold/10 dark:bg-gold/5 px-3 py-1 rounded-lg border border-gold/20',
    )}>
      <div>
        <span className="text-gray-500 dark:text-gray-400">Boxes </span>
        <span className="font-semibold text-gray-900 dark:text-white">
          {isFiltered ? `${totalBoxes} / ${unfilteredTotal}` : totalBoxes}
        </span>
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

const SEARCH_FIELD_OPTIONS = [
  { value: 'all', label: 'All Fields' },
  { value: 'id', label: 'Box ID' },
  { value: 'caliber', label: 'Caliber' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'type', label: 'Ammo Type' },
  { value: 'category', label: 'Category' },
  { value: 'condition', label: 'Condition' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'location', label: 'Location' },
  { value: 'container', label: 'Container' },
  { value: 'product', label: 'Product Name' },
]

// ---------------------------------------------------------------------------
// Field summary type
// ---------------------------------------------------------------------------

interface FieldSummary {
  key: number | string
  name: string
  total_rounds: number
  box_count: number
  total_value: number | null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  type EmptyFilter = 'active' | 'empty' | 'all'
  type ArchivedFilter = 'active' | 'archived' | 'all'

  // Global search / view state
  const [search, setSearch] = useState('')
  const [searchField, setSearchField] = useState<string>('all')
  const [emptyFilter, setEmptyFilter] = useState<EmptyFilter>(() => {
    const v = localStorage.getItem('inventory_empty_filter')
    if (v === 'active' || v === 'empty' || v === 'all') return v
    const old = localStorage.getItem('inventory_show_empty')
    return old === 'true' ? 'all' : 'active'
  })
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>(() => {
    const v = localStorage.getItem('inventory_archived_filter')
    return (v === 'active' || v === 'archived' || v === 'all') ? v : 'active'
  })
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

  // Pre-selected product from /products?product_id=X
  const [initialProductId, setInitialProductId] = useState<number | null>(null)

  useEffect(() => {
    const pid = searchParams.get('product_id')
    const searchFieldParam = searchParams.get('searchField')
    const searchVal = searchParams.get('search')
    const emptyFilterParam = searchParams.get('emptyFilter')
    const statusFilterParam = searchParams.get('statusFilter')

    if (pid) {
      const id = parseInt(pid)
      if (!isNaN(id)) {
        setInitialProductId(id)
        setEditBox(null)
        setPanelOpen(true)
      }
    }

    if (searchFieldParam) setSearchField(searchFieldParam)
    if (searchVal) setSearch(searchVal)

    if (emptyFilterParam === 'active' || emptyFilterParam === 'empty' || emptyFilterParam === 'all') {
      setEmptyFilter(emptyFilterParam)
      localStorage.setItem('inventory_empty_filter', emptyFilterParam)
    }
    if (statusFilterParam === 'active' || statusFilterParam === 'archived' || statusFilterParam === 'all') {
      setArchivedFilter(statusFilterParam)
      localStorage.setItem('inventory_archived_filter', statusFilterParam)
    }

    if (pid || searchFieldParam || searchVal || emptyFilterParam || statusFilterParam) {
      setSearchParams({}, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Panel / dialog state
  const [panelOpen, setPanelOpen] = useState(false)
  const [editBox, setEditBox] = useState<AmmoBoxRead | null>(null)
  const [deleteBox, setDeleteBox] = useState<AmmoBoxRead | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expendBox, setExpendBox] = useState<AmmoBoxRead | null>(null)
  const [expendOpen, setExpendOpen] = useState(false)
  const [splitBox, setSplitBox] = useState<AmmoBoxRead | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISS_KEY) === '1',
  )
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [exportCsvOpen, setExportCsvOpen] = useState(false)

  // Clear selection when filters or groupBy change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [columnFilters, groupBy, conditionFilter, search, searchField, emptyFilter, archivedFilter])

  const lookups = useInventoryLookups()
  const { status: thresholdStatus } = useThresholdStatus()

  // Lookup maps used for column filtering and field-scoped search
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
  const conditionMap = useMemo(
    () => new Map(lookups.ammoConditions.map((c) => [c.id, c.name])),
    [lookups.ammoConditions],
  )
  const dealerMap = useMemo(
    () => new Map(lookups.dealers.map((d) => [d.id, d.name])),
    [lookups.dealers],
  )
  const locationMap = useMemo(
    () => new Map(lookups.locations.map((l) => [l.id, l.name])),
    [lookups.locations],
  )
  const containerMap = useMemo(
    () => new Map(lookups.containers.map((c) => [c.id, c.name])),
    [lookups.containers],
  )

  const apiSearch = searchField === 'all' ? (search || undefined) : undefined
  const showEmpty = emptyFilter !== 'active'
  const showArchived = archivedFilter !== 'active'
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ammo', { search: apiSearch, showEmpty, showArchived }],
    queryFn: () => listAmmo({ search: apiSearch, show_empty: showEmpty, show_archived: showArchived }),
  })

  const allBoxes = data?.boxes ?? []
  // Apply the condition toolbar filter
  const boxes = conditionFilter
    ? allBoxes.filter(
        (b) => b.ammo_condition_id != null && String(b.ammo_condition_id) === conditionFilter,
      )
    : allBoxes

  // Client-side filter for "only" modes (empty-only / archived-only)
  const viewFiltered = useMemo(() => {
    return boxes.filter((b) => {
      if (emptyFilter === 'empty' && b.qty_remaining !== 0) return false
      if (archivedFilter === 'archived' && !b.is_archived) return false
      return true
    })
  }, [boxes, emptyFilter, archivedFilter])

  const canAdd = user?.role !== 'read_only'

  // Low-stock: caliber IDs below threshold (server-side, caliber totals)
  const lowCaliberIds = useMemo(
    () => new Set<number>(thresholdStatus.calibers.filter((c) => c.is_low).map((c) => c.caliber_id)),
    [thresholdStatus],
  )
  // Box-level set for row highlighting: any box whose caliber is low
  const lowSet = useMemo(
    () => new Set<number>(boxes.filter((b) => lowCaliberIds.has(b.caliber_id)).map((b) => b.id)),
    [boxes, lowCaliberIds],
  )

  // Client-side field-scoped search (active when searchField !== 'all')
  const searchedBoxes = useMemo(() => {
    if (!search.trim() || searchField === 'all') return viewFiltered
    const q = search.trim().toLowerCase()
    return viewFiltered.filter((box) => {
      switch (searchField) {
        case 'id':
          return String(box.id).includes(q) || (box.legacy_id ?? '').toLowerCase().includes(q)
        case 'caliber':
          return (caliberMap.get(box.caliber_id) ?? '').toLowerCase().includes(q)
        case 'manufacturer':
          return (manufacturerMap.get(box.manufacturer_id) ?? '').toLowerCase().includes(q)
        case 'type':
          return box.type_id != null && (typeMap.get(box.type_id) ?? '').toLowerCase().includes(q)
        case 'category':
          return box.category_id != null && (categoryMap.get(box.category_id) ?? '').toLowerCase().includes(q)
        case 'condition':
          return box.ammo_condition_id != null && (conditionMap.get(box.ammo_condition_id) ?? '').toLowerCase().includes(q)
        case 'dealer':
          return box.dealer_id != null && (dealerMap.get(box.dealer_id) ?? '').toLowerCase().includes(q)
        case 'location':
          return box.location_id != null && (locationMap.get(box.location_id) ?? '').toLowerCase().includes(q)
        case 'container':
          return box.container_id != null && (containerMap.get(box.container_id) ?? '').toLowerCase().includes(q)
        case 'product':
          return (box.product_name ?? '').toLowerCase().includes(q)
        default:
          return true
      }
    })
  }, [viewFiltered, search, searchField, caliberMap, manufacturerMap, typeMap, categoryMap, conditionMap, dealerMap, locationMap, containerMap])

  // Apply column filters — AND logic with field search + condition filter above
  const filteredBoxes = useMemo(() => {
    const cf = columnFilters
    const hasAny = Object.values(cf).some((v) => v !== '')
    if (!hasAny) return searchedBoxes

    return searchedBoxes.filter((box) => {
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
  }, [searchedBoxes, columnFilters, caliberMap, manufacturerMap, typeMap, categoryMap])

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

  // Dynamic summary — reflects active groupBy field (defaults to caliber when 'none')
  const summaryLabel = groupBy === 'none' ? 'Caliber' : GROUP_BY_OPTIONS.find(o => o.value === groupBy)?.label ?? 'Caliber'

  const fieldSummary = useMemo<FieldSummary[]>(() => {
    const field = groupBy === 'none' ? 'caliber' : groupBy

    type IdExtractor = (box: AmmoBoxRead) => number | null
    type NameResolver = (id: number) => string

    let getId: IdExtractor
    let getName: NameResolver

    switch (field) {
      case 'caliber':
        getId = (b) => b.caliber_id
        getName = (id) => caliberMap.get(id) ?? 'Unknown'
        break
      case 'manufacturer':
        getId = (b) => b.manufacturer_id
        getName = (id) => manufacturerMap.get(id) ?? 'Unknown'
        break
      case 'type':
        getId = (b) => b.type_id
        getName = (id) => typeMap.get(id) ?? 'Unknown'
        break
      case 'category':
        getId = (b) => b.category_id
        getName = (id) => categoryMap.get(id) ?? 'Unknown'
        break
      case 'condition':
        getId = (b) => b.ammo_condition_id
        getName = (id) => conditionMap.get(id) ?? 'Unknown'
        break
      case 'location':
        getId = (b) => b.location_id
        getName = (id) => locationMap.get(id) ?? 'Unknown'
        break
      case 'container':
        getId = (b) => b.container_id
        getName = (id) => containerMap.get(id) ?? 'Unknown'
        break
      default:
        getId = (b) => b.caliber_id
        getName = (id) => caliberMap.get(id) ?? 'Unknown'
    }

    const byKey = new Map<number, FieldSummary>()
    for (const box of filteredBoxes) {
      const id = getId(box)
      if (id == null) continue
      if (!byKey.has(id)) {
        byKey.set(id, { key: id, name: getName(id), total_rounds: 0, box_count: 0, total_value: 0 })
      }
      const entry = byKey.get(id)!
      entry.total_rounds += box.qty_remaining
      entry.box_count += 1
      if (box.cost_per_round != null) {
        entry.total_value = (entry.total_value ?? 0) + (box.qty_remaining * box.cost_per_round)
      }
    }

    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [groupBy, filteredBoxes, caliberMap, manufacturerMap, typeMap, categoryMap, conditionMap, locationMap, containerMap])

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

  function handleEmptyFilterChange(v: EmptyFilter) {
    setEmptyFilter(v)
    localStorage.setItem('inventory_empty_filter', v)
  }

  function handleArchivedFilterChange(v: ArchivedFilter) {
    setArchivedFilter(v)
    localStorage.setItem('inventory_archived_filter', v)
  }

  function dismissBanner() {
    sessionStorage.setItem(BANNER_DISMISS_KEY, '1')
    setBannerDismissed(true)
  }

  function openAdd() {
    setEditBox(null)
    setInitialProductId(null)
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

  function openSplit(box: AmmoBoxRead) {
    setSplitBox(box)
    setSplitOpen(true)
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

            {/* Search with field selector */}
            <div className="flex flex-1 min-w-[180px] max-w-sm">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                className="h-9 rounded-l-md border border-r-0 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 px-2 focus:outline-none focus:ring-2 focus:ring-gold shrink-0"
                aria-label="Search field"
              >
                {SEARCH_FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="search"
                  placeholder={searchField === 'all' ? 'Search all fields…' : `Search ${SEARCH_FIELD_OPTIONS.find(o => o.value === searchField)?.label ?? ''}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 h-9 rounded-r-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
                />
              </div>
            </div>

            {/* Empty filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                Empty
              </label>
              <HelpTip text="Filter to show boxes with rounds, empty boxes only, or all boxes" />
              <select
                value={emptyFilter}
                onChange={(e) => handleEmptyFilterChange(e.target.value as EmptyFilter)}
                className={selectClass}
                aria-label="Empty filter"
              >
                <option value="active">Has rounds</option>
                <option value="empty">Empty only</option>
                <option value="all">All boxes</option>
              </select>
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                Status
              </label>
              <HelpTip text="Filter to show active boxes, archived boxes only, or all boxes" />
              <select
                value={archivedFilter}
                onChange={(e) => handleArchivedFilterChange(e.target.value as ArchivedFilter)}
                className={selectClass}
                aria-label="Status filter"
              >
                <option value="active">Active only</option>
                <option value="archived">Archived only</option>
                <option value="all">All boxes</option>
              </select>
            </div>

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

            {/* Export CSV + Add Box — pushed to the right */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportCsvOpen(true)}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
              {canAdd && (
                <Button onClick={openAdd} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Box
                </Button>
              )}
            </div>
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

            {/* Stats — reflect filtered rows, compare against unfiltered total */}
            <StatsBar
              totalBoxes={filteredStats.totalBoxes}
              totalRounds={filteredStats.totalRounds}
              totalValue={filteredStats.totalValue}
              unfilteredTotal={allBoxes.length}
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
          {!bannerDismissed && lowCaliberIds.size > 0 && (
            <Alert variant="warning" className="flex items-start gap-3 pr-10 relative">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <AlertTitle>
                  Low stock on {lowCaliberIds.size} caliber{lowCaliberIds.size !== 1 ? 's' : ''}
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

          {/* Dynamic field summary — label and grouping follow the active Group By */}
          {fieldSummary.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setSummaryOpen((v) => !v)}
              >
                <span>{summaryLabel} Summary</span>
                {summaryOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {summaryOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-gray-200 dark:bg-gray-800">
                  {fieldSummary.map((fs) => {
                    const isLow = groupBy === 'none' && lowCaliberIds.has(fs.key as number)
                    const isFiltered = columnFilters.caliber === fs.name
                    return (
                      <button
                        key={fs.key}
                        onClick={() => {
                          handleColumnFilterChange('caliber', isFiltered ? '' : fs.name)
                        }}
                        className={cn(
                          'px-4 py-3 bg-white dark:bg-gray-900 text-left w-full hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer',
                          isLow && 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40',
                          isFiltered && 'ring-2 ring-amber-500 ring-inset',
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isLow && (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                            {fs.name}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {fs.total_rounds.toLocaleString()} rds · {fs.box_count} box
                          {fs.box_count !== 1 ? 'es' : ''}
                        </div>
                      </button>
                    )
                  })}
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
                  : emptyFilter === 'active'
                    ? 'No boxes with rounds remaining. Switch the Empty filter to "All boxes" to see empty boxes.'
                    : 'No ammo boxes yet.'}
              </p>
              {canAdd && !search && !conditionFilter && emptyFilter !== 'active' && (
                <div className="flex gap-2">
                  <Button onClick={openAdd} size="sm">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add your first box
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate('/import')}>
                    <Upload className="h-4 w-4 mr-1.5" />
                    Import from CSV
                  </Button>
                </div>
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
                  onSplit={openSplit}
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
        onOpenChange={(o) => {
          setPanelOpen(o)
          if (!o) setInitialProductId(null)
        }}
        editBox={editBox}
        initialProductId={initialProductId}
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

      {/* Split dialog — mobile path (desktop uses internal state in InventoryTable) */}
      <SplitBoxDialog
        box={splitBox}
        open={splitOpen}
        onOpenChange={(o) => {
          setSplitOpen(o)
          if (!o) setSplitBox(null)
        }}
        user={user!}
        calibers={lookups.calibers}
        manufacturers={lookups.manufacturers}
        ammoTypes={lookups.ammoTypes}
      />

      {/* Export CSV confirmation */}
      <AlertDialog open={exportCsvOpen} onOpenChange={setExportCsvOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export to CSV</AlertDialogTitle>
            <AlertDialogDescription>
              Export {filteredStats.totalBoxes} box{filteredStats.totalBoxes !== 1 ? 'es' : ''} to CSV?
              Current filters and view settings will be applied.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.location.href = exportAmmoCsv({
                  search: search || undefined,
                  show_archived: archivedFilter !== 'active',
                  show_empty: emptyFilter !== 'active',
                })
              }}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download CSV
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppShell>
  )
}
