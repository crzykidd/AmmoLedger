import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Grid,
  List,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Trash2,
  Target,
  Download,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import FirearmFormDrawer from '@/components/firearms/FirearmFormDrawer'
import DeleteFirearmDialog from '@/components/firearms/DeleteFirearmDialog'
import LogRangeDayDialog from '@/components/range/LogRangeDayDialog'
import { UserTagBadge } from '@/components/firearms/UserTagPicker'
import FirearmIcon from '@/components/icons/FirearmIcon'
import { listFirearms, exportFirearmsCsvUrl } from '@/api/firearms'
import { firearmLabelParts } from '@/lib/firearm-label'
import { photoSrc } from '@/api/firearmPhotos'
import { getCalibersLookup, getManufacturersByType } from '@/api/lookups'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import type {
  CleaningStatus,
  FirearmRead,
  FirearmType,
  User,
} from '@/types'

const NONE = '__none__'
const VIEW_MODE_KEY = 'firearms_view_mode'
const FILTERS_KEY = 'firearms_filters'
const SORT_FIELD_KEY = 'firearms_sort_field'
const SORT_DIR_KEY = 'firearms_sort_dir'

interface PersistedFilters {
  manufacturer_id: string
  caliber_id: string
  firearm_type: string
  cleaning_status: string
}

const DEFAULT_FILTERS: PersistedFilters = {
  manufacturer_id: '',
  caliber_id: '',
  firearm_type: '',
  cleaning_status: '',
}

function loadFilters(): PersistedFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return DEFAULT_FILTERS
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>
    return { ...DEFAULT_FILTERS, ...parsed }
  } catch {
    return DEFAULT_FILTERS
  }
}

function canEdit(firearm: FirearmRead, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'member') return firearm.owner_id === user.id
  return false
}

function CleaningStatusDot({ status, className }: { status: CleaningStatus; className?: string }) {
  const map: Record<CleaningStatus, string> = {
    ok: 'bg-green-500',
    due_soon: 'bg-amber-500',
    overdue: 'bg-red-500',
  }
  return (
    <span
      className={cn('inline-block w-2.5 h-2.5 rounded-full', map[status], className)}
      aria-label={`Cleaning status: ${status}`}
    />
  )
}

