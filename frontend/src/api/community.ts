import { api } from './client'
import type { CommunityStatus, CommunityContribute } from '@/types'

export function getCommunityStatus(): Promise<CommunityStatus> {
  return api.get<CommunityStatus>('/community/status')
}

export function triggerCommunitySync(): Promise<{ history_id: number; message: string }> {
  return api.post('/community/sync', {})
}

export function importCommunityEntries(table: string, ids: number[]): Promise<{ imported: number; ids: number[] }> {
  return api.post('/community/import', { table, ids })
}

export function hideCommunityEntries(table: string, ids: number[]): Promise<{ ok: boolean }> {
  return api.post('/community/hide', { table, ids })
}

export function unhideCommunityEntries(table: string, ids: number[]): Promise<{ ok: boolean }> {
  return api.post('/community/unhide', { table, ids })
}

export function getContributeYaml(table: string): Promise<CommunityContribute> {
  return api.get<CommunityContribute>(`/community/contribute/${table}`)
}
