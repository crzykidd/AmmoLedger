import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/date'
import { CalendarIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createFirearmLog, updateFirearmLog } from '@/api/firearms'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { firearmLabelParts } from '@/lib/firearm-label'
import type {
  FirearmEventType,
  FirearmLogCreate,
  FirearmLogRead,
  FirearmLogUpdate,
  FirearmRead,
} from '@/types'

const inputCls =
  'flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  firearm: FirearmRead
  editLog: FirearmLogRead | null
}

const EVENT_TYPES: { value: FirearmEventType; label: string }[] = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'service', label: 'Service' },
  { value: 'note', label: 'Note' },
]

export default function LogEventDialog({ open, onOpenChange, firearm, editLog }: Props) {
  const queryClient = useQueryClient()
  const isEdit = editLog != null

  const [eventType, setEventType] = useState<FirearmEventType>('cleaning')
  const [eventDate, setEventDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [roundsAtEvent, setRoundsAtEvent] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editLog) {
      setEventType(editLog.event_type)
      setEventDate(editLog.event_date)
      setRoundsAtEvent(String(editLog.rounds_at_event))
      setNotes(editLog.notes ?? '')
    } else {
      setEventType('cleaning')
      setEventDate(format(new Date(), 'yyyy-MM-dd'))
      setRoundsAtEvent(String(firearm.rounds_lifetime))
      setNotes('')
    }
    setError(null)
  }, [open, editLog, firearm.rounds_lifetime])

  const createMutation = useMutation({
    mutationFn: (data: FirearmLogCreate) => createFirearmLog(firearm.id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['firearm', firearm.id] })
      void queryClient.invalidateQueries({ queryKey: ['firearm-log', firearm.id] })
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      const titleByType: Record<FirearmEventType, string> = {
        cleaning: 'Cleaning logged. Rounds since clean reset to 0.',
        service: 'Service event logged.',
        note: 'Note added.',
      }
      toast({ title: titleByType[eventType] })
      onOpenChange(false)
    },
    onError: (e: unknown) => {
      setError((e as { detail?: string })?.detail ?? 'Failed to log event')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FirearmLogUpdate }) =>
      updateFirearmLog(firearm.id, id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['firearm', firearm.id] })
      void queryClient.invalidateQueries({ queryKey: ['firearm-log', firearm.id] })
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      toast({ title: 'Log entry updated' })
      onOpenChange(false)
    },
    onError: (e: unknown) => {
      setError((e as { detail?: string })?.detail ?? 'Failed to update log entry')
    },
  })

  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = () => {
    setError(null)
    const roundsNum = parseInt(roundsAtEvent)
    if (isNaN(roundsNum) || roundsNum < 0) {
      setError('Rounds at event must be a non-negative integer')
      return
    }
    if (!eventDate) {
      setError('Event date is required')
      return
    }
    if (isEdit) {
      const payload: FirearmLogUpdate = {
        event_type: eventType,
        event_date: eventDate,
        rounds_at_event: roundsNum,
        notes: notes.trim() || null,
      }
      updateMutation.mutate({ id: editLog!.id, data: payload })
    } else {
      const payload: FirearmLogCreate = {
        event_type: eventType,
        event_date: eventDate,
        rounds_at_event: roundsNum,
        notes: notes.trim() || null,
      }
      createMutation.mutate(payload)
    }
  }

  const dateObj = eventDate ? parseLocalDate(eventDate) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Log Entry' : 'Log Event'}</DialogTitle>
          <DialogDescription>
            {(() => {
              const { primary, contextSuffix } = firearmLabelParts(firearm)
              const label = contextSuffix ? `${primary} — ${contextSuffix}` : primary
              return isEdit
                ? `Update this event entry for ${label}.`
                : `Record a cleaning, service, or note for ${label}.`
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event type radio group */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Event Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setEventType(t.value)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                    eventType === t.value
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Event date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Event Date
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    inputCls,
                    'flex items-center justify-start gap-2',
                    !dateObj && 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  <CalendarIcon className="h-4 w-4 shrink-0" />
                  {dateObj ? format(dateObj, 'MMM d, yyyy') : 'Pick a date'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-0 w-auto">
                <Calendar
                  mode="single"
                  selected={dateObj}
                  onSelect={(d) => setEventDate(d ? format(d, 'yyyy-MM-dd') : '')}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Rounds at event */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Rounds at Event
            </label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={roundsAtEvent}
              onChange={(e) => setRoundsAtEvent(e.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Defaults to current lifetime count ({firearm.rounds_lifetime}). Edit if
              backdating to a known prior count.
            </p>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <Textarea
              rows={3}
              placeholder="Optional details about this event…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
