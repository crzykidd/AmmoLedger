import { api } from './client'
import type { ContainerItem, DealerItem, LocationItem, LookupItem } from '@/types'

export const getCalibersLookup = () => api.get<LookupItem[]>('/calibers')
export const getManufacturers = () => api.get<LookupItem[]>('/manufacturers')
export const getAmmoTypes = () => api.get<LookupItem[]>('/ammo-types')
export const getAmmoConditions = () => api.get<LookupItem[]>('/ammo-conditions')
export const getCategories = () => api.get<LookupItem[]>('/categories')
export const getDealers = () => api.get<DealerItem[]>('/dealers')
export const getLocations = () => api.get<LocationItem[]>('/locations')
export const getContainers = () => api.get<ContainerItem[]>('/containers')
