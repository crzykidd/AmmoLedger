import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { ChevronDown, ChevronRight, Pencil, Trash2, Archive, ArchiveRestore, Crosshair, AlertTriangle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getAmmoHistory, updateAmmo } from '@/api/ammo'
import { toast } from '@/hooks/use-toast'
import QuickExpendPopover from '@/components/QuickExpendPopover'
import QuickArchivePopover from '@/components/inventory/QuickArchivePopover'
import type { AmmoBoxRead, User, LookupItem, DealerItem, ContainerItem, LocationItem } from '@/types'

// ---------------------------------------------------------------------------
// Public types — imported by InventoryPage
// ---------------------------------------------------------------------------

export type GroupByField =
  | 'none'
  | 'caliber'
  | 'manufacturer'
  | 'category'
  | 'type'
  | 'location'
  | 'container'
  | 'condition'

export interface ColumnFilters {
  id: string
  caliber: string
  manufacturer: string
  grOz: string
  type: string
  category: string
  remaining: string
  value: string
  shared: string
}

export const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
  id: '',
  caliber: '',
  manufacturer: '',
  grOz: '',
  type: '',
  category: '',
  remaining: '',
  value: '',
  shared: '',
}

// ---------------------------------------------------------------------------
// History section
// ---------------------------------------------------------------------------

