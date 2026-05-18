import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createFirearmComplianceTag,
  getFirearmComplianceTags,
} from '@/api/lookups'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { FirearmComplianceTagItem } from '@/types'

const DISCLAIMER_KEY = 'compliance_disclaimer_dismissed'

const JURISDICTION_ORDER = [
  'Federal',
  'NFA',
  'CA',
  'NY',
  'MA',
  'NJ',
  'Other',
  'Custom',
] as const

function jurisdictionGroup(tag: FirearmComplianceTagItem): string {
  if (tag.source === 'user') return 'Custom'
  return tag.jurisdiction && tag.jurisdiction.trim() !== '' ? tag.jurisdiction : 'Other'
}

interface Props {
  selectedIds: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}

export default function ComplianceTagPicker({ selectedIds, onChange, disabled }: Props) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customJurisdiction, setCustomJurisdiction] = useState('Custom')

  const { data: tags = [] } = useQuery({
    queryKey: ['firearm-compliance-tags'],
    queryFn: getFirearmComplianceTags,
    staleTime: 5 * 60 * 1000,
  })

  const grouped = useMemo(() => {
    const map = new Map<string, FirearmComplianceTagItem[]>()
    for (const t of tags) {
      if (!t.is_active) continue
      const g = jurisdictionGroup(t)
      const list = map.get(g) ?? []
      list.push(t)
      map.set(g, list)
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    const ordered: { group: string; items: FirearmComplianceTagItem[] }[] = []
    for (const g of JURISDICTION_ORDER) {
      const items = map.get(g)
      if (items && items.length > 0) ordered.push({ group: g, items })
    }
    // Pick up any unknown jurisdiction labels not in the order list
    for (const [g, items] of map) {
      if (!JURISDICTION_ORDER.includes(g as (typeof JURISDICTION_ORDER)[number])) {
        ordered.push({ group: g, items })
      }
    }
    return ordered
  }, [tags])

  const selected = useMemo(
    () => tags.filter((t) => selectedIds.includes(t.id)),
    [tags, selectedIds],
  )

  const handleOpenChange = (v: boolean) => {
    setOpen(v)
    if (v && localStorage.getItem(DISCLAIMER_KEY) !== 'true') {
      setShowDisclaimer(true)
    }
  }

  const dismissDisclaimer = () => {
    localStorage.setItem(DISCLAIMER_KEY, 'true')
    setShowDisclaimer(false)
  }

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const remove = (id: number) => {
    onChange(selectedIds.filter((x) => x !== id))
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFirearmComplianceTag({
        name: customName.trim(),
        description: customDesc.trim() || null,
        jurisdiction: customJurisdiction.trim() || null,
      }),
    onSuccess: (tag) => {
      void queryClient.invalidateQueries({ queryKey: ['firearm-compliance-tags'] })
      onChange([...selectedIds, tag.id])
      setShowAddCustom(false)
      setCustomName('')
      setCustomDesc('')
      setCustomJurisdiction('Custom')
      toast({ title: 'Custom compliance tag added' })
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Failed to create tag'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  return (
    <div className="flex flex-col gap-2">
      {/* Selected badges */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200"
            >
              {t.jurisdiction && t.source !== 'user' ? (
                <span className="text-gray-400 dark:text-gray-500">{t.jurisdiction}:</span>
              ) : null}
              {t.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-100"
                  aria-label={`Remove ${t.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Trigger */}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-md border border-gray-200 dark:border-gray-700',
              'bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-600 dark:text-gray-300',
              'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <span>
              {selected.length === 0
                ? 'Select compliance tags…'
                : `${selected.length} selected`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-h-80 overflow-y-auto p-2"
        >
          {showDisclaimer && (
            <div className="mb-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <p className="leading-relaxed">
                Compliance tags are community-maintained and may not reflect current law.
                AmmoLedger does not provide legal advice. Verify with the relevant authority.
              </p>
              <button
                type="button"
                onClick={dismissDisclaimer}
                className="mt-1 text-xs underline hover:no-underline"
              >
                Got it
              </button>
            </div>
          )}

          {grouped.length === 0 ? (
            <p className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
              No compliance tags available.
            </p>
          ) : (
            grouped.map(({ group, items }) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {group}
                </p>
                {items.map((t) => {
                  const checked = selectedIds.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      className={cn(
                        'flex w-full items-start gap-2 px-2 py-1.5 rounded-md text-sm text-left',
                        'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                        checked && 'bg-gold/10',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="mt-0.5 accent-gold shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 dark:text-gray-100">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          )}

          <div className="border-t border-gray-200 dark:border-gray-800 mt-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setShowAddCustom(true)
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gold hover:bg-gold/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Custom Compliance Tag
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Add custom dialog */}
      <Dialog open={showAddCustom} onOpenChange={setShowAddCustom}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Compliance Tag</DialogTitle>
            <DialogDescription>
              Use this if the community list doesn&apos;t yet cover a status that applies to
              your firearm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. WA Featureless"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Jurisdiction
              </label>
              <Input
                value={customJurisdiction}
                onChange={(e) => setCustomJurisdiction(e.target.value)}
                placeholder="e.g. WA, CA, Federal, Custom"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
              </label>
              <Textarea
                rows={2}
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="Optional description…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowAddCustom(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!customName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Adding…' : 'Add Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
