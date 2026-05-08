import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SplitParentRead } from '@/types'

interface Props {
  parent: SplitParentRead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function SplitParentDetailsDialog({ parent, open, onOpenChange }: Props) {
  if (!parent) return null

  const title = [
    `Box #${parent.id}`,
    '—',
    parent.caliber_name,
    parent.manufacturer_name,
    parent.product_name ? `· ${parent.product_name}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="leading-snug">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {parent.is_archived && (
              <Badge
                variant="outline"
                className="text-gray-500 dark:text-gray-400 border-gray-400 dark:border-gray-600"
              >
                Archived{parent.archive_reason ? ` (${parent.archive_reason})` : ''}
              </Badge>
            )}
            {parent.qty_remaining === 0 && (
              <Badge
                variant="outline"
                className="text-red-500 dark:text-red-400 border-red-400 dark:border-red-600"
              >
                Empty
              </Badge>
            )}
            {!parent.is_archived && parent.qty_remaining > 0 && (
              <Badge
                variant="outline"
                className="text-emerald-600 dark:text-emerald-400 border-emerald-400 dark:border-emerald-600"
              >
                Active
              </Badge>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Original: </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {parent.qty_original.toLocaleString()} rounds
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Remaining: </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {parent.qty_remaining.toLocaleString()} rounds
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Purchased: </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {parent.purchase_date ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Last updated: </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {parent.updated_at.slice(0, 10)}
              </span>
            </div>
          </div>

          {/* Notes block */}
          {parent.notes === null ? (
            <p className="text-sm italic text-gray-400 dark:text-gray-500">
              Notes not visible — this box is private to another user.
            </p>
          ) : parent.notes ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                Notes
              </p>
              <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                {parent.notes}
              </pre>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
