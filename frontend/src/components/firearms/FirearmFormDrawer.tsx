import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { CalendarIcon, Sparkles } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ComplianceTagPicker from './ComplianceTagPicker'
import UserTagPicker from './UserTagPicker'
import { createFirearm, updateFirearm } from '@/api/firearms'
import {
  getCalibersLookup,
  getDealers,
  getFirearmActionTypes,
  getFirearmModels,
  getManufacturersByType,
} from '@/api/lookups'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type {
  FirearmCreate,
  FirearmRead,
  FirearmType,
  FirearmUpdate,
} from '@/types'

const inputCls =
  'flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const NONE = '__none__'

function toIdStr(n: number | null | undefined): string {
  return n != null ? String(n) : ''
}

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  )
}

interface FormState {
  is_shared: boolean
  manufacturer_id: string
  firearm_model_id: string
  custom_model_name: string
  use_custom_name: boolean
  firearm_type: FirearmType
  action_type_id: string
  caliber_id: string
  caliber_notes: string
  serial: string
  barrel_length_in: string
  finish: string
  purchase_date: string
  purchase_price: string
  dealer_id: string
  service_interval_rounds: string
  service_interval_days: string
  compliance_tag_ids: number[]
  user_tag_ids: number[]
  notes: string
}

const DEFAULTS: FormState = {
  is_shared: false,
  manufacturer_id: '',
  firearm_model_id: '',
  custom_model_name: '',
  use_custom_name: false,
  firearm_type: 'pistol',
  action_type_id: '',
  caliber_id: '',
  caliber_notes: '',
  serial: '',
  barrel_length_in: '',
  finish: '',
  purchase_date: '',
  purchase_price: '',
  dealer_id: '',
  service_interval_rounds: '',
  service_interval_days: '',
  compliance_tag_ids: [],
  user_tag_ids: [],
  notes: '',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editFirearm: FirearmRead | null
}

