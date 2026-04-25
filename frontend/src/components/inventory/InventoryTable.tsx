import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
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
import type { AmmoBoxRead, User, LookupItem, ContainerItem } from '@/types'

type SortKey = 'caliber' | 'manufacturer' | 'product_name' | 'qty_remaining'
type SortDir = 'asc' | 'desc'

interface Props {
  boxes: AmmoBoxRead[]
  user: User
  calibers: LookupItem[]
  manufacturers: LookupItem[]
  containers: ContainerItem[]
  onEdit: (box: AmmoBoxRead) => void
  onDelete: (box: AmmoBoxRead) => void
}

function canEdit(box: AmmoBoxRead, user: User): boolean {
  if (user.role === 'admin') return true
  if (user.role === 'member') return box.owner_id === user.id
  return false
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
  containers,
  onEdit,
  onDelete,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('caliber')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const caliberMap = useMemo(() => new Map(calibers.map((c) => [c.id, c.name])), [calibers])
  const manufacturerMap = useMemo(
    () => new Map(manufacturers.map((m) => [m.id, m.name])),
    [manufacturers],
  )
  const containerMap = useMemo(() => new Map(containers.map((c) => [c.id, c.name])), [containers])

  const sorted = useMemo(() => {
    return [...boxes].sort((a, b) => {
      let av = ''
      let bv = ''
      if (sortKey === 'caliber') {
        av = caliberMap.get(a.caliber_id) ?? ''
        bv = caliberMap.get(b.caliber_id) ?? ''
      } else if (sortKey === 'manufacturer') {
        av = manufacturerMap.get(a.manufacturer_id) ?? ''
        bv = manufacturerMap.get(b.manufacturer_id) ?? ''
      } else if (sortKey === 'product_name') {
        av = a.product_name ?? ''
        bv = b.product_name ?? ''
      } else if (sortKey === 'qty_remaining') {
        return sortDir === 'asc'
          ? a.qty_remaining - b.qty_remaining
          : b.qty_remaining - a.qty_remaining
      }
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [boxes, sortKey, sortDir, caliberMap, manufacturerMap])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
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

  const SortableHead = ({ label, col }: { label: string; col: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => toggleSort(col)}
    >
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
            <SortableHead label="Caliber" col="caliber" />
            <SortableHead label="Manufacturer" col="manufacturer" />
            <SortableHead label="Product" col="product_name" />
            <SortableHead label="Remaining" col="qty_remaining" />
            <TableHead>Original</TableHead>
            <TableHead>Shared</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((box) => {
            const isExpanded = expanded.has(box.id)
            const editable = canEdit(box, user)
            return (
              <>
                <TableRow
                  key={box.id}
                  className="cursor-pointer"
                  onClick={() => toggleExpand(box.id)}
                >
                  <TableCell className="text-gray-400">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {caliberMap.get(box.caliber_id) ?? '—'}
                  </TableCell>
                  <TableCell>{manufacturerMap.get(box.manufacturer_id) ?? '—'}</TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {box.product_name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        box.qty_remaining === 0
                          ? 'text-red-500 font-semibold'
                          : 'text-gray-900 dark:text-gray-100'
                      }
                    >
                      {box.qty_remaining}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500">{box.qty_original}</TableCell>
                  <TableCell>
                    {box.is_shared ? (
                      <Badge variant="gold">Shared</Badge>
                    ) : (
                      <span className="text-gray-400 text-xs">Private</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {editable && (
                      <div className="flex gap-1 justify-end">
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
                          className="h-7 w-7 text-gray-500 hover:text-red-600"
                          onClick={() => onDelete(box)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${box.id}-detail`} className="bg-gray-50/50 dark:bg-gray-800/20 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <TableCell />
                    <TableCell colSpan={7}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1 py-1 text-sm">
                        {box.gr_oz != null && (
                          <div>
                            <span className="text-gray-500">Weight: </span>
                            <span>
                              {box.gr_oz} {box.weight_unit ?? 'gr'}
                            </span>
                          </div>
                        )}
                        {box.cost_per_round != null && (
                          <div>
                            <span className="text-gray-500">Cost/rd: </span>
                            <span>${box.cost_per_round.toFixed(3)}</span>
                          </div>
                        )}
                        {box.purchase_date && (
                          <div>
                            <span className="text-gray-500">Purchased: </span>
                            <span>{box.purchase_date}</span>
                          </div>
                        )}
                        {box.container_id != null && (
                          <div>
                            <span className="text-gray-500">Container: </span>
                            <span>{containerMap.get(box.container_id) ?? box.container_id}</span>
                          </div>
                        )}
                        {box.notes && (
                          <div className="col-span-full">
                            <span className="text-gray-500">Notes: </span>
                            <span className="italic">{box.notes}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
