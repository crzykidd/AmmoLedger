import { useState, useEffect, useMemo } from 'react'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { splitAmmo, getAmmo } from '@/api/ammo'
import type { AmmoBoxRead, User, LookupItem, SplitResponse } from '@/types'

type Pane = 'form' | 'preview' | 'success' | 'review'

function computeMode(values: number[]): number {
  if (values.length === 0) return 0
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let modeVal = values[0]
  let maxCount = 0
  for (const [v, c] of counts) {
    if (c > maxCount || (c === maxCount && v < modeVal)) {
      modeVal = v
      maxCount = c
    }
  }
  return modeVal
}

interface Props {
  box: AmmoBoxRead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User
  calibers: LookupItem[]
  manufacturers: LookupItem[]
  ammoTypes: LookupItem[]
  mode?: 'split' | 'review'
  reviewChildIds?: number[]
}

export default function SplitBoxDialog({
  box,
  open,
  onOpenChange,
  calibers,
  manufacturers,
  ammoTypes,
  mode = 'split',
  reviewChildIds = [],
}: Props) {
  const qc = useQueryClient()

  const [pane, setPane] = useState<Pane>('form')
  const [splitType, setSplitType] = useState<'full' | 'partial'>('partial')
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  const [equalN, setEqualN] = useState(2)
  const [equalQtyPerBox, setEqualQtyPerBox] = useState('')
  const [childRows, setChildRows] = useState<string[]>([])
  const [apiError, setApiError] = useState<string | null>(null)
  const [result, setResult] = useState<SplitResponse | null>(null)

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

  // Reset form state when dialog opens for a (new) box
  useEffect(() => {
    if (!open || !box) return
    if (mode === 'review') {
      setPane('review')
      return
    }
    setPane('form')
    setSplitType('partial')
    setSplitMode('equal')
    const n = 2
    setEqualN(n)
    setEqualQtyPerBox('')
    const perBox = Math.floor(box.qty_remaining / n)
    setChildRows(Array.from({ length: n }, () => (perBox > 0 ? String(perBox) : '')))
    setApiError(null)
    setResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, box?.id])

  // Keep childRows in sync with equal-mode controls (N, type, qty-per-box)
  useEffect(() => {
    if (!box || splitMode !== 'equal') return
    const n = Math.max(2, equalN)
    const perBox =
      splitType === 'full'
        ? Math.floor(box.qty_remaining / n)
        : equalQtyPerBox !== ''
          ? Math.max(1, parseInt(equalQtyPerBox, 10) || 0)
          : 0
    setChildRows(Array.from({ length: n }, () => (perBox > 0 ? String(perBox) : '')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode, splitType, equalN, equalQtyPerBox, box?.qty_remaining])

  // Review mode: fetch each child box
  const childQueries = useQueries({
    queries:
      mode === 'review'
        ? reviewChildIds.map((id) => ({
            queryKey: ['ammo', id] as const,
            queryFn: () => getAmmo(id),
            enabled: open,
          }))
        : [],
  })

  const mutation = useMutation({
    mutationFn: () => {
      if (!box) throw new Error('No box selected')
      return splitAmmo(box.id, {
        split_type: splitType,
        children: childRows.map((r) => ({ qty_original: Number(r) })),
      })
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['ammo'] })
      void qc.invalidateQueries({ queryKey: ['ammo-history', box!.id] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'status'] })
      setResult(data)
      setApiError(null)
      setPane('success')
    },
    onError: (err: unknown) => {
      const e = err as { detail?: { message?: string } | string }
      const d = e?.detail
      setApiError(
        typeof d === 'object' && d?.message
          ? d.message
          : typeof d === 'string'
            ? d
            : 'Split failed. Please try again.',
      )
    },
  })

  if (!box) return null

  const caliberName = caliberMap.get(box.caliber_id) ?? '—'
  const manufacturerName = manufacturerMap.get(box.manufacturer_id) ?? '—'

  const totalAllocated = childRows
    .map((r) => Number(r))
    .filter((n) => !isNaN(n) && n > 0)
    .reduce((s, n) => s + n, 0)

  function validate(): string | null {
    if (childRows.length < 2) return 'At least 2 boxes required'
    if (childRows.some((r) => !r || Number(r) < 1 || isNaN(Number(r))))
      return 'Each box must have at least 1 round'
    if (totalAllocated > box!.qty_remaining)
      return `Total (${totalAllocated}) exceeds ${box!.qty_remaining} available rounds`
    if (splitType === 'full' && totalAllocated !== box!.qty_remaining)
      return `Full split must use exactly ${box!.qty_remaining} rounds (${totalAllocated} entered)`
    return null
  }

  const validationError = validate()
  const isFormValid = validationError === null

  const isOver = totalAllocated > box.qty_remaining
  const isFullMismatch =
    splitType === 'full' && totalAllocated > 0 && totalAllocated !== box.qty_remaining
  const isAtTarget = totalAllocated > 0 && !isOver && !isFullMismatch

  const barColor =
    isOver || isFullMismatch
      ? 'bg-red-500'
      : isAtTarget && totalAllocated === box.qty_remaining
        ? 'bg-emerald-500'
        : 'bg-amber-400'
  const totalColor =
    isOver || isFullMismatch
      ? 'text-red-600 dark:text-red-400'
      : isAtTarget && totalAllocated === box.qty_remaining
        ? 'text-emerald-600 dark:text-emerald-400'
        : totalAllocated > 0
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-gray-500 dark:text-gray-400'

  function updateRow(i: number, val: string) {
    setChildRows((prev) => prev.map((v, idx) => (idx === i ? val : v)))
  }

  function addRow() {
    setChildRows((prev) => [...prev, ''])
  }

  function removeRow(i: number) {
    if (childRows.length <= 2) return
    setChildRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  // Shared segmented-control button classes
  const segBase =
    'flex-1 px-3 py-2 text-sm font-medium rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-gold'
  const segActive =
    'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
  const segInactive =
    'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'

  // ── Pane: Form ─────────────────────────────────────────────────────────────

  function renderFormPane() {
    const autoHint = Math.floor(box!.qty_remaining / Math.max(2, equalN))
    return (
      <div className="space-y-5">
        {/* Split type */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Split Type
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className={cn(segBase, splitType === 'partial' ? segActive : segInactive)}
              onClick={() => setSplitType('partial')}
            >
              Partial
            </button>
            <button
              type="button"
              className={cn(segBase, splitType === 'full' ? segActive : segInactive)}
              onClick={() => setSplitType('full')}
            >
              Full
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            {splitType === 'partial'
              ? 'Split off some boxes; keep the rest in this box'
              : 'Split everything into new boxes; archive this box'}
          </p>
        </div>

        {/* Mode */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Mode
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className={cn(segBase, splitMode === 'equal' ? segActive : segInactive)}
              onClick={() => setSplitMode('equal')}
            >
              Equal Split
            </button>
            <button
              type="button"
              className={cn(segBase, splitMode === 'custom' ? segActive : segInactive)}
              onClick={() => {
                setSplitMode('custom')
                setChildRows(['', ''])
              }}
            >
              Custom Split
            </button>
          </div>
        </div>

        {/* Equal-mode controls */}
        {splitMode === 'equal' && (
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Number of boxes
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-8 w-8 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center font-medium"
                  onClick={() => setEqualN((n) => Math.max(2, n - 1))}
                >
                  −
                </button>
                <Input
                  type="number"
                  min={2}
                  value={equalN}
                  onChange={(e) => setEqualN(Math.max(2, parseInt(e.target.value, 10) || 2))}
                  className="h-8 text-sm w-16 text-center"
                />
                <button
                  type="button"
                  className="h-8 w-8 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center font-medium"
                  onClick={() => setEqualN((n) => n + 1)}
                >
                  +
                </button>
              </div>
            </div>
            {splitType === 'partial' && (
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rounds per box
                </label>
                <Input
                  type="number"
                  min={1}
                  value={equalQtyPerBox}
                  onChange={(e) => setEqualQtyPerBox(e.target.value)}
                  placeholder={autoHint > 0 ? `e.g. ${autoHint}` : 'Rounds'}
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* Child rows */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Boxes to Create
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {childRows.map((val, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 dark:text-gray-500 w-5 shrink-0 text-right">
                  {i + 1}
                </span>
                <Input
                  type="number"
                  min={1}
                  value={val}
                  onChange={(e) => updateRow(i, e.target.value)}
                  placeholder="Rounds"
                  className="h-8 text-sm flex-1"
                />
                {splitMode === 'custom' && childRows.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="h-7 w-7 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center shrink-0 text-base leading-none"
                    title="Remove row"
                  >
                    −
                  </button>
                )}
              </div>
            ))}
          </div>
          {splitMode === 'custom' && (
            <button
              type="button"
              onClick={addRow}
              className="mt-2 text-xs text-gold hover:text-gold/80 font-medium"
            >
              + Add another box
            </button>
          )}
        </div>

        {/* Running total bar */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
            <span className={cn('text-sm font-medium', totalColor)}>
              {totalAllocated} / {box!.qty_remaining} rounds allocated
              {splitType === 'full' && ` (must equal ${box!.qty_remaining})`}
            </span>
            {splitType === 'partial' &&
              totalAllocated > 0 &&
              totalAllocated <= box!.qty_remaining && (
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  {box!.qty_remaining - totalAllocated} will remain
                </span>
              )}
          </div>
          <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', barColor)}
              style={{
                width: `${Math.min((totalAllocated / box!.qty_remaining) * 100, 100)}%`,
              }}
            />
          </div>
          {!isFormValid && totalAllocated > 0 && (
            <p className="text-xs text-red-500 mt-1.5">{validationError}</p>
          )}
        </div>
      </div>
    )
  }

  // ── Pane: Preview ──────────────────────────────────────────────────────────

  function renderPreviewPane() {
    const nums = childRows.map((r) => Number(r))
    const modeQty = computeMode(nums.filter((n) => n > 0))

    return (
      <div className="space-y-3">
        <div className="space-y-2">
          {nums.map((qty, i) => {
            const isOdd = nums.length > 1 && qty !== modeQty
            return (
              <div
                key={i}
                className={cn(
                  'rounded-lg border p-2.5',
                  isOdd
                    ? 'border-amber-200 dark:border-amber-700/50 bg-amber-50/40 dark:bg-amber-950/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Box {i + 1}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {caliberName} · {manufacturerName}
                      {box!.product_name ? ` · ${box!.product_name}` : ''}
                      {box!.gr_oz != null
                        ? ` · ${box!.gr_oz}${box!.weight_unit ?? 'gr'}`
                        : ''}
                      {box!.type_id != null ? ` · ${typeMap.get(box!.type_id) ?? '—'}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                      {qty}
                    </span>
                    <span className="text-xs text-gray-400 ml-0.5">rds</span>
                  </div>
                </div>
                {isOdd && (
                  <div className="flex items-start gap-1 mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      This box has {qty} rounds. Most boxes in this split have {modeQty} rounds —
                      label this one differently.
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
          Total: {nums.length} boxes, {totalAllocated} rounds →{' '}
          {splitType === 'full' ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              parent will be archived
            </span>
          ) : (
            <span className="font-medium text-gray-900 dark:text-gray-100">
              parent reduced to {box!.qty_remaining - totalAllocated} rounds
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Labeling view (shared by success + review panes) ──────────────────────

  function renderLabelingView(parent: AmmoBoxRead, children: AmmoBoxRead[]) {
    const childQtys = children.map((c) => c.qty_original)
    const modeQty = computeMode(childQtys)
    const anyOdd = children.length > 1 && children.some((c) => c.qty_original !== modeQty)

    return (
      <div className="space-y-4">
        {/* Parent status */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Box #{parent.id} — {caliberName} {manufacturerName}
          </p>
          {parent.is_archived ? (
            <Badge
              variant="outline"
              className="text-amber-600 dark:text-amber-400 border-amber-400 dark:border-amber-600 shrink-0"
            >
              Archived (full split)
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-emerald-600 dark:text-emerald-400 border-emerald-400 dark:border-emerald-600 shrink-0"
            >
              Active — {parent.qty_remaining} rounds remaining
            </Badge>
          )}
        </div>

        {/* Children labeling grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {children.map((child) => {
            const isOdd = children.length > 1 && child.qty_original !== modeQty
            return (
              <div
                key={child.id}
                className={cn(
                  'rounded-lg border p-3',
                  isOdd
                    ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-950/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isOdd && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                        #{child.id}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                      {caliberName} · {manufacturerName}
                      {child.product_name ? ` · ${child.product_name}` : ''}
                      {child.gr_oz != null
                        ? ` · ${child.gr_oz}${child.weight_unit ?? 'gr'}`
                        : ''}
                      {child.type_id != null ? ` · ${typeMap.get(child.type_id) ?? '—'}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        'text-2xl font-bold tabular-nums',
                        isOdd
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-gray-900 dark:text-white',
                      )}
                    >
                      {child.qty_original}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">rounds</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {anyOdd && (
          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Highlighted boxes have an unusual round count for this split — label them differently
            from the rest.
          </p>
        )}
      </div>
    )
  }

  // ── Pane: Review ───────────────────────────────────────────────────────────

  function renderReviewPane() {
    const isLoading = childQueries.some((q) => q.isLoading)
    const children = childQueries
      .map((q) => q.data)
      .filter((d): d is AmmoBoxRead => d != null)

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Loading boxes…</span>
        </div>
      )
    }

    if (children.length === 0) {
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No child boxes found.</p>
      )
    }

    return renderLabelingView(box!, children)
  }

  // ── Dialog header values ───────────────────────────────────────────────────

  let dialogTitle: React.ReactNode
  let dialogDesc: string | null = null

  if (pane === 'review') {
    dialogTitle = `Split from #${box.id} — ${reviewChildIds.length} boxes`
  } else if (pane === 'success' && result) {
    dialogTitle = (
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        Split complete — {result.children.length} boxes created
      </span>
    )
  } else if (pane === 'preview') {
    dialogTitle = `Split Box #${box.id} — ${caliberName} ${manufacturerName}`
    dialogDesc = `Preview — ${childRows.length} new ${childRows.length === 1 ? 'box' : 'boxes'} will be created`
  } else {
    dialogTitle = `Split Box #${box.id} — ${caliberName} ${manufacturerName}`
    dialogDesc = `${box.qty_remaining} rounds remaining`
  }

  // ── Footer ─────────────────────────────────────────────────────────────────

  function renderFooter() {
    if (pane === 'form') {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setApiError(null)
              setPane('preview')
            }}
            disabled={!isFormValid}
          >
            Preview →
          </Button>
        </DialogFooter>
      )
    }
    if (pane === 'preview') {
      return (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setApiError(null)
              setPane('form')
            }}
            disabled={mutation.isPending}
          >
            ← Back
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Splitting…
              </>
            ) : (
              'Confirm Split'
            )}
          </Button>
        </DialogFooter>
      )
    }
    return (
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>
          {pane === 'review' ? 'Close' : 'Done'}
        </Button>
      </DialogFooter>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{dialogTitle}</DialogTitle>
          {dialogDesc && <DialogDescription>{dialogDesc}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 py-1">
          {pane === 'form' && renderFormPane()}
          {pane === 'preview' && renderPreviewPane()}
          {pane === 'success' && result && renderLabelingView(result.parent, result.children)}
          {pane === 'review' && renderReviewPane()}
        </div>

        {pane === 'preview' && apiError && (
          <Alert variant="destructive" className="shrink-0 mt-2">
            <AlertDescription>{apiError}</AlertDescription>
          </Alert>
        )}

        <div className="shrink-0">{renderFooter()}</div>
      </DialogContent>
    </Dialog>
  )
}
