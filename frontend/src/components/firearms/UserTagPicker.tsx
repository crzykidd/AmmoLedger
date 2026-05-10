import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, ChevronDown, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  createFirearmUserTag,
  deleteFirearmUserTag,
  getFirearmUserTags,
} from '@/api/lookups'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { FirearmUserTagItem } from '@/types'

const PRESET_COLORS: { name: string; hex: string }[] = [
  { name: 'amber', hex: '#f59e0b' },
  { name: 'red', hex: '#ef4444' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'green', hex: '#10b981' },
  { name: 'purple', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'gray', hex: '#6b7280' },
]

const inputCls =
  'flex h-9 w-full rounded-md border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent'

interface Props {
  selectedIds: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}

/**
 * Picks a foreground (text) color for a swatch background. Hex values match the
 * PRESET_COLORS list — anything else falls back to a sensible neutral.
 */
function fgFor(hex: string | null): string {
  if (!hex) return '#1f2937'
  // dark backgrounds → white text
  const dark = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280', '#ef4444']
  return dark.includes(hex.toLowerCase()) ? '#ffffff' : '#1f2937'
}

export function UserTagBadge({ tag, onRemove }: { tag: FirearmUserTagItem; onRemove?: () => void }) {
  const bg = tag.color ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: fgFor(bg) }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-70 hover:opacity-100"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

export default function UserTagPicker({ selectedIds, onChange, disabled }: Props) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[0].hex)

  const { data: tags = [] } = useQuery({
    queryKey: ['firearm-user-tags'],
    queryFn: getFirearmUserTags,
    staleTime: 5 * 60 * 1000,
  })

  const selected = tags.filter((t) => selectedIds.includes(t.id))

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
    mutationFn: () => createFirearmUserTag({ name: newName.trim(), color: newColor }),
    onSuccess: (tag) => {
      void queryClient.invalidateQueries({ queryKey: ['firearm-user-tags'] })
      onChange([...selectedIds, tag.id])
      setShowNew(false)
      setNewName('')
      setNewColor(PRESET_COLORS[0].hex)
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Failed to create tag'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFirearmUserTag(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ['firearm-user-tags'] })
      onChange(selectedIds.filter((x) => x !== id))
      toast({ title: 'Tag deleted' })
    },
    onError: (e: unknown) => {
      const msg = (e as { detail?: string })?.detail ?? 'Failed to delete tag'
      toast({ title: 'Error', description: msg, variant: 'destructive' })
    },
  })

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <UserTagBadge
              key={t.id}
              tag={t}
              onRemove={disabled ? undefined : () => remove(t.id)}
            />
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
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
                ? 'Select personal tags…'
                : `${selected.length} selected`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-h-80 overflow-y-auto p-2"
        >
          {tags.length === 0 ? (
            <p className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
              No personal tags yet.
            </p>
          ) : (
            <div className="space-y-1">
              {tags.map((t) => {
                const checked = selectedIds.includes(t.id)
                return (
                  <div
                    key={t.id}
                    className={cn(
                      'flex items-center gap-2 px-1 py-1 rounded-md transition-colors',
                      'hover:bg-gray-100 dark:hover:bg-gray-800',
                      checked && 'bg-gold/10',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="accent-gold shrink-0"
                      />
                      <UserTagBadge tag={t} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete tag "${t.name}"? This removes it from all firearms.`)) {
                          deleteMutation.mutate(t.id)
                        }
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      aria-label={`Delete tag ${t.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-800 mt-2 pt-2">
            {showNew ? (
              <div className="space-y-2 px-1">
                <input
                  className={inputCls}
                  placeholder="Tag name (e.g. Carry, Heirloom)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewColor(c.hex)}
                      className={cn(
                        'w-6 h-6 rounded-full ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 transition-all',
                        newColor === c.hex ? 'ring-gold' : 'ring-transparent',
                      )}
                      style={{ backgroundColor: c.hex }}
                      aria-label={`Color ${c.name}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowNew(false)
                      setNewName('')
                    }}
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => createMutation.mutate()}
                    disabled={!newName.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gold hover:bg-gold/10 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Tag
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
