import type {
  FirearmsImportConfirmResult,
  FirearmsImportValidationResult,
} from '@/types'

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
        detail = raw.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join('; ')
      } else if (raw != null) {
        detail = JSON.stringify(raw)
      }
    } catch { /* keep HTTP status as fallback */ }
    throw new Error(detail)
  }
  return res.json()
}

export const validateFirearmsImport = (
  file: File,
): Promise<FirearmsImportValidationResult> => {
  const fd = new FormData()
  fd.append('file', file)
  return postFormData('/import/firearms/validate', fd)
}

export const confirmFirearmsImport = (
  file: File,
  validationToken: string,
  isShared: boolean,
  valueRemaps: Record<string, Record<string, string>> = {},
): Promise<FirearmsImportConfirmResult> => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('validation_token', validationToken)
  fd.append('is_shared', String(isShared))
  fd.append('value_remaps', JSON.stringify(valueRemaps))
  return postFormData('/import/firearms/confirm', fd)
}

export const getFirearmsImportTemplateUrl = (): string =>
  `${BASE}/import/firearms/template`
