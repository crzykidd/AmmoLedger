import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  Info,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { HelpTip } from '@/components/HelpTip'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import {
  confirmFirearmsImport,
  getFirearmsImportTemplateUrl,
  validateFirearmsImport,
} from '@/api/firearmsImport'
import type {
  FirearmsImportConfirmResult,
  FirearmsImportSimilarityMatch,
  FirearmsImportValidationResult,
} from '@/types'

// ---------------------------------------------------------------------------
// Token countdown
// ---------------------------------------------------------------------------

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return }
    const tick = () => {
      const secs = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      setRemaining(Math.max(secs, 0))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return remaining
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Expandable list (used for new flat lookup tables)
// ---------------------------------------------------------------------------

function ExpandableList({ label, items }: { label: string; items: string[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gold transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label} ({items.length})
      </button>
      {open && (
        <ul className="mt-1 ml-5 space-y-0.5">
          {items.map((item) => (
            <li key={item} className="text-xs text-gray-600 dark:text-gray-400">{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload (Step 1)
// ---------------------------------------------------------------------------

function UploadState({
  onValidated,
}: {
  onValidated: (result: FirearmsImportValidationResult, file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleValidate = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const result = await validateFirearmsImport(file)
      onValidated(result, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <FileUp className="h-6 w-6 text-gold shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Import Firearms from CSV
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Use the AmmoLedger firearms export format. Round-trip compatible — re-importing an unmodified export produces semantically equivalent rows.
            </p>
          </div>
        </div>

        <a
          href={getFirearmsImportTemplateUrl()}
          download="firearms_import_template.csv"
          className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
        >
          <Download className="h-4 w-4" />
          Download Template
        </a>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null) } }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'w-full rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 py-8 text-sm text-gray-500 dark:text-gray-400',
              'hover:border-gold hover:text-gold transition-colors cursor-pointer',
              file && 'border-gold/40 bg-gold/5',
            )}
          >
            {file ? (
              <span className="text-gray-900 dark:text-white font-medium">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </span>
            ) : (
              'Choose CSV file or click to browse'
            )}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1.5">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <Button
          onClick={() => void handleValidate()}
          disabled={!file || loading}
          className="w-full"
        >
          {loading ? 'Validating…' : 'Validate File'}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field labels
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  manufacturer: 'Manufacturer',
  caliber: 'Caliber',
  action_type: 'Action Type',
  dealer: 'Dealer',
  model: 'Model',
  frame_size: 'Frame Size',
  optic_cut: 'Optic Cut',
  rail_type: 'Rail Type',
  finish: 'Finish',
  compliance_tags: 'Compliance Tag',
  user_tags: 'User Tag',
}

const TABLE_LABELS: Record<string, string> = {
  manufacturers: 'Manufacturers',
  calibers: 'Calibers',
  firearm_action_types: 'Action Types',
  dealers: 'Dealers',
  firearm_frame_sizes: 'Frame Sizes',
  firearm_optic_cuts: 'Optic Cuts',
  firearm_rail_types: 'Rail Types',
  firearm_finishes: 'Finishes',
  firearm_compliance_tags: 'Compliance Tags',
  firearm_user_tags: 'User Tags',
}

// ---------------------------------------------------------------------------
// Similarity resolution grid
// ---------------------------------------------------------------------------

function SimilarityResolutionGrid({
  matches,
  decisions,
  onChange,
}: {
  matches: FirearmsImportSimilarityMatch[]
  decisions: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  if (!matches.length) return null
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Similar values found — choose how to handle each match
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <th className="px-4 py-2 font-medium">Field</th>
              <th className="px-4 py-2 font-medium">Your CSV Value</th>
              <th className="px-4 py-2 font-medium">Existing Value</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {matches.map((m) => {
              const key = `${m.field}:${m.csv_value}${m.manufacturer_context ? `:${m.manufacturer_context}` : ''}`
              const decision = decisions[key] ?? m.default_action
              return (
                <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                    {FIELD_LABELS[m.field] ?? m.field}
                    {m.manufacturer_context && (
                      <span className="block text-[10px] text-gray-400 mt-0.5">
                        under {m.manufacturer_context}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200 whitespace-nowrap">
                    {m.csv_value}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800 dark:text-gray-200 whitespace-nowrap">
                    {m.existing_value}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={key}
                          checked={decision === 'use_existing'}
                          onChange={() => onChange(key, 'use_existing')}
                          className="accent-gold"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">Use existing</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={key}
                          checked={decision === 'import_new'}
                          onChange={() => onChange(key, 'import_new')}
                          className="accent-gold"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">Import as new</span>
                      </label>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New-values panel — handles flat tables + the cascading
// firearm_models_by_manufacturer group.
// ---------------------------------------------------------------------------

function NewValuesPanel({
  newValues,
  remappedFlat,
  remappedModelsByMfr,
}: {
  newValues: Record<string, string[] | Record<string, string[]>>
  remappedFlat: Record<string, Set<string>>
  remappedModelsByMfr: Record<string, Set<string>>
}) {
  const flatEntries: [string, string[]][] = []
  let modelsByMfr: Record<string, string[]> | null = null

  for (const [key, val] of Object.entries(newValues)) {
    if (key === 'firearm_models_by_manufacturer' && !Array.isArray(val)) {
      modelsByMfr = val as Record<string, string[]>
    } else if (Array.isArray(val)) {
      flatEntries.push([key, val])
    }
  }

  // Filter out remapped values from each list before deciding visibility.
  const visibleFlat = flatEntries
    .map(([table, items]): [string, string[]] => {
      const remapped = remappedFlat[table] ?? new Set()
      return [table, items.filter((i) => !remapped.has(i))]
    })
    .filter(([, items]) => items.length > 0)

  const visibleModelsByMfr = modelsByMfr
    ? Object.entries(modelsByMfr)
        .map(([mfr, models]): [string, string[]] => [
          mfr,
          models.filter((m) => !(remappedModelsByMfr[mfr] ?? new Set()).has(m)),
        ])
        .filter(([, models]) => models.length > 0)
    : []

  if (visibleFlat.length === 0 && visibleModelsByMfr.length === 0) return null

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-2">
      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
        New lookup values will be created:
      </p>
      {visibleFlat.map(([table, items]) => (
        <ExpandableList
          key={table}
          label={TABLE_LABELS[table] ?? table}
          items={items}
        />
      ))}
      {visibleModelsByMfr.length > 0 && (
        <div className="pt-1">
          <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
            Firearm models (scoped under their manufacturer):
          </p>
          {visibleModelsByMfr.map(([mfr, models]) => (
            <ExpandableList
              key={mfr}
              label={`under ${mfr}`}
              items={models}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Validation (Step 2)
// ---------------------------------------------------------------------------

function ValidationState({
  result,
  file,
  onBack,
  onImported,
}: {
  result: FirearmsImportValidationResult
  file: File
  onBack: () => void
  onImported: (res: FirearmsImportConfirmResult) => void
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isReadOnly = user?.role === 'read_only'

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(false)
  const [similarityDecisions, setSimilarityDecisions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const m of result.similarity_matches ?? []) {
      const key = `${m.field}:${m.csv_value}${m.manufacturer_context ? `:${m.manufacturer_context}` : ''}`
      initial[key] = m.default_action
    }
    return initial
  })
  const countdown = useCountdown(result.token_expires_at)
  const expired = countdown !== null && countdown <= 0

  const handleDecisionChange = (key: string, value: string) => {
    setSimilarityDecisions((prev) => ({ ...prev, [key]: value }))
  }

  const handleConfirmImport = async () => {
    // Build the value_remaps payload from "use_existing" decisions. Note that
    // cascading model remaps are applied by manufacturer-name — the backend
    // resolves the model under the row's manufacturer regardless, so a flat
    // {model: {csv_value: existing_value}} mapping is sufficient.
    const valueRemaps: Record<string, Record<string, string>> = {}
    for (const m of result.similarity_matches ?? []) {
      const key = `${m.field}:${m.csv_value}${m.manufacturer_context ? `:${m.manufacturer_context}` : ''}`
      if (similarityDecisions[key] === 'use_existing') {
        if (!valueRemaps[m.field]) valueRemaps[m.field] = {}
        valueRemaps[m.field][m.csv_value] = m.existing_value
      }
    }
    setImporting(true)
    setImportError(null)
    try {
      const res = await confirmFirearmsImport(file, result.validation_token, isShared, valueRemaps)
      onImported(res)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // Build per-table sets of CSV values being remapped (so they don't appear
  // in the "new values" panel).
  const remappedFlat: Record<string, Set<string>> = {}
  const remappedModelsByMfr: Record<string, Set<string>> = {}
  for (const m of result.similarity_matches ?? []) {
    const key = `${m.field}:${m.csv_value}${m.manufacturer_context ? `:${m.manufacturer_context}` : ''}`
    if (similarityDecisions[key] !== 'use_existing') continue
    if (m.manufacturer_context) {
      if (!remappedModelsByMfr[m.manufacturer_context]) {
        remappedModelsByMfr[m.manufacturer_context] = new Set()
      }
      remappedModelsByMfr[m.manufacturer_context].add(m.csv_value)
    } else {
      if (!remappedFlat[m.table_key]) remappedFlat[m.table_key] = new Set()
      remappedFlat[m.table_key].add(m.csv_value)
    }
  }

  const rowWarnings = result.warnings.filter((w) => w.row !== null)

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Summary */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Validation Results</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{result.importable_rows}</div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">rows ready</div>
          </div>
          <div className={cn(
            'text-center rounded-lg p-3 border',
            result.error_rows > 0
              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
          )}>
            <div className={cn('text-2xl font-bold', result.error_rows > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400')}>
              {result.error_rows}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">rows with errors</div>
          </div>
          <div className={cn(
            'text-center rounded-lg p-3 border',
            result.warning_count > 0
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
          )}>
            <div className={cn('text-2xl font-bold', result.warning_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400')}>
              {result.warning_count}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">warnings</div>
          </div>
        </div>
      </div>

      {/* New values */}
      <NewValuesPanel
        newValues={result.new_values}
        remappedFlat={remappedFlat}
        remappedModelsByMfr={remappedModelsByMfr}
      />

      {/* Similarity resolution grid */}
      {(result.similarity_matches ?? []).length > 0 && (
        <SimilarityResolutionGrid
          matches={result.similarity_matches}
          decisions={similarityDecisions}
          onChange={handleDecisionChange}
        />
      )}

      {/* Row errors */}
      {result.errors.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Rows with errors (will be skipped):
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-1 pr-4">Row</th>
                  <th className="pb-1 pr-4">Field</th>
                  <th className="pb-1">Issue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {result.errors.map((e, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-4 text-gray-500">{e.row}</td>
                    <td className="py-1 pr-4 font-mono text-gray-600 dark:text-gray-400">{e.field}</td>
                    <td className="py-1 text-red-600 dark:text-red-400">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Row warnings */}
      {rowWarnings.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Warnings (rows import with adjustments):
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-1 pr-4">Row</th>
                  <th className="pb-1 pr-4">Field</th>
                  <th className="pb-1">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rowWarnings.map((w, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-4 text-gray-500">{w.row}</td>
                    <td className="py-1 pr-4 font-mono text-gray-600 dark:text-gray-400">{w.field}</td>
                    <td className="py-1 text-amber-600 dark:text-amber-400">{w.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Token expiry */}
      <div className={cn(
        'text-sm rounded-lg px-3 py-2',
        expired
          ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
          : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
      )}>
        {expired
          ? 'Validation expired — please re-validate'
          : countdown !== null
            ? `Validation expires in ${formatCountdown(countdown)} — import before then or re-validate`
            : 'Validating expiry…'
        }
      </div>

      {/* Ownership — admin only. Members always import private. */}
      {isAdmin ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Ownership</p>
            <HelpTip text="Shared firearms are visible to all household members. Private firearms are only visible to the owner and admins." />
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="firearms_import_ownership"
                checked={!isShared}
                onChange={() => setIsShared(false)}
                className="mt-0.5 accent-gold"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Private</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Visible to the owner of each row and admins. (Default.)
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="firearms_import_ownership"
                checked={isShared}
                onChange={() => setIsShared(true)}
                className="mt-0.5 accent-gold"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Shared</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Every imported row will be visible to all members. Useful for household-wide collections.
                </p>
              </div>
            </label>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Imported firearms will be private to you. Only admins can import as shared.
          </p>
        </div>
      )}

      {importError && (
        <p className="text-sm text-red-500 flex items-center gap-1.5">
          <XCircle className="h-4 w-4 shrink-0" />
          {importError}
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} disabled={importing}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        {!isReadOnly && (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!result.valid || expired || importing || result.importable_rows === 0}
            className="flex-1"
          >
            {importing ? 'Importing…' : `Confirm Import (${result.importable_rows} firearms)`}
          </Button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import {result.importable_rows} firearms?</AlertDialogTitle>
            <AlertDialogDescription>
              A backup will be created automatically before importing.
              {result.error_rows > 0 && ` ${result.error_rows} rows with errors will be skipped.`}
              {' '}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmImport()}>
              Confirm Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result (Step 3)
// ---------------------------------------------------------------------------

function ResultState({
  result,
  onReset,
}: {
  result: FirearmsImportConfirmResult
  onReset: () => void
}) {
  const navigate = useNavigate()
  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-emerald-500 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
              Import complete!
            </h2>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
              Your firearm registry has been updated.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <Stat label="Firearms imported" value={result.imported} />
          {result.skipped > 0 && <Stat label="Rows skipped" value={result.skipped} muted />}
          {result.new_lookup_values_created > 0 && (
            <Stat label="New lookup values" value={result.new_lookup_values_created} />
          )}
          {result.synthetic_log_entries_created > 0 && (
            <Stat label="Log entries seeded" value={result.synthetic_log_entries_created} />
          )}
        </div>

        <div className="text-xs text-emerald-700 dark:text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 rounded px-2.5 py-1.5">
          Backup saved: {result.pre_import_backup}
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => navigate('/firearms')} className="flex-1">
            View Firearms
          </Button>
          <Button variant="secondary" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Import Another
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg p-3 text-center border',
      muted
        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
        : 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-900',
    )}>
      <div className={cn('text-xl font-bold', muted ? 'text-gray-500' : 'text-emerald-600 dark:text-emerald-400')}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top-level flow
// ---------------------------------------------------------------------------

type FlowState = 'upload' | 'validation' | 'result'

export default function FirearmsFlow() {
  const [state, setState] = useState<FlowState>('upload')
  const [validationResult, setValidationResult] = useState<FirearmsImportValidationResult | null>(null)
  const [confirmResult, setConfirmResult] = useState<FirearmsImportConfirmResult | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleValidated = (result: FirearmsImportValidationResult, file: File) => {
    setValidationResult(result)
    setPendingFile(file)
    setState('validation')
  }

  const handleImported = (result: FirearmsImportConfirmResult) => {
    setConfirmResult(result)
    setState('result')
  }

  const handleReset = () => {
    setValidationResult(null)
    setConfirmResult(null)
    setPendingFile(null)
    setState('upload')
  }

  return (
    <>
      {state === 'upload' && <UploadState onValidated={handleValidated} />}
      {state === 'validation' && validationResult && pendingFile && (
        <ValidationState
          result={validationResult}
          file={pendingFile}
          onBack={handleReset}
          onImported={handleImported}
        />
      )}
      {state === 'result' && confirmResult && (
        <ResultState result={confirmResult} onReset={handleReset} />
      )}
    </>
  )
}
