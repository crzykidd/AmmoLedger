import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight, ExternalLink, Pencil, Check, X,
  Eye, EyeOff, Trash2, Plus, RefreshCw, Bell, Copy, Globe,
} from 'lucide-react'
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
import {
  getCommunityStatus, triggerCommunitySync, importCommunityEntries,
  hideCommunityEntries, getContributeYaml,
} from '@/api/community'
import type { LookupItem, ManufacturerItem, DealerItem, LocationItem, ContainerItem } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnyLookupItem = LookupItem | ManufacturerItem | DealerItem | LocationItem | ContainerItem

interface SectionConfig {
  key: string
  label: string
  hasUrl: boolean
  communityManaged: boolean
  queryFn: () => Promise<AnyLookupItem[]>
  createFn: (name: string, url?: string | null) => Promise<AnyLookupItem>
}

// ---------------------------------------------------------------------------
// Section config
// ---------------------------------------------------------------------------

const SECTIONS: SectionConfig[] = [
  { key: 'calibers',        label: 'Calibers',        hasUrl: false, communityManaged: true,  queryFn: getCalibersAdmin,       createFn: (n) => createCalibersEntry(n) },
  { key: 'manufacturers',   label: 'Manufacturers',   hasUrl: true,  communityManaged: true,  queryFn: getManufacturersAdmin,  createFn: (n, u) => createManufacturerEntry(n, u) },
  { key: 'ammo-types',      label: 'Ammo Types',      hasUrl: false, communityManaged: true,  queryFn: getAmmoTypesAdmin,      createFn: (n) => createAmmoTypeEntry(n) },
  { key: 'categories',      label: 'Categories',      hasUrl: false, communityManaged: false, queryFn: getCategoriesAdmin,     createFn: (n) => createCategoryEntry(n) },
  { key: 'ammo-conditions', label: 'Ammo Conditions', hasUrl: false, communityManaged: false, queryFn: getAmmoConditionsAdmin, createFn: (n) => createAmmoConditionEntry(n) },
  { key: 'dealers',         label: 'Dealers',         hasUrl: true,  communityManaged: true,  queryFn: getDealersAdmin,        createFn: (n, u) => createDealerEntry(n, u) },
  { key: 'locations',       label: 'Locations',       hasUrl: false, communityManaged: false, queryFn: getLocationsAdmin,      createFn: (n) => createLocationEntry(n) },
  { key: 'containers',      label: 'Containers',      hasUrl: false, communityManaged: false, queryFn: getContainersAdmin,     createFn: (n) => createContainerEntry(n) },
]

// community table key used in /community/status (ammo-types → ammo_types)
const COMMUNITY_KEY_MAP: Record<string, string> = {
  'calibers': 'calibers',
  'manufacturers': 'manufacturers',
  'ammo-types': 'ammo_types',
  'dealers': 'dealers',
}

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
  name, onConfirm, onCancel, isPending,
}: { name: string; onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete entry?</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
          Delete <span className="font-medium text-gray-900 dark:text-white">{name}</span>?{' '}
          This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={isPending}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isPending}
            className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pending import dialog
// ---------------------------------------------------------------------------

