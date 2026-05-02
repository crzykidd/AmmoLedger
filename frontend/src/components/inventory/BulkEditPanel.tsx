import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { bulkUpdateAmmo } from '@/api/ammo'
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
    }
  }, [open, selectedBoxes])

  const mutation = useMutation({
    mutationFn: bulkUpdateAmmo,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['ammo'] })
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

  function buildUpdates(): BulkAmmoUpdate {
    const updates: BulkAmmoUpdate = {}
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

  function handleSave() {
    const updates = buildUpdates()
    if (Object.keys(updates).length === 0) {
      toast({ title: 'No changes to apply', variant: 'destructive' })
      return
    }
    setConfirmOpen(true)
  }

  function handleConfirm() {
    mutation.mutate({
      ids: selectedBoxes.map((b) => b.id),
      updates: buildUpdates(),
      notes_mode: notesMode,
    })
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
    </>
  )
}
