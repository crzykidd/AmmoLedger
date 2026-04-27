import { useState, useMemo, Fragment } from 'react'
import { ChevronDown, ChevronRight, Pencil, Trash2, Archive } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
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
import { getAmmoHistory } from '@/api/ammo'
import QuickExpendPopover from '@/components/QuickExpendPopover'
import type { AmmoBoxRead, User, LookupItem, DealerItem, ContainerItem } from '@/types'

// ---------------------------------------------------------------------------
// Expenditure history — fetched per-row when expanded
// ---------------------------------------------------------------------------

function HistorySection({ boxId }: { boxId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ammo-history', boxId],
    queryFn: () => getAmmoHistory(boxId),
  })

  if (isLoading) return <p className="text-xs text-gray-400 italic">Loading history…</p>
  if (isError) return <p className="text-xs text-red-400">Failed to load history</p>
  if (!data || data.length === 0) return <p className="text-xs text-gray-400 italic">No expenditure history</p>

  return (
    <div className="space-y-1">
      {data.map((entry) => (
        <div key={entry.id} className="flex items-baseline gap-3 text-xs text-gray-600 dark:text-gray-400">
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

type SortKey = 'id' | 'caliber' | 'manufacturer' | 'qty_remaining'
type SortDir = 'asc' | 'desc'

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
  lowSet: Set<number>
  onEdit: (box: AmmoBoxRead) => void
  onDelete: (box: AmmoBoxRead) => void
  onArchive: (box: AmmoBoxRead) => void
}

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
  lowSet,
  onEdit,
  onDelete,
  onArchive,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [openPopoverBoxId, setOpenPopoverBoxId] = useState<number | null>(null)

  const caliberMap = useMemo(() => new Map(calibers.map((c) => [c.id, c.name])), [calibers])
  const manufacturerMap = useMemo(() => new Map(manufacturers.map((m) => [m.id, m.name])), [manufacturers])
  const typeMap = useMemo(() => new Map(ammoTypes.map((t) => [t.id, t.name])), [ammoTypes])
  const conditionMap = useMemo(() => new Map(ammoConditions.map((c) => [c.id, c.name])), [ammoConditions])
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const dealerMap = useMemo(() => new Map(dealers.map((d) => [d.id, d.name])), [dealers])
  const containerMap = useMemo(() => new Map(containers.map((c) => [c.id, c.name])), [containers])

  const sorted = useMemo(() => {
    return [...boxes].sort((a, b) => {
      if (sortKey === 'id') {
        return sortDir === 'asc' ? a.id - b.id : b.id - a.id
      }
      if (sortKey === 'qty_remaining') {
        return sortDir === 'asc' ? a.qty_remaining - b.qty_remaining : b.qty_remaining - a.qty_remaining
      }
      const av = sortKey === 'caliber' ? (caliberMap.get(a.caliber_id) ?? '') : (manufacturerMap.get(a.manufacturer_id) ?? '')
      const bv = sortKey === 'caliber' ? (caliberMap.get(b.caliber_id) ?? '') : (manufacturerMap.get(b.manufacturer_id) ?? '')
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [boxes, sortKey, sortDir, caliberMap, manufacturerMap])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const SortableHead = ({ label, col, className }: { label: string; col: SortKey; className?: string }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap${className ? ` ${className}` : ''}`} onClick={() => toggleSort(col)}>
      {label}
      <SortIcon active={sortKey === col} dir={sortDir} />
    </TableHead>
  )

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
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
        </TableHeader>
        <TableBody>
          {sorted.map((box) => {
            const isExpanded = expanded.has(box.id)
            const editable = canEdit(box, user)
            const expendable = canExpend(box, user)
            const isLow = lowSet.has(box.id)
            const pct = box.qty_original > 0 ? (box.qty_remaining / box.qty_original) * 100 : 0
            const value =
              box.cost_per_round != null ? box.qty_remaining * box.cost_per_round : null
            const caliberName = caliberMap.get(box.caliber_id) ?? '—'
            const manufacturerName = manufacturerMap.get(box.manufacturer_id) ?? '—'

            return (
              <Fragment key={box.id}>
                <TableRow
                  className={
                    isLow
                      ? 'cursor-pointer bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                      : 'cursor-pointer'
                  }
                  onClick={() => toggleExpand(box.id)}
                >
                  {/* Expand chevron */}
                  <TableCell className="text-gray-400">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>

                  {/* ID */}
                  <TableCell>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{box.id}</span>
                    {box.legacy_id && box.legacy_id.trim() !== '' && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 leading-tight">{box.legacy_id}</div>
                    )}
                  </TableCell>

                  {/* Caliber */}
                  <TableCell className="font-medium">{caliberName}</TableCell>

                  {/* Manufacturer + product_name */}
                  <TableCell>
                    <span>{manufacturerName}</span>
                    {box.product_name && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 leading-tight">{box.product_name}</div>
                    )}
                  </TableCell>

                  {/* Gr/Oz */}
                  <TableCell className="text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {box.gr_oz != null ? `${box.gr_oz} ${box.weight_unit ?? 'gr'}` : '—'}
                  </TableCell>

                  {/* Type + Condition */}
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

                  {/* Remaining — clickable for expend */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {expendable ? (
                      <QuickExpendPopover
                        box={box}
                        caliberName={caliberName}
                        manufacturerName={manufacturerName}
                        open={openPopoverBoxId === box.id}
                        onOpenChange={(o) => setOpenPopoverBoxId(o ? box.id : null)}
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
                            <div
                              className={
                                pct > 50
                                  ? 'h-full rounded-full bg-emerald-500'
                                  : pct > 20
                                    ? 'h-full rounded-full bg-amber-400'
                                    : 'h-full rounded-full bg-red-500'
                              }
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
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
                          <div
                            className={
                              pct > 50
                                ? 'h-full rounded-full bg-emerald-500'
                                : pct > 20
                                  ? 'h-full rounded-full bg-amber-400'
                                  : 'h-full rounded-full bg-red-500'
                            }
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-500 hover:text-amber-600"
                            onClick={() => onArchive(box)}
                            title="Archive"
                            disabled={box.is_archived}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
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

                {/* Expanded row — two-column detail + history */}
                {isExpanded && (
                  <TableRow className="bg-gray-50/50 dark:bg-gray-800/20 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <TableCell />
                    <TableCell colSpan={10}>
                      <div className="grid grid-cols-2 gap-6 py-2 text-sm">
                        {/* Left: purchase details */}
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
                          {box.container_id != null && (
                            <div>
                              <span className="text-gray-500">Container: </span>
                              {containerMap.get(box.container_id) ?? box.container_id}
                            </div>
                          )}
                          {box.cost_per_round != null && (
                            <div>
                              <span className="text-gray-500">Cost/rd: </span>
                              ${box.cost_per_round.toFixed(3)}
                            </div>
                          )}
                          {box.notes && (
                            <div>
                              <span className="text-gray-500">Notes: </span>
                              <span className="italic">{box.notes}</span>
                            </div>
                          )}
                        </div>

                        {/* Right: expenditure history */}
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
          })}
        </TableBody>
      </Table>
    </div>
  )
}
