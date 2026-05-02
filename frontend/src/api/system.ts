import { api } from './client'

export interface BuildInfo {
  version: string
  branch: string
  sha: string
  is_dev: boolean
}

export interface SystemVersionResponse {
  version: string
  display_version: string
  build: BuildInfo
  latest_version: string | null
  update_available: boolean
  build_sha: string | null
  last_checked: string | null
  upgraded_from: string | null
}

export interface ChangelogSection {
  version: string
  date: string | null
  body: string
}

export interface ChangelogResponse {
  source: 'github' | 'local' | 'unavailable'
  sections: ChangelogSection[]
}

export const getSystemVersion = () => api.get<SystemVersionResponse>('/system/version')

export const forceVersionCheck = () => api.post<SystemVersionResponse>('/system/version/check')

export const getChangelog = (fromVersion?: string | null, toVersion?: string | null) => {
  const params = new URLSearchParams()
  if (fromVersion) params.set('from_version', fromVersion)
  if (toVersion) params.set('to_version', toVersion)
  const query = params.toString() ? `?${params}` : ''
  return api.get<ChangelogResponse>(`/system/changelog${query}`)
}

export const dismissUpgrade = () => api.post<{ ok: boolean }>('/system/version/dismiss-upgrade')
