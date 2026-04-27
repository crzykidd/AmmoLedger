import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUp, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight, Download, RotateCcw, ArrowLeft } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
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
import { confirmImport, getImportTemplateUrl, validateImport } from '@/api/import'
import type { ImportConfirmResult, ImportValidationResult } from '@/types'

// ---------------------------------------------------------------------------
// Countdown timer hook
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
// Expandable list
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
// State 1 — Upload
// ---------------------------------------------------------------------------

function UploadState({
  onValidated,
}: {
  onValidated: (result: ImportValidationResult, file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = (f: File) => {
    setFile(f)
    setError(null)
  }

  const handleValidate = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const result = await validateImport(file)
      onValidated(result, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* AmmoLedger CSV card */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <FileUp className="h-6 w-6 text-gold shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Import from AmmoLedger CSV
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Use the standard AmmoLedger format. Download the template to get started.
            </p>
          </div>
        </div>

        <a
          href={getImportTemplateUrl()}
          download="ammoledger_import_template.csv"
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
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
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

      {/* Future formats note */}
      <p className="text-center text-sm text-gray-400 dark:text-gray-500">
        More import formats coming soon.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// State 2 — Validation Results
// ---------------------------------------------------------------------------

const TABLE_LABELS: Record<string, string> = {
  calibers: 'Calibers',
  manufacturers: 'Manufacturers',
  ammo_types: 'Ammo Types',
  ammo_conditions: 'Conditions',
  categories: 'Categories',
  dealers: 'Dealers',
  locations: 'Locations',
  containers: 'Containers',
}

function ValidationState({
  result,
  file,
  onBack,
  onImported,
}: {
  result: ImportValidationResult
  file: File
  onBack: () => void
  onImported: (res: ImportConfirmResult) => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const countdown = useCountdown(result.token_expires_at)
  const expired = countdown !== null && countdown <= 0

  const handleConfirmImport = async () => {
    setImporting(true)
    setImportError(null)
    try {
      const res = await confirmImport(file, result.validation_token)
      onImported(res)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const hasNewValues = Object.values(result.new_values).some((v) => v.length > 0)
  const fuzzyWarnings = result.warnings.filter((w) => w.row === null)
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
      {hasNewValues && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-2">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            New lookup values will be created:
          </p>
          {Object.entries(result.new_values).map(([table, items]) =>
            items.length > 0 ? (
              <ExpandableList
                key={table}
                label={TABLE_LABELS[table] ?? table}
                items={items}
              />
            ) : null,
          )}
        </div>
      )}

      {/* Fuzzy warnings */}
      {fuzzyWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-1.5">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Similarity warnings — please verify:
          </p>
          {fuzzyWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-400 ml-5">
              {w.message}
            </p>
          ))}
        </div>
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
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!result.valid || expired || importing || result.importable_rows === 0}
          className="flex-1"
        >
          {importing ? 'Importing…' : `Confirm Import (${result.importable_rows} boxes)`}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import {result.importable_rows} ammo boxes?</AlertDialogTitle>
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
// State 3 — Results
// ---------------------------------------------------------------------------

function ResultState({
  result,
  onReset,
}: {
  result: ImportConfirmResult
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
              Your inventory has been updated.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
          <Stat label="Boxes imported" value={result.imported} />
          {result.skipped > 0 && <Stat label="Rows skipped" value={result.skipped} muted />}
          {result.new_lookup_values_created > 0 && (
            <Stat label="New lookup values" value={result.new_lookup_values_created} />
          )}
        </div>

        <div className="text-xs text-emerald-700 dark:text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 rounded px-2.5 py-1.5">
          Backup saved: {result.pre_import_backup}
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => navigate('/inventory')} className="flex-1">
            View Inventory
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
// Page
// ---------------------------------------------------------------------------

type PageState = 'upload' | 'validation' | 'result'

export default function ImportPage() {
  const [state, setState] = useState<PageState>('upload')
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null)
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResult | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleValidated = (result: ImportValidationResult, file: File) => {
    setValidationResult(result)
    setPendingFile(file)
    setState('validation')
  }

  const handleImported = (result: ImportConfirmResult) => {
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
    <AppShell>
      <TopBar title="Import Ammo Data" />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
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
      </div>
    </AppShell>
  )
}
