import { api } from './client'
import type {
  AmmoBoxCreate,
  AmmoBoxRead,
  AmmoBoxUpdate,
  AmmoListResponse,
  BulkUpdateRequest,
  BulkUpdateResponse,
  ExpendRequest,
  ExpendResponse,
  ExpenditureRead,
  RecentExpenditure,
  SplitParentRead,
  SplitRequest,
  SplitResponse,
} from '@/types'

export const listAmmo = (params?: { search?: string; show_archived?: boolean; show_empty?: boolean }) => {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.show_archived) qs.set('show_archived', 'true')
  if (params?.show_empty) qs.set('show_empty', 'true')
  const query = qs.toString()
  return api.get<AmmoListResponse>(`/ammo${query ? `?${query}` : ''}`)
}

export const getAmmo = (id: number) => api.get<AmmoBoxRead>(`/ammo/${id}`)

export const createAmmo = (data: AmmoBoxCreate) => api.post<AmmoBoxRead>('/ammo', data)

export const updateAmmo = (id: number, data: AmmoBoxUpdate) =>
  api.patch<AmmoBoxRead>(`/ammo/${id}`, data)

export const deleteAmmo = (id: number) => api.delete<void>(`/ammo/${id}`)

export const bulkUpdateAmmo = (data: BulkUpdateRequest) =>
  api.patch<BulkUpdateResponse>('/ammo/bulk-update', data)

export const expendAmmo = (boxId: number, data: ExpendRequest) =>
  api.post<ExpendResponse>(`/ammo/${boxId}/expend`, data)

export const splitAmmo = (boxId: number, data: SplitRequest) =>
  api.post<SplitResponse>(`/ammo/${boxId}/split`, data)

export const getAmmoHistory = (boxId: number) =>
  api.get<ExpenditureRead[]>(`/ammo/${boxId}/history`)

export const getRecentExpenditure = () =>
  api.get<RecentExpenditure[]>('/expenditures/recent')

export const getSplitParents = () =>
  api.get<SplitParentRead[]>('/ammo/split-parents')

export const exportAmmoCsv = (params?: { search?: string; show_archived?: boolean; show_empty?: boolean }) => {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.show_archived) qs.set('show_archived', 'true')
  if (params?.show_empty) qs.set('show_empty', 'true')
  const query = qs.toString()
  return `/api/ammo/export/csv${query ? `?${query}` : ''}`
}
