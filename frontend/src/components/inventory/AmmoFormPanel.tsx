import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, parseISO } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarIcon } from 'lucide-react'
import { createAmmo, updateAmmo } from '@/api/ammo'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
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
import { cn } from '@/lib/utils'
import type { AmmoBoxCreate, AmmoBoxRead, AmmoBoxUpdate, ContainerItem, LookupItem, User } from '@/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const formSchema = z.object({
  caliber_id: z.string().min(1, 'Caliber is required'),
  manufacturer_id: z.string().min(1, 'Manufacturer is required'),
  qty_original: z.number().int().min(1, 'Must be at least 1'),
  product_name: z.string().optional(),
  qty_remaining: z.string().optional(),
  is_shared: z.boolean(),
  gr_oz: z.string().optional(),
  weight_unit: z.string().optional(),
  type_id: z.string().optional(),
  ammo_condition_id: z.string().optional(),
  category_id: z.string().optional(),
  purchase_date: z.string().optional(),
  cost_per_round: z.string().optional(),
  dealer_id: z.string().optional(),
  container_id: z.string().optional(),
  legacy_id: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

const DEFAULT_VALUES: FormValues = {
  caliber_id: '',
  manufacturer_id: '',
  qty_original: 0,
  product_name: '',
  qty_remaining: '',
  is_shared: false,
  gr_oz: '',
  weight_unit: '',
  type_id: '',
  ammo_condition_id: '',
  category_id: '',
  purchase_date: '',
  cost_per_round: '',
  dealer_id: '',
  container_id: '',
  legacy_id: '',
  notes: '',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NONE = '__none__'

function toNum(s: string | undefined): number | undefined {
  if (!s || s.trim() === '' || s === NONE) return undefined
  const n = parseFloat(s)
  return isNaN(n) ? undefined : n
}

function toIntStr(n: number | null | undefined): string {
  return n != null ? String(n) : ''
}

// Returns true when an optional select field has a real selection
function hasId(s: string | undefined): s is string {
  return !!s && s !== '' && s !== NONE
}

// ---------------------------------------------------------------------------
// Field styling — matches Textarea/Select light+dark theme
// ---------------------------------------------------------------------------

const inputCls =
  'flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  items: { id: number; name: string }[]
  optional?: boolean
}

