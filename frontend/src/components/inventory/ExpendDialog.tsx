import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, parseISO } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarIcon } from 'lucide-react'
import { updateAmmo } from '@/api/ammo'
import { toast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { AmmoBoxRead, LookupItem } from '@/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  rounds_used: z.number().int().min(1, 'Must be at least 1'),
  date_used: z.string(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputCls =
  'flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  box: AmmoBoxRead | null
  calibers: LookupItem[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExpendDialog({ open, onOpenChange, box, calibers }: Props) {
  const queryClient = useQueryClient()

  const caliberName = box ? (calibers.find((c) => c.id === box.caliber_id)?.name ?? '') : ''
  const itemLabel = box
    ? [box.product_name, caliberName].filter(Boolean).join(' · ')
    : ''

  const pct = box && box.qty_original > 0
    ? Math.round((box.qty_remaining / box.qty_original) * 100)
    : 0

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      rounds_used: 1,
      date_used: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        rounds_used: 1,
        date_used: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
      })
    }
  }, [open, reset])

  const roundsUsed = watch('rounds_used')

  const mutation = useMutation({
    mutationFn: (newQty: number) =>
      updateAmmo(box!.id, { qty_remaining: newQty }),
    onSuccess: (_, newQty) => {
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      const used = box!.qty_remaining - newQty
      toast({ title: `Logged ${used} round${used !== 1 ? 's' : ''} used` })
      onOpenChange(false)
    },
    onError: () => {
      toast({ title: 'Failed to log use', variant: 'destructive' })
    },
  })

  const onSubmit = (values: FormValues) => {
    if (!box) return
    if (values.rounds_used > box.qty_remaining) {
      setError('rounds_used', {
        message: `Only ${box.qty_remaining} round${box.qty_remaining !== 1 ? 's' : ''} remaining`,
      })
      return
    }
    const newQty = box.qty_remaining - values.rounds_used
    mutation.mutate(newQty)
  }

  const newQty = box ? Math.max(0, box.qty_remaining - (roundsUsed || 0)) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Range Use</DialogTitle>
          {box && (
            <DialogDescription asChild>
              <div className="space-y-2 mt-1">
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  {itemLabel || `Box #${box.id}`}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {box.qty_remaining} of {box.qty_original} rounds remaining
                </p>
                {/* Stock progress bar */}
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      pct > 50 ? 'bg-gold' : pct > 20 ? 'bg-amber-500' : 'bg-red-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        <form id="expend-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Rounds used */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Rounds Used *
            </label>
            <input
              {...register('rounds_used', { valueAsNumber: true })}
              type="number"
              min={1}
              max={box?.qty_remaining ?? undefined}
              className={inputCls}
              autoFocus
            />
            {errors.rounds_used ? (
              <p className="text-xs text-red-500">{errors.rounds_used.message}</p>
            ) : (
              box && (
                <p className="text-xs text-gray-400">
                  {box.qty_remaining} round{box.qty_remaining !== 1 ? 's' : ''} remaining
                  {roundsUsed > 0 && roundsUsed <= box.qty_remaining && (
                    <> → <span className="text-gray-600 dark:text-gray-300">{newQty} after</span></>
                  )}
                </p>
              )
            )}
          </div>

          {/* Date used */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Date Used
            </label>
            <Controller
              name="date_used"
              control={control}
              render={({ field }) => {
                const date = field.value ? parseISO(field.value) : undefined
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          inputCls,
                          'flex items-center justify-start gap-2',
                          !date && 'text-gray-400 dark:text-gray-500',
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        {date ? format(date, 'MMM d, yyyy') : 'Pick a date'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0 w-auto">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(d) => field.onChange(d ? format(d, 'yyyy-MM-dd') : '')}
                      />
                    </PopoverContent>
                  </Popover>
                )
              }}
            />
            <p className="text-xs text-gray-400">For your records — not stored separately</p>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <Textarea
              {...register('notes')}
              placeholder="Range session notes… (optional)"
              rows={2}
            />
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500">Failed to save. Please try again.</p>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="expend-form"
            disabled={mutation.isPending || isSubmitting}
          >
            {mutation.isPending ? 'Saving…' : 'Log Use'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
