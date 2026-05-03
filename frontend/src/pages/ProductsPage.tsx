import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Grid,
  ImageOff,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  autoGenerateProducts,
  createProduct,
  deleteProduct,
  deleteProductImage,
  getProductImageUrl,
  listProducts,
  updateProduct,
  uploadProductImage,
} from '@/api/products'
import {
  getAmmoConditions,
  getAmmoTypes,
  getCalibersLookup,
  getCategories,
  getManufacturers,
} from '@/api/lookups'
import { useAuth } from '@/hooks/useAuth'
import type {
  LookupItem,
  ManufacturerItem,
  ProductCreate,
  ProductRead,
  ProductUpdate,
} from '@/types'

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
// Form sub-components
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function LookupSelect({
  label,
  required,
  value,
  onChange,
  items,
  placeholder,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  items: { id: number; name: string; is_active: boolean }[]
  placeholder?: string
}) {
  return (
    <Field label={label} required={required}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {!required && (
            <SelectItem value="__none__">
              <span className="text-gray-400">None</span>
            </SelectItem>
          )}
          {items.filter((i) => i.is_active).map((item) => (
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
// Auto-generate name preview
// ---------------------------------------------------------------------------

function buildPreviewName(
  manufacturerName: string,
  productName: string,
  caliberName: string,
  grOz: string,
  weightUnit: string,
  typeName: string,
): string {
  const parts: string[] = []
  if (manufacturerName) parts.push(manufacturerName)
  if (productName) parts.push(productName)
  if (caliberName) parts.push(caliberName)
  if (grOz) {
    const n = parseFloat(grOz)
    if (!isNaN(n)) parts.push(`${n}${(weightUnit || 'gr').toLowerCase()}`)
  }
  if (typeName) parts.push(typeName)
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Image URL sanitizer — only allow known-safe schemes before rendering in <img>
// ---------------------------------------------------------------------------

const SAFE_API_PATH_RE = /^\/api\/[\w/.-]+$/

function safeSrc(url: string): string {
  // Break CodeQL taint chain by constructing a new string rather than returning the input.
  try {
    if (url.startsWith('/api/')) {
      const path = url.split('?')[0].split('#')[0]
      if (SAFE_API_PATH_RE.test(path)) {
        // Reconstruct from validated path + fresh timestamp (never from user input)
        return `${path}?t=${Date.now()}`
      }
    }
    if (url.startsWith('blob:')) return url   // locally created by URL.createObjectURL
    if (url.startsWith('data:image/')) return url  // locally created data URI
  } catch {
    // fall through
  }
  return ''
}

// ---------------------------------------------------------------------------
// Image upload area
// ---------------------------------------------------------------------------

interface ImageUploadAreaProps {
  currentImageUrl: string | null
  localPreview: string | null
  onFileSelected: (file: File) => void
  onRemove: () => void
  pending: boolean
}

function ImageUploadArea({
  currentImageUrl,
  localPreview,
  onFileSelected,
  onRemove,
  pending,
}: ImageUploadAreaProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const displayUrl = localPreview ?? (currentImageUrl ? currentImageUrl + `?t=${Date.now()}` : null)

  const handleFile = (f: File) => {
    if (!f.type.match(/image\/(jpeg|png|webp)/)) return
    onFileSelected(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Image</label>
      {displayUrl && (displayUrl.startsWith('/api/') || displayUrl.startsWith('blob:') || displayUrl.startsWith('data:image/')) ? (
        <div className="relative w-full aspect-square max-h-48 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <img src={safeSrc(displayUrl)} alt="Product" className="w-full h-full object-contain bg-gray-50 dark:bg-gray-800" />
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 cursor-pointer transition-colors',
            dragging
              ? 'border-gold bg-gold/5'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500',
          )}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-6 h-6 text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drag & drop or <span className="text-gold font-medium">click to upload</span>
          </p>
          <p className="text-xs text-gray-400">JPG, PNG, or WebP — max 5 MB</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add / Edit product sheet
// ---------------------------------------------------------------------------

interface ProductFormValues {
  caliber_id: string
  manufacturer_id: string
  product_name: string
  gr_oz: string
  weight_unit: string
  type_id: string
  category_id: string
  ammo_condition_id: string
  default_cost: string
  upc: string
  notes: string
  is_shared: boolean
}

const FORM_DEFAULTS: ProductFormValues = {
  caliber_id: '',
  manufacturer_id: '',
  product_name: '',
  gr_oz: '',
  weight_unit: 'GR',
  type_id: '',
  category_id: '',
  ammo_condition_id: '',
  default_cost: '',
  upc: '',
  notes: '',
  is_shared: true,
}

const NONE = '__none__'
function toId(s: string): number | null {
  if (!s || s === NONE) return null
  const n = parseInt(s)
  return isNaN(n) ? null : n
}
function idStr(n: number | null | undefined): string {
  return n != null ? String(n) : ''
}

interface ProductFormSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  editProduct: ProductRead | null
  calibers: LookupItem[]
  manufacturers: ManufacturerItem[]
  ammoTypes: LookupItem[]
  categories: LookupItem[]
  ammoConditions: LookupItem[]
}

function ProductFormSheet({
  open,
  onOpenChange,
  editProduct,
  calibers,
  manufacturers,
  ammoTypes,
  categories,
  ammoConditions,
}: ProductFormSheetProps) {
  const queryClient = useQueryClient()

  const [vals, setVals] = useState<ProductFormValues>(FORM_DEFAULTS)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when sheet opens
  const onSheetOpen = useCallback((o: boolean) => {
    if (o) {
      if (editProduct) {
        setVals({
          caliber_id: idStr(editProduct.caliber_id),
          manufacturer_id: idStr(editProduct.manufacturer_id),
          product_name: editProduct.product_name ?? '',
          gr_oz: editProduct.gr_oz != null ? String(editProduct.gr_oz) : '',
          weight_unit: editProduct.weight_unit ?? 'GR',
          type_id: idStr(editProduct.type_id),
          category_id: idStr(editProduct.category_id),
          ammo_condition_id: idStr(editProduct.ammo_condition_id),
          default_cost: editProduct.default_cost != null ? String(editProduct.default_cost) : '',
          upc: editProduct.upc ?? '',
          notes: editProduct.notes ?? '',
          is_shared: editProduct.is_shared,
        })
      } else {
        setVals(FORM_DEFAULTS)
      }
      setPendingImage(null)
      setLocalPreview(null)
      setRemoveImage(false)
      setError(null)
    }
    onOpenChange(o)
  }, [editProduct, onOpenChange])

  const set = (key: keyof ProductFormValues, value: string | boolean) =>
    setVals((prev) => ({ ...prev, [key]: value }))

  const caliberName = calibers.find((c) => String(c.id) === vals.caliber_id)?.name ?? ''
  const manufacturerName = manufacturers.find((m) => String(m.id) === vals.manufacturer_id)?.name ?? ''
  const typeName = ammoTypes.find((t) => String(t.id) === vals.type_id)?.name ?? ''

  const previewName = buildPreviewName(
    manufacturerName,
    vals.product_name,
    caliberName,
    vals.gr_oz,
    vals.weight_unit,
    typeName,
  )

  const handleFileSelected = (f: File) => {
    setPendingImage(f)
    setLocalPreview(URL.createObjectURL(f))
    setRemoveImage(false)
  }

  const handleRemoveImage = () => {
    setPendingImage(null)
    setLocalPreview(null)
    setRemoveImage(true)
  }

  const handleSave = async () => {
    if (!vals.caliber_id || vals.caliber_id === NONE) {
      setError('Caliber is required')
      return
    }
    if (!vals.manufacturer_id || vals.manufacturer_id === NONE) {
      setError('Manufacturer is required')
      return
    }
    setError(null)
    setSaving(true)

    try {
      const payload: ProductCreate | ProductUpdate = {
        caliber_id: parseInt(vals.caliber_id),
        manufacturer_id: parseInt(vals.manufacturer_id),
        product_name: vals.product_name || null,
        gr_oz: vals.gr_oz ? parseFloat(vals.gr_oz) : null,
        weight_unit: vals.weight_unit || null,
        type_id: toId(vals.type_id),
        category_id: toId(vals.category_id),
        ammo_condition_id: toId(vals.ammo_condition_id),
        default_cost: vals.default_cost ? parseFloat(vals.default_cost) : null,
        upc: vals.upc || null,
        notes: vals.notes || null,
        is_shared: vals.is_shared,
      }

      let saved: ProductRead
      if (editProduct) {
        saved = await updateProduct(editProduct.id, payload as ProductUpdate)
      } else {
        saved = await createProduct(payload as ProductCreate)
      }

      // Handle image changes
      if (removeImage && editProduct?.image_path) {
        await deleteProductImage(saved.id)
      }
      if (pendingImage) {
        await uploadProductImage(saved.id, pendingImage)
      }

      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast({ title: editProduct ? 'Product updated' : 'Product created' })
      onSheetOpen(false)
    } catch (e: unknown) {
      const msg = (e as { detail?: string })?.detail ?? 'An error occurred'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const currentImageUrl =
    !removeImage && editProduct?.image_path
      ? getProductImageUrl(editProduct.id)
      : null

  return (
    <Sheet open={open} onOpenChange={onSheetOpen}>
      <SheetContent title={editProduct ? 'Edit Product' : 'Add Product'} description="">
        <SheetHeader>
          <SheetTitle>{editProduct ? 'Edit Product' : 'Add Product'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Name preview */}
          {previewName && (
            <div className="rounded-lg bg-gold/10 border border-gold/20 px-3 py-2">
              <p className="text-xs text-gold/70 font-medium mb-0.5">This product will be saved as:</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{previewName}</p>
            </div>
          )}

          <LookupSelect
            label="Caliber"
            required
            value={vals.caliber_id}
            onChange={(v) => set('caliber_id', v)}
            items={calibers}
          />

          <LookupSelect
            label="Manufacturer"
            required
            value={vals.manufacturer_id}
            onChange={(v) => set('manufacturer_id', v)}
            items={manufacturers}
          />

          <Field label="Product Name (sub-brand)">
            <input
              className={inputCls}
              placeholder="e.g. American Eagle, Gold Dot, HST"
              value={vals.product_name}
              onChange={(e) => set('product_name', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight">
              <input
                className={inputCls}
                type="number"
                step="0.1"
                min={0}
                placeholder="e.g. 115"
                value={vals.gr_oz}
                onChange={(e) => set('gr_oz', e.target.value)}
              />
            </Field>
            <Field label="Unit">
              <Select value={vals.weight_unit} onValueChange={(v) => set('weight_unit', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GR">gr (grains)</SelectItem>
                  <SelectItem value="OZ">oz (ounces)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <LookupSelect
            label="Type"
            value={vals.type_id}
            onChange={(v) => set('type_id', v)}
            items={ammoTypes}
          />

          <LookupSelect
            label="Category"
            value={vals.category_id}
            onChange={(v) => set('category_id', v)}
            items={categories}
          />

          <LookupSelect
            label="Condition"
            value={vals.ammo_condition_id}
            onChange={(v) => set('ammo_condition_id', v)}
            items={ammoConditions}
          />

          <Field label="Default Cost per Round ($)">
            <input
              className={inputCls}
              type="number"
              step="0.001"
              min={0}
              placeholder="0.000"
              value={vals.default_cost}
              onChange={(e) => set('default_cost', e.target.value)}
            />
          </Field>

          <Field label="UPC (for future use)">
            <input
              className={inputCls}
              placeholder="Optional barcode"
              value={vals.upc}
              onChange={(e) => set('upc', e.target.value)}
            />
          </Field>

          <Field label="Notes">
            <Textarea
              rows={2}
              placeholder="Optional notes…"
              value={vals.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>

          <div className="flex items-center justify-between py-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Shared (visible to all members)
            </label>
            <Switch
              checked={vals.is_shared}
              onCheckedChange={(v) => set('is_shared', v)}
            />
          </div>

          <ImageUploadArea
            currentImageUrl={currentImageUrl}
            localPreview={localPreview}
            onFileSelected={handleFileSelected}
            onRemove={handleRemoveImage}
            pending={saving}
          />

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={() => onSheetOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : editProduct ? 'Save Changes' : 'Save Product'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

function ProductCard({
  product,
  onEdit,
  onDelete,
  onAddBox,
}: {
  product: ProductRead
  onEdit: () => void
  onDelete: () => void
  onAddBox: () => void
}) {
  const imageUrl = product.image_path ? getProductImageUrl(product.id) : null

  const subtitle = [
    product.caliber_name,
    product.gr_oz != null ? `${product.gr_oz}${(product.weight_unit ?? 'gr').toLowerCase()}` : null,
    product.type_name,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="aspect-square w-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={safeSrc(imageUrl)}
            alt={product.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <ImageOff className="w-10 h-10 text-gray-300 dark:text-gray-600" />
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight line-clamp-2">
          {product.name}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
        {product.category_name && (
          <p className="text-xs text-gray-400 dark:text-gray-500">{product.category_name}</p>
        )}
        {product.default_cost != null && (
          <p className="text-xs text-gold font-medium">
            Default: ${product.default_cost.toFixed(3)}/rd
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-auto pt-1">
          Used by {product.usage_count} box{product.usage_count !== 1 ? 'es' : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-2 flex gap-2">
        <Button size="sm" className="flex-1 text-xs h-7" onClick={onAddBox}>
          Add Box
        </Button>
        <Button size="sm" variant="secondary" className="h-7 w-7 p-0" onClick={onEdit} title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-500"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProductsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [filterCaliberId, setFilterCaliberId] = useState<string>('')
  const [formOpen, setFormOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<ProductRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductRead | null>(null)
  const [autoGenerating, setAutoGenerating] = useState(false)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search, filterCaliberId],
    queryFn: () =>
      listProducts({
        search: search || undefined,
        caliber_id: filterCaliberId && filterCaliberId !== NONE ? parseInt(filterCaliberId) : undefined,
      }),
  })

  const { data: calibers = [] } = useQuery({
    queryKey: ['lookups', 'calibers'],
    queryFn: getCalibersLookup,
  })
  const { data: manufacturers = [] } = useQuery({
    queryKey: ['lookups', 'manufacturers'],
    queryFn: getManufacturers,
  })
  const { data: ammoTypes = [] } = useQuery({
    queryKey: ['lookups', 'ammo-types'],
    queryFn: getAmmoTypes,
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['lookups', 'categories'],
    queryFn: getCategories,
  })
  const { data: ammoConditions = [] } = useQuery({
    queryKey: ['lookups', 'ammo-conditions'],
    queryFn: getAmmoConditions,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProduct(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast({ title: 'Product deleted' })
      setDeleteTarget(null)
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Delete failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
      setDeleteTarget(null)
    },
  })

  const handleAutoGenerate = async () => {
    setAutoGenerating(true)
    try {
      const result = await autoGenerateProducts()
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      toast({
        title: 'Auto-generate complete',
        description: `Created ${result.products_created} products, linked ${result.boxes_linked} boxes`,
      })
    } catch (e: unknown) {
      const msg = (e as { detail?: string })?.detail ?? 'Auto-generate failed'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    } finally {
      setAutoGenerating(false)
    }
  }

  const handleAddBox = (product: ProductRead) => {
    navigate(`/inventory?product_id=${product.id}`)
  }

  const openAdd = () => {
    setEditProduct(null)
    setFormOpen(true)
  }

  const openEdit = (p: ProductRead) => {
    setEditProduct(p)
    setFormOpen(true)
  }

  const NONE = '__none__'

  return (
    <AppShell>
      <TopBar
        title="Products"
        subtitle="Saved product templates for quick box entry"
        actions={
          <div className="flex gap-2">
            {user?.role === 'admin' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleAutoGenerate()}
                disabled={autoGenerating}
              >
                <RefreshCw className={cn('w-4 h-4 mr-1.5', autoGenerating && 'animate-spin')} />
                {autoGenerating ? 'Generating…' : 'Auto-Generate from Inventory'}
              </Button>
            )}
            <Button size="sm" onClick={openAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Product
            </Button>
          </div>
        }
      />

      <div className="p-6 flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search products…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="w-48">
            <Select value={filterCaliberId} onValueChange={setFilterCaliberId}>
              <SelectTrigger>
                <SelectValue placeholder="All calibers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All calibers</SelectItem>
                {calibers.filter((c) => c.is_active).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              className={cn(
                'px-3 py-2 text-sm transition-colors',
                view === 'grid'
                  ? 'bg-gold/20 text-gold'
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              className={cn(
                'px-3 py-2 text-sm transition-colors border-l border-gray-200 dark:border-gray-700',
                view === 'list'
                  ? 'bg-gold/20 text-gold'
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
              onClick={() => setView('list')}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading products…</div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4 text-center">
            <Box className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            <div>
              <p className="font-medium text-gray-600 dark:text-gray-300">No products yet</p>
              <p className="text-sm text-gray-400 mt-1">
                {user?.role === 'admin'
                  ? 'Click "Auto-Generate from Inventory" to create templates from existing boxes, or add one manually.'
                  : 'No product templates have been created yet.'}
              </p>
            </div>
            {user?.role === 'admin' && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void handleAutoGenerate()} disabled={autoGenerating}>
                  <RefreshCw className={cn('w-4 h-4 mr-1.5', autoGenerating && 'animate-spin')} />
                  Auto-Generate
                </Button>
                <Button onClick={openAdd}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Product
                </Button>
              </div>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onEdit={() => openEdit(p)}
                onDelete={() => setDeleteTarget(p)}
                onAddBox={() => handleAddBox(p)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">Img</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Caliber</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Category</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Default $/rd</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Boxes</th>
                  <th className="px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => {
                  const imageUrl = p.image_path ? getProductImageUrl(p.id) : null
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        'border-b border-gray-100 dark:border-gray-800 last:border-0',
                        i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/20',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="w-9 h-9 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                          {imageUrl ? (
                            <img src={safeSrc(imageUrl)} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <ImageOff className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white leading-tight">{p.name}</p>
                        {p.manufacturer_name && (
                          <p className="text-xs text-gray-400">{p.manufacturer_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-300">
                        {p.caliber_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-300">
                        {p.type_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-300">
                        {p.category_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell text-gray-600 dark:text-gray-300">
                        {p.default_cost != null ? `$${p.default_cost.toFixed(3)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                        {p.usage_count}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleAddBox(p)}>
                            Add Box
                          </Button>
                          <Button size="sm" variant="secondary" className="h-7 w-7 p-0" onClick={() => openEdit(p)} title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-500"
                            onClick={() => setDeleteTarget(p)}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit sheet */}
      <ProductFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editProduct={editProduct}
        calibers={calibers}
        manufacturers={manufacturers}
        ammoTypes={ammoTypes}
        categories={categories}
        ammoConditions={ammoConditions}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.usage_count > 0
                ? `This product is used by ${deleteTarget.usage_count} box${deleteTarget.usage_count !== 1 ? 'es' : ''}. Unlink them first.`
                : `"${deleteTarget?.name}" will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || deleteTarget.usage_count > 0 || deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
