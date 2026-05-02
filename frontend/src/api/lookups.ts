import { api } from './client'
import type { ContainerItem, DealerItem, LocationItem, LookupItem, ManufacturerItem } from '@/types'

// ---------------------------------------------------------------------------
// Form dropdown getters — active entries only (default active_only=true)
// ---------------------------------------------------------------------------

export const getCalibersLookup = () => api.get<LookupItem[]>('/calibers')
export const getManufacturers = () => api.get<ManufacturerItem[]>('/manufacturers')
export const getAmmoTypes = () => api.get<LookupItem[]>('/ammo-types')
export const getAmmoConditions = () => api.get<LookupItem[]>('/ammo-conditions')
export const getCategories = () => api.get<LookupItem[]>('/categories')
export const getDealers = () => api.get<DealerItem[]>('/dealers')
export const getLocations = () => api.get<LocationItem[]>('/locations')
export const getContainers = () => api.get<ContainerItem[]>('/containers')

// ---------------------------------------------------------------------------
// Admin page getters — all entries including hidden (active_only=false)
// ---------------------------------------------------------------------------

export const getCalibersAdmin = () => api.get<LookupItem[]>('/calibers?active_only=false')
export const getManufacturersAdmin = () => api.get<ManufacturerItem[]>('/manufacturers?active_only=false')
export const getAmmoTypesAdmin = () => api.get<LookupItem[]>('/ammo-types?active_only=false')
export const getAmmoConditionsAdmin = () => api.get<LookupItem[]>('/ammo-conditions?active_only=false')
export const getCategoriesAdmin = () => api.get<LookupItem[]>('/categories?active_only=false')
export const getDealersAdmin = () => api.get<DealerItem[]>('/dealers?active_only=false')
export const getLocationsAdmin = () => api.get<LocationItem[]>('/locations?active_only=false')
export const getContainersAdmin = () => api.get<ContainerItem[]>('/containers?active_only=false')

// ---------------------------------------------------------------------------
// Generic admin mutations — operate on /lookups/{table}/{id}
// ---------------------------------------------------------------------------

export const updateLookupEntry = (
  table: string,
  id: number,
  payload: { name?: string; url?: string | null },
) => api.patch<LookupItem>(`/lookups/${table}/${id}`, payload)

export const toggleLookupActive = (table: string, id: number) =>
  api.patch<LookupItem>(`/lookups/${table}/${id}/toggle-active`)

export const deleteLookupEntry = (table: string, id: number) =>
  api.delete<void>(`/lookups/${table}/${id}`)

// ---------------------------------------------------------------------------
// Create entries — use existing table-specific POST endpoints
// ---------------------------------------------------------------------------

export const createCalibersEntry = (name: string) =>
  api.post<LookupItem>('/calibers', { name })

export const createManufacturerEntry = (name: string, url?: string | null) =>
  api.post<ManufacturerItem>('/manufacturers', { name, url })

export const createAmmoTypeEntry = (name: string) =>
  api.post<LookupItem>('/ammo-types', { name })

export const createAmmoConditionEntry = (name: string) =>
  api.post<LookupItem>('/ammo-conditions', { name })

export const createCategoryEntry = (name: string) =>
  api.post<LookupItem>('/categories', { name })

export const createDealerEntry = (name: string, url?: string | null) =>
  api.post<DealerItem>('/dealers', { name, url })

export const createLocationEntry = (name: string) =>
  api.post<LocationItem>('/locations', { name })

export const createContainerEntry = (name: string) =>
  api.post<ContainerItem>('/containers', { name })