function HistorySection({ boxId }: { boxId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ammo-history', boxId],
    queryFn: () => getAmmoHistory(boxId),
  })

  if (isLoading) return <p className="text-xs text-gray-400 italic">Loading history…</p>
  if (isError) return <p className="text-xs text-red-400">Failed to load history</p>
  if (!data || data.length === 0)
    return <p className="text-xs text-gray-400 italic">No expenditure history</p>

  return (
    <div className="space-y-1">
      {data.map((entry) => (
        <div
          key={entry.id}
          className="flex items-baseline gap-3 text-xs text-gray-600 dark:text-gray-400"
        >
          <span className="tabular-nums shrink-0 w-20 text-gray-400">{entry.date}</span>
          <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200 shrink-0">
            −{entry.rounds_used} rds
          </span>
          {entry.notes && (
            <span className="truncate italic text-gray-400 dark:text-gray-500">{entry.notes}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Indeterminate checkbox
// ---------------------------------------------------------------------------

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn('accent-gold cursor-pointer', className)}
    />
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'id' | 'caliber' | 'manufacturer' | 'qty_remaining'
type SortDir = 'asc' | 'desc'

interface GroupEntry {
  name: string
  boxes: AmmoBoxRead[]
  isUngrouped: boolean
}

interface Props {
  boxes: AmmoBoxRead[]
  user: User
  calibers: LookupItem[]
  manufacturers: LookupItem[]
  ammoTypes: LookupItem[]
  ammoConditions: LookupItem[]
  categories: LookupItem[]
  dealers: DealerItem[]
  containers: ContainerItem[]
  locations: LocationItem[]
  lowSet: Set<number>
  groupBy: GroupByField
  collapseSignal: number
  expandSignal: number
  columnFilters: ColumnFilters
  selectedIds: Set<number>
  onSelectionChange: (ids: Set<number>) => void
  onColumnFilterChange: (key: keyof ColumnFilters, value: string) => void
  onEdit: (box: AmmoBoxRead) => void
  onDelete: (box: AmmoBoxRead) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canEdit(box: AmmoBoxRead, user: User): boolean {
  if (user.role === 'admin') return true
  if (user.role === 'member') return box.owner_id === user.id
  return false
}

function canExpend(box: AmmoBoxRead, user: User): boolean {
  if (user.role === 'read_only') return false
  if (user.role === 'admin') return true
  return box.owner_id === user.id || box.is_shared
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-400">↕</span>
  return <span className="ml-1 text-gold">{dir === 'asc' ? '↑' : '↓'}</span>
}

// Compact filter input rendered inside a <TableHead>
function FilterCell({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <TableHead className={`py-1.5${className ? ` ${className}` : ''}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
        className={[
          'w-full h-7 px-2 text-xs rounded border',
          value
            ? 'border-gold bg-amber-50/40 dark:bg-amber-950/20'
            : 'border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100',
          'placeholder:text-gray-400 dark:placeholder:text-gray-600',
          'focus:outline-none focus:ring-1 focus:ring-gold',
        ].join(' ')}
      />
    </TableHead>
  )
}

const GROUP_FIELD_LABEL: Record<string, string> = {
  caliber: 'Caliber',
  manufacturer: 'Manufacturer',
  category: 'Category',
  type: 'Type',
  condition: 'Condition',
  container: 'Container',
  location: 'Location',
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InventoryTable({
  boxes,
  user,
  calibers,
  manufacturers,
  ammoTypes,
  ammoConditions,
  categories,
  dealers,
  containers,
  locations,
  lowSet,
  groupBy,
  collapseSignal,
  expandSignal,
  columnFilters,
  selectedIds,
  onSelectionChange,
  onColumnFilterChange,
  onEdit,
  onDelete,
}: Props) {
  const qc = useQueryClient()
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [openExpendBoxId, setOpenExpendBoxId] = useState<number | null>(null)
  const [openArchiveBoxId, setOpenArchiveBoxId] = useState<number | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [startCollapsed, setStartCollapsed] = useState(true)

  const unarchiveMutation = useMutation({
    mutationFn: (boxId: number) =>
      updateAmmo(boxId, { is_archived: false, archive_reason: null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ammo'] })
      toast({ title: 'Box restored from archive' })
    },
    onError: () => {
      toast({ title: 'Failed to restore box', variant: 'destructive' })
    },
  })

  const collapseKey = (g: string) => `inventory_collapsed_${g}`

  // When groupBy changes: restore sessionStorage state or plan to start collapsed
  useEffect(() => {
    if (groupBy === 'none') {
      setCollapsedGroups(new Set())
      return
    }
    const saved = sessionStorage.getItem(collapseKey(groupBy))
    if (saved) {
      try {
        setCollapsedGroups(new Set(JSON.parse(saved) as string[]))
        setStartCollapsed(false)
        return
      } catch { /* fall through to default */ }
    }
    setStartCollapsed(true)
  }, [groupBy])

  // Persist collapse state to sessionStorage whenever it changes
  useEffect(() => {
    if (groupBy !== 'none') {
      sessionStorage.setItem(collapseKey(groupBy), JSON.stringify([...collapsedGroups]))
    }
  }, [collapsedGroups, groupBy])

  // Lookup maps
  const caliberMap = useMemo(
    () => new Map(calibers.map((c) => [c.id, c.name])),
    [calibers],
  )
  const manufacturerMap = useMemo(
    () => new Map(manufacturers.map((m) => [m.id, m.name])),
    [manufacturers],
  )
  const typeMap = useMemo(
    () => new Map(ammoTypes.map((t) => [t.id, t.name])),
    [ammoTypes],
  )
  const conditionMap = useMemo(
    () => new Map(ammoConditions.map((c) => [c.id, c.name])),
    [ammoConditions],
  )
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )
  const dealerMap = useMemo(
    () => new Map(dealers.map((d) => [d.id, d.name])),
    [dealers],
  )
  const containerMap = useMemo(
    () => new Map(containers.map((c) => [c.id, c.name])),
    [containers],
  )
  const locationMap = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations],
  )
  const containerLocationMap = useMemo(
    () => new Map(containers.map((c) => [c.id, c.location_id])),
    [containers],
  )

  // Sort
  const sorted = useMemo(() => {
    return [...boxes].sort((a, b) => {
      if (sortKey === 'id') return sortDir === 'asc' ? a.id - b.id : b.id - a.id
      if (sortKey === 'qty_remaining')
        return sortDir === 'asc'
          ? a.qty_remaining - b.qty_remaining
          : b.qty_remaining - a.qty_remaining
      const av =
        sortKey === 'caliber'
          ? (caliberMap.get(a.caliber_id) ?? '')
          : (manufacturerMap.get(a.manufacturer_id) ?? '')
      const bv =
        sortKey === 'caliber'
          ? (caliberMap.get(b.caliber_id) ?? '')
          : (manufacturerMap.get(b.manufacturer_id) ?? '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [boxes, sortKey, sortDir, caliberMap, manufacturerMap])

  // All visible IDs for header checkbox
  const allIds = useMemo(() => sorted.map((b) => b.id), [sorted])
  const headerChecked = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const headerIndeterminate = selectedIds.size > 0 && !headerChecked

  // Grouping
  const groups = useMemo((): GroupEntry[] => {
    if (groupBy === 'none') return []

    // Wait for lookup data before grouping to avoid false "No Location" / "No Container" groups
    if (groupBy === 'location' && locations.length === 0 && sorted.some((b) => b.location_id !== null)) return []
    if (groupBy === 'container' && containers.length === 0 && sorted.some((b) => b.container_id !== null)) return []

    const groupMap = new Map<string, AmmoBoxRead[]>()
    const ungrouped: AmmoBoxRead[] = []

    for (const box of sorted) {
      let name: string | null = null

      switch (groupBy) {
        case 'caliber':
          name = caliberMap.get(box.caliber_id) ?? null
          break
        case 'manufacturer':
          name = manufacturerMap.get(box.manufacturer_id) ?? null
          break
        case 'category':
          name = box.category_id != null ? (categoryMap.get(box.category_id) ?? null) : null
          break
        case 'type':
          name = box.type_id != null ? (typeMap.get(box.type_id) ?? null) : null
          break
        case 'condition':
          name =
            box.ammo_condition_id != null
              ? (conditionMap.get(box.ammo_condition_id) ?? null)
              : null
          break
        case 'container':
          name = box.container_id != null ? (containerMap.get(box.container_id) ?? null) : null
          break
        case 'location':
          name = box.location_id != null ? (locationMap.get(box.location_id) ?? null) : null
          break
      }

      if (name) {
        if (!groupMap.has(name)) groupMap.set(name, [])
        groupMap.get(name)!.push(box)
      } else {
        ungrouped.push(box)
      }
    }

    const label = GROUP_FIELD_LABEL[groupBy] ?? groupBy
    const named = Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([n, bs]) => ({ name: n, boxes: bs, isUngrouped: false }))

    if (ungrouped.length > 0) {
      named.push({ name: `No ${label}`, boxes: ungrouped, isUngrouped: true })
    }

    return named
  }, [
    sorted,
    groupBy,
    caliberMap,
    manufacturerMap,
    categoryMap,
    typeMap,
    conditionMap,
    containerMap,
    locationMap,
  ])

  const groupsRef = useRef<GroupEntry[]>(groups)
  groupsRef.current = groups

  // Once groups are known and startCollapsed is set, collapse all groups
  useEffect(() => {
    if (startCollapsed && groups.length > 0) {
      setCollapsedGroups(new Set(groups.map((g) => g.name)))
      setStartCollapsed(false)
    }
  }, [groups, startCollapsed])

  useEffect(() => {
    if (collapseSignal > 0) {
      setCollapsedGroups(new Set(groupsRef.current.map((g) => g.name)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignal])

  useEffect(() => {
    if (expandSignal > 0) {
      setCollapsedGroups(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleRowSelection(boxId: number, checked: boolean) {
    const next = new Set(selectedIds)
    if (checked) next.add(boxId)
    else next.delete(boxId)
    onSelectionChange(next)
  }

  function toggleGroupSelection(groupBoxes: AmmoBoxRead[], checked: boolean) {
    const next = new Set(selectedIds)
    if (checked) groupBoxes.forEach((b) => next.add(b.id))
    else groupBoxes.forEach((b) => next.delete(b.id))
    onSelectionChange(next)
  }

  const SortableHead = ({
    label,
    col,
    className,
  }: {
    label: string
    col: SortKey
    className?: string
  }) => (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap${className ? ` ${className}` : ''}`}
      onClick={() => toggleSort(col)}
    >
      {label}
      <SortIcon active={sortKey === col} dir={sortDir} />
    </TableHead>
  )

  // ---------------------------------------------------------------------------
  // Row renderer
  // ---------------------------------------------------------------------------

  function renderRow(box: AmmoBoxRead) {
    const isExpanded = expanded.has(box.id)
    const isSelected = selectedIds.has(box.id)
    const editable = canEdit(box, user)
    const expendable = canExpend(box, user)
    const isLow = lowSet.has(box.id)
    const pct = box.qty_original > 0 ? (box.qty_remaining / box.qty_original) * 100 : 0
    const value = box.cost_per_round != null ? box.qty_remaining * box.cost_per_round : null
    const caliberName = caliberMap.get(box.caliber_id) ?? '—'
    const manufacturerName = manufacturerMap.get(box.manufacturer_id) ?? '—'

    const barClass =
      pct > 50
        ? 'h-full rounded-full bg-emerald-500'
        : pct > 20
          ? 'h-full rounded-full bg-amber-400'
          : 'h-full rounded-full bg-red-500'

    return (
      <Fragment key={box.id}>
        <TableRow
          className={cn(
            'group cursor-pointer',
            isLow
              ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              : undefined,
            isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : undefined,
          )}
          onClick={() => toggleExpand(box.id)}
        >
          {/* Checkbox */}
          <TableCell
            className="w-8 py-0 pl-3"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => toggleRowSelection(box.id, e.target.checked)}
              className={cn(
                'accent-gold cursor-pointer',
                selectedIds.size === 0 ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
              )}
            />
          </TableCell>

          {/* Expand chevron */}
          <TableCell className="text-gray-400 w-8 px-1">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </TableCell>

          {/* ID */}
          <TableCell>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{box.id}</span>
            {box.legacy_id && box.legacy_id.trim() !== '' && box.legacy_id !== String(box.id) && (
              <div className="text-xs text-gray-400 dark:text-gray-500 leading-tight">
                {box.legacy_id}
              </div>
            )}
          </TableCell>

          {/* Caliber */}
          <TableCell className="font-medium">{caliberName}</TableCell>

          {/* Manufacturer + product_name */}
          <TableCell>
            <span>{manufacturerName}</span>
            {box.product_name && (
              <div className="text-xs text-gray-400 dark:text-gray-500 leading-tight">
                {box.product_name}
              </div>
            )}
          </TableCell>

          {/* Gr/Oz */}
          <TableCell className="text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {box.gr_oz != null ? `${box.gr_oz} ${box.weight_unit ?? 'gr'}` : '—'}
          </TableCell>

          {/* Type + Condition badge */}
          <TableCell className="text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{box.type_id != null ? (typeMap.get(box.type_id) ?? '—') : '—'}</span>
              {box.ammo_condition_id != null && conditionMap.has(box.ammo_condition_id) && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                  {conditionMap.get(box.ammo_condition_id)}
                </span>
              )}
            </div>
          </TableCell>

          {/* Category */}
          <TableCell className="text-gray-600 dark:text-gray-300">
            {box.category_id != null ? (categoryMap.get(box.category_id) ?? '—') : '—'}
          </TableCell>

          {/* Remaining — click opens QuickExpendPopover */}
          <TableCell onClick={(e) => e.stopPropagation()}>
            {expendable ? (
              <QuickExpendPopover
                box={box}
                caliberName={caliberName}
                manufacturerName={manufacturerName}
                open={openExpendBoxId === box.id}
                onOpenChange={(o) => setOpenExpendBoxId(o ? box.id : null)}
              >
                <button
                  className="flex flex-col gap-1 min-w-[72px] group text-left focus:outline-none disabled:cursor-default"
                  disabled={box.qty_remaining === 0}
                  title="Click to log rounds"
                >
                  <span
                    className={
                      box.qty_remaining === 0
                        ? 'text-red-500 font-semibold'
                        : 'text-gray-900 dark:text-gray-100 group-hover:text-gold transition-colors'
                    }
                  >
                    {box.qty_remaining}
                  </span>
                  <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={barClass} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </button>
              </QuickExpendPopover>
            ) : (
              <div className="flex flex-col gap-1 min-w-[72px]">
                <span
                  className={
                    box.qty_remaining === 0
                      ? 'text-red-500 font-semibold'
                      : 'text-gray-900 dark:text-gray-100'
                  }
                >
                  {box.qty_remaining}
                </span>
                <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={barClass} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            )}
          </TableCell>

          {/* Value */}
          <TableCell className="text-gray-600 dark:text-gray-300 tabular-nums">
            {value != null ? `$${value.toFixed(2)}` : '—'}
          </TableCell>

          {/* Shared */}
          <TableCell>
            {box.is_shared ? (
              <Badge variant="gold">Shared</Badge>
            ) : (
              <span className="text-gray-400 text-xs">Private</span>
            )}
          </TableCell>

          {/* Actions */}
          <TableCell onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1 justify-end">
              {expendable && box.qty_remaining > 0 && (
                <QuickExpendPopover
                  box={box}
                  caliberName={caliberName}
                  manufacturerName={manufacturerName}
                  open={openExpendBoxId === box.id}
                  onOpenChange={(o) => setOpenExpendBoxId(o ? box.id : null)}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-500 hover:text-gold"
                    title="Log rounds used"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </Button>
                </QuickExpendPopover>
              )}
              {editable && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-500 hover:text-navy dark:hover:text-white"
                    onClick={() => onEdit(box)}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {box.is_archived ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-500 hover:text-emerald-600"
                      onClick={() => unarchiveMutation.mutate(box.id)}
                      title="Restore from archive"
                      disabled={unarchiveMutation.isPending}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <QuickArchivePopover
                      box={box}
                      caliberName={caliberName}
                      manufacturerName={manufacturerName}
                      open={openArchiveBoxId === box.id}
                      onOpenChange={(o) => setOpenArchiveBoxId(o ? box.id : null)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-500 hover:text-amber-600"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </QuickArchivePopover>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-500 hover:text-red-600"
                    onClick={() => onDelete(box)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </TableCell>
        </TableRow>

        {/* Expanded detail row */}
        {isExpanded && (
          <TableRow className="bg-gray-50/50 dark:bg-gray-800/20 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
            <TableCell />
            <TableCell />
            <TableCell colSpan={10}>
              <div className="grid grid-cols-2 gap-6 py-2 text-sm">
                <div className="space-y-1 text-gray-700 dark:text-gray-300">
                  {box.purchase_date && (
                    <div>
                      <span className="text-gray-500">Purchased: </span>
                      {box.purchase_date}
                    </div>
                  )}
                  {box.dealer_id != null && (
                    <div>
                      <span className="text-gray-500">Dealer: </span>
                      {dealerMap.get(box.dealer_id) ?? box.dealer_id}
                    </div>
                  )}
                  {box.location_id != null && (
                    <div>
                      <span className="text-gray-500">Location: </span>
                      {locationMap.get(box.location_id) ?? box.location_id}
                    </div>
                  )}
                  {box.container_id != null && (
                    <div>
                      <span className="text-gray-500">Container: </span>
                      {containerMap.get(box.container_id) ?? box.container_id}
                    </div>
                  )}
                  {box.cost_per_round != null && (
                    <div>
                      <span className="text-gray-500">Cost/rd: </span>$
                      {box.cost_per_round.toFixed(3)}
                    </div>
                  )}
                  {box.notes && (
                    <div>
                      <span className="text-gray-500">Notes: </span>
                      <span className="italic">{box.notes}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                    History
                  </p>
                  <HistorySection boxId={box.id} />
                </div>
              </div>
            </TableCell>
          </TableRow>
        )}
      </Fragment>
    )
  }

  // ---------------------------------------------------------------------------
  // Group header row
  // ---------------------------------------------------------------------------

  function renderGroupHeader(group: GroupEntry) {
    const { name, boxes: groupBoxes, isUngrouped } = group
    const isCollapsed = collapsedGroups.has(name)
    const totalRounds = groupBoxes.reduce((sum, b) => sum + b.qty_remaining, 0)
    const hasValue = groupBoxes.some((b) => b.cost_per_round != null)
    const totalValue = hasValue
      ? groupBoxes.reduce(
          (sum, b) => sum + (b.cost_per_round != null ? b.qty_remaining * b.cost_per_round : 0),
          0,
        )
      : null
    const lowCount = groupBoxes.filter((b) => lowSet.has(b.id)).length
    const groupIds = groupBoxes.map((b) => b.id)
    const groupChecked = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id))
    const groupIndeterminate = groupIds.some((id) => selectedIds.has(id)) && !groupChecked

    return (
      <Fragment key={name}>
        <TableRow
          className="cursor-pointer bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20 border-t-2 border-amber-200/60 dark:border-amber-800/30"
          onClick={() => toggleGroup(name)}
        >
          {/* Group checkbox */}
          <TableCell
            className="py-2 w-8 pl-3"
            onClick={(e) => e.stopPropagation()}
          >
            <IndeterminateCheckbox
              checked={groupChecked}
              indeterminate={groupIndeterminate}
              onChange={(checked) => toggleGroupSelection(groupBoxes, checked)}
            />
          </TableCell>

          <TableCell colSpan={11} className="py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
                )}
                <span
                  className={
                    isUngrouped
                      ? 'font-semibold text-gray-500 dark:text-gray-400 italic'
                      : 'font-semibold text-gray-900 dark:text-gray-100'
                  }
                >
                  {name}
                </span>
              </div>
              <div className="flex items-center gap-0 text-sm text-gray-600 dark:text-gray-400 divide-x divide-gray-300 dark:divide-gray-600 pr-1">
                <span className="pr-3">
                  {groupBoxes.length} {groupBoxes.length === 1 ? 'box' : 'boxes'}
                </span>
                <span className="px-3">{totalRounds.toLocaleString()} rds</span>
                {totalValue != null && (
                  <span className="px-3">${totalValue.toFixed(2)}</span>
                )}
                {lowCount > 0 && (
                  <span className="pl-3 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {lowCount} low
                  </span>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
        {!isCollapsed && groupBoxes.map(renderRow)}
      </Fragment>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const cf = columnFilters

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <Table>
        <TableHeader>
          {/* Column header row */}
          <TableRow className="bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
            {/* Header checkbox */}
            <TableHead className="w-8 pl-3">
              <IndeterminateCheckbox
                checked={headerChecked}
                indeterminate={headerIndeterminate}
                onChange={(checked) =>
                  onSelectionChange(checked ? new Set(allIds) : new Set())
                }
              />
            </TableHead>
            <TableHead className="w-8" />
            <SortableHead label="ID" col="id" className="w-16" />
            <SortableHead label="Caliber" col="caliber" />
            <SortableHead label="Manufacturer" col="manufacturer" />
            <TableHead>Gr/Oz</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <SortableHead label="Remaining" col="qty_remaining" />
            <TableHead>Value</TableHead>
            <TableHead>Shared</TableHead>
            <TableHead className="w-24" />
          </TableRow>

          {/* Filter row */}
          <TableRow className="bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
            <TableHead className="py-1.5" />
            <TableHead className="py-1.5" />
            <FilterCell
              value={cf.id}
              onChange={(v) => onColumnFilterChange('id', v)}
              placeholder="ID..."
            />
            <FilterCell
              value={cf.caliber}
              onChange={(v) => onColumnFilterChange('caliber', v)}
              placeholder="Caliber..."
            />
            <FilterCell
              value={cf.manufacturer}
              onChange={(v) => onColumnFilterChange('manufacturer', v)}
              placeholder="Manufacturer..."
            />
            <FilterCell
              value={cf.grOz}
              onChange={(v) => onColumnFilterChange('grOz', v)}
              placeholder="GR..."
            />
            <FilterCell
              value={cf.type}
              onChange={(v) => onColumnFilterChange('type', v)}
              placeholder="Type..."
            />
            <FilterCell
              value={cf.category}
              onChange={(v) => onColumnFilterChange('category', v)}
              placeholder="Category..."
            />
            <FilterCell
              value={cf.remaining}
              onChange={(v) => onColumnFilterChange('remaining', v)}
              placeholder="<, >, or exact"
            />
            <FilterCell
              value={cf.value}
              onChange={(v) => onColumnFilterChange('value', v)}
              placeholder="<, >, or exact"
            />
            <FilterCell
              value={cf.shared}
              onChange={(v) => onColumnFilterChange('shared', v)}
              placeholder="shared/private"
            />
            <TableHead className="py-1.5" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {groupBy === 'none'
            ? sorted.map(renderRow)
            : groups.map(renderGroupHeader)}
        </TableBody>
      </Table>
    </div>
  )
}
