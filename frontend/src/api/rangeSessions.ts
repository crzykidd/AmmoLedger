import { api } from './client'
import type {
  RangeSessionCreate,
  RangeSessionLineCreate,
  RangeSessionLineRead,
  RangeSessionLineUpdate,
  RangeSessionListFilters,
  RangeSessionListItem,
  RangeSessionRead,
  RangeSessionUpdate,
} from '@/types'

const buildQuery = (params?: RangeSessionListFilters): string => {
  if (!params) return ''
  const qs = new URLSearchParams()
  if (params.firearm_id != null) qs.set('firearm_id', String(params.firearm_id))
  if (params.after) qs.set('after', params.after)
  if (params.before) qs.set('before', params.before)
  if (params.limit != null) qs.set('limit', String(params.limit))
  const query = qs.toString()
  return query ? `?${query}` : ''
}

export const listRangeSessions = (params?: RangeSessionListFilters) =>
  api.get<RangeSessionListItem[]>(`/range-sessions${buildQuery(params)}`)

export const getRangeSession = (id: number) =>
  api.get<RangeSessionRead>(`/range-sessions/${id}`)

export const createRangeSession = (data: RangeSessionCreate) =>
  api.post<RangeSessionRead>('/range-sessions', data)

export const updateRangeSession = (id: number, data: RangeSessionUpdate) =>
  api.patch<RangeSessionRead>(`/range-sessions/${id}`, data)

export const deleteRangeSession = (id: number) =>
  api.delete<void>(`/range-sessions/${id}`)

export const addRangeSessionLine = (sessionId: number, data: RangeSessionLineCreate) =>
  api.post<RangeSessionLineRead>(`/range-sessions/${sessionId}/lines`, data)

export const updateRangeSessionLine = (
  sessionId: number,
  lineId: number,
  data: RangeSessionLineUpdate,
) =>
  api.patch<RangeSessionLineRead>(`/range-sessions/${sessionId}/lines/${lineId}`, data)

export const deleteRangeSessionLine = (sessionId: number, lineId: number) =>
  api.delete<void>(`/range-sessions/${sessionId}/lines/${lineId}`)
