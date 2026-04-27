import { api } from './client'

export interface SystemVersionResponse {
  version: string
  latest_version: string | null
  update_available: boolean
  build_sha: string | null
}

export const getSystemVersion = () => api.get<SystemVersionResponse>('/system/version')
