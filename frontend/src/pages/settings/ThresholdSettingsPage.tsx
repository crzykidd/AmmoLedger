import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Trash2 } from 'lucide-react'
import { HelpTip } from '@/components/HelpTip'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import {
  fetchDefaultThreshold,
  updateDefaultThreshold,
  fetchCaliberThresholds,
  createCaliberThreshold,
  deleteCaliberThreshold,
  fetchLocationThresholds,
  createLocationThreshold,
  deleteLocationThreshold,
} from '@/api/thresholds'

const selectCls =
  'w-full h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ' +
  'text-sm text-gray-900 dark:text-gray-100 px-3 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent'

export default function ThresholdSettingsPage() {
  const qc = useQueryClient()
  const { calibers, locations } = useInventoryLookups()

  const [defaultInput, setDefaultInput] = useState('')
  const [defaultSaved, setDefaultSaved] = useState(false)
  const [caliberFormId, setCaliberFormId] = useState('')
  const [caliberFormRounds, setCaliberFormRounds] = useState('200')
  const [locationFormId, setLocationFormId] = useState('')
  const [locationFormRounds, setLocationFormRounds] = useState('1000')

  const { data: defaultData, isLoading: defaultLoading } = useQuery({
    queryKey: ['thresholds', 'default'],
    queryFn: fetchDefaultThreshold,
  })

  const { data: caliberThresholds = [], isLoading: calLoading } = useQuery({
    queryKey: ['thresholds', 'calibers'],
    queryFn: fetchCaliberThresholds,
  })

  const { data: locationThresholds = [], isLoading: locLoading } = useQuery({
    queryKey: ['thresholds', 'locations'],
    queryFn: fetchLocationThresholds,
  })

  const defaultMutation = useMutation({
    mutationFn: (rounds: number) => updateDefaultThreshold(rounds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thresholds', 'default'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'low-stock'] })
      setDefaultSaved(true)
      setTimeout(() => setDefaultSaved(false), 2000)
    },
  })

  const addCaliberMutation = useMutation({
    mutationFn: ({ caliber_id, rounds }: { caliber_id: number; rounds: number }) =>
      createCaliberThreshold(caliber_id, rounds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thresholds', 'calibers'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'low-stock'] })
      setCaliberFormId('')
      setCaliberFormRounds('200')
    },
  })

  const deleteCaliberMutation = useMutation({
    mutationFn: (caliber_id: number) => deleteCaliberThreshold(caliber_id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thresholds', 'calibers'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'low-stock'] })
    },
  })

  const addLocationMutation = useMutation({
    mutationFn: ({ location_id, rounds }: { location_id: number; rounds: number }) =>
      createLocationThreshold(location_id, rounds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thresholds', 'locations'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'low-stock'] })
      setLocationFormId('')
      setLocationFormRounds('1000')
    },
  })

  const deleteLocationMutation = useMutation({
    mutationFn: (location_id: number) => deleteLocationThreshold(location_id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['thresholds', 'locations'] })
      void qc.invalidateQueries({ queryKey: ['thresholds', 'low-stock'] })
    },
  })

  const currentDefault = defaultData?.rounds ?? 200
  const defaultDisplayValue = defaultInput !== '' ? defaultInput : String(currentDefault)

  const handleSaveDefault = () => {
    const rounds = parseInt(defaultDisplayValue, 10)
    if (isNaN(rounds) || rounds < 0) return
    defaultMutation.mutate(rounds)
  }

  const handleAddCaliber = () => {
    const id = parseInt(caliberFormId, 10)
    const rounds = parseInt(caliberFormRounds, 10)
    if (!id || isNaN(rounds) || rounds < 0) return
    addCaliberMutation.mutate({ caliber_id: id, rounds })
  }

  const handleAddLocation = () => {
    const id = parseInt(locationFormId, 10)
    const rounds = parseInt(locationFormRounds, 10)
    if (!id || isNaN(rounds) || rounds < 0) return
    addLocationMutation.mutate({ location_id: id, rounds })
  }

  const usedCaliberIds = new Set(caliberThresholds.map((t) => t.caliber_id))
  const availableCalibers = calibers.filter((c) => !usedCaliberIds.has(c.id))
  const usedLocationIds = new Set(locationThresholds.map((t) => t.location_id))
  const availableLocations = locations.filter((l) => !usedLocationIds.has(l.id))

  return (
    <AppShell>
      <TopBar title="Stock Thresholds" />
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-6 max-w-2xl space-y-8">

        {/* Section 1: Global Default */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Global Default
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Applied to any caliber that doesn't have a specific threshold set.
          </p>
          {defaultLoading ? (
            <div className="h-9 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ) : (
            <div className="flex items-end gap-3">
              <div className="w-40">
                <div className="flex items-center gap-1 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Low rounds threshold
                  </label>
                  <HelpTip text="Alert when any caliber's total rounds drop below this number. Overridden by caliber-specific thresholds." />
                </div>
                <Input
                  type="number"
                  min={0}
                  value={defaultDisplayValue}
                  onChange={(e) => setDefaultInput(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveDefault}
                disabled={defaultMutation.isPending}
              >
                Save
              </Button>
              {defaultSaved && (
                <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pb-0.5">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              )}
            </div>
          )}
        </section>

        {/* Section 2: Caliber Thresholds */}
        <section>
          <div className="flex items-center gap-1.5 mb-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Per-Caliber Thresholds
            </h2>
            <HelpTip text="Set a specific round count alert for a caliber. Overrides the global default threshold for that caliber." />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Override the global default for specific calibers. The global default still applies to all others.
          </p>

          {calLoading ? (
            <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-4" />
          ) : caliberThresholds.length > 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Caliber</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-300">On Hand</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Threshold</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {caliberThresholds.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{t.caliber_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {t.rounds_on_hand.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {t.rounds.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {t.is_low ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> Low
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3 w-3" /> OK
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => deleteCaliberMutation.mutate(t.caliber_id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove threshold"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {availableCalibers.length > 0 && (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Caliber
                </label>
                <select
                  value={caliberFormId}
                  onChange={(e) => setCaliberFormId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select caliber…</option>
                  {availableCalibers.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rounds
                </label>
                <Input
                  type="number"
                  min={0}
                  value={caliberFormRounds}
                  onChange={(e) => setCaliberFormRounds(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                onClick={handleAddCaliber}
                disabled={!caliberFormId || addCaliberMutation.isPending}
                className="shrink-0"
              >
                Add
              </Button>
            </div>
          )}
        </section>

        {/* Section 3: Location Thresholds */}
        <section>
          <div className="flex items-center gap-1.5 mb-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Per-Location Thresholds
            </h2>
            <HelpTip text="Alert when total rounds stored in a location drop below this number. Counts all calibers in that location." />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Alert when total rounds at a storage location fall below a minimum.
            Only locations with a threshold set will trigger low-stock alerts.
          </p>

          {locLoading ? (
            <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-4" />
          ) : locationThresholds.length > 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Location</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-300">On Hand</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Threshold</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {locationThresholds.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{t.location_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {t.rounds_on_hand.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {t.rounds.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {t.is_low ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> Low
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3 w-3" /> OK
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => deleteLocationMutation.mutate(t.location_id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove threshold"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {availableLocations.length > 0 ? (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Location
                </label>
                <select
                  value={locationFormId}
                  onChange={(e) => setLocationFormId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select location…</option>
                  {availableLocations.map((l) => (
                    <option key={l.id} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rounds
                </label>
                <Input
                  type="number"
                  min={0}
                  value={locationFormRounds}
                  onChange={(e) => setLocationFormRounds(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                onClick={handleAddLocation}
                disabled={!locationFormId || addLocationMutation.isPending}
                className="shrink-0"
              >
                Add
              </Button>
            </div>
          ) : locations.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No locations defined yet. Add locations in the Lookups settings.
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              All locations have thresholds set.
            </p>
          )}
        </section>

      </div>
    </AppShell>
  )
}
