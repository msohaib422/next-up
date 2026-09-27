import axios from 'axios'

/**
 * The single HTTP client for the app.
 *
 * The important rule this file enforces: a session is only ever ended when the
 * server has positively confirmed the credential is not usable. A dropped
 * request, a timeout, a 429, a 500 or a 503 all mean "ask again later", never
 * "you are signed out".
 *
 * The previous interceptor ended the session on any 401, and AuthContext ended
 * it on any failure at all. Because the backend could briefly fail to answer -
 * a database reconnect, a cold start, a rate limit - an ordinary network blip
 * destroyed a perfectly valid login. That is what produced the random logouts.
 */

import { noteActivity, rememberIdleWindow } from '../utils/sessionIdle'

const api = axios.create({
  // Same-origin in production: Vercel rewrites /api to the serverless function,
  // so no backend URL is ever compiled into the bundle and no CORS preflight is
  // needed in the common case. VITE_API_URL is the escape hatch for a backend
  // hosted on a different origin.
  baseURL: import.meta.env.VITE_API_URL || '/api',
  // A request that has not answered in this long is a failure, not a hang. The
  // previous default was no timeout at all, so a stalled request left the UI
  // spinning indefinitely.
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 20000,
})

/** Fired when the server confirms the session is no longer valid. */
export const UNAUTHORIZED_EVENT = 'nextup:unauthorized'

/** Fired when the server reports the account is not approved. */
export const APPROVAL_REQUIRED_EVENT = 'nextup:approval-required'

/** Paths where a 401 is an expected answer about the form, not about a session. */
const NO_SESSION_PATHS = ['/auth/login', '/auth/register']

/**
 * True only for a response the server actually sent saying the credential is
 * not usable.
 *
 * `error.response` is undefined for a network failure, a timeout or a cancelled
 * request, so those can never be mistaken for a rejected token. The server marks
 * these with an explicit `reason` (INVALID_TOKEN, TOKEN_EXPIRED, NO_TOKEN,
 * ACCOUNT_NOT_FOUND); a plain 401 on a protected route is also treated as a
 * genuine rejection, so an unrecognised 401 still ends the session rather than
 * looping.
 */
export const isAuthRejection = (error) => {
  if (error?.response?.status !== 401) return false
  if (NO_SESSION_PATHS.some((path) => error.config?.url?.includes(path))) return false
  return true
}

/** True when the server refused because the account is not approved. */
export const isApprovalRejection = (error) =>
  error?.response?.status === 403 &&
  Boolean(error.response?.data?.data?.status) &&
  error.response.data.data.status !== 'Approved'

/**
 * True for anything that means "the request did not get a usable answer" and
 * that a later attempt could still succeed. Used to decide between retrying and
 * reporting, never to end a session.
 */
export const isTransient = (error) => {
  if (!error) return false
  if (error.response) {
    const status = error.response.status
    // 5xx and 429 are the server saying "not now".
    return status >= 500 || status === 429 || status === 408
  }
  // No response at all: offline, DNS failure, CORS, timeout, abort.
  return true
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** Fired when the server hands back a renewed session token. */
export const SESSION_RENEWED_EVENT = 'nextup:session-renewed'

/** Response headers carrying the sliding session (see backend/config/session.js). */
const SESSION_TOKEN_HEADER = 'x-session-token'
const SESSION_IDLE_HEADER = 'x-session-idle-ms'

/*
 * Keep the stored token in step with the server's sliding window.
 *
 * The server signs each credential for one idle window and re-signs it on every
 * request it accepts, so a session the user is actually using never runs out
 * while a session they walked away from does. The renewed token arrives as a
 * response header, and it has to be stored here, before the next request is
 * built, otherwise the client would keep presenting the older copy until it
 * happened to expire.
 *
 * Nothing here decides whether a session is valid: the server already answered
 * this request, so the credential was good, and the client is only recording
 * the newer copy of it.
 */
api.interceptors.response.use(
  (response) => {
    const headers = response?.headers
    if (!headers) return response

    const idle = Number(headers[SESSION_IDLE_HEADER])
    if (Number.isFinite(idle) && idle > 0) {
      rememberIdleWindow(idle)
      // The server only sends this header on a request it actually
      // authenticated, so receiving it is proof that the user is still here.
      // That keeps the browser's record of when this session was last used
      // accurate, which is what the closed-tab check on the next visit reads.
      noteActivity()
    }

    const renewed = headers[SESSION_TOKEN_HEADER]
    if (typeof renewed === 'string' && renewed && renewed !== localStorage.getItem('token')) {
      localStorage.setItem('token', renewed)
      window.dispatchEvent(new CustomEvent(SESSION_RENEWED_EVENT, { detail: renewed }))
    }

    return response
  },

  (error) => {
    // 1. The server positively rejected the credential. This is the ONLY case
    //    that ends the session, and the stored token is removed for real.
    if (isAuthRejection(error)) {
      localStorage.removeItem('token')
      localStorage.removeItem('nextup.user')
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: error.response.data?.reason }))
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    // 2. Registration approval gate. If the server refuses because the account
    //    is not approved, show the status screen instead of leaving the user on
    //    a page they cannot use.
    if (isApprovalRejection(error)) {
      localStorage.removeItem('token')
      localStorage.removeItem('nextup.user')
      const status = error.response.data.data.status
      window.dispatchEvent(new CustomEvent(APPROVAL_REQUIRED_EVENT, { detail: status }))
      if (window.location.pathname !== '/account-status') {
        window.location.href = '/account-status'
      }
      return Promise.reject(error)
    }

    // 3. Everything else - timeout, offline, 500, 503, 429 - is reported to the
    //    caller with the session untouched, so the app can show "can't reach
    //    the server right now" and try again.
    return Promise.reject(error)
  }
)

export default api