export default function FirearmFormDrawer({ open, onOpenChange, editFirearm }: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isEdit = editFirearm != null

  const [vals, setVals] = useState<FormState>(DEFAULTS)
  const [originalVals, setOriginalVals] = useState<FormState>(DEFAULTS)
  const [error, setError] = useState<string | null>(null)
  const [autofillFlash, setAutofillFlash] = useState<{ caliber: boolean; action: boolean }>({
    caliber: false,
    action: false,
  })
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setVals((prev) => ({ ...prev, [key]: value }))

  // Lookups
  const { data: manufacturers = [] } = useQuery({
    queryKey: ['firearm-manufacturers'],
    queryFn: () => getManufacturersByType('firearm'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: calibers = [] } = useQuery({
    queryKey: ['calibers'],
    queryFn: getCalibersLookup,
    staleTime: 5 * 60 * 1000,
  })
  const { data: actionTypes = [] } = useQuery({
    queryKey: ['firearm-action-types'],
    queryFn: getFirearmActionTypes,
    staleTime: 5 * 60 * 1000,
  })
  const { data: dealers = [] } = useQuery({
    queryKey: ['dealers'],
    queryFn: getDealers,
    staleTime: 5 * 60 * 1000,
  })

  // Cascading models — fetched whenever manufacturer changes
  const manuId = vals.manufacturer_id ? parseInt(vals.manufacturer_id) : null
  const { data: models = [] } = useQuery({
    queryKey: ['firearm-models', manuId],
    queryFn: () => getFirearmModels(manuId ?? undefined),
    enabled: manuId != null,
    staleTime: 60_000,
  })

  // Reset / populate on open or when editFirearm changes
  useEffect(() => {
    if (!open) return
    if (editFirearm) {
      const next: FormState = {
        is_shared: editFirearm.is_shared,
        manufacturer_id: toIdStr(editFirearm.manufacturer_id),
        firearm_model_id: toIdStr(editFirearm.firearm_model_id),
        custom_model_name: editFirearm.custom_model_name ?? '',
        use_custom_name: editFirearm.firearm_model_id == null && !!editFirearm.custom_model_name,
        firearm_type: editFirearm.firearm_type,
        action_type_id: toIdStr(editFirearm.action_type_id),
        caliber_id: toIdStr(editFirearm.caliber_id),
        caliber_notes: editFirearm.caliber_notes ?? '',
        serial: editFirearm.serial ?? '',
        barrel_length_in:
          editFirearm.barrel_length_in != null ? String(editFirearm.barrel_length_in) : '',
        finish: editFirearm.finish ?? '',
        purchase_date: editFirearm.purchase_date ?? '',
        purchase_price:
          editFirearm.purchase_price != null ? String(editFirearm.purchase_price) : '',
        dealer_id: toIdStr(editFirearm.dealer_id),
        service_interval_rounds:
          editFirearm.service_interval_rounds != null
            ? String(editFirearm.service_interval_rounds)
            : '',
        service_interval_days:
          editFirearm.service_interval_days != null
            ? String(editFirearm.service_interval_days)
            : '',
        compliance_tag_ids: editFirearm.compliance_tags.map((t) => t.id),
        user_tag_ids: editFirearm.user_tags.map((t) => t.id),
        notes: editFirearm.notes ?? '',
      }
      setVals(next)
      setOriginalVals(next)
    } else {
      setVals(DEFAULTS)
      setOriginalVals(DEFAULTS)
    }
    setError(null)
    setAutofillFlash({ caliber: false, action: false })
  }, [open, editFirearm])

  // Auto-fill caliber & action_type from selected model (only if empty)
  const handleModelChange = (modelIdStr: string) => {
    set('firearm_model_id', modelIdStr)
    set('use_custom_name', false)
    set('custom_model_name', '')
    if (modelIdStr === NONE || !modelIdStr) return
    const model = models.find((m) => String(m.id) === modelIdStr)
    if (!model) return
    let flashCaliber = false
    let flashAction = false
    setVals((prev) => {
      const next = { ...prev }
      if (!next.caliber_id && model.default_caliber_id) {
        next.caliber_id = String(model.default_caliber_id)
        flashCaliber = true
      }
      if (!next.action_type_id && model.default_action_type_id) {
        next.action_type_id = String(model.default_action_type_id)
        flashAction = true
      }
      return next
    })
    if (flashCaliber || flashAction) {
      setAutofillFlash({ caliber: flashCaliber, action: flashAction })
      setTimeout(() => setAutofillFlash({ caliber: false, action: false }), 3000)
    }
  }

  // Manufacturer change — clear model & custom name
  const handleManufacturerChange = (v: string) => {
    set('manufacturer_id', v)
    set('firearm_model_id', '')
    // Don't clear caliber/action — user may have already set them deliberately
  }

  const isDirty = useMemo(
    () => JSON.stringify(vals) !== JSON.stringify(originalVals),
    [vals, originalVals],
  )

  // Validation
  const validationErrors: string[] = []
  if (!vals.manufacturer_id) validationErrors.push('Manufacturer is required')
  if (!vals.caliber_id) validationErrors.push('Caliber is required')
  if (!vals.firearm_type) validationErrors.push('Firearm Type is required')
  const hasModel = vals.firearm_model_id && vals.firearm_model_id !== NONE
  const hasCustom = vals.use_custom_name && vals.custom_model_name.trim() !== ''
  if (!hasModel && !hasCustom) {
    validationErrors.push('Either a catalog model or a custom name is required')
  }
  if (
    vals.barrel_length_in &&
    (isNaN(parseFloat(vals.barrel_length_in)) || parseFloat(vals.barrel_length_in) < 0)
  ) {
    validationErrors.push('Barrel length must be ≥ 0')
  }
  if (
    vals.purchase_price &&
    (isNaN(parseFloat(vals.purchase_price)) || parseFloat(vals.purchase_price) < 0)
  ) {
    validationErrors.push('Purchase price must be ≥ 0')
  }
  if (
    vals.service_interval_rounds &&
    (isNaN(parseInt(vals.service_interval_rounds)) || parseInt(vals.service_interval_rounds) < 1)
  ) {
    validationErrors.push('Service interval (rounds) must be ≥ 1')
  }
  if (
    vals.service_interval_days &&
    (isNaN(parseInt(vals.service_interval_days)) || parseInt(vals.service_interval_days) < 1)
  ) {
    validationErrors.push('Service interval (days) must be ≥ 1')
  }
  const isValid = validationErrors.length === 0

  const buildPayload = (): FirearmCreate | FirearmUpdate => {
    const payload: FirearmCreate = {
      is_shared: vals.is_shared,
      manufacturer_id: parseInt(vals.manufacturer_id),
      firearm_model_id: vals.use_custom_name
        ? null
        : vals.firearm_model_id && vals.firearm_model_id !== NONE
          ? parseInt(vals.firearm_model_id)
          : null,
      custom_model_name: vals.use_custom_name ? vals.custom_model_name.trim() : null,
      firearm_type: vals.firearm_type,
      action_type_id:
        vals.action_type_id && vals.action_type_id !== NONE
          ? parseInt(vals.action_type_id)
          : null,
      caliber_id: parseInt(vals.caliber_id),
      caliber_notes: vals.caliber_notes.trim() || null,
      serial: vals.serial.trim() || null,
      barrel_length_in: vals.barrel_length_in ? parseFloat(vals.barrel_length_in) : null,
      finish: vals.finish.trim() || null,
      purchase_date: vals.purchase_date || null,
      purchase_price: vals.purchase_price ? parseFloat(vals.purchase_price) : null,
      dealer_id:
        vals.dealer_id && vals.dealer_id !== NONE ? parseInt(vals.dealer_id) : null,
      service_interval_rounds: vals.service_interval_rounds
        ? parseInt(vals.service_interval_rounds)
        : null,
      service_interval_days: vals.service_interval_days
        ? parseInt(vals.service_interval_days)
        : null,
      compliance_tag_ids: vals.compliance_tag_ids,
      user_tag_ids: vals.user_tag_ids,
      notes: vals.notes.trim() || null,
    }
    return payload
  }

  const createMutation = useMutation({
    mutationFn: (data: FirearmCreate) => createFirearm(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      toast({ title: 'Firearm added' })
      onOpenChange(false)
    },
    onError: (e: unknown) => {
      setError((e as { detail?: string })?.detail ?? 'Failed to create firearm')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FirearmUpdate }) => updateFirearm(id, data),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['firearms'] })
      void queryClient.invalidateQueries({ queryKey: ['firearm', vars.id] })
      toast({ title: 'Firearm updated' })
      onOpenChange(false)
    },
    onError: (e: unknown) => {
      setError((e as { detail?: string })?.detail ?? 'Failed to update firearm')
    },
  })

  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = () => {
    setError(null)
    if (!isValid) {
      setError(validationErrors[0])
      return
    }
    const payload = buildPayload()
    if (isEdit) {
      updateMutation.mutate({ id: editFirearm!.id, data: payload })
    } else {
      createMutation.mutate(payload as FirearmCreate)
    }
  }

  const handleClose = () => {
    if (isDirty && !saving) {
      setConfirmDiscard(true)
    } else {
      onOpenChange(false)
    }
  }

  const purchaseDate = vals.purchase_date ? parseISO(vals.purchase_date) : undefined

  return (
    <>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Closing this drawer will lose them.
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

      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            handleClose()
          } else {
            onOpenChange(true)
          }
        }}
      >
        <SheetContent
          title={isEdit ? 'Edit Firearm' : 'Add Firearm'}
          description={isEdit ? 'Update firearm details' : 'Register a new firearm'}
        >
          <SheetHeader>
            <SheetTitle>{isEdit ? 'Edit Firearm' : 'Add Firearm'}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Identity */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Identity
              </h3>

              <Field label="Manufacturer" required>
                <Select value={vals.manufacturer_id} onValueChange={handleManufacturerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select manufacturer" />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturers
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>

              {!vals.use_custom_name && (
                <Field label="Model" hint="Pick from catalog or check 'Use custom model name' below.">
                  <Select
                    value={vals.firearm_model_id || NONE}
                    onValueChange={handleModelChange}
                    disabled={!vals.manufacturer_id}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !vals.manufacturer_id
                            ? 'Select manufacturer first'
                            : models.length === 0
                              ? 'No models in catalog'
                              : 'Select model'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>
                        <span className="text-gray-400">None</span>
                      </SelectItem>
                      {models
                        .filter((m) => m.is_active)
                        .map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                            {m.default_caliber_name && (
                              <span className="text-gray-400 ml-2">
                                ({m.default_caliber_name})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <div className="flex items-center justify-between py-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Use custom model name
                </label>
                <Switch
                  checked={vals.use_custom_name}
                  onCheckedChange={(v) => {
                    set('use_custom_name', v)
                    if (v) {
                      set('firearm_model_id', '')
                    } else {
                      set('custom_model_name', '')
                    }
                  }}
                />
              </div>

              {vals.use_custom_name && (
                <Field
                  label="Custom Model Name"
                  required
                  hint="For firearms not in the community catalog."
                >
                  <input
                    className={inputCls}
                    placeholder="e.g. Custom 1911 Build"
                    value={vals.custom_model_name}
                    onChange={(e) => set('custom_model_name', e.target.value)}
                  />
                </Field>
              )}

              <Field label="Firearm Type" required>
                <div className="grid grid-cols-4 gap-2">
                  {(['pistol', 'rifle', 'shotgun', 'other'] as FirearmType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set('firearm_type', t)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors',
                        vals.firearm_type === t
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Action Type">
                <div className="relative">
                  <Select
                    value={vals.action_type_id || NONE}
                    onValueChange={(v) => set('action_type_id', v === NONE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select action type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>
                        <span className="text-gray-400">None</span>
                      </SelectItem>
                      {actionTypes
                        .filter((a) => a.is_active)
                        .map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {autofillFlash.action && (
                    <span className="absolute -top-2 right-0 text-xs text-gold flex items-center gap-1 bg-white dark:bg-gray-900 px-1.5">
                      <Sparkles className="w-3 h-3" /> Auto-filled
                    </span>
                  )}
                </div>
              </Field>

              <Field label="Caliber" required>
                <div className="relative">
                  <Select
                    value={vals.caliber_id}
                    onValueChange={(v) => set('caliber_id', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select caliber" />
                    </SelectTrigger>
                    <SelectContent>
                      {calibers
                        .filter((c) => c.is_active)
                        .map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {autofillFlash.caliber && (
                    <span className="absolute -top-2 right-0 text-xs text-gold flex items-center gap-1 bg-white dark:bg-gray-900 px-1.5">
                      <Sparkles className="w-3 h-3" /> Auto-filled
                    </span>
                  )}
                </div>
              </Field>

              <Field label="Caliber Notes">
                <input
                  className={inputCls}
                  placeholder="e.g. also accepts .38 Special"
                  value={vals.caliber_notes}
                  onChange={(e) => set('caliber_notes', e.target.value)}
                />
              </Field>
            </section>

            {/* Physical */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Physical
              </h3>
              <Field label="Serial">
                <input
                  className={inputCls}
                  placeholder="Optional"
                  value={vals.serial}
                  onChange={(e) => set('serial', e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Barrel Length (in.)">
                  <input
                    className={inputCls}
                    type="number"
                    step="0.1"
                    min={0}
                    placeholder="e.g. 4.5"
                    value={vals.barrel_length_in}
                    onChange={(e) => set('barrel_length_in', e.target.value)}
                  />
                </Field>
                <Field label="Finish">
                  <input
                    className={inputCls}
                    placeholder="e.g. Black, Stainless, FDE"
                    value={vals.finish}
                    onChange={(e) => set('finish', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            {/* Acquisition */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Acquisition
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Purchase Date">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          inputCls,
                          'flex items-center justify-start gap-2',
                          !purchaseDate && 'text-gray-400 dark:text-gray-500',
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        {purchaseDate ? format(purchaseDate, 'MMM d, yyyy') : 'Pick a date'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0 w-auto">
                      <Calendar
                        mode="single"
                        selected={purchaseDate}
                        onSelect={(d) =>
                          set('purchase_date', d ? format(d, 'yyyy-MM-dd') : '')
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
                <Field label="Purchase Price ($)">
                  <input
                    className={inputCls}
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0.00"
                    value={vals.purchase_price}
                    onChange={(e) => set('purchase_price', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Dealer">
                <Select
                  value={vals.dealer_id || NONE}
                  onValueChange={(v) => set('dealer_id', v === NONE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dealer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      <span className="text-gray-400">None</span>
                    </SelectItem>
                    {dealers
                      .filter((d) => d.is_active)
                      .map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </section>

            {/* Service */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Service
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Either, both, or neither. Cleaning status alerts when either threshold is reached.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Service Interval (Rounds)">
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    placeholder="e.g. 500"
                    value={vals.service_interval_rounds}
                    onChange={(e) => set('service_interval_rounds', e.target.value)}
                  />
                </Field>
                <Field label="Service Interval (Days)">
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    placeholder="e.g. 90"
                    value={vals.service_interval_days}
                    onChange={(e) => set('service_interval_days', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            {/* Compliance Tags */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Compliance Tags
              </h3>
              <ComplianceTagPicker
                selectedIds={vals.compliance_tag_ids}
                onChange={(ids) => set('compliance_tag_ids', ids)}
              />
            </section>

            {/* Personal Tags */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Personal Tags
              </h3>
              <UserTagPicker
                selectedIds={vals.user_tag_ids}
                onChange={(ids) => set('user_tag_ids', ids)}
              />
            </section>

            {/* Sharing — admin only */}
            {user?.role === 'admin' && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Sharing
                </h3>
                <div className="flex items-center justify-between py-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Shared (visible to all members)
                  </label>
                  <Switch
                    checked={vals.is_shared}
                    onCheckedChange={(v) => set('is_shared', v)}
                  />
                </div>
              </section>
            )}

            {/* Notes */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Notes
              </h3>
              <Field label="Notes">
                <Textarea
                  rows={3}
                  placeholder="Optional notes about this firearm…"
                  value={vals.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </Field>
            </section>

            {error && (
              <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <SheetFooter>
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !isValid}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Firearm'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
