import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { expendAmmo } from '@/api/ammo'
import { toast } from '@/hooks/use-toast'
import type { AmmoBoxRead } from '@/types'

const PRESETS = [50, 25, 10, 5]

interface Props {
  box: AmmoBoxRead
  caliberName: string
  manufacturerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export default function QuickExpendPopover({
  box,
  caliberName,
  manufacturerName,
  open,
  onOpenChange,
  children,
}: Props) {
  const qc = useQueryClient()
  const [rounds, setRounds] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setRounds('')
    setNotes('')
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: () =>
      expendAmmo(box.id, {
        rounds_used: Number(rounds),
        date: new Date().toISOString().slice(0, 10),
        notes: notes || null,
      }),
    onSuccess: () => {
      toast({ title: `Logged ${rounds} rounds for ${caliberName}` })
      void qc.invalidateQueries({ queryKey: ['ammo'] })
      void qc.invalidateQueries({ queryKey: ['ammo-history', box.id] })
      reset()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      const e = err as { detail?: { message?: string } | string }
      const d = e?.detail
      setError(typeof d === 'object' && d?.message ? d.message : 'Failed to log rounds')
    },
  })

  function handleSubmit() {
    const n = Number(rounds)
    if (!n || n < 1 || n > box.qty_remaining) {
      setError(`Enter a number between 1 and ${box.qty_remaining}`)
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Popover open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
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
              {box.qty_remaining} rounds remaining
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setRounds(String(box.qty_remaining)); setError(null) }}
            >
              Shot All
            </Button>
            {PRESETS.filter((n) => n < box.qty_remaining).map((n) => (
              <Button
                key={n}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setRounds(String(n)); setError(null) }}
              >
                Shot {n}
              </Button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rounds used
            </label>
            <Input
              type="number"
              min={1}
              max={box.qty_remaining}
              value={rounds}
              onChange={(e) => { setRounds(e.target.value); setError(null) }}
              placeholder={`1–${box.qty_remaining}`}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes (optional)
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Range session, practice…"
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
              onClick={() => { reset(); onOpenChange(false) }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7"
              disabled={!rounds || mutation.isPending}
              onClick={handleSubmit}
            >
              {mutation.isPending ? 'Logging…' : 'Log Usage'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