function SelectField({
  label,
  value,
  onChange,
  placeholder,
  error,
  items,
  optional,
}: SelectFieldProps) {
  return (
    <Field label={label} error={error}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {optional && (
            <SelectItem value="__none__">
              <span className="text-gray-400">None</span>
            </SelectItem>
          )}
          {items
            .filter((item) => item.id != null && item.id !== 0)
            .map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editBox: AmmoBoxRead | null
  user: User
  calibers: LookupItem[]
  manufacturers: LookupItem[]
  ammoTypes: LookupItem[]
  ammoConditions: LookupItem[]
  categories: LookupItem[]
  containers: ContainerItem[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AmmoFormPanel({
  open,
  onOpenChange,
  editBox,
  user,
  calibers,
  manufacturers,
  ammoTypes,
  ammoConditions,
  categories,
  containers,
}: Props) {
  const queryClient = useQueryClient()
  const isEdit = editBox != null

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    if (!open) return
    if (editBox) {
      reset({
        caliber_id: String(editBox.caliber_id),
        manufacturer_id: String(editBox.manufacturer_id),
        qty_original: editBox.qty_original,
        product_name: editBox.product_name ?? '',
        qty_remaining: String(editBox.qty_remaining),
        is_shared: editBox.is_shared,
        gr_oz: editBox.gr_oz != null ? String(editBox.gr_oz) : '',
        weight_unit: editBox.weight_unit ?? '',
        type_id: toIntStr(editBox.type_id),
        ammo_condition_id: toIntStr(editBox.ammo_condition_id),
        category_id: toIntStr(editBox.category_id),
        purchase_date: editBox.purchase_date ?? '',
        cost_per_round: editBox.cost_per_round != null ? String(editBox.cost_per_round) : '',
        dealer_id: toIntStr(editBox.dealer_id),
        container_id: toIntStr(editBox.container_id),
        legacy_id: editBox.legacy_id ?? '',
        notes: editBox.notes ?? '',
      })
    } else {
      reset({ ...DEFAULT_VALUES, purchase_date: format(new Date(), 'yyyy-MM-dd') })
    }
  }, [open, editBox, reset])

  const createMutation = useMutation({
    mutationFn: (data: AmmoBoxCreate) => createAmmo(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      onOpenChange(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AmmoBoxUpdate }) => updateAmmo(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      onOpenChange(false)
    },
  })

  const mutating = createMutation.isPending || updateMutation.isPending
  const mutateError = createMutation.error ?? updateMutation.error

  const onSubmit = (values: FormValues) => {
    const qtyRem = toNum(values.qty_remaining)

    if (isEdit) {
      const data: AmmoBoxUpdate = {
        caliber_id: parseInt(values.caliber_id),
        manufacturer_id: parseInt(values.manufacturer_id),
        qty_original: values.qty_original,
        ...(values.product_name ? { product_name: values.product_name } : {}),
        ...(qtyRem !== undefined ? { qty_remaining: qtyRem } : {}),
        is_shared: values.is_shared,
        ...(toNum(values.gr_oz) !== undefined ? { gr_oz: toNum(values.gr_oz) } : {}),
        ...(values.weight_unit ? { weight_unit: values.weight_unit } : {}),
        ...(hasId(values.type_id) ? { type_id: parseInt(values.type_id) } : {}),
        ...(hasId(values.ammo_condition_id) ? { ammo_condition_id: parseInt(values.ammo_condition_id) } : {}),
        ...(hasId(values.category_id) ? { category_id: parseInt(values.category_id) } : {}),
        ...(values.purchase_date ? { purchase_date: values.purchase_date } : {}),
        ...(toNum(values.cost_per_round) !== undefined
          ? { cost_per_round: toNum(values.cost_per_round) }
          : {}),
        ...(hasId(values.dealer_id) ? { dealer_id: parseInt(values.dealer_id) } : {}),
        ...(hasId(values.container_id) ? { container_id: parseInt(values.container_id) } : {}),
        ...(values.legacy_id ? { legacy_id: values.legacy_id } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      }
      updateMutation.mutate({ id: editBox!.id, data })
    } else {
      const data: AmmoBoxCreate = {
        caliber_id: parseInt(values.caliber_id),
        manufacturer_id: parseInt(values.manufacturer_id),
        qty_original: values.qty_original,
        ...(values.product_name ? { product_name: values.product_name } : {}),
        ...(qtyRem !== undefined ? { qty_remaining: qtyRem } : {}),
        is_shared: values.is_shared,
        ...(toNum(values.gr_oz) !== undefined ? { gr_oz: toNum(values.gr_oz) } : {}),
        ...(values.weight_unit ? { weight_unit: values.weight_unit } : {}),
        ...(hasId(values.type_id) ? { type_id: parseInt(values.type_id) } : {}),
        ...(hasId(values.ammo_condition_id) ? { ammo_condition_id: parseInt(values.ammo_condition_id) } : {}),
        ...(hasId(values.category_id) ? { category_id: parseInt(values.category_id) } : {}),
        ...(values.purchase_date ? { purchase_date: values.purchase_date } : {}),
        ...(toNum(values.cost_per_round) !== undefined
          ? { cost_per_round: toNum(values.cost_per_round) }
          : {}),
        ...(hasId(values.dealer_id) ? { dealer_id: parseInt(values.dealer_id) } : {}),
        ...(hasId(values.container_id) ? { container_id: parseInt(values.container_id) } : {}),
        ...(values.legacy_id ? { legacy_id: values.legacy_id } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      }
      createMutation.mutate(data)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={isEdit ? 'Edit Ammo Box' : 'Add Ammo Box'}
        description={isEdit ? 'Update ammo box details' : 'Record a new ammo box'}
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit Ammo Box' : 'Add Ammo Box'}</SheetTitle>
        </SheetHeader>

        <form
          id="ammo-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
        >
          {/* Required fields */}
          <Controller
            name="caliber_id"
            control={control}
            render={({ field }) => (
              <SelectField
                label="Caliber *"
                value={field.value}
                onChange={field.onChange}
                items={calibers}
                error={errors.caliber_id?.message}
              />
            )}
          />

          <Controller
            name="manufacturer_id"
            control={control}
            render={({ field }) => (
              <SelectField
                label="Manufacturer *"
                value={field.value}
                onChange={field.onChange}
                items={manufacturers}
                error={errors.manufacturer_id?.message}
              />
            )}
          />

          <Field label="Product Name" error={errors.product_name?.message}>
            <input
              {...register('product_name')}
              placeholder="e.g. Federal HST 147gr"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty Original *" error={errors.qty_original?.message}>
              <input
                {...register('qty_original', { valueAsNumber: true })}
                type="number"
                min={1}
                className={inputCls}
              />
            </Field>
            <Field label="Qty Remaining" error={errors.qty_remaining?.message}>
              <input
                {...register('qty_remaining')}
                type="number"
                min={0}
                placeholder="= Original"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" error={errors.gr_oz?.message}>
              <input
                {...register('gr_oz')}
                type="number"
                step="0.1"
                min={0}
                placeholder="e.g. 147"
                className={inputCls}
              />
            </Field>
            <Field label="Unit" error={errors.weight_unit?.message}>
              <Controller
                name="weight_unit"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="gr / oz" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gr">gr (grains)</SelectItem>
                      <SelectItem value="oz">oz (ounces)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Controller
            name="type_id"
            control={control}
            render={({ field }) => (
              <SelectField
                label="Type"
                value={field.value ?? ''}
                onChange={field.onChange}
                items={ammoTypes}
                optional
                error={errors.type_id?.message}
              />
            )}
          />

          <Controller
            name="ammo_condition_id"
            control={control}
            render={({ field }) => (
              <SelectField
                label="Condition"
                value={field.value ?? ''}
                onChange={field.onChange}
                items={ammoConditions}
                optional
                error={errors.ammo_condition_id?.message}
              />
            )}
          />

          <Controller
            name="category_id"
            control={control}
            render={({ field }) => (
              <SelectField
                label="Category"
                value={field.value ?? ''}
                onChange={field.onChange}
                items={categories}
                optional
                error={errors.category_id?.message}
              />
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Date" error={errors.purchase_date?.message}>
              <Controller
                name="purchase_date"
                control={control}
                render={({ field }) => {
                  const date =
                    field.value && field.value !== '' ? parseISO(field.value) : undefined
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
                          onSelect={(d) =>
                            field.onChange(d ? format(d, 'yyyy-MM-dd') : '')
                          }
                        />
                      </PopoverContent>
                    </Popover>
                  )
                }}
              />
            </Field>
            <Field label="Cost / Round ($)" error={errors.cost_per_round?.message}>
              <input
                {...register('cost_per_round')}
                type="number"
                step="0.001"
                min={0}
                placeholder="0.000"
                className={inputCls}
              />
            </Field>
          </div>

          <Controller
            name="container_id"
            control={control}
            render={({ field }) => (
              <SelectField
                label="Container"
                value={field.value ?? ''}
                onChange={field.onChange}
                items={containers}
                optional
                error={errors.container_id?.message}
              />
            )}
          />

          {user.role === 'admin' && (
            <div className="flex items-center justify-between py-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Shared (visible to all members)
              </label>
              <Controller
                name="is_shared"
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          )}

          <Field label="Legacy ID" error={errors.legacy_id?.message}>
            <input
              {...register('legacy_id')}
              placeholder="e.g. B23, #637, LOT-2024"
              className={inputCls}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Optional — if this box has an ID from a previous tracking system
            </p>
          </Field>

          <Field label="Notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} placeholder="Optional notes…" rows={3} />
          </Field>

          {mutateError && (
            <p className="text-sm text-red-500">
              {(mutateError as { message?: string }).message ?? 'An error occurred'}
            </p>
          )}
        </form>

        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={mutating}
          >
            Cancel
          </Button>
          <Button type="submit" form="ammo-form" disabled={mutating || isSubmitting}>
            {mutating ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Box'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
