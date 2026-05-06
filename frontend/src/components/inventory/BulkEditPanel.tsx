import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
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
import { Input } from '@/components/ui/input'
import { bulkUpdateAmmo } from '@/api/ammo'
import { listProducts } from '@/api/products'
import { toast } from '@/hooks/use-toast'
import type {
  AmmoBoxRead,
  User,
  LookupItem,
  DealerItem,
  ContainerItem,
  LocationItem,
  BulkAmmoUpdate,
} from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function commonIdValue(boxes: AmmoBoxRead[], getter: (b: AmmoBoxRead) => number | null): string {
  if (boxes.length === 0) return ''
  const values = boxes.map(getter)
  const first = values[0]
  return values.every((v) => v === first) ? (first != null ? String(first) : '') : ''
}

function isMixed(boxes: AmmoBoxRead[], getter: (b: AmmoBoxRead) => number | null): boolean {
  if (boxes.length <= 1) return false
  const values = boxes.map(getter)
  const first = values[0]
  return !values.every((v) => v === first)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedBoxes: AmmoBoxRead[]
  user: User
  manufacturers: LookupItem[]
  ammoTypes: LookupItem[]
  ammoConditions: LookupItem[]
  categories: LookupItem[]
  dealers: DealerItem[]
  containers: ContainerItem[]
  locations: LocationItem[]
  onSaved: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SELECT_CLASS =
  'w-full h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-2 focus:outline-none focus:ring-2 focus:ring-gold'

export default function BulkEditPanel({
  open,
  onOpenChange,
  selectedBoxes,
  user,
  manufacturers,
  ammoTypes,
  ammoConditions,
  categories,
  dealers,
  containers,
  locations,
  onSaved,
}: Props) {
  const qc = useQueryClient()

  const [mfgId, setMfgId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [conditionId, setConditionId] = useState('')
  const [dealerId, setDealerId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [filterLocId, setFilterLocId] = useState('')
  const [containerId, setContainerId] = useState('')
  const [isShared, setIsShared] = useState('') // '' | 'true' | 'false'
  const [costPerRound, setCostPerRound] = useState('')
  const [notes, setNotes] = useState('')
  const [notesMode, setNotesMode] = useState<'replace' | 'append'>('replace')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reassignProductId, setReassignProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showReassignConfirm, setShowReassignConfirm] = useState(false)

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
    enabled: open,
  })

  const filteredProductOptions = useMemo(() => {
    if (!productSearch.trim()) return allProducts.slice(0, 20)
    const q = productSearch.toLowerCase()
    return allProducts.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20)
  }, [allProducts, productSearch])

  // Pre-fill common values when panel opens or selection changes
  useEffect(() => {
    if (open && selectedBoxes.length > 0) {
      setMfgId(commonIdValue(selectedBoxes, (b) => b.manufacturer_id))
      setTypeId(commonIdValue(selectedBoxes, (b) => b.type_id))
      setCategoryId(commonIdValue(selectedBoxes, (b) => b.category_id))
      setConditionId(commonIdValue(selectedBoxes, (b) => b.ammo_condition_id))
      setDealerId(commonIdValue(selectedBoxes, (b) => b.dealer_id))
      setLocationId(commonIdValue(selectedBoxes, (b) => b.location_id ?? null))
      setContainerId(commonIdValue(selectedBoxes, (b) => b.container_id))
      setFilterLocId('')
      setIsShared('')
      setCostPerRound('')
      setNotes('')
      setNotesMode('replace')
      setReassignProductId('')
      setProductSearch('')
      setShowReassignConfirm(false)
    }
  }, [open, selectedBoxes])

  const mutation = useMutation({
    mutationFn: bulkUpdateAmmo,
    onSuccess: (data, variables) => {
      void qc.invalidateQueries({ queryKey: ['ammo'] })
      if (variables.updates.product_id != null) {
        void qc.invalidateQueries({ queryKey: ['products'] })
      }
      toast({ title: `Updated ${data.updated} box${data.updated !== 1 ? 'es' : ''}` })
      onSaved()
      onOpenChange(false)
    },
    onError: () => {
      toast({ title: 'Bulk update failed', variant: 'destructive' })
    },
  })

  const filteredContainers = filterLocId
    ? containers.filter((c) => c.location_id === Number(filterLocId))
    : containers

  function buildUpdates(includeProduct = false): BulkAmmoUpdate {
    const updates: BulkAmmoUpdate = {}
    if (includeProduct && reassignProductId) updates.product_id = Number(reassignProductId)
    if (mfgId) updates.manufacturer_id = Number(mfgId)
    if (typeId) updates.type_id = Number(typeId)
    if (categoryId) updates.category_id = Number(categoryId)
    if (conditionId) updates.ammo_condition_id = Number(conditionId)
    if (dealerId) updates.dealer_id = Number(dealerId)
    if (locationId) updates.location_id = Number(locationId)
    if (containerId) updates.container_id = Number(containerId)
    if (isShared === 'true') updates.is_shared = true
    if (isShared === 'false') updates.is_shared = false
    if (costPerRound) updates.cost_per_round = Number(costPerRound)
    if (notes) updates.notes = notes
    return updates
  }

  function changedFieldLabels(): string[] {
    const fields: string[] = []
    if (mfgId) fields.push('Manufacturer')
    if (typeId) fields.push('Type')
    if (categoryId) fields.push('Category')
    if (conditionId) fields.push('Condition')
    if (dealerId) fields.push('Dealer')
    if (locationId) fields.push('Location')
    if (containerId) fields.push('Container')
    if (isShared !== '') fields.push('Shared status')
    if (costPerRound) fields.push('Cost per Round')
    if (notes) fields.push(`Notes (${notesMode})`)
    return fields
  }

  function doSave(includeProduct: boolean) {
    mutation.mutate({
      ids: selectedBoxes.map((b) => b.id),
      updates: buildUpdates(includeProduct),
      notes_mode: notesMode,
    })
  }

  function handleSave() {
    if (reassignProductId) {
      setShowReassignConfirm(true)
      return
    }
    const updates = buildUpdates(false)
    if (Object.keys(updates).length === 0) {
      toast({ title: 'No changes to apply', variant: 'destructive' })
      return
    }
    setConfirmOpen(true)
  }

  function handleConfirm() {
    doSave(false)
    setConfirmOpen(false)
  }

  const changedFields = changedFieldLabels()

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>
              Edit {selectedBoxes.length} Selected Box{selectedBoxes.length !== 1 ? 'es' : ''}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Leave a field blank to keep each box's existing value unchanged.
            </p>
          </SheetHeader>

          <div className="space-y-4">
            {/* Reassign Product */}
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2">
              <label className="text-sm font-medium text-amber-600 dark:text-amber-400">
                Reassign Product
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Changing the product will update caliber, manufacturer, weight, type,
                category, and condition on all {selectedBoxes.length} selected box
                {selectedBoxes.length !== 1 ? 'es' : ''}.
              </p>
              <Input
                placeholder="Search products…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="h-8 text-sm"
              />
              {reassignProductId && (
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
                  <span className="flex-1 truncate">
                    {allProducts.find((p) => String(p.id) === reassignProductId)?.name ?? 'Unknown'}
                  </span>
                  <button
                    onClick={() => setReassignProductId('')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {!reassignProductId && productSearch && (
                <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded">
                  {filteredProductOptions.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-gray-400">No products found</p>
                  ) : (
                    filteredProductOptions.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => {
                          setReassignProductId(String(p.id))
                          setProductSearch('')
                        }}
                      >
                        <span className="font-medium">{p.name}</span>
                        {p.usage_count > 0 && (
                          <span className="text-xs text-gray-400 ml-2">({p.usage_count} boxes)</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Manufacturer */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Manufacturer
                {isMixed(selectedBoxes, (b) => b.manufacturer_id) && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">Mixed</span>
                )}
              </label>
              <select
                value={mfgId}
                onChange={(e) => setMfgId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— Unchanged —</option>
                {manufacturers.filter((m) => m.is_active).map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Type
                {isMixed(selectedBoxes, (b) => b.type_id) && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">Mixed</span>
                )}
              </label>
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— Unchanged —</option>
                {ammoTypes.filter((t) => t.is_active).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Category
                {isMixed(selectedBoxes, (b) => b.category_id) && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">Mixed</span>
                )}
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— Unchanged —</option>
                {categories.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Condition */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Condition
                {isMixed(selectedBoxes, (b) => b.ammo_condition_id) && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">Mixed</span>
                )}
              </label>
              <select
                value={conditionId}
                onChange={(e) => setConditionId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— Unchanged —</option>
                {ammoConditions.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dealer */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Dealer
                {isMixed(selectedBoxes, (b) => b.dealer_id) && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">Mixed</span>
                )}
              </label>
              <select
                value={dealerId}
                onChange={(e) => setDealerId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— Unchanged —</option>
                {dealers.filter((d) => d.is_active).map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Location — bulk editable */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Location
                {isMixed(selectedBoxes, (b) => b.location_id ?? null) && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">Mixed</span>
                )}
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— Unchanged —</option>
                {locations.filter((l) => l.is_active).map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Container filter by location */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter containers by location
              </label>
              <select
                value={filterLocId}
                onChange={(e) => {
                  setFilterLocId(e.target.value)
                  setContainerId('')
                }}
                className={SELECT_CLASS}
              >
                <option value="">All Locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Container
                {isMixed(selectedBoxes, (b) => b.container_id) && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">Mixed</span>
                )}
              </label>
              <select
                value={containerId}
                onChange={(e) => setContainerId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— Unchanged —</option>
                {filteredContainers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Shared — admin only */}
            {user.role === 'admin' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Shared
                </label>
                <select
                  value={isShared}
                  onChange={(e) => setIsShared(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— Unchanged —</option>
                  <option value="true">Shared</option>
                  <option value="false">Private</option>
                </select>
              </div>
            )}

            {/* Cost per round */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Cost per Round ($)
              </label>
              <input
                type="number"
                min={0}
                step={0.001}
                value={costPerRound}
                onChange={(e) => setCostPerRound(e.target.value)}
                placeholder="Leave blank to keep unchanged"
                className="w-full h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-2 focus:outline-none focus:ring-2 focus:ring-gold placeholder:text-gray-400"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Leave blank to keep unchanged"
                rows={3}
                className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gold placeholder:text-gray-400 resize-none"
              />
              {notes && (
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      value="replace"
                      checked={notesMode === 'replace'}
                      onChange={() => setNotesMode('replace')}
                      className="accent-gold"
                    />
                    Replace existing notes
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      value="append"
                      checked={notesMode === 'append'}
                      onChange={() => setNotesMode('append')}
                      className="accent-gold"
                    />
                    Append
                  </label>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="flex-1"
              >
                {mutation.isPending ? 'Saving…' : 'Apply Changes'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Edit</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Apply changes to{' '}
                  <strong>
                    {selectedBoxes.length} box{selectedBoxes.length !== 1 ? 'es' : ''}
                  </strong>
                  ?
                </p>
                {changedFields.length > 0 && (
                  <ul className="text-sm list-disc list-inside text-gray-700 dark:text-gray-300">
                    {changedFields.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReassignConfirm} onOpenChange={setShowReassignConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reassign {selectedBoxes.length} box{selectedBoxes.length !== 1 ? 'es' : ''} to a new product?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will change the caliber, manufacturer, weight, type, category, and condition
              on {selectedBoxes.length} box{selectedBoxes.length !== 1 ? 'es' : ''} to match
              "{allProducts.find((p) => String(p.id) === reassignProductId)?.name}".
              This cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setShowReassignConfirm(false)
                doSave(true)
              }}
            >
              Reassign {selectedBoxes.length} Box{selectedBoxes.length !== 1 ? 'es' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
