import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, Check, X } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getManufacturers, updateManufacturer, getDealers, updateDealer } from '@/api/lookups'
import type { ManufacturerItem, DealerItem } from '@/types'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const inputCls =
  'flex h-8 w-full rounded border border-gray-300 dark:border-gray-600 ' +
  'bg-white dark:bg-gray-800 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 ' +
  'focus:outline-none focus:ring-1 focus:ring-gold'

// ---------------------------------------------------------------------------
// Manufacturer row
// ---------------------------------------------------------------------------

function ManufacturerRow({ m }: { m: ManufacturerItem }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(m.name)
  const [url, setUrl] = useState(m.url ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateManufacturer(m.id, {
        name: name.trim() || undefined,
        url: url.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['manufacturers'] })
      toast({ title: 'Saved', description: `${name} updated.` })
      setEditing(false)
    },
    onError: (err: { detail?: string }) => {
      toast({
        title: 'Error',
        description: err.detail ?? 'Failed to update manufacturer',
        variant: 'destructive',
      })
    },
  })

  const handleCancel = () => {
    setName(m.name)
    setUrl(m.url ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800">
        <td className="py-2 pr-3">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
          />
        </td>
        <td className="py-2 pr-3">
          <input
            className={cn(inputCls, 'font-mono text-xs')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
          />
        </td>
        <td className="py-2 pr-3 text-xs text-gray-400">{m.source}</td>
        <td className="py-2">
          <div className="flex gap-1.5">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !name.trim()}
              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancel}
              disabled={mutation.isPending}
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

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="py-2 pr-3 text-sm text-gray-900 dark:text-gray-100">{m.name}</td>
      <td className="py-2 pr-3">
        {m.url ? (
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {m.url}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-gray-400">{m.source}</td>
      <td className="py-2">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Dealer row
// ---------------------------------------------------------------------------

function DealerRow({ d }: { d: DealerItem }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(d.name)
  const [url, setUrl] = useState(d.url ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateDealer(d.id, {
        name: name.trim() || undefined,
        url: url.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dealers'] })
      toast({ title: 'Saved', description: `${name} updated.` })
      setEditing(false)
    },
    onError: (err: { detail?: string }) => {
      toast({
        title: 'Error',
        description: err.detail ?? 'Failed to update dealer',
        variant: 'destructive',
      })
    },
  })

  const handleCancel = () => {
    setName(d.name)
    setUrl(d.url ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800">
        <td className="py-2 pr-3">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
          />
        </td>
        <td className="py-2 pr-3">
          <input
            className={cn(inputCls, 'font-mono text-xs')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
          />
        </td>
        <td className="py-2 pr-3 text-xs text-gray-400">{d.source}</td>
        <td className="py-2">
          <div className="flex gap-1.5">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !name.trim()}
              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancel}
              disabled={mutation.isPending}
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

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="py-2 pr-3 text-sm text-gray-900 dark:text-gray-100">{d.name}</td>
      <td className="py-2 pr-3">
        {d.url ? (
          <a
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {d.url}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-gray-400">{d.source}</td>
      <td className="py-2">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Lookup table card
// ---------------------------------------------------------------------------

function LookupCard({
  title,
  count,
  isLoading,
  children,
}: {
  title: string
  count: number
  isLoading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {count} entries — click the pencil icon to edit a name or URL
        </p>
      </div>
      {isLoading ? (
        <div className="px-5 py-8 text-sm text-gray-400 text-center">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-2.5 font-medium">Name</th>
                <th className="px-0 py-2.5 pr-3 font-medium">Website</th>
                <th className="py-2.5 pr-3 font-medium">Source</th>
                <th className="py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="px-5">{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LookupsPage() {
  const { data: manufacturers = [], isLoading: mfgLoading } = useQuery({
    queryKey: ['manufacturers'],
    queryFn: getManufacturers,
  })

  const { data: dealers = [], isLoading: dealersLoading } = useQuery({
    queryKey: ['dealers'],
    queryFn: getDealers,
  })

  return (
    <AppShell>
      <TopBar title="Lookup Tables" />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-8">

        <LookupCard title="Manufacturers" count={manufacturers.length} isLoading={mfgLoading}>
          {manufacturers.map((m) => (
            <ManufacturerRow key={m.id} m={m} />
          ))}
        </LookupCard>

        <LookupCard title="Dealers / Sources" count={dealers.length} isLoading={dealersLoading}>
          {dealers.map((d) => (
            <DealerRow key={d.id} d={d} />
          ))}
        </LookupCard>

      </div>
    </AppShell>
  )
}
