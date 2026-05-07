import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateAmmo } from '@/api/ammo'
import { toast } from '@/hooks/use-toast'
import type { AmmoBoxRead } from '@/types'

interface Props {
  box: AmmoBoxRead
  caliberName: string
  manufacturerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export default function QuickArchivePopover({
  box,
  caliberName,
  manufacturerName,
  open,
  onOpenChange,
  children,
}: Props) {
  const qc = useQueryClient()
  const isEmpty = box.qty_remaining === 0
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason(isEmpty ? 'Empty Box' : '')
      setError(null)
    }
  }, [open, isEmpty])

  const mutation = useMutation({
    mutationFn: () =>
      updateAmmo(box.id, { is_archived: true, archive_reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast({ title: 'Box archived' })
      void qc.invalidateQueries({ queryKey: ['ammo'] })
      void qc.invalidateQueries({ queryKey: ['ammo-history', box.id] })
      onOpenChange(false)
    },
    onError: () => {
      setError('Failed to archive box')
    },
  })

  function handleSubmit() {
    if (!isEmpty && !reason.trim()) {
      setError('Reason required when archiving a box with rounds remaining')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-4"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-sm text-gray-900 dark:text-white">
              Box #{box.id} — {caliberName} {manufacturerName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isEmpty ? 'Empty box, 0 rounds remaining' : `${box.qty_remaining} rounds remaining`}
            </p>
          </div>

          {!isEmpty && (
            <p className="text-xs text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20 rounded px-2 py-2 border border-amber-200 dark:border-amber-800/40">
              This box still has {box.qty_remaining} rounds remaining. Archiving removes it from
              active inventory and low-stock totals.
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reason{!isEmpty && ' *'}
            </label>
            <Input
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null) }}
              placeholder={isEmpty ? '' : 'Why are you archiving this box?'}
              className="h-8 text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7"
              disabled={mutation.isPending || (!isEmpty && !reason.trim())}
              onClick={handleSubmit}
            >
              {mutation.isPending ? 'Archiving…' : isEmpty ? 'Archive' : 'Archive Anyway'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
