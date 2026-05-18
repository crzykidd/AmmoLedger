import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/date'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarIcon, Package, Search, X } from 'lucide-react'
import { HelpTip } from '@/components/HelpTip'
import { createAmmo, updateAmmo } from '@/api/ammo'
import { createProduct, getProduct, getProductImageUrl, listProducts } from '@/api/products'
import {
  createAmmoConditionEntry,
  createAmmoTypeEntry,
  createCalibersEntry,
  createCategoryEntry,
  createContainerEntry,
  createDealerEntry,
  createLocationEntry,
  createManufacturerWithTypes,
} from '@/api/lookups'
import { toast } from '@/hooks/use-toast'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
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
import { LookupCombobox, type LookupOption } from '@/components/ui/LookupCombobox'
import { Switch } from '@/components/ui/switch'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type {
  AmmoBoxCreate,
  AmmoBoxRead,
  AmmoBoxUpdate,
  ContainerItem,
  LocationItem,
  LookupItem,
  ProductCreate,
  ProductRead,
  User,
} from '@/types'

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
  location_id: z.string().optional(),
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
  is_shared: true,
  gr_oz: '',
  weight_unit: '',
  type_id: '',
  ammo_condition_id: '',
  category_id: '',
  purchase_date: '',
  cost_per_round: '',
  dealer_id: '',
  location_id: '',
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

function hasId(s: string | undefined): s is string {
  return !!s && s !== '' && s !== NONE
}

