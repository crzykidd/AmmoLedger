import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  CalendarIcon,
  Check,
  Plus,
  Search,
  StickyNote,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { listAmmo } from '@/api/ammo'
import { listFirearms } from '@/api/firearms'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import {
  addRangeSessionLine,
  createRangeSession,
  deleteRangeSessionLine,
  updateRangeSession,
  updateRangeSessionLine,
} from '@/api/rangeSessions'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type {
  AmmoBoxRead,
  FirearmRead,
  RangeSessionCreate,
  RangeSessionLineCreate,
  RangeSessionLineUpdate,
  RangeSessionRead,
  RangeSessionUpdate,
} from '@/types'

const inputCls =
  'flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const NONE = '__none__'

// Stable client-side ID generator for line rows
let _uidCounter = 0
const newUid = () => `line_${++_uidCounter}_${Date.now()}`

interface LineState {
  uid: string
  id: number | null            // server id; null for new lines
  firearm_id: number | null
  ammo_box_id: number | null
  rounds_fired: string         // string for input control
  notes: string
}

function makeEmptyLine(): LineState {
  return {
    uid: newUid(),
    id: null,
    firearm_id: null,
    ammo_box_id: null,
    rounds_fired: '',
    notes: '',
  }
}

function lineEquals(a: LineState, b: LineState): boolean {
  return (
    a.firearm_id === b.firearm_id &&
    a.ammo_box_id === b.ammo_box_id &&
    a.rounds_fired === b.rounds_fired &&
    (a.notes ?? '') === (b.notes ?? '')
  )
}

function buildLineFromSession(session: RangeSessionRead): LineState[] {
  return session.lines.map((ln) => ({
    uid: newUid(),
    id: ln.id,
    firearm_id: ln.firearm_id,
    ammo_box_id: ln.ammo_box_id,
    rounds_fired: String(ln.rounds_fired),
    notes: ln.notes ?? '',
  }))
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, dialog opens in edit mode populated from this session. */
  editSession?: RangeSessionRead | null
  /** Optional pre-selected firearm for the first line in create mode. */
  defaultFirearmId?: number | null
}

