import { useCallback, useEffect, useState } from 'react'
import type { ThresholdConfig, CaliberSummary, AmmoBoxRead, LookupItem } from '@/types'

const STORAGE_KEY = 'ammo_thresholds'

const DEFAULT_CONFIG: ThresholdConfig = {
  default_rounds: 200,
  default_boxes: 1,
  caliber_overrides: {},
}

function loadConfig(): ThresholdConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    // corrupt storage — fall through to default
  }
  return DEFAULT_CONFIG
}

export function useThresholds() {
  const [thresholds, setThresholds] = useState<ThresholdConfig>(loadConfig)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds))
  }, [thresholds])

  const setDefaultThreshold = useCallback((rounds: number, boxes: number) => {
    setThresholds((prev) => ({ ...prev, default_rounds: rounds, default_boxes: boxes }))
  }, [])

  const setCaliberThreshold = useCallback((caliber: string, rounds?: number, boxes?: number) => {
    setThresholds((prev) => ({
      ...prev,
      caliber_overrides: { ...prev.caliber_overrides, [caliber]: { rounds, boxes } },
    }))
  }, [])

  const removeCaliberThreshold = useCallback((caliber: string) => {
    setThresholds((prev) => {
      const overrides = { ...prev.caliber_overrides }
      delete overrides[caliber]
      return { ...prev, caliber_overrides: overrides }
    })
  }, [])

  const updateConfig = useCallback((config: ThresholdConfig) => {
    setThresholds(config)
  }, [])

  const isItemLow = useCallback(
    (box: AmmoBoxRead, caliberName: string): boolean => {
      const override = thresholds.caliber_overrides[caliberName]
      const threshold = override?.rounds ?? thresholds.default_rounds
      return box.qty_remaining < threshold
    },
    [thresholds],
  )

  const getLowItems = useCallback(
    (boxes: AmmoBoxRead[], calibers: LookupItem[]): AmmoBoxRead[] => {
      const caliberMap = new Map(calibers.map((c) => [c.id, c.name]))
      return boxes.filter((box) => isItemLow(box, caliberMap.get(box.caliber_id) ?? ''))
    },
    [isItemLow],
  )

  const getCaliberSummary = useCallback(
    (boxes: AmmoBoxRead[], calibers: LookupItem[]): CaliberSummary[] => {
      const caliberMap = new Map(calibers.map((c) => [c.id, c.name]))
      const byId = new Map<number, CaliberSummary>()

      for (const box of boxes) {
        if (!byId.has(box.caliber_id)) {
          byId.set(box.caliber_id, {
            caliber_id: box.caliber_id,
            caliber_name: caliberMap.get(box.caliber_id) ?? 'Unknown',
            total_rounds: 0,
            box_count: 0,
            is_low: false,
          })
        }
        const entry = byId.get(box.caliber_id)!
        entry.total_rounds += box.qty_remaining
        entry.box_count += 1
      }

      for (const entry of byId.values()) {
        const override = thresholds.caliber_overrides[entry.caliber_name]
        const threshold = override?.rounds ?? thresholds.default_rounds
        entry.is_low = entry.total_rounds < threshold
      }

      return [...byId.values()].sort((a, b) => a.caliber_name.localeCompare(b.caliber_name))
    },
    [thresholds],
  )

  return {
    thresholds,
    setDefaultThreshold,
    setCaliberThreshold,
    removeCaliberThreshold,
    updateConfig,
    isItemLow,
    getLowItems,
    getCaliberSummary,
  }
}
