import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import {
  AlertTriangle,
  Download,
  Trash2,
  DatabaseBackup,
  FileJson,
  Clock,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  triggerBackup,
  exportBackup,
  listBackups,
  deleteBackup,
  restoreSqlite,
  previewImport,
  commitImport,
  getSystemConfig,
  saveSystemConfig,
} from '@/api/backup'
import type { BackupFile, ImportPreview, ImportResult } from '@/api/backup'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy HH:mm')
  } catch {
    return iso
  }
}

function TypeBadge({ type }: { type: 'sqlite' | 'json' }) {
  return (
    <span
      className={cn(
        'text-xs px-2 py-0.5 rounded-full font-medium',
        type === 'sqlite'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      )}
    >
      {type === 'sqlite' ? 'SQLite' : 'JSON'}
    </span>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-1">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>
      )}
      {children}
    </section>
  )
}

function DownloadLink({ filename }: { filename: string }) {
  return (
    <a
      href={`/api/backup/download/${encodeURIComponent(filename)}`}
      download={filename}
      className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-light font-medium"
    >
      <Download className="w-3.5 h-3.5" />
      {filename}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BackupPage() {
  const qc = useQueryClient()

  // Post-action download links
  const [lastBackupFile, setLastBackupFile] = useState<BackupFile | null>(null)
  const [lastExportFile, setLastExportFile] = useState<BackupFile | null>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Restore from SQLite
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)

  // Import from JSON
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreviewData, setImportPreviewData] = useState<ImportPreview | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importMode, setImportMode] = useState<'full' | 'additive' | null>(null)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)

  // Schedule config form
  const [schedEnabled, setSchedEnabled] = useState(true)
  const [schedTime, setSchedTime] = useState('03:00')
  const [schedRetention, setSchedRetention] = useState(30)
  const [schedLoaded, setSchedLoaded] = useState(false)

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: backups = [], isLoading: backupsLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: listBackups,
  })

  const { data: systemConfig } = useQuery({
    queryKey: ['system-config'],
    queryFn: getSystemConfig,
  })

  useEffect(() => {
    if (systemConfig && !schedLoaded) {
      setSchedEnabled(systemConfig.backup.enabled)
      setSchedTime(systemConfig.backup.schedule)
      setSchedRetention(systemConfig.backup.retention_days)
      setSchedLoaded(true)
    }
  }, [systemConfig, schedLoaded])

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const backupMutation = useMutation({
    mutationFn: triggerBackup,
    onSuccess: (file) => {
      setLastBackupFile(file)
      toast({ title: `Backup created: ${file.filename}` })
      void qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const exportMutation = useMutation({
    mutationFn: exportBackup,
    onSuccess: (file) => {
      setLastExportFile(file)
      toast({ title: `Export created: ${file.filename}` })
      void qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBackup,
    onSuccess: () => {
      toast({ title: 'Backup deleted' })
      void qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const restoreMutation = useMutation({
    mutationFn: (file: File) => restoreSqlite(file),
    onSuccess: (res) => {
      toast({ title: res.message })
      setRestoreFile(null)
      if (restoreInputRef.current) restoreInputRef.current.value = ''
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const previewMutation = useMutation({
    mutationFn: (file: File) => previewImport(file),
    onSuccess: (preview) => {
      setImportPreviewData(preview)
      setImportResult(null)
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const commitMutation = useMutation({
    mutationFn: ({ file, mode }: { file: File; mode: 'full' | 'additive' }) =>
      commitImport(file, mode),
    onSuccess: (result) => {
      setImportResult(result)
      setImportPreviewData(null)
      setImportFile(null)
      if (importInputRef.current) importInputRef.current.value = ''
      toast({
        title: `Import complete — ${result.records_imported} records imported, ${result.records_skipped} skipped`,
      })
      void qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  const saveScheduleMutation = useMutation({
    mutationFn: () =>
      saveSystemConfig({
        backup: {
          enabled: schedEnabled,
          schedule: schedTime,
          retention_days: schedRetention,
        },
      }),
    onSuccess: () => toast({ title: 'Schedule saved' }),
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  })

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell>
      <TopBar title="Backup & Restore" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-6">

          {/* Quick Backup */}
          <Section
            title="Quick Backup"
            description="Creates a copy of your database file. Fast and safe — use before making changes."
          >
            <Button
              onClick={() => backupMutation.mutate()}
              disabled={backupMutation.isPending}
              className="bg-gold hover:bg-gold-light text-navy font-semibold"
            >
              <DatabaseBackup className="w-4 h-4 mr-2" />
              {backupMutation.isPending ? 'Backing up…' : 'Backup Now'}
            </Button>
            {lastBackupFile && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Created:{' '}
                <DownloadLink filename={lastBackupFile.filename} />
                <span className="ml-2 text-gray-400">({fmtBytes(lastBackupFile.size_bytes)})</span>
              </p>
            )}
          </Section>

          {/* Data Export */}
          <Section
            title="Data Export"
            description="Exports all data as portable JSON. Use for migrating to a new server or major upgrades."
          >
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              <FileJson className="w-4 h-4 mr-2" />
              {exportMutation.isPending ? 'Exporting…' : 'Export Now'}
            </Button>
            {lastExportFile && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Created:{' '}
                <DownloadLink filename={lastExportFile.filename} />
                <span className="ml-2 text-gray-400">({fmtBytes(lastExportFile.size_bytes)})</span>
              </p>
            )}
          </Section>

          {/* Scheduled Backup */}
          <Section
            title="Scheduled Backup"
            description="Automatically backs up your database every night."
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enable nightly backup
                </label>
                <Switch
                  checked={schedEnabled}
                  onCheckedChange={setSchedEnabled}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Schedule time (24-hour)
                  </label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Keep last N days
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={schedRetention}
                    onChange={(e) => setSchedRetention(Number(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <Button
                  onClick={() => saveScheduleMutation.mutate()}
                  disabled={saveScheduleMutation.isPending}
                  size="sm"
                >
                  {saveScheduleMutation.isPending ? 'Saving…' : 'Save Schedule'}
                </Button>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  Changes take effect immediately. The next scheduled backup will run at the configured time.
                </p>
              </div>
            </div>
          </Section>

          {/* Backup History */}
          <Section title="Backup History">
            {backupsLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : backups.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                No backups yet. Run your first backup above.
              </p>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Filename</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Size</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created</th>
                      <th className="px-4 py-2.5 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {backups.map((b) => (
                      <tr key={b.filename} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 font-mono text-xs truncate max-w-xs">
                          {b.filename}
                        </td>
                        <td className="px-4 py-2.5">
                          <TypeBadge type={b.type} />
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 tabular-nums">
                          {fmtBytes(b.size_bytes)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            {fmtDate(b.created_at)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <a
                              href={`/api/backup/download/${encodeURIComponent(b.filename)}`}
                              download={b.filename}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-red-600"
                              title="Delete"
                              onClick={() => setDeleteTarget(b.filename)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Restore & Import */}
          <Section title="Restore & Import">
            {/* Warning banner */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-500/30 px-4 py-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Restoring will replace your current data. A backup is created automatically before any restore or import operation.
              </p>
            </div>

            {/* Restore from SQLite */}
            <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                Restore from SQLite backup
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Restore from a .db backup file. Best for rolling back to a recent backup on the same version.
              </p>
              <div className="flex items-center gap-3">
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".db"
                  className="text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 dark:file:border-gray-700 file:text-sm file:bg-white dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-50 dark:hover:file:bg-gray-700 cursor-pointer"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!restoreFile || restoreMutation.isPending}
                  onClick={() => setRestoreConfirmOpen(true)}
                >
                  {restoreMutation.isPending ? 'Restoring…' : 'Restore Database'}
                </Button>
              </div>
            </div>

            {/* Import from JSON */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                Import from JSON export
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Import from a JSON export file. Use for migrating between versions or servers.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  className="text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 dark:file:border-gray-700 file:text-sm file:bg-white dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-50 dark:hover:file:bg-gray-700 cursor-pointer"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] ?? null)
                    setImportPreviewData(null)
                    setImportResult(null)
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!importFile || previewMutation.isPending}
                  onClick={() => { if (importFile) previewMutation.mutate(importFile) }}
                >
                  {previewMutation.isPending ? 'Previewing…' : 'Preview Import'}
                </Button>
              </div>

              {/* Preview panel */}
              {importPreviewData && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                  <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Version: <span className="text-gray-900 dark:text-white font-medium">{importPreviewData.version}</span></span>
                    <span>Exported: <span className="text-gray-900 dark:text-white font-medium">{fmtDate(importPreviewData.exported_at)}</span></span>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Table</th>
                        <th className="text-right py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Records</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                      {Object.entries(importPreviewData.record_counts).map(([table, count]) => (
                        <tr key={table}>
                          <td className="py-1 font-mono text-xs text-gray-600 dark:text-gray-400">{table}</td>
                          <td className="py-1 text-right tabular-nums text-gray-900 dark:text-white">{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {importPreviewData.warnings.length > 0 && (
                    <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
                      {importPreviewData.warnings.map((w, i) => (
                        <li key={i}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => { setImportMode('full'); setImportConfirmOpen(true) }}
                    >
                      Full Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setImportMode('additive'); setImportConfirmOpen(true) }}
                    >
                      Additive Merge
                    </Button>
                  </div>
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-4 text-sm text-green-800 dark:text-green-300">
                  Import complete — {importResult.records_imported} records imported, {importResult.records_skipped} skipped.
                  {importResult.warnings.length > 0 && (
                    <ul className="mt-2 text-xs space-y-0.5 text-amber-600 dark:text-amber-400">
                      {importResult.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* Delete confirm dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete backup?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs">{deleteTarget}</span> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget)
                setDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirm dialog */}
      <AlertDialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore database?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all current data with the backup. A safety backup will be created first automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (restoreFile) restoreMutation.mutate(restoreFile)
                setRestoreConfirmOpen(false)
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import confirm dialog */}
      <AlertDialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {importMode === 'full' ? 'Full Replace — are you sure?' : 'Additive Merge — are you sure?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {importMode === 'full'
                ? 'This will wipe all current data and replace it with the import. A safety backup will be created first.'
                : 'This will add records from the import that do not already exist. Existing records will not be changed. A safety backup will be created first.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={importMode === 'full' ? 'bg-red-600 hover:bg-red-700' : undefined}
              onClick={() => {
                if (importFile && importMode) {
                  commitMutation.mutate({ file: importFile, mode: importMode })
                }
                setImportConfirmOpen(false)
              }}
            >
              {importMode === 'full' ? 'Replace All Data' : 'Merge Records'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
