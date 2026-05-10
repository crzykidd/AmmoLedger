import { api } from './client'
import type {
  FirearmCreate,
  FirearmListFilters,
  FirearmLogCreate,
  FirearmLogRead,
  FirearmLogUpdate,
  FirearmRead,
  FirearmUpdate,
} from '@/types'

const buildQuery = (params?: FirearmListFilters): string => {
  if (!params) return ''
  const qs = new URLSearchParams()
  if (params.firearm_type) qs.set('firearm_type', params.firearm_type)
  if (params.manufacturer_id != null)
    qs.set('manufacturer_id', String(params.manufacturer_id))
  if (params.caliber_id != null)
    qs.set('caliber_id', String(params.caliber_id))
  if (params.cleaning_status) qs.set('cleaning_status', params.cleaning_status)
  if (params.compliance_tag_id != null)
    qs.set('compliance_tag_id', String(params.compliance_tag_id))
  if (params.user_tag_id != null)
    qs.set('user_tag_id', String(params.user_tag_id))
  const query = qs.toString()
  return query ? `?${query}` : ''
}

export const listFirearms = (params?: FirearmListFilters) =>
  api.get<FirearmRead[]>(`/firearms${buildQuery(params)}`)

export const getFirearm = (id: number) => api.get<FirearmRead>(`/firearms/${id}`)

export const createFirearm = (data: FirearmCreate) =>
  api.post<FirearmRead>('/firearms', data)

export const updateFirearm = (id: number, data: FirearmUpdate) =>
  api.patch<FirearmRead>(`/firearms/${id}`, data)

export const deleteFirearm = (id: number) =>
  api.delete<void>(`/firearms/${id}`)

// ---------------------------------------------------------------------------
// Firearm log (nested)
// ---------------------------------------------------------------------------

export const listFirearmLog = (firearmId: number) =>
  api.get<FirearmLogRead[]>(`/firearms/${firearmId}/log`)

export const createFirearmLog = (firearmId: number, data: FirearmLogCreate) =>
  api.post<FirearmLogRead>(`/firearms/${firearmId}/log`, data)

export const updateFirearmLog = (
  firearmId: number,
  logId: number,
  data: FirearmLogUpdate,
) => api.patch<FirearmLogRead>(`/firearms/${firearmId}/log/${logId}`, data)

export const deleteFirearmLog = (firearmId: number, logId: number) =>
  api.delete<void>(`/firearms/${firearmId}/log/${logId}`)

export const exportFirearmsCsvUrl = () => '/api/firearms/export/csv'
