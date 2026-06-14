import type { ApiError } from '@/types'

const BASE = '/api'

// ---------------------------------------------------------------------------
// Global 401 handler — cleared and reset by AuthContext on mount.
// The handler is intentionally skipped for auth endpoints that legitimately
// return 401 when not logged in (/auth/me probe, /auth/login, etc.).
// ---------------------------------------------------------------------------

type UnauthorizedHandler = () => void
let _on401Handler: UnauthorizedHandler | null = null

/** Auth paths that may legitimately return 401 — do NOT trigger the handler. */
const AUTH_EXEMPT_PATHS = [
  '/auth/me',
  '/auth/login',
  '/auth/setup',
  '/auth/register',
  '/auth/reset',
]

export function setOn401Handler(handler: UnauthorizedHandler | null): void {
  _on401Handler = handler
}

class ApiClient {
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      let error: ApiError & { status?: number } = { detail: `HTTP ${res.status}`, status: res.status }
      try {
        const json = await res.json() as ApiError
        error = { ...json, status: res.status }
      } catch {
        // keep default error
      }

      // On session expiry, notify the global handler (skips auth-own endpoints).
      if (res.status === 401 && _on401Handler && !AUTH_EXEMPT_PATHS.some((p) => path.startsWith(p))) {
        _on401Handler()
      }

      throw error
    }

    if (res.status === 204) return undefined as T
    return res.json()
  }

  get<T>(path: string) {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body)
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body)
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body)
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path)
  }
}

export const api = new ApiClient()
