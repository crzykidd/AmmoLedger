import { api } from './client'
import type {
  ContainerItem,
  DealerItem,
  FirearmActionTypeItem,
  FirearmComplianceTagItem,
  FirearmFinishItem,
  FirearmFrameSizeItem,
  FirearmModelItem,
  FirearmOpticCutItem,
  FirearmRailTypeItem,
  FirearmUserTagItem,
  LocationItem,
  LookupItem,
  ManufacturerDomain,
  ManufacturerItem,
} from '@/types'

// ---------------------------------------------------------------------------
// Form dropdown getters — active entries only (default active_only=true)
// ---------------------------------------------------------------------------

export const getCalibersLookup = () => api.get<LookupItem[]>('/calibers')
export const getManufacturers = () => api.get<ManufacturerItem[]>('/manufacturers')

/** Domain-filtered manufacturers (e.g. firearm makers only). For cascading dropdowns. */
export const getManufacturersByType = (type: ManufacturerDomain) =>
  api.get<ManufacturerItem[]>(`/manufacturers?type=${type}`)
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

// ---------------------------------------------------------------------------
// Manufacturers — types (ammo / firearm) admin mutation
// ---------------------------------------------------------------------------

export const updateManufacturerTypes = (id: number, types: ManufacturerDomain[]) =>
  api.patch<ManufacturerItem>(`/manufacturers/${id}/types`, { types: JSON.stringify(types) })

// ---------------------------------------------------------------------------
// Firearm Action Types
// ---------------------------------------------------------------------------

export const getFirearmActionTypes = () =>
  api.get<FirearmActionTypeItem[]>('/firearm-action-types')

export const getFirearmActionTypesAdmin = () =>
  api.get<FirearmActionTypeItem[]>('/firearm-action-types?active_only=false')

export const createFirearmActionType = (name: string) =>
  api.post<FirearmActionTypeItem>('/firearm-action-types', { name })

export const updateFirearmActionType = (id: number, payload: { name?: string }) =>
  api.patch<FirearmActionTypeItem>(`/firearm-action-types/${id}`, payload)

export const deleteFirearmActionType = (id: number) =>
  api.delete<void>(`/firearm-action-types/${id}`)

// ---------------------------------------------------------------------------
// Firearm Models
// ---------------------------------------------------------------------------

export const getFirearmModels = (manufacturerId?: number) =>
  api.get<FirearmModelItem[]>(
    manufacturerId
      ? `/firearm-models?manufacturer_id=${manufacturerId}`
      : '/firearm-models',
  )

export const getFirearmModelsAdmin = () =>
  api.get<FirearmModelItem[]>('/firearm-models?active_only=false')

export const createFirearmModel = (payload: {
  manufacturer_id: number
  name: string
  default_caliber_id?: number | null
  default_action_type_id?: number | null
}) => api.post<FirearmModelItem>('/firearm-models', payload)

export const updateFirearmModel = (
  id: number,
  payload: {
    manufacturer_id?: number
    name?: string
    default_caliber_id?: number | null
    default_action_type_id?: number | null
  },
) => api.patch<FirearmModelItem>(`/firearm-models/${id}`, payload)

export const deleteFirearmModel = (id: number) =>
  api.delete<void>(`/firearm-models/${id}`)

// ---------------------------------------------------------------------------
// Firearm Compliance Tags
// ---------------------------------------------------------------------------

export const getFirearmComplianceTags = () =>
  api.get<FirearmComplianceTagItem[]>('/firearm-compliance-tags')

export const getFirearmComplianceTagsAdmin = () =>
  api.get<FirearmComplianceTagItem[]>('/firearm-compliance-tags?active_only=false')

export const createFirearmComplianceTag = (payload: {
  name: string
  description?: string | null
  jurisdiction?: string | null
}) => api.post<FirearmComplianceTagItem>('/firearm-compliance-tags', payload)

export const updateFirearmComplianceTag = (
  id: number,
  payload: { name?: string; description?: string | null; jurisdiction?: string | null },
) => api.patch<FirearmComplianceTagItem>(`/firearm-compliance-tags/${id}`, payload)

