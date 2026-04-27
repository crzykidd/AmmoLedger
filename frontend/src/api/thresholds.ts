import type { CaliberThreshold, LocationThreshold, LowStockResponse } from '@/types'

const BASE = '/api'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const json = await res.json()
      if (typeof json.detail === 'string') detail = json.detail
    } catch { /* keep status */ }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const fetchDefaultThreshold = (): Promise<{ rounds: number }> =>
  apiFetch('/thresholds/default')

export const updateDefaultThreshold = (rounds: number): Promise<{ rounds: number }> =>
  apiFetch('/thresholds/default', { method: 'PUT', body: JSON.stringify({ rounds }) })

export const fetchCaliberThresholds = (): Promise<CaliberThreshold[]> =>
  apiFetch('/thresholds/calibers')

export const createCaliberThreshold = (caliber_id: number, rounds: number): Promise<unknown> =>
  apiFetch('/thresholds/calibers', { method: 'POST', body: JSON.stringify({ caliber_id, rounds }) })

export const deleteCaliberThreshold = (caliber_id: number): Promise<void> =>
  apiFetch(`/thresholds/calibers/${caliber_id}`, { method: 'DELETE' })

export const fetchLocationThresholds = (): Promise<LocationThreshold[]> =>
  apiFetch('/thresholds/locations')

export const createLocationThreshold = (location_id: number, rounds: number): Promise<unknown> =>
  apiFetch('/thresholds/locations', { method: 'POST', body: JSON.stringify({ location_id, rounds }) })

export const deleteLocationThreshold = (location_id: number): Promise<void> =>
  apiFetch(`/thresholds/locations/${location_id}`, { method: 'DELETE' })

export const fetchLowStock = (): Promise<LowStockResponse> =>
  apiFetch('/thresholds/low-stock')
