import { api } from './client'
import type { ContainerItem, DealerItem, LocationItem, LookupItem, ManufacturerItem } from '@/types'

export const getCalibersLookup = () => api.get<LookupItem[]>('/calibers')
export const getManufacturers = () => api.get<ManufacturerItem[]>('/manufacturers')
export const getAmmoTypes = () => api.get<LookupItem[]>('/ammo-types')
export const getAmmoConditions = () => api.get<LookupItem[]>('/ammo-conditions')
export const getCategories = () => api.get<LookupItem[]>('/categories')
export const getDealers = () => api.get<DealerItem[]>('/dealers')
export const getLocations = () => api.get<LocationItem[]>('/locations')
export const getContainers = () => api.get<ContainerItem[]>('/containers')

export const updateManufacturer = (
  id: number,
  payload: { name?: string; url?: string | null },
) => api.patch<ManufacturerItem>(`/manufacturers/${id}`, payload)

export const updateDealer = (
  id: number,
  payload: { name?: string; url?: string | null },
) => api.patch<DealerItem>(`/dealers/${id}`, payload)
