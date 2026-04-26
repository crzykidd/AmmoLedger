import { api } from './client'
import type {
  AmmoBoxCreate,
  AmmoBoxRead,
  AmmoBoxUpdate,
  AmmoListResponse,
  ExpendRequest,
  ExpendResponse,
  ExpenditureRead,
} from '@/types'

export const listAmmo = (params?: { search?: string; show_archived?: boolean }) => {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.show_archived) qs.set('show_archived', 'true')
  const query = qs.toString()
  return api.get<AmmoListResponse>(`/ammo${query ? `?${query}` : ''}`)
}

export const getAmmo = (id: number) => api.get<AmmoBoxRead>(`/ammo/${id}`)

export const createAmmo = (data: AmmoBoxCreate) => api.post<AmmoBoxRead>('/ammo', data)

export const updateAmmo = (id: number, data: AmmoBoxUpdate) =>
  api.patch<AmmoBoxRead>(`/ammo/${id}`, data)

export const deleteAmmo = (id: number) => api.delete<void>(`/ammo/${id}`)

export const expendAmmo = (boxId: number, data: ExpendRequest) =>
  api.post<ExpendResponse>(`/ammo/${boxId}/expend`, data)

export const getAmmoHistory = (boxId: number) =>
  api.get<ExpenditureRead[]>(`/ammo/${boxId}/history`)