function CleaningStatusLabel({ status }: { status: CleaningStatus }) {
  const map: Record<CleaningStatus, { label: string; cls: string; Icon: React.ElementType }> = {
    ok: { label: 'OK', cls: 'text-green-600 dark:text-green-400', Icon: CheckCircle2 },
    due_soon: { label: 'Due soon', cls: 'text-amber-600 dark:text-amber-400', Icon: Clock },
    overdue: { label: 'Overdue', cls: 'text-red-600 dark:text-red-400', Icon: AlertTriangle },
  }
  const { label, cls, Icon } = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', cls)}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}

function statusTooltip(f: FirearmRead): string {
  const hasIntervals = f.service_interval_rounds != null || f.service_interval_days != null
  if (!hasIntervals) return 'Service interval not set'
  if (f.last_cleaned_at) {
    const days = Math.floor(
      (Date.now() - new Date(f.last_cleaned_at).getTime()) / (1000 * 60 * 60 * 24),
    )
    return `${f.rounds_since_clean.toLocaleString()} rounds and ${days} days since clean`
  }
  return `${f.rounds_since_clean.toLocaleString()} rounds since clean (never cleaned)`
}

interface FirearmCardProps {
  firearm: FirearmRead
  onClick: () => void
}

function FirearmCard({ firearm, onClick }: FirearmCardProps) {
  const { primary: primaryTitle, contextSuffix } = firearmLabelParts(firearm)
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all"
    >
      <div className="aspect-[16/9] bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
        {firearm.default_photo_thumb_url ? (
          <img
            src={photoSrc(firearm.default_photo_thumb_url)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <FirearmIcon className="w-12 h-12 text-gray-300 dark:text-gray-600" />
        )}
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-base text-gray-900 dark:text-white leading-tight line-clamp-2">
              {primaryTitle}
            </p>
            {contextSuffix && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                {contextSuffix}
              </p>
            )}
          </div>
          <span
            title={statusTooltip(firearm)}
            className="shrink-0 mt-1.5"
          >
            <CleaningStatusDot status={firearm.cleaning_status} />
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {firearm.caliber_name && (
            <span className="inline-flex items-center rounded-full bg-gold/15 text-gold px-2 py-0.5 text-xs font-medium">
              {firearm.caliber_name}
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 text-xs font-medium capitalize">
            {firearm.firearm_type}
          </span>
        </div>

        <div className="flex items-end justify-between mt-2">
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
              {firearm.rounds_lifetime.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">lifetime rounds</p>
          </div>
        </div>

        {(firearm.compliance_tags.length > 0 || firearm.user_tags.length > 0) && (
          <div className="flex flex-wrap gap-1 pt-2 mt-auto border-t border-gray-100 dark:border-gray-800">
            {firearm.compliance_tags.slice(0, 4).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 text-[10px] font-medium"
              >
                {t.name}
              </span>
            ))}
            {firearm.user_tags.slice(0, 3).map((t) => (
              <UserTagBadge key={t.id} tag={t} />
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function FirearmCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="h-5 animate-pulse bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
      <div className="flex gap-1.5">
        <div className="h-5 animate-pulse bg-gray-200 dark:bg-gray-800 rounded-full w-16" />
        <div className="h-5 animate-pulse bg-gray-200 dark:bg-gray-800 rounded-full w-12" />
      </div>
      <div className="h-8 animate-pulse bg-gray-200 dark:bg-gray-800 rounded w-1/3 mt-2" />
      <div className="flex gap-1 pt-2">
        <div className="h-4 animate-pulse bg-gray-200 dark:bg-gray-800 rounded-full w-12" />
        <div className="h-4 animate-pulse bg-gray-200 dark:bg-gray-800 rounded-full w-14" />
      </div>
    </div>
  )
}

type SortField = 'name' | 'manufacturer' | 'caliber' | 'type' | 'rounds' | 'status'

export default function FirearmsListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [view, setView] = useState<'grid' | 'list'>(() => {
    const v = localStorage.getItem(VIEW_MODE_KEY)
    return v === 'list' ? 'list' : 'grid'
  })
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, view)
  }, [view])

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<PersistedFilters>(loadFilters)
  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  }, [filters])

  const [sortField, setSortField] = useState<SortField>(() => {
    const v = localStorage.getItem(SORT_FIELD_KEY)
    if (v === 'name' || v === 'manufacturer' || v === 'caliber' || v === 'type' || v === 'rounds' || v === 'status') {
      return v
    }
    return 'name'
  })
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const v = localStorage.getItem(SORT_DIR_KEY)
    return v === 'desc' ? 'desc' : 'asc'
  })
  useEffect(() => {
    localStorage.setItem(SORT_FIELD_KEY, sortField)
  }, [sortField])
  useEffect(() => {
    localStorage.setItem(SORT_DIR_KEY, sortDir)
  }, [sortDir])

  const [formOpen, setFormOpen] = useState(false)
  const [editFirearm, setEditFirearm] = useState<FirearmRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FirearmRead | null>(null)
  const [logRangeOpen, setLogRangeOpen] = useState(false)

  const { data: firearms = [], isLoading } = useQuery({
    queryKey: ['firearms', filters],
    queryFn: () =>
      listFirearms({
        manufacturer_id:
          filters.manufacturer_id && filters.manufacturer_id !== NONE
            ? parseInt(filters.manufacturer_id)
            : undefined,
        caliber_id:
          filters.caliber_id && filters.caliber_id !== NONE
            ? parseInt(filters.caliber_id)
            : undefined,
        firearm_type:
          filters.firearm_type && filters.firearm_type !== NONE
            ? (filters.firearm_type as FirearmType)
            : undefined,
        cleaning_status:
          filters.cleaning_status && filters.cleaning_status !== NONE
            ? (filters.cleaning_status as CleaningStatus)
            : undefined,
      }),
  })

  const { data: manufacturers = [] } = useQuery({
    queryKey: ['firearm-manufacturers'],
    queryFn: () => getManufacturersByType('firearm'),
    staleTime: 5 * 60 * 1000,
  })
  const { data: calibers = [] } = useQuery({
    queryKey: ['calibers'],
    queryFn: getCalibersLookup,
    staleTime: 5 * 60 * 1000,
  })

  // Client-side search across manufacturer, model, serial, nickname
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return firearms
    return firearms.filter((f) => {
      const haystack = [
        f.nickname,
        f.manufacturer_name,
        f.firearm_model_name,
        f.custom_model_name,
        f.display_model,
        f.serial,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [firearms, search])

  const sorted = useMemo(() => {
    const list = [...searched]
    const statusOrder: Record<CleaningStatus, number> = { ok: 0, due_soon: 1, overdue: 2 }
    list.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      switch (sortField) {
        case 'name':
          av = firearmLabelParts(a).primary.toLowerCase()
          bv = firearmLabelParts(b).primary.toLowerCase()
          break
        case 'manufacturer':
          av = (a.manufacturer_name ?? '').toLowerCase()
          bv = (b.manufacturer_name ?? '').toLowerCase()
          break
        case 'caliber':
          av = (a.caliber_name ?? '').toLowerCase()
          bv = (b.caliber_name ?? '').toLowerCase()
          break
        case 'type':
          av = a.firearm_type
          bv = b.firearm_type
          break
        case 'rounds':
          av = a.rounds_lifetime
          bv = b.rounds_lifetime
          break
        case 'status':
          av = statusOrder[a.cleaning_status]
          bv = statusOrder[b.cleaning_status]
          break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [searched, sortField, sortDir])

  const totalRounds = sorted.reduce((acc, f) => acc + f.rounds_lifetime, 0)
  const hasFilters =
    !!search ||
    Object.values(filters).some((v) => v && v !== NONE)

  const clearFilters = () => {
    setSearch('')
    setFilters(DEFAULT_FILTERS)
  }

  const openAdd = () => {
    setEditFirearm(null)
    setFormOpen(true)
  }

  const SortableHeader = ({ field, label, className }: {
    field: SortField
    label: string
    className?: string
  }) => {
    const active = sortField === field
    return (
      <th
        className={cn(
          'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300 transition-colors',
          className,
        )}
        onClick={() => {
          if (active) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
          else {
            setSortField(field)
            setSortDir('asc')
          }
        }}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && <span className="text-gold">{sortDir === 'asc' ? '↑' : '↓'}</span>}
        </span>
      </th>
    )
  }

  return (
    <AppShell>
      <TopBar
        title="Firearms"
        subtitle="Track firearms, cleaning history, and service intervals"
        actions={
          user?.role !== 'read_only' ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setLogRangeOpen(true)}>
                <Target className="w-4 h-4 mr-1.5" />
                Log Range Day
              </Button>
              <Button size="sm" onClick={openAdd}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Firearm
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
        {/* Stats */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Firearms </span>
            <span className="font-semibold text-gray-900 dark:text-white">{sorted.length}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total Lifetime Rounds </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {totalRounds.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[16rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search manufacturer, model, or serial…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="w-44">
            <Select
              value={filters.manufacturer_id || NONE}
              onValueChange={(v) =>
                setFilters((p) => ({ ...p, manufacturer_id: v === NONE ? '' : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All manufacturers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All manufacturers</SelectItem>
                {manufacturers
                  .filter((m) => m.is_active)
                  .map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-40">
            <Select
              value={filters.caliber_id || NONE}
              onValueChange={(v) =>
                setFilters((p) => ({ ...p, caliber_id: v === NONE ? '' : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All calibers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All calibers</SelectItem>
                {calibers
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-32">
            <Select
              value={filters.firearm_type || NONE}
              onValueChange={(v) =>
                setFilters((p) => ({ ...p, firearm_type: v === NONE ? '' : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All types</SelectItem>
                <SelectItem value="pistol">Pistol</SelectItem>
                <SelectItem value="rifle">Rifle</SelectItem>
                <SelectItem value="shotgun">Shotgun</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-36">
            <Select
              value={filters.cleaning_status || NONE}
              onValueChange={(v) =>
                setFilters((p) => ({ ...p, cleaning_status: v === NONE ? '' : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Any status</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="due_soon">Due Soon</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.location.href = exportFirearmsCsvUrl()
            }}
            title="Download all visible firearms as CSV"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>

          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              className={cn(
                'px-3 py-2 text-sm transition-colors',
                view === 'grid'
                  ? 'bg-gold/20 text-gold'
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              className={cn(
                'px-3 py-2 text-sm transition-colors border-l border-gray-200 dark:border-gray-700',
                view === 'list'
                  ? 'bg-gold/20 text-gold'
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
              onClick={() => setView('list')}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <FirearmCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
              <table className="w-full">
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-2 py-2">
                        <div className="w-9 h-9 animate-pulse bg-gray-300 dark:bg-gray-700 rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 animate-pulse bg-gray-200 dark:bg-gray-800 rounded w-48" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 animate-pulse bg-gray-200 dark:bg-gray-800 rounded w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 animate-pulse bg-gray-200 dark:bg-gray-800 rounded w-20" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 animate-pulse bg-gray-200 dark:bg-gray-800 rounded w-16" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : sorted.length === 0 ? (
          hasFilters ? (
            <div className="flex flex-col items-center py-16 gap-4 text-center">
              <Search className="w-12 h-12 text-gray-300 dark:text-gray-600" />
              <div>
                <p className="font-medium text-gray-600 dark:text-gray-300">
                  No firearms match these filters
                </p>
                <p className="text-sm text-gray-400 mt-1">Try adjusting your search or clearing filters.</p>
              </div>
              <Button variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-16 gap-4 text-center">
              <FirearmIcon className="w-12 h-12 text-gray-300 dark:text-gray-600" />
              <div>
                <p className="font-medium text-gray-600 dark:text-gray-300">No firearms yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  {user?.role !== 'read_only'
                    ? 'Register your first firearm to start tracking cleaning and service intervals.'
                    : 'No firearms have been added yet.'}
                </p>
              </div>
              {user?.role !== 'read_only' && (
                <Button onClick={openAdd}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Your First Firearm
                </Button>
              )}
            </div>
          )
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((f) => (
              <FirearmCard key={f.id} firearm={f} onClick={() => navigate(`/firearms/${f.id}`)} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-2 py-3 w-12" aria-label="Photo" />
                  <SortableHeader field="name" label="Display Model" />
                  <SortableHeader field="manufacturer" label="Manufacturer" className="hidden md:table-cell" />
                  <SortableHeader field="caliber" label="Caliber" className="hidden md:table-cell" />
                  <SortableHeader field="type" label="Type" className="hidden lg:table-cell" />
                  <SortableHeader field="rounds" label="Rounds" className="text-right" />
                  <SortableHeader field="status" label="Status" />
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">
                    Tags
                  </th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => (
                  <tr
                    key={f.id}
                    className={cn(
                      'border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer',
                      'hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors',
                      i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/20',
                    )}
                    onClick={() => navigate(`/firearms/${f.id}`)}
                  >
                    <td className="px-2 py-2">
                      <div className="w-9 h-9 rounded bg-black overflow-hidden flex items-center justify-center">
                        {f.default_photo_thumb_url ? (
                          <img
                            src={photoSrc(f.default_photo_thumb_url)}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <FirearmIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const { primary, contextSuffix: ctx } = firearmLabelParts(f)
                        return (
                          <>
                            <p className="font-medium text-gray-900 dark:text-white leading-tight">
                              {primary}
                            </p>
                            {ctx && (
                              <p className="text-xs text-gray-400">{ctx}</p>
                            )}
                            {f.serial && (
                              <p className="text-xs text-gray-400">SN: {f.serial}</p>
                            )}
                          </>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-300">
                      {f.manufacturer_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600 dark:text-gray-300">
                      {f.caliber_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-300 capitalize">
                      {f.firearm_type}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 font-medium">
                      {f.rounds_lifetime.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span title={statusTooltip(f)}>
                        <CleaningStatusLabel status={f.cleaning_status} />
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {f.user_tags.slice(0, 3).map((t) => (
                          <UserTagBadge key={t.id} tag={t} />
                        ))}
                        {f.compliance_tags.slice(0, 2).map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 text-[10px] font-medium"
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canEdit(f, user ?? null) && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditFirearm(f)
                                setFormOpen(true)
                              }}
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0 hover:bg-red-500/10 hover:text-red-500"
                              onClick={() => setDeleteTarget(f)}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FirearmFormDrawer
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o) setEditFirearm(null)
        }}
        editFirearm={editFirearm}
      />

      <DeleteFirearmDialog
        firearm={deleteTarget}
        open={deleteTarget != null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      />

      <LogRangeDayDialog
        open={logRangeOpen}
        onOpenChange={setLogRangeOpen}
      />
    </AppShell>
  )
}
