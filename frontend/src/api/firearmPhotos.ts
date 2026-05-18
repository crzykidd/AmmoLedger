import { api } from './client'
import type { FirearmPhoto, FirearmPhotoReorderItem } from '@/types'

/** Prefix the auth-gated photo URL the server sends with the API base so
 *  it can be used in `<img src>` directly. The browser ships the session
 *  cookie automatically (same-origin via the dev proxy / production proxy). */
export function photoSrc(serverUrl: string): string {
  if (!serverUrl) return ''
  if (serverUrl.startsWith('http://') || serverUrl.startsWith('https://')) {
    return serverUrl
  }
  return `/api${serverUrl}`
}

export const listFirearmPhotos = (firearmId: number) =>
  api.get<FirearmPhoto[]>(`/firearms/${firearmId}/photos`)

export async function uploadFirearmPhoto(
  firearmId: number,
  file: File,
): Promise<FirearmPhoto> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`/api/firearms/${firearmId}/photos`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = typeof err.detail === 'string' ? err.detail : (err.detail?.message ?? detail)
    } catch {
      // keep default
    }
    throw new Error(detail)
  }
  return (await res.json()) as FirearmPhoto
}

export const setDefaultPhoto = (firearmId: number, photoId: number) =>
  api.patch<FirearmPhoto>(`/firearms/${firearmId}/photos/${photoId}/default`)

export const reorderPhotos = (
  firearmId: number,
  items: FirearmPhotoReorderItem[],
) =>
  api.post<FirearmPhoto[]>(`/firearms/${firearmId}/photos/reorder`, { items })

export const deleteFirearmPhoto = (firearmId: number, photoId: number) =>
  api.delete<void>(`/firearms/${firearmId}/photos/${photoId}`)
