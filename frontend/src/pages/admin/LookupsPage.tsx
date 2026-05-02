import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ExternalLink, Pencil, Check, X, Eye, EyeOff, Trash2, Plus } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  getCalibersAdmin, getManufacturersAdmin, getAmmoTypesAdmin, getAmmoConditionsAdmin,
  getCategoriesAdmin, getDealersAdmin, getLocationsAdmin, getContainersAdmin,
  updateLookupEntry, toggleLookupActive, deleteLookupEntry,
  createCalibersEntry, createManufacturerEntry, createAmmoTypeEntry, createAmmoConditionEntry,
  createCategoryEntry, createDealerEntry, createLocationEntry, createContainerEntry,
} from '@/api/lookups'
import type { LookupItem, ManufacturerItem, DealerItem, LocationItem, ContainerItem } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnyLookupItem = LookupItem | ManufacturerItem | DealerItem | LocationItem | ContainerItem

interface SectionConfig {
  key: string
  label: string
  hasUrl: boolean
  queryFn: () => Promise<AnyLookupItem[]>
  createFn: (name: string, url?: string | null) => Promise<AnyLookupItem>
}

// ---------------------------------------------------------------------------
// Section config
// ---------------------------------------------------------------------------

const SECTIONS: SectionConfig[] = [
  { key: 'calibers',       label: 'Calibers',       hasUrl: false, queryFn: getCalibersAdmin,       createFn: (n) => createCalibersEntry(n) },
  { key: 'manufacturers',  label: 'Manufacturers',  hasUrl: true,  queryFn: getManufacturersAdmin,  createFn: (n, u) => createManufacturerEntry(n, u) },
  { key: 'ammo-types',     label: 'Ammo Types',     hasUrl: false, queryFn: getAmmoTypesAdmin,      createFn: (n) => createAmmoTypeEntry(n) },
  { key: 'categories',     label: 'Categories',     hasUrl: false, queryFn: getCategoriesAdmin,     createFn: (n) => createCategoryEntry(n) },
  { key: 'ammo-conditions',label: 'Ammo Conditions',hasUrl: false, queryFn: getAmmoConditionsAdmin, createFn: (n) => createAmmoConditionEntry(n) },
  { key: 'dealers',        label: 'Dealers',        hasUrl: true,  queryFn: getDealersAdmin,        createFn: (n, u) => createDealerEntry(n, u) },
  { key: 'locations',      label: 'Locations',      hasUrl: false, queryFn: getLocationsAdmin,      createFn: (n) => createLocationEntry(n) },
  { key: 'containers',     label: 'Containers',     hasUrl: false, queryFn: getContainersAdmin,     createFn: (n) => createContainerEntry(n) },
]

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputCls =
  'flex h-8 w-full rounded border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 ' +
  'focus:outline-none focus:ring-1 focus:ring-gold'

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

