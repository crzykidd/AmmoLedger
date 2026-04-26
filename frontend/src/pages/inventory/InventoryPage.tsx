import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, PackageOpen } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import InventoryTable from '@/components/inventory/InventoryTable'
import InventoryCardList from '@/components/inventory/InventoryCardList'
import AmmoFormPanel from '@/components/inventory/AmmoFormPanel'
import DeleteAmmoDialog from '@/components/inventory/DeleteAmmoDialog'
import ExpendDialog from '@/components/inventory/ExpendDialog'
import { useAuth } from '@/contexts/AuthContext'
import { listAmmo } from '@/api/ammo'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import type { AmmoBoxRead } from '@/types'

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
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editBox, setEditBox] = useState<AmmoBoxRead | null>(null)
  const [deleteBox, setDeleteBox] = useState<AmmoBoxRead | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expendBox, setExpendBox] = useState<AmmoBoxRead | null>(null)
  const [expendOpen, setExpendOpen] = useState(false)

  const lookups = useInventoryLookups()

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['ammo', { search, showArchived }],
    queryFn: () => listAmmo({ search: search || undefined, show_archived: showArchived }),
  })

  const boxes = data?.boxes ?? []
  const canAdd = user?.role !== 'read_only'

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
        <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
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
                  containers={lookups.containers}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  onExpend={openExpend}
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
