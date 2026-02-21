import { useAuthStore } from '@/store/auth-store'

const SERVER_URL = import.meta.env.VITE_AUTOMD_SERVER ?? ''
export const API_BASE = SERVER_URL ? `${SERVER_URL}/api` : ''
export const WS_BASE = SERVER_URL ? SERVER_URL.replace(/^http/, 'ws') + '/ws' : ''

export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  if (!API_BASE) return { ok: false, error: 'No server configured' }

  try {
    const token = useAuthStore.getState().token
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    // Allow caller to override headers
    if (options?.headers) {
      Object.assign(headers, options.headers)
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    })

    if (res.status === 401) {
      // Session expired or invalid — clear auth so login prompt shows
      const authStore = useAuthStore.getState()
      if (authStore.status === 'authenticated') {
        authStore.clearAuth()
      }
      return { ok: false, error: 'Session expired', status: 401 }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: body || res.statusText, status: res.status }
    }
    if (res.status === 204) return { ok: true, data: null as T }
    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
