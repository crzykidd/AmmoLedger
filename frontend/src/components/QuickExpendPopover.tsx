import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { expendAmmo } from '@/api/ammo'
import { listFirearms } from '@/api/firearms'
import {
  addRangeSessionLine,
  createRangeSession,
  listRangeSessions,
} from '@/api/rangeSessions'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { firearmLabel, firearmLabelForToast } from '@/lib/firearm-label'
import type { AmmoBoxRead, FirearmRead, RangeSessionListItem } from '@/types'

const STATIC_PRESETS = [50, 30, 20, 10, 1]

type SessionAttribution = 'none' | 'new' | 'last'

function readStoredAttribution(): SessionAttribution {
  const stored = sessionStorage.getItem('at_range_attribution')
  return stored === 'new' || stored === 'last' ? stored : 'none'
}

function readStoredFirearmId(): number | null {
  const stored = sessionStorage.getItem('at_range_last_firearm_id')
  if (!stored) return null
  const n = parseInt(stored, 10)
  return Number.isFinite(n) ? n : null
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

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
  const { user } = useAuth()
  const [rounds, setRounds] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attribution, setAttribution] = useState<SessionAttribution>(readStoredAttribution)
  const [firearmId, setFirearmId] = useState<number | null>(readStoredFirearmId)

  const recents = useMemo<number[]>(() => {
    if (!open) return []
    try {
      const v = JSON.parse(sessionStorage.getItem('quick_expend_recent_counts') || '[]')
      return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : []
    } catch {
      return []
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setNotes(sessionStorage.getItem('quick_expend_last_notes') ?? '')
    setRounds('')
    setError(null)

    // Date-rollover check — clear yesterday's session linkage but keep
    // firearm + attribution preferences across days.
    const today = todayIso()
    const storedDate = sessionStorage.getItem('at_range_last_session_date')
    if (storedDate !== today) {
      sessionStorage.removeItem('at_range_last_session_id')
      sessionStorage.removeItem('at_range_last_session_date')
    }
  }, [open])

  // Discover today's most-recent session owned by the current user.
  const { data: todaysSessions } = useQuery({
    queryKey: ['at-range-todays-sessions'],
    queryFn: () => listRangeSessions({ after: todayIso(), limit: 10 }),
    enabled: open,
    staleTime: 30 * 1000,
  })

  const lastSession = useMemo<RangeSessionListItem | null>(() => {
    if (!todaysSessions || !user) return null
    const mine = todaysSessions.filter((s) => s.owner_id === user.id)
    return mine.length > 0 ? mine[0] : null
  }, [todaysSessions, user])

  // If the user's persisted attribution is 'last' but no last session exists
  // today, degrade to 'new' so the UI stays coherent.
  useEffect(() => {
    if (!open) return
    if (attribution === 'last' && todaysSessions !== undefined && !lastSession) {
      setAttribution('new')
    }
  }, [open, attribution, todaysSessions, lastSession])

  // Persist attribution choice; clear firearm when going back to None.
  useEffect(() => {
    if (attribution === 'none') {
      sessionStorage.removeItem('at_range_attribution')
      setFirearmId(null)
    } else {
      sessionStorage.setItem('at_range_attribution', attribution)
    }
  }, [attribution])

  useEffect(() => {
    if (firearmId != null) {
      sessionStorage.setItem('at_range_last_firearm_id', String(firearmId))
    } else {
      sessionStorage.removeItem('at_range_last_firearm_id')
    }
  }, [firearmId])

  // Firearm list — only fetched when attribution requires one.
  const { data: firearmsList } = useQuery({
    queryKey: ['firearms'],
    queryFn: () => listFirearms(),
    enabled: open && attribution !== 'none',
    staleTime: 5 * 60 * 1000,
  })

  const firearmsByCaliber = useMemo<{ match: FirearmRead[]; other: FirearmRead[] }>(() => {
    if (!firearmsList) return { match: [], other: [] }
    const match = firearmsList.filter((f) => f.caliber_id === box.caliber_id)
    const other = firearmsList.filter((f) => f.caliber_id !== box.caliber_id)
    return { match, other }
  }, [firearmsList, box.caliber_id])

  const selectedFirearm = useMemo<FirearmRead | null>(() => {
    if (firearmId == null || !firearmsList) return null
    return firearmsList.find((f) => f.id === firearmId) ?? null
  }, [firearmId, firearmsList])

  function reset() {
    setRounds('')
    setNotes('')
    setError(null)
    // Intentionally preserve attribution + firearmId so a box-by-box range
    // workflow doesn't have to re-pick the gun every time.
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const n = Number(rounds)
      const today = todayIso()
      const note = notes || null

      if (attribution === 'none') {
        const result = await expendAmmo(box.id, {
          rounds_used: n,
          date: today,
          notes: note,
        })
        return {
          kind: 'expend' as const,
          result,
          sessionId: null as number | null,
          firearmId: null as number | null,
        }
      }

      if (attribution === 'new') {
        const session = await createRangeSession({
          is_shared: false,
          date: today,
          location_name: null,
          notes: null,
          lines: [
            {
              firearm_id: firearmId,
              ammo_box_id: box.id,
              rounds_fired: n,
              notes: note,
            },
          ],
        })
        return {
          kind: 'new_session' as const,
          session,
          sessionId: session.id,
          firearmId,
        }
      }

      // attribution === 'last' — lastSession guaranteed by handleSubmit guard
      const line = await addRangeSessionLine(lastSession!.id, {
        firearm_id: firearmId,
        ammo_box_id: box.id,
        rounds_fired: n,
        notes: note,
      })
      return {
        kind: 'last_session' as const,
        line,
        sessionId: lastSession!.id,
        firearmId,
      }
    },

    onSuccess: (result) => {
      sessionStorage.setItem('quick_expend_last_notes', notes)
      const n = Number(rounds)
      try {
        const prior: number[] = JSON.parse(
          sessionStorage.getItem('quick_expend_recent_counts') || '[]',
        )
        const filtered = Array.isArray(prior)
          ? prior.filter((x) => typeof x === 'number' && x !== n)
          : []
        sessionStorage.setItem(
          'quick_expend_recent_counts',
          JSON.stringify([n, ...filtered].slice(0, 5)),
        )
      } catch {
        sessionStorage.setItem('quick_expend_recent_counts', JSON.stringify([n]))
      }

      if (result.kind === 'new_session' || result.kind === 'last_session') {
        sessionStorage.setItem('at_range_last_session_id', String(result.sessionId))
        sessionStorage.setItem('at_range_last_session_date', todayIso())
        void qc.invalidateQueries({ queryKey: ['at-range-todays-sessions'] })
        void qc.invalidateQueries({ queryKey: ['range-sessions'] })
      }

      const firearm =
        result.firearmId != null
          ? firearmsList?.find((f) => f.id === result.firearmId)
          : null
      const firearmDesc = firearm
        ? ` through ${firearmLabelForToast(firearm)}`
        : ''

      if (result.kind === 'expend') {
        toast({ title: `Logged ${rounds} rounds for ${caliberName}` })
      } else if (result.kind === 'new_session') {
        toast({
          title: `Logged ${rounds} rounds in new session #${result.sessionId}${firearmDesc}`,
        })
      } else {
        toast({
          title: `Logged ${rounds} rounds in session #${result.sessionId}${firearmDesc}`,
        })
      }

      void qc.invalidateQueries({ queryKey: ['ammo'] })
      void qc.invalidateQueries({ queryKey: ['ammo-history', box.id] })
      if (result.firearmId != null) {
        void qc.invalidateQueries({ queryKey: ['firearms'] })
        void qc.invalidateQueries({ queryKey: ['firearm', result.firearmId] })
      }

      reset()
      onOpenChange(false)
    },

    onError: (err: unknown) => {
      const e = err as { detail?: { message?: string } | string }
      const d = e?.detail
      setError(
        typeof d === 'object' && d?.message
          ? d.message
          : typeof d === 'string'
            ? d
            : 'Failed to log rounds',
      )
    },
  })

  function handleSubmit() {
    const n = Number(rounds)
    if (!n || n < 1 || n > box.qty_remaining) {
      setError(`Enter a number between 1 and ${box.qty_remaining}`)
      return
    }
    if (attribution !== 'none' && firearmId == null) {
      setError('Select a firearm or change session to None')
      return
    }
    if (attribution === 'last' && !lastSession) {
      setError('No active session today. Pick None or New session.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  const showFirearmMismatch =
    selectedFirearm != null && selectedFirearm.caliber_id !== box.caliber_id

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

          {(() => {
            const visibleStatic = STATIC_PRESETS.filter((n) => n < box.qty_remaining)
            const visibleRecents = recents
              .filter((n) => n < box.qty_remaining && !STATIC_PRESETS.includes(n))
              .slice(0, 2)
            return (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { setRounds(String(box.qty_remaining)); setError(null) }}
                >
                  Shot All
                </Button>
                {visibleStatic.map((n) => (
                  <Button
                    key={`s-${n}`}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => { setRounds(String(n)); setError(null) }}
                  >
                    {n}
                  </Button>
                ))}
                {visibleRecents.map((n) => (
                  <Button
                    key={`r-${n}`}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => { setRounds(String(n)); setError(null) }}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            )
          })()}

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

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Range session
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAttribution('none')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md border transition-colors',
                  attribution === 'none'
                    ? 'bg-gold/10 border-gold/40 text-gold'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                )}
              >
                None
              </button>
              <button
                type="button"
                onClick={() => setAttribution('new')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md border transition-colors',
                  attribution === 'new'
                    ? 'bg-gold/10 border-gold/40 text-gold'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                )}
              >
                New session
              </button>
              {lastSession && (
                <button
                  type="button"
                  onClick={() => setAttribution('last')}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md border transition-colors',
                    attribution === 'last'
                      ? 'bg-gold/10 border-gold/40 text-gold'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                  )}
                  title={`Session #${lastSession.id} · ${lastSession.line_count} line${lastSession.line_count === 1 ? '' : 's'} · ${lastSession.total_rounds} rounds`}
                >
                  Last (#{lastSession.id})
                </button>
              )}
            </div>
          </div>

          {attribution !== 'none' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Firearm
              </label>
              <select
                value={firearmId ?? ''}
                onChange={(e) =>
                  setFirearmId(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                className="w-full h-8 px-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">Select firearm…</option>
                {firearmsByCaliber.match.length > 0 && (
                  <optgroup label="Caliber match">
                    {firearmsByCaliber.match.map((f) => (
                      <option key={f.id} value={f.id}>
                        {firearmLabel(f)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {firearmsByCaliber.other.length > 0 && (
                  <optgroup label="Other calibers">
                    {firearmsByCaliber.other.map((f) => (
                      <option key={f.id} value={f.id}>
                        {firearmLabel(f)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {showFirearmMismatch && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                  Caliber mismatch: firearm is {selectedFirearm!.caliber_name ?? 'unknown'},
                  box is {caliberName}.
                </p>
              )}
            </div>
          )}

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