function PendingImportDialog({
  tableKey, entries, onClose, onDone,
}: { tableKey: string; entries: AnyLookupItem[]; onClose: () => void; onDone: () => void }) {
  const communityKey = COMMUNITY_KEY_MAP[tableKey] ?? tableKey
  const [checked, setChecked] = useState<Set<number>>(new Set(entries.map((e) => e.id)))

  const toggle = (id: number) =>
    setChecked((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const importMut = useMutation({
    mutationFn: () => importCommunityEntries(communityKey, Array.from(checked)),
    onSuccess: ({ imported }) => {
      toast({ title: 'Imported', description: `${imported} entr${imported === 1 ? 'y' : 'ies'} added to dropdowns.` })
      onDone()
    },
    onError: () => toast({ title: 'Error', description: 'Import failed', variant: 'destructive' }),
  })

  const hideMut = useMutation({
    mutationFn: () => {
      const unchecked = entries.filter((e) => !checked.has(e.id)).map((e) => e.id)
      return unchecked.length ? hideCommunityEntries(communityKey, unchecked) : Promise.resolve({ ok: true })
    },
    onSuccess: () => {
      importMut.mutate()
    },
  })

  const handleApply = () => hideMut.mutate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-lg w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Review new community entries
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Select entries to add to your dropdowns. Unchecked entries will be hidden.
        </p>

        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 mb-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          {entries.map((entry) => (
            <label key={entry.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <input
                type="checkbox"
                checked={checked.has(entry.id)}
                onChange={() => toggle(entry.id)}
                className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold"
              />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{entry.name}</span>
              {'url' in entry && entry.url && (
                <span className="text-xs text-gray-400 truncate max-w-[140px]">{entry.url}</span>
              )}
              {'country' in entry && entry.country && (
                <span className="text-xs text-gray-400">{entry.country}</span>
              )}
            </label>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">{checked.size} / {entries.length} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button onClick={handleApply} disabled={hideMut.isPending || importMut.isPending}
              className="px-3 py-1.5 text-sm rounded bg-gold text-navy font-medium hover:bg-gold/90 disabled:opacity-50">
              {hideMut.isPending || importMut.isPending ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contribute dialog
// ---------------------------------------------------------------------------

function ContributeDialog({ tableKey, onClose }: { tableKey: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['community-contribute', tableKey],
    queryFn: () => getContributeYaml(tableKey),
  })

  const handleCopy = () => {
    if (data?.yaml) {
      void navigator.clipboard.writeText(data.yaml)
      toast({ title: 'Copied', description: 'YAML copied to clipboard.' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-xl w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Generate PR Content</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Copy this YAML and paste it into the community file on GitHub.
        </p>

        {isLoading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Loading…</div>
        ) : !data || data.count === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
            No user-created entries to contribute.
          </div>
        ) : (
          <>
            <textarea
              readOnly
              value={data.yaml}
              rows={10}
              className="w-full font-mono text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-3 text-gray-800 dark:text-gray-200 resize-none mb-3"
            />
            <div className="flex gap-2 mb-3">
              <button onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                <Copy className="h-3.5 w-3.5" />
                Copy to Clipboard
              </button>
              {data.github_url && (
                <a href={data.github_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200">
                  <Globe className="h-3.5 w-3.5" />
                  Open GitHub
                </a>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end">
          <button onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: string }) {
  const cls = cn(
    'inline-block text-xs px-1.5 py-0.5 rounded font-medium',
    source === 'community'
      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      : source === 'user'
      ? 'bg-gold/15 text-gold-700 dark:text-gold'
      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  )
  return <span className={cls}>{source}</span>
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function EntryRow({
  entry, tableKey, hasUrl, onUpdated, onToggled, onDeleted,
}: {
  entry: AnyLookupItem; tableKey: string; hasUrl: boolean
  onUpdated: () => void; onToggled: () => void; onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(entry.name)
  const [url, setUrl] = useState('url' in entry ? (entry.url ?? '') : '')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const entryUrl = 'url' in entry ? entry.url : null

  const updateMut = useMutation({
    mutationFn: () => updateLookupEntry(tableKey, entry.id, { name: name.trim(), url: hasUrl ? (url.trim() || null) : undefined }),
    onSuccess: () => { onUpdated(); toast({ title: 'Saved', description: `${name} updated.` }); setEditing(false) },
    onError: (err: { detail?: string }) => toast({ title: 'Error', description: err.detail ?? 'Failed to update', variant: 'destructive' }),
  })

  const toggleMut = useMutation({
    mutationFn: () => toggleLookupActive(tableKey, entry.id),
    onSuccess: () => { onToggled(); toast({ title: entry.is_active ? 'Hidden' : 'Visible', description: `${entry.name} ${entry.is_active ? 'hidden from dropdowns' : 'restored'}.` }) },
    onError: (err: { detail?: string }) => toast({ title: 'Error', description: err.detail ?? 'Failed', variant: 'destructive' }),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteLookupEntry(tableKey, entry.id),
    onSuccess: () => { setShowDeleteDialog(false); onDeleted(); toast({ title: 'Deleted', description: `${entry.name} deleted.` }) },
    onError: (err: { detail?: string }) => { setShowDeleteDialog(false); toast({ title: 'Error', description: err.detail ?? 'Failed to delete', variant: 'destructive' }) },
  })

  const handleCancel = () => { setName(entry.name); setUrl('url' in entry ? (entry.url ?? '') : ''); setEditing(false) }
  const inactive = !entry.is_active

  if (editing) {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800 bg-amber-50/40 dark:bg-amber-900/10">
        <td className="py-2 pl-3 pr-3">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') handleCancel() }} autoFocus />
        </td>
        {hasUrl && (
          <td className="py-2 pr-3">
            <input className={cn(inputCls, 'font-mono text-xs')} value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…" onKeyDown={(e) => { if (e.key === 'Escape') handleCancel() }} />
          </td>
        )}
        <td className="py-2 pr-3" /><td className="py-2 pr-3" />
        <td className="py-2 pr-3">
          <div className="flex gap-1.5">
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending || !name.trim()}
              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40" title="Save">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={handleCancel} disabled={updateMut.isPending}
              className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const canHide = (entry.source === 'yaml' || entry.source === 'community') && entry.usage_count === 0 && entry.is_active
  const canDelete = entry.source === 'user' && entry.usage_count === 0 && entry.is_active
  const canUnhide = !entry.is_active

  return (
    <>
      {showDeleteDialog && (
        <DeleteDialog name={entry.name} onConfirm={() => deleteMut.mutate()}
          onCancel={() => setShowDeleteDialog(false)} isPending={deleteMut.isPending} />
      )}
      <tr className={cn('border-b border-gray-100 dark:border-gray-800', inactive ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50')}>
        <td className="py-2 pl-3 pr-3">
          <span className={cn('text-sm text-gray-900 dark:text-gray-100', inactive && 'line-through text-gray-400')}>
            {entry.name}
          </span>
          {inactive && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">Hidden</span>}
          {'is_imported' in entry && !entry.is_imported && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">Pending review</span>
          )}
        </td>

        {hasUrl && (
          <td className="py-2 pr-3">
            {entryUrl ? (
              <a href={entryUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[180px]">
                {entryUrl}<ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </td>
        )}

        <td className="py-2 pr-3"><SourceBadge source={entry.source} /></td>
        <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {entry.usage_count > 0 ? `${entry.usage_count} box${entry.usage_count === 1 ? '' : 'es'}` : '—'}
        </td>

        <td className="py-2 pr-3">
          {canUnhide ? (
            <button onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}
              className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title="Restore to dropdowns">
              <Eye className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex gap-0.5">
              <button onClick={() => setEditing(true)}
                className="p-1 rounded text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {canHide && (
                <button onClick={() => toggleMut.mutate()} disabled={toggleMut.isPending}
                  className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Hide from dropdowns">
                  <EyeOff className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button onClick={() => setShowDeleteDialog(true)}
                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete permanently">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {entry.usage_count > 0 && (
                <span className="p-1 text-xs text-gray-400 cursor-default" title={`Used by ${entry.usage_count} boxes — cannot hide or delete`}>🔒</span>
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

function AccordionSection({ config, communityStatus }: {
  config: SectionConfig
  communityStatus: Record<string, { pending: number }> | undefined
}) {
  const queryClient = useQueryClient()
  const queryKey = [config.key, 'admin']

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addName, setAddName] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showContributeDialog, setShowContributeDialog] = useState(false)

  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: config.queryFn as () => Promise<AnyLookupItem[]>,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({ queryKey: [config.key] })
    void queryClient.invalidateQueries({ queryKey: ['community-status'] })
  }

  const createMut = useMutation({
    mutationFn: () => config.createFn(addName.trim(), config.hasUrl ? (addUrl.trim() || null) : undefined),
    onSuccess: () => { invalidate(); toast({ title: 'Added', description: `${addName.trim()} added.` }); setAddName(''); setAddUrl('') },
    onError: (err: { detail?: string }) => toast({ title: 'Error', description: err.detail ?? 'Failed to add entry', variant: 'destructive' }),
  })

  const sorted = [...data].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const filtered = search.trim()
    ? sorted.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : sorted

  const activeCount = data.filter((e) => e.is_active).length

  const communityKey = COMMUNITY_KEY_MAP[config.key]
  const pending = config.communityManaged && communityKey
    ? (communityStatus?.[communityKey]?.pending ?? 0)
    : 0
  const pendingEntries = pending > 0
    ? (data as AnyLookupItem[]).filter((e) => 'is_imported' in e && !e.is_imported)
    : []

  return (
    <>
      {showImportDialog && pendingEntries.length > 0 && (
        <PendingImportDialog
          tableKey={config.key}
          entries={pendingEntries}
          onClose={() => setShowImportDialog(false)}
          onDone={() => { setShowImportDialog(false); invalidate() }}
        />
      )}
      {showContributeDialog && (
        <ContributeDialog tableKey={communityKey ?? config.key} onClose={() => setShowContributeDialog(false)} />
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {/* Header */}
        <button type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          onClick={() => setIsOpen((v) => !v)}>
          <div className="flex items-center gap-3">
            {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <span className="text-base font-semibold text-gray-900 dark:text-white">{config.label}</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 tabular-nums">
              {isLoading ? '…' : activeCount}
            </span>
            {pending > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                {pending} new
              </span>
            )}
          </div>
        </button>

        {isOpen && (
          <div className="border-t border-gray-100 dark:border-gray-800">
            {/* Pending banner */}
            {pending > 0 && (
              <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm text-amber-800 dark:text-amber-200">
                    <span className="font-medium">{pending} new community {config.label.toLowerCase()}</span> available
                  </span>
                </div>
                <button onClick={() => setShowImportDialog(true)}
                  className="shrink-0 px-3 py-1.5 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700">
                  Review &amp; Import
                </button>
              </div>
            )}

            {/* Search */}
            <div className="px-5 pt-4 pb-2">
              <input className={inputCls} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                      <EntryRow key={entry.id} entry={entry} tableKey={config.key} hasUrl={config.hasUrl}
                        onUpdated={invalidate} onToggled={invalidate} onDeleted={invalidate} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add form */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex gap-2 items-center">
                <input className={cn(inputCls, 'flex-1')} placeholder="New entry name…" value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && addName.trim()) createMut.mutate() }} />
                {config.hasUrl && (
                  <input className={cn(inputCls, 'flex-1 font-mono text-xs')} placeholder="https://… (optional)" value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && addName.trim()) createMut.mutate() }} />
                )}
                <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !addName.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-gold text-navy hover:bg-gold/90 disabled:opacity-40 shrink-0">
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </div>

            {/* Contribute section (community-managed tables only) */}
            {config.communityManaged && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Have entries not in the community list? Share them with all AmmoLedger users.
                  </p>
                  <button onClick={() => setShowContributeDialog(true)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <Globe className="h-3.5 w-3.5" />
                    Generate PR Content
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LookupsPage() {
  const queryClient = useQueryClient()

  const { data: communityStatus } = useQuery({
    queryKey: ['community-status'],
    queryFn: getCommunityStatus,
    refetchInterval: 60_000,
  })

  const syncMut = useMutation({
    mutationFn: triggerCommunitySync,
    onSuccess: () => {
      toast({ title: 'Community sync complete', description: 'Lookup tables updated from GitHub.' })
      void queryClient.invalidateQueries({ queryKey: ['community-status'] })
      SECTIONS.filter((s) => s.communityManaged).forEach((s) => {
        void queryClient.invalidateQueries({ queryKey: [s.key, 'admin'] })
      })
    },
    onError: () => toast({ title: 'Sync failed', description: 'Could not reach GitHub.', variant: 'destructive' }),
  })

  const pendingTotal = communityStatus
    ? Object.values(communityStatus).reduce((sum, s) => sum + s.pending, 0)
    : 0

  return (
    <AppShell>
      <TopBar
        title="Lookup Tables"
        actions={
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncMut.isPending && 'animate-spin')} />
            {syncMut.isPending ? 'Syncing…' : 'Check for Updates'}
            {pendingTotal > 0 && !syncMut.isPending && (
              <span className="ml-1 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pendingTotal}
              </span>
            )}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-3">
        {SECTIONS.map((config) => (
          <AccordionSection
            key={config.key}
            config={config}
            communityStatus={communityStatus as Record<string, { pending: number }> | undefined}
          />
        ))}
      </div>
    </AppShell>
  )
}
