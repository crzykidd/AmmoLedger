import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Crosshair, ChevronDown, ChevronUp, Delete, X, Hash } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { useAuth } from '@/contexts/AuthContext'
import { listAmmo } from '@/api/ammo'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import QuickExpendPopover from '@/components/QuickExpendPopover'
import { cn } from '@/lib/utils'

type KeypadMode = 'numpad' | 'text'

export default function AtRangePage() {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [keypadVisible, setKeypadVisible] = useState(
    () => localStorage.getItem('at_range_keypad_visible') !== 'false',
  )
  const [keypadMode, setKeypadMode] = useState<KeypadMode>('numpad')
  const [openPopoverBoxId, setOpenPopoverBoxId] = useState<number | null>(null)

  const lookups = useInventoryLookups()
  const caliberMap = useMemo(
    () => new Map(lookups.calibers.map((c) => [c.id, c.name])),
    [lookups.calibers],
  )
  const manufacturerMap = useMemo(
    () => new Map(lookups.manufacturers.map((m) => [m.id, m.name])),
    [lookups.manufacturers],
  )

  const { data } = useQuery({
    queryKey: ['ammo', { show_empty: true, show_archived: false }],
    queryFn: () => listAmmo({ show_empty: true, show_archived: false }),
  })

  const allBoxes = data?.boxes ?? []

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allBoxes
      .filter((b) => String(b.id).includes(q) || (b.legacy_id ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.id - b.id)
  }, [allBoxes, query])

  if (user?.role === 'read_only') {
    return (
      <AppShell>
        <TopBar title="At Range" />
        <div className="p-6 text-center text-gray-500">
          At Range mode is not available for read-only users.
        </div>
      </AppShell>
    )
  }

  const isNumericQuery = /^\d+$/.test(query.trim())
  const steppersDisabled = query.trim() === '' || !isNumericQuery
  const showSteppers = !(keypadVisible && keypadMode === 'text')
  const showKeypad = keypadVisible && openPopoverBoxId === null
  const inputMode = keypadVisible && keypadMode === 'numpad' ? 'none' : 'search'

  function focusInput() {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  function handleStep(delta: number) {
    if (steppersDisabled) return
    const next = Math.max(0, parseInt(query) + delta)
    setQuery(String(next))
    setTimeout(focusInput, 0)
  }

  function handleKeypadDigit(digit: string) {
    setQuery((q) => q + digit)
  }

  function handleKeypadBackspace() {
    setQuery((q) => q.slice(0, -1))
  }

  function handleSetKeypadVisible(visible: boolean) {
    setKeypadVisible(visible)
    localStorage.setItem('at_range_keypad_visible', String(visible))
    if (!visible) setKeypadMode('numpad')
  }

  function handleToggleMode() {
    if (keypadMode === 'numpad') {
      setKeypadMode('text')
      setTimeout(focusInput, 0)
    } else {
      setKeypadMode('numpad')
    }
  }

  return (
    <AppShell>
      <TopBar
        title="At Range"
        subtitle="Quickly log rounds used during a range session"
      />
      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* Search row */}
        <div className="flex items-center gap-2">
          {showSteppers && (
            <button
              onClick={() => handleStep(-1)}
              disabled={steppersDisabled}
              className="flex items-center justify-center w-11 h-12 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Decrease box ID"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            inputMode={inputMode}
            placeholder="Box ID or Legacy ID"
            autoFocus
            className="flex-1 h-12 px-4 text-lg rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/50"
          />
          {showSteppers && (
            <button
              onClick={() => handleStep(1)}
              disabled={steppersDisabled}
              className="flex items-center justify-center w-11 h-12 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Increase box ID"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Keypad */}
        {showKeypad && (
          <div className="relative bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => handleSetKeypadVisible(false)}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Hide keypad"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  onClick={() => handleKeypadDigit(d)}
                  className="h-16 text-2xl font-semibold rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={handleKeypadBackspace}
                className="h-16 flex items-center justify-center rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all"
                aria-label="Backspace"
              >
                <Delete className="w-6 h-6" />
              </button>
              <button
                onClick={() => handleKeypadDigit('0')}
                className="h-16 text-2xl font-semibold rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all"
              >
                0
              </button>
              <button
                onClick={handleToggleMode}
                className="h-16 text-sm font-semibold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all"
              >
                {keypadMode === 'numpad' ? 'ABC' : '123'}
              </button>
            </div>
          </div>
        )}

        {/* Show Keypad button */}
        {!keypadVisible && (
          <button
            onClick={() => handleSetKeypadVisible(true)}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <Hash className="w-4 h-4" />
            Show Keypad
          </button>
        )}

        {/* Results */}
        <div className="space-y-2">
          {query.trim() === '' ? (
            <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
              <Crosshair className="w-12 h-12 opacity-40" />
              <p className="text-sm text-center">Type a box ID to find your ammo and log rounds used.</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No boxes match — check the ID and try again.
            </div>
          ) : (
            matches.map((box) => {
              const caliberName = caliberMap.get(box.caliber_id) ?? '—'
              const manufacturerName = manufacturerMap.get(box.manufacturer_id) ?? '—'
              const isEmpty = box.qty_remaining === 0
              const isOpen = openPopoverBoxId === box.id

              const rowContent = (
                <div
                  className={cn(
                    'w-full text-left min-h-16 px-4 py-3 rounded-xl border transition-colors',
                    isEmpty
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                      : cn(
                          'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
                          isOpen ? 'border-gold/50 bg-gold/5' : 'hover:border-gold/40 hover:bg-gold/5',
                        ),
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-base text-gray-900 dark:text-white">
                        Box #{box.id} — {caliberName} {manufacturerName}
                        {box.legacy_id && box.legacy_id !== String(box.id) && (
                          <span className="ml-1 text-sm font-normal text-gray-400"> · ({box.legacy_id})</span>
                        )}
                      </p>
                      <p className={cn('text-sm mt-0.5', isEmpty ? 'text-red-500' : 'text-gray-500 dark:text-gray-400')}>
                        {isEmpty
                          ? `Empty — 0 of ${box.qty_original} rounds remaining`
                          : `${box.qty_remaining} of ${box.qty_original} rounds remaining${box.product_name ? ` · ${box.product_name}` : ''}`}
                      </p>
                    </div>
                    {isEmpty && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">
                        Empty
                      </span>
                    )}
                  </div>
                </div>
              )

              if (isEmpty) {
                return <div key={box.id}>{rowContent}</div>
              }

              return (
                <QuickExpendPopover
                  key={box.id}
                  box={box}
                  caliberName={caliberName}
                  manufacturerName={manufacturerName}
                  open={isOpen}
                  onOpenChange={(o) => setOpenPopoverBoxId(o ? box.id : null)}
                >
                  <button className="w-full text-left">
                    {rowContent}
                  </button>
                </QuickExpendPopover>
              )
            })
          )}
        </div>
      </div>
    </AppShell>
  )
}
