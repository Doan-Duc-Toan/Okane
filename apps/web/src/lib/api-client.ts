/**
 * Authenticated fetch wrapper.
 *
 * Attaches the in-memory access token, transparently refreshes on a 401 via
 * a single-flight refresh promise (concurrent 401s share one refresh call —
 * without this, an expired token under N parallel dashboard queries would
 * fire N refreshes, and Phase 3's reuse-detection would nuke the session),
 * and retries the original request exactly once after a successful refresh.
 */

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Wire shape shared by register/login/refresh (Phase 3, frozen contract). */
export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: {
    id: string
    email: string
    displayName: string | null
    locale: 'vi' | 'ja'
    theme: 'light' | 'dark' | 'system'
  }
}

// Kept out of React state so the access token never lands in a
// devtools-serializable store.
let accessToken: string | null = null
let refreshToken: string | null = null
let onSessionExpired: (() => void) | null = null
let refreshInFlight: Promise<AuthSession | null> | null = null

export function setTokens(tokens: Pick<AuthSession, 'accessToken' | 'refreshToken'> | null): void {
  accessToken = tokens?.accessToken ?? null
  refreshToken = tokens?.refreshToken ?? null
}

/** Used only for the boot-time silent restore, before any access token exists. */
export function setRefreshTokenOnly(token: string | null): void {
  accessToken = null
  refreshToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setOnSessionExpired(handler: () => void): void {
  onSessionExpired = handler
}

async function performRefresh(): Promise<AuthSession | null> {
  if (!refreshToken) return null
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const session = (await res.json()) as AuthSession
    setTokens(session)
    return session
  } catch {
    return null
  }
}

/** Ensures only one refresh call is ever in flight at a time (single-flight). */
export function attemptRefresh(): Promise<AuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

interface RequestOptions extends RequestInit {
  /** internal — set on the retried request to prevent a second refresh loop */
  _isRetry?: boolean
}

export async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { _isRetry, headers, ...rest } = init
  const finalHeaders = new Headers(headers)
  if (accessToken) finalHeaders.set('Authorization', `Bearer ${accessToken}`)
  if (rest.body && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }

  const res = await fetch(`/api${path}`, { ...rest, headers: finalHeaders })

  if (res.status === 401 && !_isRetry) {
    const session = await attemptRefresh()
    if (session) {
      return request<T>(path, { ...init, _isRetry: true })
    }
    setTokens(null)
    onSessionExpired?.()
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { message?: string }
      if (body?.message) message = body.message
    } catch {
      // response had no JSON body — keep statusText
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