export const deleteFirearmComplianceTag = (id: number) =>
  api.delete<void>(`/firearm-compliance-tags/${id}`)

// ---------------------------------------------------------------------------
// Firearm User Tags (per-user; NOT community-managed)
// ---------------------------------------------------------------------------

export const getFirearmUserTags = () =>
  api.get<FirearmUserTagItem[]>('/firearm-user-tags')

export const createFirearmUserTag = (payload: { name: string; color?: string | null }) =>
  api.post<FirearmUserTagItem>('/firearm-user-tags', payload)

export const updateFirearmUserTag = (
  id: number,
  payload: { name?: string; color?: string | null },
) => api.patch<FirearmUserTagItem>(`/firearm-user-tags/${id}`, payload)

export const deleteFirearmUserTag = (id: number) =>
  api.delete<void>(`/firearm-user-tags/${id}`)

// ---------------------------------------------------------------------------
// Firearm physical attribute lookups (v0.3.0) — frame size, optic cut,
// rail type, finish. All four mirror the firearm_action_types pattern.
// ---------------------------------------------------------------------------

export const getFirearmFrameSizes = () =>
  api.get<FirearmFrameSizeItem[]>('/firearm-frame-sizes')
export const getFirearmFrameSizesAdmin = () =>
  api.get<FirearmFrameSizeItem[]>('/firearm-frame-sizes?active_only=false')
export const createFirearmFrameSize = (name: string) =>
  api.post<FirearmFrameSizeItem>('/firearm-frame-sizes', { name })
export const updateFirearmFrameSize = (id: number, payload: { name?: string }) =>
  api.patch<FirearmFrameSizeItem>(`/firearm-frame-sizes/${id}`, payload)
export const deleteFirearmFrameSize = (id: number) =>
  api.delete<void>(`/firearm-frame-sizes/${id}`)

export const getFirearmOpticCuts = () =>
  api.get<FirearmOpticCutItem[]>('/firearm-optic-cuts')
export const getFirearmOpticCutsAdmin = () =>
  api.get<FirearmOpticCutItem[]>('/firearm-optic-cuts?active_only=false')
export const createFirearmOpticCut = (name: string) =>
  api.post<FirearmOpticCutItem>('/firearm-optic-cuts', { name })
export const updateFirearmOpticCut = (id: number, payload: { name?: string }) =>
  api.patch<FirearmOpticCutItem>(`/firearm-optic-cuts/${id}`, payload)
export const deleteFirearmOpticCut = (id: number) =>
  api.delete<void>(`/firearm-optic-cuts/${id}`)

export const getFirearmRailTypes = () =>
  api.get<FirearmRailTypeItem[]>('/firearm-rail-types')
export const getFirearmRailTypesAdmin = () =>
  api.get<FirearmRailTypeItem[]>('/firearm-rail-types?active_only=false')
export const createFirearmRailType = (name: string) =>
  api.post<FirearmRailTypeItem>('/firearm-rail-types', { name })
export const updateFirearmRailType = (id: number, payload: { name?: string }) =>
  api.patch<FirearmRailTypeItem>(`/firearm-rail-types/${id}`, payload)
export const deleteFirearmRailType = (id: number) =>
  api.delete<void>(`/firearm-rail-types/${id}`)

export const getFirearmFinishes = () =>
  api.get<FirearmFinishItem[]>('/firearm-finishes')
export const getFirearmFinishesAdmin = () =>
  api.get<FirearmFinishItem[]>('/firearm-finishes?active_only=false')
export const createFirearmFinish = (name: string) =>
  api.post<FirearmFinishItem>('/firearm-finishes', { name })
export const updateFirearmFinish = (id: number, payload: { name?: string }) =>
  api.patch<FirearmFinishItem>(`/firearm-finishes/${id}`, payload)
export const deleteFirearmFinish = (id: number) =>
  api.delete<void>(`/firearm-finishes/${id}`)
