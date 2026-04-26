import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Trash2 } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useThresholds } from '@/hooks/useThresholds'
import { useInventoryLookups } from '@/hooks/useInventoryLookups'
import { cn } from '@/lib/utils'
import type { ThresholdConfig } from '@/types'

const defaultSchema = z.object({
  default_rounds: z.number().min(0),
  default_boxes: z.number().min(0),
})
type DefaultForm = z.infer<typeof defaultSchema>

const overrideSchema = z.object({
  caliber_id: z.string().min(1, 'Select a caliber'),
  rounds: z.number().min(0),
})
type OverrideForm = z.infer<typeof overrideSchema>

export default function ThresholdSettingsPage() {
  const { thresholds, updateConfig, removeCaliberThreshold } = useThresholds()
  const { calibers } = useInventoryLookups()
  const [saved, setSaved] = useState(false)

  const defaultForm = useForm<DefaultForm>({
    resolver: zodResolver(defaultSchema),
    values: {
      default_rounds: thresholds.default_rounds,
      default_boxes: thresholds.default_boxes,
    },
  })

  const overrideForm = useForm<OverrideForm>({
    resolver: zodResolver(overrideSchema),
    defaultValues: { caliber_id: '', rounds: 200 },
  })

  function saveDefaults(data: DefaultForm) {
    updateConfig({ ...thresholds, default_rounds: data.default_rounds, default_boxes: data.default_boxes })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function addOverride(data: OverrideForm) {
    const name = calibers.find((c) => String(c.id) === data.caliber_id)?.name ?? ''
    if (!name) return
    const next: ThresholdConfig = {
      ...thresholds,
      caliber_overrides: {
        ...thresholds.caliber_overrides,
        [name]: { rounds: data.rounds },
      },
    }
    updateConfig(next)
    overrideForm.reset({ caliber_id: '', rounds: 200 })
  }

  const overrideEntries = Object.entries(thresholds.caliber_overrides)

  return (
    <AppShell>
      <TopBar title="Stock Thresholds" />
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-6 max-w-2xl space-y-8">
        {/* Default thresholds */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Default thresholds
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Applied to all calibers that don't have a specific override.
          </p>
          <form onSubmit={defaultForm.handleSubmit(saveDefaults)} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Low rounds threshold
                </label>
                <Input
                  type="number"
                  min={0}
                  {...defaultForm.register('default_rounds', { valueAsNumber: true })}
                  className={cn(defaultForm.formState.errors.default_rounds && 'border-red-500')}
                />
                {defaultForm.formState.errors.default_rounds && (
                  <p className="text-xs text-red-500 mt-1">
                    {defaultForm.formState.errors.default_rounds.message}
                  </p>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Low boxes threshold
                </label>
                <Input
                  type="number"
                  min={0}
                  {...defaultForm.register('default_boxes', { valueAsNumber: true })}
                  className={cn(defaultForm.formState.errors.default_boxes && 'border-red-500')}
                />
                {defaultForm.formState.errors.default_boxes && (
                  <p className="text-xs text-red-500 mt-1">
                    {defaultForm.formState.errors.default_boxes.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm">
                Save defaults
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved!</span>
              )}
            </div>
          </form>
        </section>

        {/* Caliber overrides */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Caliber overrides
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Set a custom low-rounds threshold for a specific caliber.
          </p>

          {overrideEntries.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">
                      Caliber
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">
                      Rounds threshold
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {overrideEntries.map(([name, cfg]) => (
                    <tr
                      key={name}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                    >
                      <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{name}</td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                        {cfg.rounds ?? thresholds.default_rounds}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => removeCaliberThreshold(name)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove override"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={overrideForm.handleSubmit(addOverride)} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Caliber
              </label>
              <select
                {...overrideForm.register('caliber_id')}
                className="w-full h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
              >
                <option value="">Select caliber…</option>
                {calibers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
              {overrideForm.formState.errors.caliber_id && (
                <p className="text-xs text-red-500 mt-1">
                  {overrideForm.formState.errors.caliber_id.message}
                </p>
              )}
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rounds
              </label>
              <Input
                type="number"
                min={0}
                {...overrideForm.register('rounds', { valueAsNumber: true })}
              />
            </div>
            <Button type="submit" size="sm" className="shrink-0">
              Add override
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  )
}
