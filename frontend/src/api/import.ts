import type { ImportConfirmResult, ImportValidationResult } from '@/types'

const BASE = '/api'

async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  // Do NOT set Content-Type manually — the browser must set it with the multipart boundary.
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const json = await res.json()
      const raw = json.detail
      if (typeof raw === 'string') {
        detail = raw
      } else if (Array.isArray(raw)) {
        // FastAPI validation error format: [{loc, msg, type}, ...]
        detail = raw.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join('; ')
      } else if (raw != null) {
        detail = JSON.stringify(raw)
      }
    } catch { /* keep HTTP status as fallback */ }
    throw new Error(detail)
  }
  return res.json()
}

export const validateImport = (file: File): Promise<ImportValidationResult> => {
  const fd = new FormData()
  fd.append('file', file)
  return postFormData('/import/validate', fd)
}

export const confirmImport = (
  file: File,
  validationToken: string,
  useLegacyIds: boolean,
  isShared: boolean = true,
): Promise<ImportConfirmResult> => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('validation_token', validationToken)
  fd.append('use_legacy_ids', String(useLegacyIds))
  fd.append('is_shared', String(isShared))
  return postFormData('/import/confirm', fd)
}

export const getImportTemplateUrl = () => `${BASE}/import/template`
