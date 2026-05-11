import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Plus } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import { buttonVariants } from '@/components/ui/button'
import { findSimilar } from '@/lib/levenshtein'
import { cn } from '@/lib/utils'

export interface LookupOption {
  id: number
  name: string
  /** "community" | "local" | "user" — drives the source badge. */
  source?: string | null
  /** Extra display text shown after the name in muted color. */
  hint?: string | null
}

export interface LookupComboboxProps {
  value: number | null
  options: LookupOption[]
  onChange: (id: number | null) => void
  /** Hits the backend POST and returns the new row. The combobox handles
   *  selecting it after creation. */
  onCreate?: (
    name: string,
  ) => Promise<{ id: number; name: string; source?: string | null }>
  placeholder?: string
  /** Used only inside the fuzzy-guard dialog text. The parent renders the
   *  visible field label. */
  label?: string
  disabled?: boolean
  /** Hide the "+ Create" affordance even when typing a new name. Used for
   *  read-only users and for cascading pickers without a parent selected. */
  disableCreate?: boolean
  /** Inline hint shown when create is suppressed by disableCreate. */
  disableCreateReason?: string
  showSourceBadges?: boolean
  required?: boolean
  id?: string
  'data-testid'?: string
}

export function LookupCombobox({
  value,
  options,
  onChange,
  onCreate,
  placeholder = 'Select…',
  label,
  disabled = false,
  disableCreate = false,
  disableCreateReason,
  showSourceBadges = true,
  required = false,
  id,
  'data-testid': testId,
}: LookupComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingCreate, setPendingCreate] = useState<{
    name: string
    suggestions: { name: string; distance: number; option: LookupOption }[]
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return [...options].sort((a, b) => {
        const aUser = a.source === 'user' ? 0 : 1
        const bUser = b.source === 'user' ? 0 : 1
        if (aUser !== bUser) return aUser - bUser
        return a.name.localeCompare(b.name)
      })
    }
    return options
      .filter((o) => o.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPrefix = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bPrefix = b.name.toLowerCase().startsWith(q) ? 0 : 1
        if (aPrefix !== bPrefix) return aPrefix - bPrefix
        return a.name.localeCompare(b.name)
      })
  }, [options, query])

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return options.find((o) => o.name.toLowerCase() === q) ?? null
  }, [options, query])

  const canShowCreate =
    !disableCreate && !!onCreate && query.trim().length > 0 && !exactMatch

  function handleSelect(opt: LookupOption) {
    onChange(opt.id)
    setQuery('')
    setOpen(false)
  }

  function handleCreateClick() {
    if (!onCreate) return
    const name = query.trim()
    if (!name) return
    setCreateError(null)
    const optionByName = new Map(options.map((o) => [o.name, o]))
    const similar = findSimilar(
      name,
      options.map((o) => o.name),
      3,
    )
      .map((s) => ({ ...s, option: optionByName.get(s.name)! }))
      .filter((s) => s.option != null)

    if (similar.length > 0) {
      setPendingCreate({ name, suggestions: similar })
      return
    }
    void doCreate(name)
  }

  async function doCreate(name: string) {
    if (!onCreate) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await onCreate(name)
      onChange(created.id)
      setQuery('')
      setOpen(false)
      setPendingCreate(null)
    } catch (e: unknown) {
      const msg =
        (e as { detail?: string; message?: string })?.detail ??
        (e as { message?: string })?.message ??
        'Could not create entry'
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
  }

  function handleUseExisting(opt: LookupOption) {
    onChange(opt.id)
    setQuery('')
    setPendingCreate(null)
    setOpen(false)
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) {
            setQuery('')
            setCreateError(null)
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            data-testid={testId}
            className={cn(
              'flex h-10 w-full items-center justify-between gap-2 rounded-md',
              'border border-gray-200 dark:border-gray-700',
              'bg-white dark:bg-gray-900 px-3 py-2 text-sm',
              'text-gray-900 dark:text-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <span
              className={cn(
                'truncate text-left flex-1',
                !selected && 'text-gray-400 dark:text-gray-500',
              )}
            >
              {selected ? (
                <>
                  {selected.name}
                  {showSourceBadges && selected.source === 'user' && (
                    <span className="ml-1.5 text-xs text-gray-400">(user)</span>
                  )}
                  {selected.hint && (
                    <span className="ml-1.5 text-xs text-gray-400">
                      · {selected.hint}
                    </span>
                  )}
                </>
              ) : (
                placeholder + (required ? ' *' : '')
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              ref={inputRef}
              className="w-full h-8 px-2 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
              placeholder="Search or type to create…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && !canShowCreate && (
              <div className="py-6 text-center text-sm text-gray-400">
                No matches.
              </div>
            )}
            {filtered.map((opt) => {
              const isSelected = opt.id === value
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors',
                    isSelected
                      ? 'bg-gold/10 text-gold'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
                  )}
                >
                  {isSelected ? (
                    <Check className="w-3.5 h-3.5 shrink-0 text-gold" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{opt.name}</span>
                  {showSourceBadges && opt.source === 'user' && (
                    <span className="text-xs text-gray-400 shrink-0">user</span>
                  )}
                  {opt.hint && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {opt.hint}
                    </span>
                  )}
                </button>
              )
            })}
            {canShowCreate && (
              <button
                type="button"
                disabled={creating}
                onClick={handleCreateClick}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2',
                  'border-t border-gray-100 dark:border-gray-800',
                  'text-gold hover:bg-gold/10 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">
                  {creating ? 'Creating…' : <>Create &ldquo;{query.trim()}&rdquo;</>}
                </span>
              </button>
            )}
            {disableCreate && disableCreateReason && query.trim() && !exactMatch && (
              <div className="px-3 py-2 text-xs text-gray-400 italic border-t border-gray-100 dark:border-gray-800">
                {disableCreateReason}
              </div>
            )}
            {createError && (
              <div className="px-3 py-2 text-xs text-red-500 border-t border-gray-100 dark:border-gray-800">
                {createError}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={pendingCreate !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPendingCreate(null)
            setCreateError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Did you mean one of these?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You typed{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    &ldquo;{pendingCreate?.name}&rdquo;
                  </span>
                  {label && <> for {label}</>}. These existing entries look
                  similar:
                </p>
                <div className="space-y-1.5">
                  {pendingCreate?.suggestions.map((s) => (
                    <button
                      key={s.option.id}
                      type="button"
                      onClick={() => handleUseExisting(s.option)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-md text-sm',
                        'border border-gray-200 dark:border-gray-700',
                        'bg-gray-50 dark:bg-gray-800 hover:bg-gold/10 hover:border-gold/30',
                        'transition-colors flex items-center justify-between gap-3',
                      )}
                    >
                      <span className="truncate">
                        <span className="font-medium">{s.option.name}</span>
                        {s.option.source === 'user' && (
                          <span className="ml-1.5 text-xs text-gray-400">
                            (user)
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        Use this
                      </span>
                    </button>
                  ))}
                </div>
                {createError && (
                  <p className="text-xs text-red-500">{createError}</p>
                )}
                <p className="text-xs text-gray-500">
                  If none of these are right, you can still create &ldquo;
                  {pendingCreate?.name}&rdquo; as a new entry.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (pendingCreate) void doCreate(pendingCreate.name)
              }}
              disabled={creating}
              className={cn(buttonVariants({ variant: 'default' }))}
            >
              {creating
                ? 'Creating…'
                : `Create "${pendingCreate?.name ?? ''}" anyway`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