function DeleteDialog({
  name,
  onConfirm,
  onCancel,
  isPending,
}: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete entry?</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
          Delete <span className="font-medium text-gray-900 dark:text-white">{name}</span>?{' '}
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  tableKey,
  hasUrl,
  onUpdated,
  onToggled,
  onDeleted,
}: {
  entry: AnyLookupItem
  tableKey: string
  hasUrl: boolean
  onUpdated: () => void
  onToggled: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(entry.name)
  const [url, setUrl] = useState('url' in entry ? (entry.url ?? '') : '')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const entryUrl = 'url' in entry ? entry.url : null

  const updateMut = useMutation({
    mutationFn: () => updateLookupEntry(tableKey, entry.id, { name: name.trim(), url: hasUrl ? (url.trim() || null) : undefined }),
    onSuccess: () => {
      onUpdated()
      toast({ title: 'Saved', description: `${name} updated.` })
      setEditing(false)
    },
    onError: (err: { detail?: string }) => {
      toast({ title: 'Error', description: err.detail ?? 'Failed to update', variant: 'destructive' })
    },
  })

  const toggleMut = useMutation({
    mutationFn: () => toggleLookupActive(tableKey, entry.id),
    onSuccess: () => {
      onToggled()
      toast({ title: entry.is_active ? 'Hidden' : 'Visible', description: `${entry.name} ${entry.is_active ? 'hidden from dropdowns' : 'restored'}.` })
    },
    onError: (err: { detail?: string }) => {
      toast({ title: 'Error', description: err.detail ?? 'Failed', variant: 'destructive' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteLookupEntry(tableKey, entry.id),
    onSuccess: () => {
      setShowDeleteDialog(false)
      onDeleted()
      toast({ title: 'Deleted', description: `${entry.name} deleted.` })
    },
    onError: (err: { detail?: string }) => {
      setShowDeleteDialog(false)
      toast({ title: 'Error', description: err.detail ?? 'Failed to delete', variant: 'destructive' })
    },
  })

  const handleCancel = () => {
    setName(entry.name)
    setUrl('url' in entry ? (entry.url ?? '') : '')
    setEditing(false)
  }

  const inactive = !entry.is_active

  // -------------------------
  // Editing state
  // -------------------------
  if (editing) {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800 bg-amber-50/40 dark:bg-amber-900/10">
        <td className="py-2 pl-3 pr-3">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') handleCancel() }}
            autoFocus
          />
        </td>
        {hasUrl && (
          <td className="py-2 pr-3">
            <input
              className={cn(inputCls, 'font-mono text-xs')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              onKeyDown={(e) => { if (e.key === 'Escape') handleCancel() }}
            />
          </td>
        )}
        <td className="py-2 pr-3" />
        <td className="py-2 pr-3" />
        <td className="py-2 pr-3">
          <div className="flex gap-1.5">
            <button
              onClick={() => updateMut.mutate()}
              disabled={updateMut.isPending || !name.trim()}
              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancel}
              disabled={updateMut.isPending}
              className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  // -------------------------
  // Display state
  // -------------------------
  const canHide = entry.source === 'yaml' && entry.usage_count === 0 && entry.is_active
  const canDelete = entry.source === 'user' && entry.usage_count === 0 && entry.is_active
  const canUnhide = !entry.is_active

  return (
    <>
      {showDeleteDialog && (
        <DeleteDialog
          name={entry.name}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setShowDeleteDialog(false)}
          isPending={deleteMut.isPending}
        />
      )}
      <tr
        className={cn(
          'border-b border-gray-100 dark:border-gray-800',
          inactive
            ? 'opacity-50'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        )}
      >
        <td className="py-2 pl-3 pr-3">
          <span className={cn('text-sm text-gray-900 dark:text-gray-100', inactive && 'line-through text-gray-400')}>
            {entry.name}
          </span>
          {inactive && (
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">Hidden</span>
          )}
        </td>

        {hasUrl && (
          <td className="py-2 pr-3">
            {entryUrl ? (
              <a
                href={entryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[180px]"
              >
                {entryUrl}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </td>
        )}

        <td className="py-2 pr-3">
          <span
            className={cn(
              'inline-block text-xs px-1.5 py-0.5 rounded font-medium',
              entry.source === 'yaml'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                : 'bg-gold/15 text-gold-700 dark:text-gold',
            )}
          >
            {entry.source}
          </span>
        </td>

        <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {entry.usage_count > 0 ? `${entry.usage_count} box${entry.usage_count === 1 ? '' : 'es'}` : '—'}
        </td>

        <td className="py-2 pr-3">
          {canUnhide ? (
            <button
              onClick={() => toggleMut.mutate()}
              disabled={toggleMut.isPending}
              className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
              title="Restore to dropdowns"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex gap-0.5">
              <button
                onClick={() => setEditing(true)}
                className="p-1 rounded text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {canHide && (
                <button
                  onClick={() => toggleMut.mutate()}
                  disabled={toggleMut.isPending}
                  className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  title="Hide from dropdowns (YAML entries are restored on restart)"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete permanently"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {entry.usage_count > 0 && (
                <span
                  className="p-1 text-xs text-gray-400 cursor-default"
                  title={`Used by ${entry.usage_count} boxes — cannot hide or delete`}
                >
                  🔒
                </span>
              )}
            </div>
          )}
        </td>
      </tr>
    </>
  )
}

// ---------------------------------------------------------------------------
// Accordion section
// ---------------------------------------------------------------------------

function AccordionSection({ config }: { config: SectionConfig }) {
  const queryClient = useQueryClient()
  const queryKey = [config.key, 'admin']

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addName, setAddName] = useState('')
  const [addUrl, setAddUrl] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: config.queryFn as () => Promise<AnyLookupItem[]>,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey })
    // Also invalidate form dropdown caches so hidden entries disappear from forms
    void queryClient.invalidateQueries({ queryKey: [config.key] })
  }

  const createMut = useMutation({
    mutationFn: () => config.createFn(addName.trim(), config.hasUrl ? (addUrl.trim() || null) : undefined),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Added', description: `${addName.trim()} added.` })
      setAddName('')
      setAddUrl('')
    },
    onError: (err: { detail?: string }) => {
      toast({ title: 'Error', description: err.detail ?? 'Failed to add entry', variant: 'destructive' })
    },
  })

  // Sort: active entries first (alphabetically), then inactive at bottom
  const sorted = [...data].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const filtered = search.trim()
    ? sorted.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : sorted

  const activeCount = data.filter((e) => e.is_active).length

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            {config.label}
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 tabular-nums">
            {isLoading ? '…' : activeCount}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {/* Search */}
          <div className="px-5 pt-4 pb-2">
            <input
              className={inputCls}
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="px-5 py-6 text-sm text-gray-400 text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-6 text-sm text-gray-400 text-center">
              {search ? 'No matching entries.' : 'No entries yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="pl-3 py-2.5 pr-3 font-medium">Name</th>
                    {config.hasUrl && <th className="py-2.5 pr-3 font-medium">Website</th>}
                    <th className="py-2.5 pr-3 font-medium">Source</th>
                    <th className="py-2.5 pr-3 font-medium">In Use</th>
                    <th className="py-2.5 pr-3 w-20 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      tableKey={config.key}
                      hasUrl={config.hasUrl}
                      onUpdated={invalidate}
                      onToggled={invalidate}
                      onDeleted={invalidate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add form */}
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <div className="flex gap-2 items-center">
              <input
                className={cn(inputCls, 'flex-1')}
                placeholder="New entry name…"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && addName.trim()) createMut.mutate()
                }}
              />
              {config.hasUrl && (
                <input
                  className={cn(inputCls, 'flex-1 font-mono text-xs')}
                  placeholder="https://… (optional)"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && addName.trim()) createMut.mutate()
                  }}
                />
              )}
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !addName.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-gold text-navy hover:bg-gold/90 disabled:opacity-40 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LookupsPage() {
  return (
    <AppShell>
      <TopBar title="Lookup Tables" />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-3">
        {SECTIONS.map((config) => (
          <AccordionSection key={config.key} config={config} />
        ))}
      </div>
    </AppShell>
  )
}