// ---------------------------------------------------------------------------
// Field styling
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
  help,
  error,
  children,
}: {
  label: string
  help?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
        {help && <HelpTip text={help} />}
      </div>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface LookupFieldProps {
  label: string
  help?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  items: { id: number; name: string; is_active: boolean; source?: string | null }[]
  required?: boolean
  /** Hide the "+ Create" affordance (read-only role). */
  disableCreate?: boolean
  onCreate?: (
    name: string,
  ) => Promise<{ id: number; name: string; source?: string | null }>
}

function LookupField({
  label,
  help,
  value,
  onChange,
  placeholder,
  error,
  items,
  required,
  disableCreate,
  onCreate,
}: LookupFieldProps) {
  const options = useMemo<LookupOption[]>(
    () =>
      items
        .filter((item) => item.id != null && item.id !== 0 && item.is_active)
        .map((item) => ({ id: item.id, name: item.name, source: item.source ?? null })),
    [items],
  )
  return (
    <Field label={label} help={help} error={error}>
      <LookupCombobox
        value={value && value !== NONE ? parseInt(value) : null}
        options={options}
        onChange={(id) => onChange(id != null ? String(id) : '')}
        onCreate={onCreate}
        placeholder={placeholder ?? `Select ${label.toLowerCase()}`}
        label={label}
        required={required}
        disableCreate={disableCreate}
      />
    </Field>
  )
}

// ---------------------------------------------------------------------------
// Product selector component
// ---------------------------------------------------------------------------

function ProductSelector({
  selectedProduct,
  onSelect,
  onClear,
  onEnterManually,
}: {
  selectedProduct: ProductRead | null
  onSelect: (p: ProductRead) => void
  onClear: () => void
  onEnterManually: () => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const { data: products = [] } = useQuery({
    queryKey: ['products', search],
    queryFn: () => listProducts({ search: search || undefined }),
    staleTime: 30_000,
  })

  if (selectedProduct) {
    const imageUrl = selectedProduct.image_path ? getProductImageUrl(selectedProduct.id) : null
    const subtitle = [
      selectedProduct.caliber_name,
      selectedProduct.gr_oz != null
        ? `${selectedProduct.gr_oz}${(selectedProduct.weight_unit ?? 'gr').toLowerCase()}`
        : null,
      selectedProduct.type_name,
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <div className="rounded-lg bg-gold/10 border border-gold/20 p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <Package className="w-5 h-5 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {selectedProduct.name}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          title="Clear product selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          className={cn(inputCls, 'pl-9')}
          placeholder="Search products to auto-fill…"
          value={search}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        />
      </div>

      {open && products.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-56 overflow-y-auto">
          {products.slice(0, 20).map((p) => {
            const sub = [
              p.caliber_name,
              p.gr_oz != null ? `${p.gr_oz}${(p.weight_unit ?? 'gr').toLowerCase()}` : null,
              p.type_name,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0"
                onMouseDown={() => { onSelect(p); setSearch(''); setOpen(false) }}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                {sub && <p className="text-xs text-gray-400">{sub}</p>}
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="text-xs text-gray-400 hover:text-gold transition-colors text-left"
        onClick={onEnterManually}
      >
        Enter details manually →
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editBox: AmmoBoxRead | null
  initialProductId?: number | null
  user: User
  calibers: LookupItem[]
  manufacturers: LookupItem[]
  ammoTypes: LookupItem[]
  ammoConditions: LookupItem[]
  categories: LookupItem[]
  locations: LocationItem[]
  containers: ContainerItem[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AmmoFormPanel({
  open,
  onOpenChange,
  editBox,
  initialProductId,
  user,
  calibers,
  manufacturers,
  ammoTypes,
  ammoConditions,
  categories,
  locations,
  containers,
}: Props) {
  const queryClient = useQueryClient()
  const isEdit = editBox != null
  const canCreateLookups = user.role !== 'read_only'

  // Inline-create handlers. Each one POSTs the new entry, invalidates the
  // relevant cache key so the dropdown picks up the row immediately, and
  // returns it to the combobox for selection. Errors propagate so the
  // combobox can show them inline.
  const createCaliberInline = async (name: string) => {
    const created = await createCalibersEntry(name)
    await queryClient.invalidateQueries({ queryKey: ['calibers'] })
    return { id: created.id, name: created.name, source: created.source }
  }
  const createManufacturerInline = async (name: string) => {
    const created = await createManufacturerWithTypes(name, ['ammo'])
    await queryClient.invalidateQueries({ queryKey: ['manufacturers'] })
    return { id: created.id, name: created.name, source: created.source }
  }
  const createAmmoTypeInline = async (name: string) => {
    const created = await createAmmoTypeEntry(name)
    await queryClient.invalidateQueries({ queryKey: ['ammo-types'] })
    return { id: created.id, name: created.name, source: created.source }
  }
  const createAmmoConditionInline = async (name: string) => {
    const created = await createAmmoConditionEntry(name)
    await queryClient.invalidateQueries({ queryKey: ['ammo-conditions'] })
    return { id: created.id, name: created.name, source: created.source }
  }
  const createCategoryInline = async (name: string) => {
    const created = await createCategoryEntry(name)
    await queryClient.invalidateQueries({ queryKey: ['categories'] })
    return { id: created.id, name: created.name, source: created.source }
  }
  const createLocationInline = async (name: string) => {
    const created = await createLocationEntry(name)
    await queryClient.invalidateQueries({ queryKey: ['locations'] })
    return { id: created.id, name: created.name, source: created.source }
  }
  const createContainerInline = async (name: string) => {
    const created = await createContainerEntry(name)
    await queryClient.invalidateQueries({ queryKey: ['containers'] })
    return { id: created.id, name: created.name, source: created.source }
  }

  // Product selector state — only relevant in add mode
  const [productMode, setProductMode] = useState<'selector' | 'manual'>('selector')
  const [selectedProduct, setSelectedProduct] = useState<ProductRead | null>(null)
  const [formProductId, setFormProductId] = useState<number | null>(null)

  // "Save as template?" dialog after manual create
  const [savedBox, setSavedBox] = useState<AmmoBoxRead | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  })

  // Fetch product by ID when initialProductId is provided
  const { data: initialProduct } = useQuery({
    queryKey: ['product', initialProductId],
    queryFn: () => getProduct(initialProductId!),
    enabled: initialProductId != null,
    staleTime: 60_000,
  })

  // Apply product auto-fill to form
  const applyProduct = (p: ProductRead) => {
    setSelectedProduct(p)
    setFormProductId(p.id)
    if (p.caliber_id) setValue('caliber_id', String(p.caliber_id))
    if (p.manufacturer_id) setValue('manufacturer_id', String(p.manufacturer_id))
    setValue('product_name', p.product_name ?? '')
    setValue('gr_oz', p.gr_oz != null ? String(p.gr_oz) : '')
    setValue('weight_unit', p.weight_unit ?? 'gr')
    if (p.type_id) setValue('type_id', String(p.type_id))
    if (p.category_id) setValue('category_id', String(p.category_id))
    if (p.ammo_condition_id) setValue('ammo_condition_id', String(p.ammo_condition_id))
    if (p.default_cost != null) setValue('cost_per_round', String(p.default_cost))
  }

  const clearProduct = () => {
    setSelectedProduct(null)
    setFormProductId(null)
  }

  useEffect(() => {
    if (!open) return
    if (editBox) {
      // Edit mode — pre-fill from existing box
      setProductMode('manual')
      setSelectedProduct(null)
      setFormProductId(editBox.product_id ?? null)
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
        location_id: toIntStr(editBox.location_id),
        container_id: toIntStr(editBox.container_id),
        legacy_id: editBox.legacy_id ?? '',
        notes: editBox.notes ?? '',
      })
    } else {
      // Add mode
      reset({ ...DEFAULT_VALUES, purchase_date: format(new Date(), 'yyyy-MM-dd') })
      setProductMode('selector')
      setSelectedProduct(null)
      setFormProductId(null)
    }
  }, [open, editBox, reset])

  // Apply initialProduct when it loads
  useEffect(() => {
    if (initialProduct && open && !isEdit) {
      applyProduct(initialProduct)
      setProductMode('manual')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProduct, open, isEdit])

  const createMutation = useMutation({
    mutationFn: (data: AmmoBoxCreate) => createAmmo(data),
    onSuccess: (box) => {
      void queryClient.invalidateQueries({ queryKey: ['ammo'] })
      // Offer template save only when added manually (no product linked)
      if (formProductId == null) {
        setSavedBox(box)
        setTemplateDialogOpen(true)
      }
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
        product_id: formProductId,
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
        ...(hasId(values.location_id) ? { location_id: parseInt(values.location_id) } : {}),
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
        product_id: formProductId,
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
        ...(hasId(values.location_id) ? { location_id: parseInt(values.location_id) } : {}),
        ...(hasId(values.container_id) ? { container_id: parseInt(values.container_id) } : {}),
        ...(values.legacy_id ? { legacy_id: values.legacy_id } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      }
      createMutation.mutate(data)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!savedBox) return
    setSavingTemplate(true)
    try {
      const payload: ProductCreate = {
        caliber_id: savedBox.caliber_id,
        manufacturer_id: savedBox.manufacturer_id,
        product_name: savedBox.product_name ?? null,
        gr_oz: savedBox.gr_oz ?? null,
        weight_unit: savedBox.weight_unit ?? null,
        type_id: savedBox.type_id ?? null,
        category_id: savedBox.category_id ?? null,
        ammo_condition_id: savedBox.ammo_condition_id ?? null,
        default_cost: savedBox.cost_per_round ?? null,
        is_shared: savedBox.is_shared,
      }
      await createProduct(payload)
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast({ title: 'Product template saved' })
    } catch {
      toast({ title: 'Could not save template', variant: 'destructive' })
    } finally {
      setSavingTemplate(false)
      setTemplateDialogOpen(false)
      setSavedBox(null)
    }
  }

  return (
    <>
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
            {/* Product selector — add mode only */}
            {!isEdit && productMode === 'selector' && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Select a product to auto-fill
                </p>
                <ProductSelector
                  selectedProduct={selectedProduct}
                  onSelect={(p) => {
                    applyProduct(p)
                    setProductMode('manual')
                  }}
                  onClear={clearProduct}
                  onEnterManually={() => setProductMode('manual')}
                />
              </div>
            )}

            {/* Selected product indicator — manual mode with product linked */}
            {!isEdit && productMode === 'manual' && selectedProduct && (
              <div className="rounded-lg bg-gold/10 border border-gold/20 px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="w-4 h-4 text-gold shrink-0" />
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {selectedProduct.name}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                  onClick={() => { clearProduct(); setProductMode('selector') }}
                >
                  Change
                </button>
              </div>
            )}

            {/* Required fields */}
            <Controller
              name="caliber_id"
              control={control}
              render={({ field }) => (
                <LookupField
                  label="Caliber *"
                  help="The cartridge size (e.g. 9mm Luger, .223 Remington, 12 Gauge)"
                  value={field.value}
                  onChange={field.onChange}
                  items={calibers}
                  error={errors.caliber_id?.message}
                  required
                  disableCreate={!canCreateLookups}
                  onCreate={createCaliberInline}
                />
              )}
            />

            <Controller
              name="manufacturer_id"
              control={control}
              render={({ field }) => (
                <LookupField
                  label="Manufacturer *"
                  help="The brand that made the ammunition"
                  value={field.value}
                  onChange={field.onChange}
                  items={manufacturers}
                  error={errors.manufacturer_id?.message}
                  required
                  disableCreate={!canCreateLookups}
                  onCreate={createManufacturerInline}
                />
              )}
            />

            <Field label="Product Name" help="The specific product line (e.g. American Eagle, Gold Dot, X-TAC)" error={errors.product_name?.message}>
              <input
                {...register('product_name')}
                placeholder="e.g. Federal HST 147gr"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Qty Original *" help="Number of rounds when the box was full or purchased" error={errors.qty_original?.message}>
                <input
                  {...register('qty_original', { valueAsNumber: true })}
                  type="number"
                  min={1}
                  className={inputCls}
                />
              </Field>
              <Field label="Qty Remaining" help="Current number of rounds in the box" error={errors.qty_remaining?.message}>
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
              <Field label="Weight" help="Bullet weight in grains or shot weight in ounces" error={errors.gr_oz?.message}>
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
                <LookupField
                  label="Type"
                  help="Bullet type (e.g. FMJ, JHP, Slug, Shot)"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={ammoTypes}
                  error={errors.type_id?.message}
                  disableCreate={!canCreateLookups}
                  onCreate={createAmmoTypeInline}
                />
              )}
            />

            <Controller
              name="ammo_condition_id"
              control={control}
              render={({ field }) => (
                <LookupField
                  label="Condition"
                  help="Production origin — Factory New, Remanufactured, Military Surplus, etc."
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={ammoConditions}
                  error={errors.ammo_condition_id?.message}
                  disableCreate={!canCreateLookups}
                  onCreate={createAmmoConditionInline}
                />
              )}
            />

            <Controller
              name="category_id"
              control={control}
              render={({ field }) => (
                <LookupField
                  label="Category"
                  help="Intended use (e.g. Defense, Target / Range, Hunting)"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={categories}
                  error={errors.category_id?.message}
                  disableCreate={!canCreateLookups}
                  onCreate={createCategoryInline}
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
                      field.value && field.value !== '' ? parseLocalDate(field.value) : undefined
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
              <Field label="Cost / Round ($)" help="Price per individual round. Divide the box price by the round count." error={errors.cost_per_round?.message}>
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
              name="location_id"
              control={control}
              render={({ field }) => (
                <LookupField
                  label="Location"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={locations}
                  error={errors.location_id?.message}
                  disableCreate={!canCreateLookups}
                  onCreate={createLocationInline}
                />
              )}
            />

            <Controller
              name="container_id"
              control={control}
              render={({ field }) => (
                <LookupField
                  label="Container"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  items={containers}
                  error={errors.container_id?.message}
                  disableCreate={!canCreateLookups}
                  onCreate={createContainerInline}
                />
              )}
            />

            {user.role === 'admin' && (
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Shared (visible to all members)
                  </label>
                  <HelpTip text="When on, all household members can see this box. When off, only you and admins can see it." />
                </div>
                <Controller
                  name="is_shared"
                  control={control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            )}

            <Field label="Legacy ID" help="Optional — if this box has an ID number from a previous tracking system" error={errors.legacy_id?.message}>
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

      {/* Save as template dialog */}
      <AlertDialog open={templateDialogOpen} onOpenChange={(o) => { if (!o) { setTemplateDialogOpen(false); setSavedBox(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as product template?</AlertDialogTitle>
            <AlertDialogDescription>
              Create a reusable product template from this box so you can quickly add similar boxes in the future. You can upload a photo and adjust it later on the Products page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setTemplateDialogOpen(false); setSavedBox(null) }}>
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleSaveAsTemplate()}
              disabled={savingTemplate}
            >
              {savingTemplate ? 'Saving…' : 'Save as Template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
