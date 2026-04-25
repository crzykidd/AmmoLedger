import type { ApiError } from '@/types'

const BASE = '/api'

class ApiClient {
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      let error: ApiError = { detail: `HTTP ${res.status}` }
      try {
        error = await res.json()
      } catch {
        // keep default error
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

  delete<T>(path: string) {
    return this.request<T>('DELETE', path)
  }
}

export const api = new ApiClient()
