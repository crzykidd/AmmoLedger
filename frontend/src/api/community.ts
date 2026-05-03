import { get, post } from './client'
import type { CommunityStatus, CommunityContribute } from '@/types'

export function getCommunityStatus(): Promise<CommunityStatus> {
  return get<CommunityStatus>('/community/status')
}

export function triggerCommunitySync(): Promise<{ history_id: number; message: string }> {
  return post('/community/sync', {})
}

export function importCommunityEntries(table: string, ids: number[]): Promise<{ imported: number; ids: number[] }> {
  return post('/community/import', { table, ids })
}

export function hideCommunityEntries(table: string, ids: number[]): Promise<{ ok: boolean }> {
  return post('/community/hide', { table, ids })
}

export function unhideCommunityEntries(table: string, ids: number[]): Promise<{ ok: boolean }> {
  return post('/community/unhide', { table, ids })
}

export function getContributeYaml(table: string): Promise<CommunityContribute> {
  return get<CommunityContribute>(`/community/contribute/${table}`)
}
