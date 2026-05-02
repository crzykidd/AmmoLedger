import { api } from './client'

export interface BackupFile {
  filename: string
  size_bytes: number
  created_at: string
  type: 'sqlite' | 'json'
}

export interface ImportPreview {
  valid: boolean
  version: string
  schema_migration: string
  exported_at: string
  record_counts: Record<string, number>
  warnings: string[]
}

export interface ImportResult {
  records_imported: number
  records_skipped: number
  warnings: string[]
}

export interface BackupConfig {
  backup: {
    enabled: boolean
    schedule: string
    retention_days: number
  }
}

// JSON body endpoints — use the typed API client
export const triggerBackup = () => api.post<BackupFile>('/backup/trigger')
export const exportCsvAll = () => '/api/backup/export/csv'
export const exportBackup = () => api.post<BackupFile>('/backup/export')
export const listBackups = () => api.get<BackupFile[]>('/backup/list')
export const deleteBackup = (filename: string) => api.delete<void>(`/backup/${filename}`)
export const getSystemConfig = () => api.get<BackupConfig>('/system/config')
export const saveSystemConfig = (data: BackupConfig) => api.post<BackupConfig>('/system/config', data)

// Multipart file upload helper — bypasses the JSON-only ApiClient
async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    let detail: string = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = typeof err.detail === 'string' ? err.detail : (err.detail?.message ?? detail)
    } catch {
      // keep default
    }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const restoreSqlite = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return postFormData<{ success: boolean; message: string }>('/backup/restore/sqlite', fd)
}

export const previewImport = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return postFormData<ImportPreview>('/backup/import/preview', fd)
}

export const commitImport = (file: File, mode: 'full' | 'additive') => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('mode', mode)
  return postFormData<ImportResult>('/backup/import/commit', fd)
}
