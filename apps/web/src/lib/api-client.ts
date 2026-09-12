/**
 * Authenticated fetch wrapper.
 *
 * Attaches the in-memory access token, transparently refreshes on a 401 via
 * a single-flight refresh promise (concurrent 401s share one refresh call —
 * without this, an expired token under N parallel dashboard queries would
 * fire N refreshes, and Phase 3's reuse-detection would nuke the session),
 * and retries the original request exactly once after a successful refresh.
 */

import i18n from '@/i18n'

/**
 * In dev, this stays '' and every call below hits a relative `/api/...` path,
 * which Vite's dev-server proxy (vite.config.ts) forwards to localhost:3000 —
 * same-origin, no CORS involved. In production the frontend (Vercel) and API
 * (Render) are two different origins with nothing proxying between them, so
 * VITE_API_URL must be set to the deployed API's own origin at build time
 * (baked into the bundle — see apps/web/.env.example).
 */
const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  /** Every individual validation message, in server order — for callers that
   *  want to render a list instead of one flattened sentence. */
  details: string[]

  constructor(status: number, details: string[]) {
    // Each detail is already period-terminated (see extractErrorDetails) —
    // join with a space, not '. ', or multi-error messages get a stray "..".
    super(details.join(' '))
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/**
 * Nest's default error body is `{ message: string | string[], error, statusCode }`.
 * Every message this backend sends is a stable i18n key (e.g. `'passwordWeak'`,
 * `'goalNotFound'`) — never English prose — set explicitly via each DTO
 * decorator's `message` option, each hand-thrown `HttpException`, and the
 * global ValidationPipe's `exceptionFactory` (see
 * apps/api/src/common/validation-error.factory.ts, which also flattens
 * class-validator's own "property X should not exist" whitelist message down
 * to a single `'unexpectedField'` key). Translated here via `apiError.<key>`
 * so the message language always matches the UI's current language, not
 * whatever the server assumed.
 *
 * A key with no matching translation (a bug, or a genuinely unanticipated
 * error) falls back to a capitalized, period-terminated rendering of the raw
 * key/text rather than showing nothing or a raw i18n key like "goalNotFound"
 * verbatim.
 */
async function extractErrorDetails(res: Response): Promise<string[]> {
  let raw: unknown
  try {
    raw = (await res.json()) as { message?: unknown }
  } catch {
    return [res.statusText || `Request failed (${res.status})`]
  }
  const message = (raw as { message?: unknown } | undefined)?.message
  const list = Array.isArray(message) ? message : message ? [message] : []
  const cleaned = list
    .filter((m): m is string => typeof m === 'string' && m.length > 0)
    .map(translateOrFallback)
  return cleaned.length > 0 ? cleaned : [res.statusText || `Request failed (${res.status})`]
}

function translateOrFallback(key: string): string {
  const namespaced = `apiError.${key}`
  if (i18n.exists(namespaced)) return i18n.t(namespaced)
  // Unrecognized key (or, rarely, a raw English fragment from a dependency
  // we don't control) — still render something readable instead of the bare
  // camelCase key or nothing at all.
  return (key[0].toUpperCase() + key.slice(1)).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\.?$/, '.')
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
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
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

  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...rest, headers: finalHeaders })

  if (res.status === 401 && !_isRetry) {
    const session = await attemptRefresh()
    if (session) {
      return request<T>(path, { ...init, _isRetry: true })
    }
    setTokens(null)
    onSessionExpired?.()
    throw new ApiError(401, ['Session expired'])
  }

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorDetails(res))
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