export default function LogRangeDayDialog({
  open,
  onOpenChange,
  editSession = null,
  defaultFirearmId = null,
}: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isEdit = editSession != null

  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [locationName, setLocationName] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [lines, setLines] = useState<LineState[]>([makeEmptyLine()])
  const [originalHeader, setOriginalHeader] = useState({
    date: '',
    locationName: '',
    sessionNotes: '',
    isShared: false,
  })
  const [originalLines, setOriginalLines] = useState<LineState[]>([])

  const [error, setError] = useState<string | null>(null)
  const [highlightedLineUids, setHighlightedLineUids] = useState<Set<string>>(new Set())
  const [progressMsg, setProgressMsg] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Lookups
  const lookups = useInventoryLookups()
  const caliberMap = useMemo(
    () => new Map(lookups.calibers.map((c) => [c.id, c.name])),
    [lookups.calibers],
  )
  const manufacturerMap = useMemo(
    () => new Map(lookups.manufacturers.map((m) => [m.id, m.name])),
    [lookups.manufacturers],
  )
  const { data: firearms = [] } = useQuery({
    queryKey: ['firearms'],
    queryFn: () => listFirearms(),
    staleTime: 60_000,
    enabled: open,
  })
  const { data: ammoData } = useQuery({
    queryKey: ['ammo', { show_empty: false, show_archived: false }],
    queryFn: () => listAmmo({ show_empty: false, show_archived: false }),
    enabled: open,
  })
  const allBoxes = useMemo<AmmoBoxRead[]>(() => ammoData?.boxes ?? [], [ammoData])
  const boxById = useMemo(() => {
    const m = new Map<number, AmmoBoxRead>()
    allBoxes.forEach((b) => m.set(b.id, b))
    // Also include any box currently referenced in lines that may be
    // archived/empty (so the picker can still show "Box #N — gone").
    if (editSession) {
      editSession.lines.forEach((ln) => {
        if (ln.ammo_box_id != null && !m.has(ln.ammo_box_id)) {
          // We can't fetch it on demand here; leave it absent and the row
          // will show whatever ammo_box_display the server gave us.
        }
      })
    }
    return m
  }, [allBoxes, editSession])
  const firearmById = useMemo(() => {
    const m = new Map<number, FirearmRead>()
    firearms.forEach((f) => m.set(f.id, f))
    return m
  }, [firearms])

  // Reset / populate on open
  useEffect(() => {
    if (!open) return
    if (editSession) {
      setDate(editSession.date)
      setLocationName(editSession.location_name ?? '')
      setSessionNotes(editSession.notes ?? '')
      setIsShared(editSession.is_shared)
      const built = buildLineFromSession(editSession)
      setLines(built)
      setOriginalHeader({
        date: editSession.date,
        locationName: editSession.location_name ?? '',
        sessionNotes: editSession.notes ?? '',
        isShared: editSession.is_shared,
      })
      // Snapshot for diff — clone field values, but preserve the same uid
      // so user-side edits track back to the original by uid.
      setOriginalLines(built.map((l) => ({ ...l })))
    } else {
      const today = format(new Date(), 'yyyy-MM-dd')
      const first: LineState = { ...makeEmptyLine(), firearm_id: defaultFirearmId }
      setDate(today)
      setLocationName('')
      setSessionNotes('')
      setIsShared(false)
      setLines([first])
      setOriginalHeader({
        date: today,
        locationName: '',
        sessionNotes: '',
        isShared: false,
      })
      setOriginalLines([])
    }
    setError(null)
    setHighlightedLineUids(new Set())
    setProgressMsg(null)
  }, [open, editSession, defaultFirearmId])

  // Location autocomplete suggestions — distinct prior locations from cache
  const locationSuggestions = useMemo<string[]>(() => {
    const sessions = (queryClient.getQueryData(['range-sessions']) ?? []) as
      | { location_name: string | null }[]
      | undefined
    if (!Array.isArray(sessions)) return []
    const set = new Set<string>()
    sessions.forEach((s) => {
      if (s.location_name && s.location_name.trim()) set.add(s.location_name.trim())
    })
    return Array.from(set).sort()
  }, [queryClient])

  const dateObj = date ? parseISO(date) : undefined

  // ---------------------------------------------------------------------------
  // Line manipulation
  // ---------------------------------------------------------------------------
  const updateLine = (uid: string, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  }
  const removeLine = (uid: string) => {
    setLines((prev) => prev.filter((l) => l.uid !== uid))
  }
  const addLine = () => {
    setLines((prev) => [...prev, makeEmptyLine()])
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function lineErrors(l: LineState): string[] {
    const errs: string[] = []
    if (l.firearm_id == null && l.ammo_box_id == null) {
      errs.push('Each line needs a firearm or an ammo box')
    }
    const r = parseInt(l.rounds_fired)
    if (!l.rounds_fired || isNaN(r) || r < 0) {
      errs.push('Rounds fired must be 0 or more')
    } else if (l.ammo_box_id != null) {
      const b = boxById.get(l.ammo_box_id)
      if (b) {
        // In edit mode the box's qty_remaining already reflects this line's
        // existing draw. Add back the original draw before comparing so the
        // user can keep an existing value without "exceeds remaining" errors.
        let cap = b.qty_remaining
        const orig = originalLines.find((o) => o.id === l.id && l.id != null)
        if (orig && orig.ammo_box_id === l.ammo_box_id) {
          const origR = parseInt(orig.rounds_fired)
          if (!isNaN(origR)) cap += origR
        }
        if (r > cap) {
          errs.push(`Only ${cap} rounds remaining in box`)
        }
      }
    }
    return errs
  }

  const lineErrorMap = useMemo(() => {
    const m = new Map<string, string[]>()
    lines.forEach((l) => {
      const errs = lineErrors(l)
      if (errs.length) m.set(l.uid, errs)
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, boxById, originalLines])

  const calMismatchUids = useMemo(() => {
    const out = new Set<string>()
    lines.forEach((l) => {
      if (l.firearm_id != null && l.ammo_box_id != null) {
        const f = firearmById.get(l.firearm_id)
        const b = boxById.get(l.ammo_box_id)
        if (f && b && f.caliber_id !== b.caliber_id) out.add(l.uid)
      }
    })
    return out
  }, [lines, firearmById, boxById])

  const sessionValid =
    !!date &&
    lines.length > 0 &&
    lineErrorMap.size === 0

  const headerDirty =
    date !== originalHeader.date ||
    locationName !== originalHeader.locationName ||
    sessionNotes !== originalHeader.sessionNotes ||
    isShared !== originalHeader.isShared

  const linesDirty = useMemo(() => {
    if (!isEdit) return false
    if (lines.length !== originalLines.length) return true
    // Map original by id
    const origById = new Map<number, LineState>()
    originalLines.forEach((o) => {
      if (o.id != null) origById.set(o.id, o)
    })
    for (const l of lines) {
      if (l.id == null) return true // new line
      const o = origById.get(l.id)
      if (!o) return true
      if (!lineEquals(l, o)) return true
    }
    // Any deleted?
    const currentIds = new Set(lines.map((l) => l.id).filter((x): x is number => x != null))
    for (const o of originalLines) {
      if (o.id != null && !currentIds.has(o.id)) return true
    }
    return false
  }, [lines, originalLines, isEdit])

  const isDirty = isEdit ? headerDirty || linesDirty : true

  // Pending-changes count for edit mode (header + line ops)
  const pendingChanges = useMemo(() => {
    if (!isEdit) return 0
    let count = 0
    if (headerDirty) count += 1
    const origById = new Map<number, LineState>()
    originalLines.forEach((o) => {
      if (o.id != null) origById.set(o.id, o)
    })
    for (const l of lines) {
      if (l.id == null) count += 1
      else {
        const o = origById.get(l.id)
        if (o && !lineEquals(l, o)) count += 1
      }
    }
    const currentIds = new Set(lines.map((l) => l.id).filter((x): x is number => x != null))
    for (const o of originalLines) {
      if (o.id != null && !currentIds.has(o.id)) count += 1
    }
    return count
  }, [isEdit, headerDirty, lines, originalLines])

  // ---------------------------------------------------------------------------
  // Save — create
  // ---------------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: (payload: RangeSessionCreate) => createRangeSession(payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['range-sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      toast({ title: 'Range day logged', description: `${created.total_rounds} rounds across ${created.lines.length} ${created.lines.length === 1 ? 'line' : 'lines'}` })
      onOpenChange(false)
    },
    onError: (e: unknown) => {
      const detail = (e as { detail?: string })?.detail ?? 'Failed to create range session'
      setError(detail)
      // Try to highlight an offending line by box reference
      const m = detail.match(/box #(\d+)/i)
      if (m) {
        const boxId = parseInt(m[1])
        const offending = lines.find((l) => l.ammo_box_id === boxId)
        if (offending) setHighlightedLineUids(new Set([offending.uid]))
      }
    },
  })

  function handleCreate() {
    setError(null)
    setHighlightedLineUids(new Set())
    if (!sessionValid) {
      setError('Fix the line errors before saving.')
      return
    }
    const payload: RangeSessionCreate = {
      is_shared: isShared,
      date,
      location_name: locationName.trim() || null,
      notes: sessionNotes.trim() || null,
      lines: lines.map<RangeSessionLineCreate>((l) => ({
        firearm_id: l.firearm_id,
        ammo_box_id: l.ammo_box_id,
        rounds_fired: parseInt(l.rounds_fired) || 0,
        notes: l.notes.trim() || null,
      })),
    }
    createMutation.mutate(payload)
  }

  // ---------------------------------------------------------------------------
  // Save — edit (diff PATCH/POST/DELETE)
  // ---------------------------------------------------------------------------
  const [editSaving, setEditSaving] = useState(false)

  async function handleEdit() {
    if (!editSession) return
    setError(null)
    setHighlightedLineUids(new Set())
    if (!sessionValid) {
      setError('Fix the line errors before saving.')
      return
    }

    setEditSaving(true)
    setProgressMsg(null)
    try {
      // 1. PATCH header if changed
      if (headerDirty) {
        const headerPayload: RangeSessionUpdate = {}
        if (date !== originalHeader.date) headerPayload.date = date
        if (locationName !== originalHeader.locationName) {
          headerPayload.location_name = locationName.trim() || null
        }
        if (sessionNotes !== originalHeader.sessionNotes) {
          headerPayload.notes = sessionNotes.trim() || null
        }
        if (isShared !== originalHeader.isShared) headerPayload.is_shared = isShared
        setProgressMsg('Saving session details…')
        await updateRangeSession(editSession.id, headerPayload)
      }

      // Build diff plans
      const origById = new Map<number, LineState>()
      originalLines.forEach((o) => {
        if (o.id != null) origById.set(o.id, o)
      })
      const newLines: LineState[] = []
      const modifiedLines: LineState[] = []
      const currentIds = new Set<number>()
      for (const l of lines) {
        if (l.id == null) {
          newLines.push(l)
        } else {
          currentIds.add(l.id)
          const o = origById.get(l.id)
          if (o && !lineEquals(l, o)) modifiedLines.push(l)
        }
      }
      const deletedLineIds: number[] = []
      for (const o of originalLines) {
        if (o.id != null && !currentIds.has(o.id)) deletedLineIds.push(o.id)
      }

      // Order: POST new → PATCH modified → DELETE removed.
      // Doing POST first ensures the session never temporarily has 0 lines.
      const total = newLines.length + modifiedLines.length + deletedLineIds.length
      let stepIdx = 0
      const stepLabel = (action: string) => {
        stepIdx += 1
        return `${action} line ${stepIdx} of ${total}…`
      }

      for (const l of newLines) {
        setProgressMsg(stepLabel('Adding'))
        await addRangeSessionLine(editSession.id, {
          firearm_id: l.firearm_id,
          ammo_box_id: l.ammo_box_id,
          rounds_fired: parseInt(l.rounds_fired) || 0,
          notes: l.notes.trim() || null,
        })
      }
      for (const l of modifiedLines) {
        setProgressMsg(stepLabel('Updating'))
        const payload: RangeSessionLineUpdate = {
          firearm_id: l.firearm_id,
          ammo_box_id: l.ammo_box_id,
          rounds_fired: parseInt(l.rounds_fired) || 0,
          notes: l.notes.trim() || null,
        }
        await updateRangeSessionLine(editSession.id, l.id!, payload)
      }
      for (const id of deletedLineIds) {
        setProgressMsg(stepLabel('Deleting'))
        await deleteRangeSessionLine(editSession.id, id)
      }

      void queryClient.invalidateQueries({ queryKey: ['range-sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['range-session', editSession.id] })
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      toast({ title: 'Range session updated' })
      onOpenChange(false)
    } catch (e: unknown) {
      const detail = (e as { detail?: string })?.detail ?? 'Save failed partway'
      setError(`${progressMsg ?? 'Save'} failed: ${detail}`)
      // Refresh server-side data so the dialog can be reopened against fresh state
      void queryClient.invalidateQueries({ queryKey: ['range-sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['range-session', editSession.id] })
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
    } finally {
      setEditSaving(false)
      setProgressMsg(null)
    }
  }

  const saving = createMutation.isPending || editSaving

  const handleClose = () => {
    if (saving) return
    if (isDirty) {
      setConfirmDiscard(true)
    } else {
      onOpenChange(false)
    }
  }

  // RBAC: who can flip is_shared?
  const canSetShared = user?.role === 'admin'

  return (
    <>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Closing this dialog will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false)
                onOpenChange(false)
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleClose()
          else onOpenChange(true)
        }}
      >
        <DialogContent
          className="max-w-3xl w-[95vw] sm:w-full max-h-[90vh] overflow-hidden flex flex-col p-0"
          onInteractOutside={(e) => {
            if (saving) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            if (saving) e.preventDefault()
          }}
        >
          <DialogHeader className="px-6 pt-6 mb-0">
            <DialogTitle>{isEdit ? 'Edit Range Day' : 'Log Range Day'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update session details and lines. Changes are committed individually after you save.'
                : 'Record a range session with one or more lines. Each line ties an ammo box and/or firearm to a round count.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Header section */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Date" required>
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
                      onSelect={(d) => setDate(d ? format(d, 'yyyy-MM-dd') : '')}
                    />
                  </PopoverContent>
                </Popover>
              </Field>

              <Field label="Location">
                <input
                  className={inputCls}
                  placeholder="e.g. Indoor Range, Backyard"
                  list="range-location-suggestions"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                />
                <datalist id="range-location-suggestions">
                  {locationSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>

              <Field label="Session Notes" className="md:col-span-2">
                <Textarea
                  rows={2}
                  placeholder="Conditions, drills, observations…"
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                />
              </Field>

              {canSetShared && (
                <Field
                  label="Shared session"
                  className="md:col-span-2"
                  hint="Visible to all members. Admin only."
                >
                  <div className="flex items-center gap-3">
                    <Switch checked={isShared} onCheckedChange={setIsShared} />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {isShared ? 'Visible to all members' : 'Private to you'}
                    </span>
                  </div>
                </Field>
              )}
            </section>

            {/* Lines section */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Lines ({lines.length})
                </h3>
                {isEdit && pendingChanges > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {pendingChanges} pending {pendingChanges === 1 ? 'change' : 'changes'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <LineRow
                    key={line.uid}
                    index={idx}
                    line={line}
                    firearms={firearms}
                    boxes={allBoxes}
                    boxById={boxById}
                    firearmById={firearmById}
                    caliberMap={caliberMap}
                    manufacturerMap={manufacturerMap}
                    errors={lineErrorMap.get(line.uid) ?? []}
                    calMismatch={calMismatchUids.has(line.uid)}
                    highlighted={highlightedLineUids.has(line.uid)}
                    onChange={(patch) => updateLine(line.uid, patch)}
                    onRemove={lines.length > 1 ? () => removeLine(line.uid) : null}
                  />
                ))}
              </div>

              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={addLine}
                  disabled={saving}
                  type="button"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Line
                </Button>
              </div>
            </section>

            {progressMsg && (
              <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
                {progressMsg}
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 mt-0">
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={isEdit ? handleEdit : handleCreate}
              disabled={saving || !sessionValid || (isEdit && !isDirty)}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Range Day'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ===========================================================================
// Field — small label/hint wrapper used by both header and line UI
// ===========================================================================
function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label?: string
  required?: boolean
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  )
}

// ===========================================================================
// LineRow — one line of the multi-line form
// ===========================================================================
interface LineRowProps {
  index: number
  line: LineState
  firearms: FirearmRead[]
  boxes: AmmoBoxRead[]
  boxById: Map<number, AmmoBoxRead>
  firearmById: Map<number, FirearmRead>
  caliberMap: Map<number, string>
  manufacturerMap: Map<number, string>
  errors: string[]
  calMismatch: boolean
  highlighted: boolean
  onChange: (patch: Partial<LineState>) => void
  onRemove: (() => void) | null
}

function LineRow({
  index,
  line,
  firearms,
  boxes,
  boxById,
  firearmById,
  caliberMap,
  manufacturerMap,
  errors,
  calMismatch,
  highlighted,
  onChange,
  onRemove,
}: LineRowProps) {
  const firearm = line.firearm_id != null ? firearmById.get(line.firearm_id) : undefined
  const box = line.ammo_box_id != null ? boxById.get(line.ammo_box_id) : undefined
  const firearmCaliberId = firearm?.caliber_id ?? null
  const boxCaliberName = box ? caliberMap.get(box.caliber_id) ?? null : null

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        highlighted
          ? 'border-red-400 dark:border-red-700 bg-red-50/60 dark:bg-red-950/20'
          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Line {index + 1}
        </p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Remove line"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
        {/* Firearm */}
        <div className="md:col-span-4">
          <Select
            value={line.firearm_id != null ? String(line.firearm_id) : NONE}
            onValueChange={(v) =>
              onChange({ firearm_id: v === NONE ? null : parseInt(v) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select firearm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>
                <span className="text-gray-400">None (e.g. dry fire)</span>
              </SelectItem>
              {firearms.map((f) => {
                const title = `${f.manufacturer_name ?? ''} ${f.display_model}`.trim()
                return (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {title}
                    {f.caliber_name && (
                      <span className="text-gray-400 ml-1.5">({f.caliber_name})</span>
                    )}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Ammo box */}
        <div className="md:col-span-4">
          <BoxPicker
            value={line.ammo_box_id}
            boxes={boxes}
            caliberMap={caliberMap}
            manufacturerMap={manufacturerMap}
            preferCaliberId={firearmCaliberId}
            onChange={(id) => onChange({ ammo_box_id: id })}
          />
        </div>

        {/* Rounds fired */}
        <div className="md:col-span-2">
          <input
            className={inputCls}
            type="number"
            min={0}
            placeholder="Rounds"
            value={line.rounds_fired}
            onChange={(e) => onChange({ rounds_fired: e.target.value })}
          />
        </div>

        {/* Notes popover + remove handled above */}
        <div className="md:col-span-2 flex items-center justify-end md:justify-start gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  'h-9 w-9 p-0 relative',
                  line.notes && 'text-gold',
                )}
                title={line.notes ? 'Notes (set)' : 'Add notes'}
              >
                <StickyNote className="w-4 h-4" />
                {line.notes && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-gold" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes for this line
              </p>
              <Textarea
                rows={3}
                placeholder="Drill, group size, observations…"
                value={line.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Validation messages + caliber-mismatch warning */}
      {(errors.length > 0 || calMismatch) && (
        <div className="mt-2 space-y-1">
          {errors.map((err, i) => (
            <p
              key={i}
              className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {err}
            </p>
          ))}
          {calMismatch && firearm && box && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Caliber mismatch: {firearm.caliber_name ?? 'unknown'} vs {boxCaliberName ?? 'box caliber'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// BoxPicker — search-able popover dropdown with caliber-match prioritization
// ===========================================================================
interface BoxPickerProps {
  value: number | null
  boxes: AmmoBoxRead[]
  caliberMap: Map<number, string>
  manufacturerMap: Map<number, string>
  preferCaliberId: number | null
  onChange: (id: number | null) => void
}

function BoxPicker({
  value,
  boxes,
  caliberMap,
  manufacturerMap,
  preferCaliberId,
  onChange,
}: BoxPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => boxes.find((b) => b.id === value) ?? null,
    [boxes, value],
  )

  const sorted = useMemo<AmmoBoxRead[]>(() => {
    const q = query.trim().toLowerCase()
    let list = boxes
    if (q) {
      list = list.filter((b) => {
        const haystack = [
          String(b.id),
          b.legacy_id ?? '',
          b.product_name ?? '',
          caliberMap.get(b.caliber_id) ?? '',
          manufacturerMap.get(b.manufacturer_id) ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }
    if (preferCaliberId != null) {
      list = [...list].sort((a, b) => {
        const aMatch = a.caliber_id === preferCaliberId ? 0 : 1
        const bMatch = b.caliber_id === preferCaliberId ? 0 : 1
        if (aMatch !== bMatch) return aMatch - bMatch
        return a.id - b.id
      })
    } else {
      list = [...list].sort((a, b) => a.id - b.id)
    }
    return list.slice(0, 100)
  }, [boxes, query, preferCaliberId, caliberMap, manufacturerMap])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            inputCls,
            'flex items-center justify-between gap-2 text-left',
            !selected && 'text-gray-400 dark:text-gray-500',
          )}
        >
          <span className="truncate">
            {selected ? (
              <>
                Box #{selected.id}
                {caliberMap.get(selected.caliber_id) && (
                  <span className="text-gray-400 ml-1.5">
                    · {caliberMap.get(selected.caliber_id)}
                  </span>
                )}
                {selected.product_name && (
                  <span className="text-gray-400 ml-1">· {selected.product_name}</span>
                )}
              </>
            ) : (
              'Select ammo box (optional)'
            )}
          </span>
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  e.preventDefault()
                  onChange(null)
                }
              }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 cursor-pointer"
              aria-label="Clear selected box"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0" align="start">
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className={cn(inputCls, 'pl-8 h-9')}
              placeholder="Search by ID, legacy ID, or product"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {sorted.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">
              No boxes match your search.
            </div>
          ) : (
            sorted.map((b) => {
              const isMatch =
                preferCaliberId != null && b.caliber_id === preferCaliberId
              const isSelected = b.id === value
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onChange(b.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors',
                    isSelected
                      ? 'bg-gold/10 text-gold'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
                  )}
                >
                  {isSelected ? (
                    <Check className="w-4 h-4 shrink-0 mt-0.5 text-gold" />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">Box #{b.id}</span>
                      {isMatch && (
                        <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          Match
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {[
                        caliberMap.get(b.caliber_id),
                        manufacturerMap.get(b.manufacturer_id),
                        b.product_name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}{' '}
                      · {b.qty_remaining} of {b.qty_original} remaining
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

