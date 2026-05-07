import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Archive, ArchiveRestore, Crosshair, Pencil, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { updateAmmo } from '@/api/ammo'
import { toast } from '@/hooks/use-toast'
import QuickExpendPopover from '@/components/QuickExpendPopover'
import QuickArchivePopover from '@/components/inventory/QuickArchivePopover'
import type { AmmoBoxRead, User, LookupItem, ContainerItem } from '@/types'

interface Props {
  boxes: AmmoBoxRead[]
  user: User
  calibers: LookupItem[]
  manufacturers: LookupItem[]
  containers: ContainerItem[]
  lowSet: Set<number>
  onEdit: (box: AmmoBoxRead) => void
  onDelete: (box: AmmoBoxRead) => void
  onExpend: (box: AmmoBoxRead) => void
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

export default function InventoryCardList({
  boxes,
  user,
  calibers,
  manufacturers,
  containers,
  lowSet,
  onEdit,
  onDelete,
  onExpend,
}: Props) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [openExpendBoxId, setOpenExpendBoxId] = useState<number | null>(null)
  const [openArchiveBoxId, setOpenArchiveBoxId] = useState<number | null>(null)

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

  const caliberMap = useMemo(() => new Map(calibers.map((c) => [c.id, c.name])), [calibers])
  const manufacturerMap = useMemo(
    () => new Map(manufacturers.map((m) => [m.id, m.name])),
    [manufacturers],
  )
  const containerMap = useMemo(() => new Map(containers.map((c) => [c.id, c.name])), [containers])

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {boxes.map((box) => {
        const isExpanded = expanded.has(box.id)
        const editable = canEdit(box, user)
        const expendable = canExpend(box, user)
        const isLow = lowSet.has(box.id)
        const pct = box.qty_original > 0 ? (box.qty_remaining / box.qty_original) * 100 : 0

        return (
          <Card
            key={box.id}
            className={
              isLow
                ? 'overflow-hidden border-amber-400/60 dark:border-amber-500/40'
                : 'overflow-hidden'
            }
          >
            <CardContent className="p-0">
              <button
                className="w-full text-left px-4 pt-4 pb-3 flex items-start justify-between gap-2"
                onClick={() => toggleExpand(box.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-white truncate">
                    {caliberMap.get(box.caliber_id) ?? '—'}
                    {box.product_name && (
                      <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                        {box.product_name}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {manufacturerMap.get(box.manufacturer_id) ?? '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {expendable && box.qty_remaining > 0 && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <QuickExpendPopover
                        box={box}
                        caliberName={caliberMap.get(box.caliber_id) ?? '—'}
                        manufacturerName={manufacturerMap.get(box.manufacturer_id) ?? '—'}
                        open={openExpendBoxId === box.id}
                        onOpenChange={(o) => setOpenExpendBoxId(o ? box.id : null)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-400 hover:text-gold"
                          title="Log rounds used"
                        >
                          <Crosshair className="h-4 w-4" />
                        </Button>
                      </QuickExpendPopover>
                    </div>
                  )}
                  <div className="text-right">
                    <div
                      className={`text-lg font-bold tabular-nums ${
                        box.qty_remaining === 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {box.qty_remaining}
                    </div>
                    <div className="text-xs text-gray-400">/ {box.qty_original}</div>
                    <div className="h-1 w-14 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-1">
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
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-1.5">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {box.gr_oz != null && (
                      <>
                        <span className="text-gray-500">Weight</span>
                        <span>
                          {box.gr_oz} {box.weight_unit ?? 'gr'}
                        </span>
                      </>
                    )}
                    {box.cost_per_round != null && (
                      <>
                        <span className="text-gray-500">Cost / round</span>
                        <span>${box.cost_per_round.toFixed(3)}</span>
                      </>
                    )}
                    {box.purchase_date && (
                      <>
                        <span className="text-gray-500">Purchased</span>
                        <span>{box.purchase_date}</span>
                      </>
                    )}
                    {box.container_id != null && (
                      <>
                        <span className="text-gray-500">Container</span>
                        <span>{containerMap.get(box.container_id) ?? box.container_id}</span>
                      </>
                    )}
                    {box.is_shared && (
                      <>
                        <span className="text-gray-500">Visibility</span>
                        <Badge variant="gold" className="w-fit">
                          Shared
                        </Badge>
                      </>
                    )}
                  </div>
                  {box.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 italic pt-1">
                      {box.notes}
                    </p>
                  )}
                  {(editable || expendable) && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                      {expendable && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => onExpend(box)}
                          disabled={box.qty_remaining === 0}
                        >
                          <Crosshair className="h-3.5 w-3.5 mr-1.5" />
                          Log Use
                        </Button>
                      )}
                      {editable && (
                        <>
                          {box.is_archived ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1"
                              onClick={() => unarchiveMutation.mutate(box.id)}
                              disabled={unarchiveMutation.isPending}
                            >
                              <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                              Restore
                            </Button>
                          ) : (
                            <QuickArchivePopover
                              box={box}
                              caliberName={caliberMap.get(box.caliber_id) ?? '—'}
                              manufacturerName={manufacturerMap.get(box.manufacturer_id) ?? '—'}
                              open={openArchiveBoxId === box.id}
                              onOpenChange={(o) => setOpenArchiveBoxId(o ? box.id : null)}
                            >
                              <Button
                                variant="secondary"
                                size="sm"
                                className="flex-1"
                              >
                                <Archive className="h-3.5 w-3.5 mr-1.5" />
                                Archive
                              </Button>
                            </QuickArchivePopover>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={() => onEdit(box)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex-1"
                            onClick={() => onDelete(box)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
