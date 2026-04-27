import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, PackageOpen, AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import InventoryTable from '@/components/inventory/InventoryTable'
import InventoryCardList from '@/components/inventory/InventoryCardList'
import AmmoFormPanel from '@/components/inventory/AmmoFormPanel'
import DeleteAmmoDialog from '@/components/inventory/DeleteAmmoDialog'
import ExpendDialog from '@/components/inventory/ExpendDialog'
import { useAuth } from '@/contexts/AuthContext'
import { listAmmo, updateAmmo } from '@/api/ammo'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import { useThresholds } from '@/hooks/useThresholds'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { AmmoBoxRead } from '@/types'

const BANNER_DISMISS_KEY = 'low_stock_banner_dismissed'

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({
  totalBoxes,
  totalRounds,
  totalValue,
}: {
  totalBoxes: number
  totalRounds: number
  totalValue: number | null
}) {
  return (
    <div className="flex gap-6 text-sm">
      <div>
        <span className="text-gray-500 dark:text-gray-400">Boxes </span>
        <span className="font-semibold text-gray-900 dark:text-white">{totalBoxes}</span>
      </div>
      <div>
        <span className="text-gray-500 dark:text-gray-400">Rounds </span>
        <span className="font-semibold text-gray-900 dark:text-white">
          {totalRounds.toLocaleString()}
        </span>
      </div>
      {totalValue != null && (
        <div>
          <span className="text-gray-500 dark:text-gray-400">Value </span>
          <span className="font-semibold text-gray-900 dark:text-white">
            ${totalValue.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [conditionFilter, setConditionFilter] = useState<string>('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [editBox, setEditBox] = useState<AmmoBoxRead | null>(null)
  const [deleteBox, setDeleteBox] = useState<AmmoBoxRead | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expendBox, setExpendBox] = useState<AmmoBoxRead | null>(null)
  const [expendOpen, setExpendOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem(BANNER_DISMISS_KEY) === '1',
  )
  const [summaryOpen, setSummaryOpen] = useState(false)

  const lookups = useInventoryLookups()
  const { getLowItems, getCaliberSummary } = useThresholds()

  const archiveMutation = useMutation({
    mutationFn: (box: AmmoBoxRead) =>
      updateAmmo(box.id, { is_archived: true, archive_reason: 'manual' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ammo'] })
      toast({ title: 'Box archived' })
    },
    onError: () => {
      toast({ title: 'Failed to archive box', variant: 'destructive' })
    },
  })

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['ammo', { search, showArchived }],
    queryFn: () => listAmmo({ search: search || undefined, show_archived: showArchived }),
  })

  const allBoxes = data?.boxes ?? []
  const boxes = conditionFilter
    ? allBoxes.filter((b) => b.ammo_condition_id != null && String(b.ammo_condition_id) === conditionFilter)
    : allBoxes
  const canAdd = user?.role !== 'read_only'

  const lowItems = useMemo(
    () => getLowItems(boxes, lookups.calibers),
    [boxes, lookups.calibers, getLowItems],
  )

  const lowSet = useMemo(() => new Set(lowItems.map((b) => b.id)), [lowItems])

  const caliberSummary = useMemo(
    () => getCaliberSummary(boxes, lookups.calibers),
    [boxes, lookups.calibers, getCaliberSummary],
  )

  function dismissBanner() {
    sessionStorage.setItem(BANNER_DISMISS_KEY, '1')
    setBannerDismissed(true)
  }

  function openAdd() {
    setEditBox(null)
    setPanelOpen(true)
  }

  function openEdit(box: AmmoBoxRead) {
    setEditBox(box)
    setPanelOpen(true)
  }

  function openDelete(box: AmmoBoxRead) {
    setDeleteBox(box)
    setDeleteOpen(true)
  }

  function openExpend(box: AmmoBoxRead) {
    setExpendBox(box)
    setExpendOpen(true)
  }

  function openArchive(box: AmmoBoxRead) {
    archiveMutation.mutate(box)
  }

  return (
    <AppShell>
      <TopBar title="Inventory" />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0 w-full sm:w-auto">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search caliber, manufacturer, product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="accent-gold"
              />
              Archived
            </label>
            {lookups.ammoConditions.length > 0 && (
              <select
                value={conditionFilter}
                onChange={(e) => setConditionFilter(e.target.value)}
                className="h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 px-2 focus:outline-none focus:ring-2 focus:ring-gold"
                aria-label="Filter by condition"
              >
                <option value="">All Conditions</option>
                {lookups.ammoConditions.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {data && (
              <StatsBar
                totalBoxes={data.total_boxes}
                totalRounds={data.total_rounds}
                totalValue={data.total_value}
              />
            )}
            {canAdd && (
              <Button onClick={openAdd} size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Box
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Low-stock alert banner */}
          {!bannerDismissed && lowItems.length > 0 && (
            <Alert variant="warning" className="flex items-start gap-3 pr-10 relative">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <AlertTitle>Low stock on {lowItems.length} item{lowItems.length !== 1 ? 's' : ''}</AlertTitle>
                <AlertDescription>
                  Some calibers are below your configured thresholds.{' '}
                  <button
                    className="underline hover:no-underline font-medium"
                    onClick={() => setSummaryOpen(true)}
                  >
                    View summary
                  </button>
                </AlertDescription>
              </div>
              <button
                className="absolute right-3 top-3 text-amber-600 dark:text-amber-400 hover:opacity-70"
                onClick={dismissBanner}
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </Alert>
          )}

          {/* Caliber summary */}
          {caliberSummary.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setSummaryOpen((v) => !v)}
              >
                <span>Caliber Summary</span>
                {summaryOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {summaryOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-gray-200 dark:bg-gray-800">
                  {caliberSummary.map((cs) => (
                    <div
                      key={cs.caliber_id}
                      className={cn(
                        'px-4 py-3 bg-white dark:bg-gray-900',
                        cs.is_low && 'bg-amber-50 dark:bg-amber-950/20',
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {cs.is_low && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {cs.caliber_name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {cs.total_rounds.toLocaleString()} rds · {cs.box_count} box{cs.box_count !== 1 ? 'es' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoading || lookups.isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-red-500 font-medium">Failed to load inventory.</p>
              <p className="text-gray-500 text-sm mt-1">Check your connection and try again.</p>
            </div>
          ) : boxes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
              <PackageOpen className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {search ? 'No results match your search.' : 'No ammo boxes yet.'}
              </p>
              {canAdd && !search && (
                <Button onClick={openAdd} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add your first box
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <InventoryTable
                  boxes={boxes}
                  user={user!}
                  calibers={lookups.calibers}
                  manufacturers={lookups.manufacturers}
                  ammoTypes={lookups.ammoTypes}
                  ammoConditions={lookups.ammoConditions}
                  categories={lookups.categories}
                  dealers={lookups.dealers}
                  containers={lookups.containers}
                  lowSet={lowSet}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onArchive={openArchive}
                />
              </div>
              {/* Mobile cards */}
              <div className="md:hidden">
                <InventoryCardList
                  boxes={boxes}
                  user={user!}
                  calibers={lookups.calibers}
                  manufacturers={lookups.manufacturers}
                  containers={lookups.containers}
                  lowSet={lowSet}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onExpend={openExpend}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Form panel */}
      <AmmoFormPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        editBox={editBox}
        user={user!}
        calibers={lookups.calibers}
        manufacturers={lookups.manufacturers}
        ammoTypes={lookups.ammoTypes}
        ammoConditions={lookups.ammoConditions}
        categories={lookups.categories}
        containers={lookups.containers}
      />

      {/* Delete confirmation */}
      <DeleteAmmoDialog
        box={deleteBox}
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o)
          if (!o) setDeleteBox(null)
        }}
      />

      {/* Expenditure dialog */}
      <ExpendDialog
        box={expendBox}
        open={expendOpen}
        onOpenChange={(o) => {
          setExpendOpen(o)
          if (!o) setExpendBox(null)
        }}
        calibers={lookups.calibers}
      />
    </AppShell>
  )
}
