import type { ImportConfirmResult, ImportValidationResult } from '@/types'

const BASE = '/api'

async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const json = await res.json()
      detail = json.detail ?? detail
    } catch { /* keep default */ }
    throw new Error(detail)
  }
  return res.json()
}

export const validateImport = (file: File): Promise<ImportValidationResult> => {
  const fd = new FormData()
  fd.append('file', file)
  return postFormData('/import/validate', fd)
}

export const confirmImport = (file: File, validationToken: string): Promise<ImportConfirmResult> => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('validation_token', validationToken)
  return postFormData('/import/confirm', fd)
}

export const getImportTemplateUrl = () => `${BASE}/import/template`
