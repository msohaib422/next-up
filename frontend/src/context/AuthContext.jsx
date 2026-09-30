import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { isAuthRejection, isTransient, UNAUTHORIZED_EVENT, APPROVAL_REQUIRED_EVENT, SESSION_RENEWED_EVENT } from '../api/axios'
import { forgetAllLists } from '../utils/listCache'
import {
  clearSessionRecord,
  markTabOpen,
  noteActivity,
  noteTabClosed,
  rememberIdleWindow,
} from '../utils/sessionIdle'

const AuthContext = createContext(null)

const TOKEN_KEY = 'token'
const USER_KEY = 'nextup.user'

/**
 * The last user the server confirmed, kept so a page load can render an
 * authenticated shell before /auth/me answers.
 *
 * This is a convenience cache, never an authority: the server re-checks the
 * token on every request, so a stale or edited value here grants nothing. It
 * exists so that a temporary failure during startup shows the app instead of
 * bouncing the user to the login page.
 */
const readCachedUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeCachedUser = (user) => {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* storage unavailable or full - the session still works for this tab */
  }
}

/** How many times to re-ask before falling back to the cached user. */
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 800

/**
 * How often a signed-in, visible tab confirms it is still being used.
 *
 * This is the client half of the ten-minute rule: the server slides the
 * credential forward on every request it accepts, so a tab that is genuinely in
 * use keeps its session alive indefinitely. The notification bell already polls
 * every 30 seconds, so this is a safety net rather than the mechanism - it makes
 * the guarantee independent of any one feature, and it is deliberately not a
 * countdown that logs anybody out: it only ever runs while the tab is visible,
 * and all it does is ask the server an ordinary question.
 */
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Work out, once per page load, whether this browser still holds a live session.
 *
 * The server owns this decision, and it always has: the credential is verified
 * on every request, and the session is renewed by a real request carrying the
 * refresh cookie (see api/axios.js). The browser therefore does NOT second-
 * guess the server by deleting a session here.
 *
 * That deletion used to happen: if the tab marker was gone and the idle window
 * had passed, the stored token was removed before any request was made, and the
 * user was bounced to /login without the server ever being asked. That was wrong
 * in two ways. It fired on an ordinary REFRESH, because pagehide clears the tab
 * marker on a reload as well as on a close, so a reload after the window had
 * passed destroyed a session the server would happily have renewed. And it
 * assumed a closed tab means an abandoned session, which is simply not true -
 * closing a tab, switching windows, or a machine suspending are all normal.
 *
 * So the only question left here is whether there is anything to restore. If
 * there is a token, it is kept and the server decides; if there is not, the user
 * is asked to sign in. Nothing is pre-emptively thrown away.
 */
const resolveStoredSession = () => {
  const stored = localStorage.getItem(TOKEN_KEY)
  if (!stored) return { token: null, expired: false }

  // This tab is the live one from now on. The marker lives in sessionStorage,
  // so it survives a refresh of this tab and disappears when the tab is gone.
  markTabOpen()
  noteActivity()
  return { token: stored, expired: false }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedUser)
  // Resolved once per page load (a ref, so it is not recomputed on re-render)
  // rather than inside an effect, which would render the app as signed in for a
  // frame before taking it away again.
  const bootRef = useRef(null)
  if (bootRef.current === null) bootRef.current = resolveStoredSession()
  const [token, setToken] = useState(bootRef.current.token)
  const [loading, setLoading] = useState(true)
  // Bumped to re-run the session lookup without changing the token.
  const [sessionRefresh, setSessionRefresh] = useState(0)
  // Non-blocking: true when the server could not be reached. The session is
  // still valid, so nothing navigates away.
  const [connectionIssue, setConnectionIssue] = useState(false)
  // True when a session this browser held has expired because the tab that held
  // it was closed and left alone past the idle window. Only used to explain the
  // sign-in screen; it never grants access.
  const [sessionExpired, setSessionExpired] = useState(bootRef.current.expired)
  // A plain boolean, not the token: used as an effect dependency below, and the
  // token is replaced on every renewal.
  const authenticated = Boolean(token) && Boolean(user)
  const navigate = useNavigate()

  // A token handed over by the server mid-session. Remembered so the lookup
  // below can tell a renewal from a genuine sign-in and skip the refetch it
  // would otherwise cause.
  const renewedTokenRef = useRef(null)

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    writeCachedUser(null)
    clearSessionRecord()
    // The lists held for display (see utils/listCache) belong to the account
    // that is ending here, so they go with it.
    forgetAllLists()
    setToken(null)
    setUser(null)
  }, [])

  /*
   * Record when this tab stops being in use, so the next start-up can tell a
   * closed tab from a live one.
   *
   * `pagehide` covers a close, a refresh and the back/forward cache alike, and
   * it is the one event that fires for all three. `visibilitychange` -> hidden
   * is the tab-switch and mobile equivalent, where pagehide never fires: there
   * the activity time is stamped as the user leaves, so a tab they walked away
   * from is measured from the moment they left it rather than from whenever the
   * browser eventually suspends it.
   *
   * `visibilitychange` -> visible marks this tab as the live one again, which is
   * what stops a long, quiet stretch of reading from ever being mistaken for a
   * closed session.
   */
  useEffect(() => {
    if (!token) return undefined

    const onPageHide = () => noteTabClosed()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') noteTabClosed()
      else markTabOpen()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token])

  /*
   * Resolve the current user on mount and whenever the token changes.
   *
   * The decisive difference from before: a failure here is only allowed to end
   * the session when the server says the credential is invalid. A timeout, a
   * dropped connection or a 5xx is retried, and if the server still cannot be
   * reached the cached user is used and the token is KEPT, so the app opens
   * normally and recovers on the next request.
   */
  useEffect(() => {
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    // A renewal carries the same account as the session already in hand, so
    // there is nothing to look up: re-fetching here would be a request per
    // renewal for no new information.
    if (renewedTokenRef.current === token) {
      renewedTokenRef.current = null
      setLoading(false)
      return
    }

    const resolveUser = async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const res = await api.get('/auth/me')
          if (cancelled) return
          const data = res.data.data
          setUser(data)
          writeCachedUser(data)
          setConnectionIssue(false)
          return
        } catch (error) {
          if (cancelled) return

          // A real credential rejection: end the session, correctly.
          if (isAuthRejection(error)) {
            clearSession()
            setConnectionIssue(false)
            return
          }

          // Anything else might be temporary. Try again before deciding.
          if (isTransient(error) && attempt < MAX_ATTEMPTS) {
            await delay(RETRY_DELAY_MS * attempt)
            if (cancelled) return
            continue
          }

          // Still failing, and it was not a credential problem. Keep the token:
          // the session is intact, the server is simply not answering right now.
          const cached = readCachedUser()
          if (cached) {
            setUser(cached)
            setConnectionIssue(true)
          } else {
            // Nothing cached to fall back on, so the user must sign in again -
            // but the token is left alone in case it is still good.
            setUser(null)
            setConnectionIssue(true)
          }
          return
        }
      }
    }

    resolveUser().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [token, sessionRefresh, clearSession])

  /*
   * Stay in step with the axios interceptor. It clears the stored token the
   * moment the server rejects a credential; without this the React state would
   * still hold a user that no longer has a session, and a refresh would appear
   * to "log them back in" until the next request failed.
   */
  useEffect(() => {
    const onUnauthorized = () => {
      clearSession()
      setConnectionIssue(false)
      if (!window.location.pathname.startsWith('/login')) navigate('/login')
    }
    const onApprovalRequired = () => {
      clearSession()
      navigate('/account-status')
    }
    // A renewal: the server accepted the current credential and issued a newer
    // one. React state is brought in step so nothing here is holding a token the
    // browser has already replaced. The session lookup skips this case (see
    // renewedTokenRef), so no extra request is made.
    const onRenewed = (event) => {
      const renewed = event?.detail
      if (typeof renewed !== 'string' || !renewed) return
      renewedTokenRef.current = renewed
      setToken(renewed)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    window.addEventListener(APPROVAL_REQUIRED_EVENT, onApprovalRequired)
    window.addEventListener(SESSION_RENEWED_EVENT, onRenewed)
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
      window.removeEventListener(APPROVAL_REQUIRED_EVENT, onApprovalRequired)
      window.removeEventListener(SESSION_RENEWED_EVENT, onRenewed)
    }
  }, [clearSession, navigate])

  /*
   * Keep an in-use session alive.
   *
   * The server slides the credential forward on every request it accepts, so a
   * tab that is genuinely being used never runs out of session. This is the
   * explicit heartbeat for that: while a user is signed in and the tab is
   * visible, one ordinary authenticated request is made every few minutes, which
   * is all "still here" has to mean.
   *
   * Two things it deliberately is NOT:
   *   - a countdown. Nothing here ends a session; only the server can, and only
   *     because the credential was genuinely rejected.
   *   - a requirement. The session survives even if this never runs - the
   *     browser may throttle or freeze it at any time - because renewal also
   *     happens on demand through the refresh cookie (see api/axios.js).
   */
  useEffect(() => {
    if (!authenticated) return undefined

    const keepalive = () => {
      // Deliberately NOT gated on document.visibilityState any more.
      //
      // It used to return early for a hidden tab, on the reasoning that a
      // background tab does not need keeping alive. That is what made a
      // backgrounded tab get logged out: nothing was renewing the credential
      // while the tab was hidden, so it expired.
      //
      // The session no longer depends on this call - if the browser throttles
      // it, or suspends the page entirely, the credential is still renewed on
      // the next real request (see api/axios.js). So this is only a courtesy
      // that keeps a long-lived background tab from reaching the renewal path
      // at all, and it is safe to attempt whether the tab is visible or not.
      //
      // Failures are ignored on purpose: this call exists to be uninteresting.
      // A 401 is handled centrally by the axios interceptor, and a network
      // problem must never end a session. The credential is read from storage
      // per request, so it is always the newest one.
      api.get('/auth/me').catch(() => {})
    }

    // Deliberately not keyed on the token: the token is replaced on every
    // renewal, and re-creating this timer each time would reset the countdown
    // before it ever elapsed. Whether the user is signed in is the only thing
    // this depends on.
    const timer = setInterval(keepalive, KEEPALIVE_INTERVAL_MS)

    /*
     * Coming back to the tab is the moment a throttled background timer is most
     * likely to be behind, so this asks the server a question immediately
     * rather than waiting for the next tick. The browser has just handed
     * control back, so the request is sent promptly instead of being throttled.
     *
     * This is an optimisation, not a dependency: if the browser has frozen the
     * page so thoroughly that even this does not run, the session is still fine,
     * because the credential is renewed by the interceptor on the first real
     * request the user makes. Nothing is lost by omitting it.
     */
    const onVisible = () => {
      if (document.visibilityState === 'visible') keepalive()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [authenticated])

  // Coming back online is the natural moment to retry: the token was never
  // discarded, so this only re-reads the user.
  //
  // This bumps a counter rather than re-setting the token to its own value:
  // React bails out of a state update whose value is unchanged, so writing the
  // same token back would not re-run the effect and nothing would be retried.
  useEffect(() => {
    if (!connectionIssue || !token) return
    const onOnline = () => setSessionRefresh((n) => n + 1)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [connectionIssue, token])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password })
    const { token: newToken, data: userData } = res.data
    localStorage.setItem(TOKEN_KEY, newToken)
    writeCachedUser(userData)
    // The server publishes its own idle window with the login, so the browser
    // never keeps a second, possibly different, copy of that number. It starts
    // counting from this moment.
    if (res.data.sessionIdleMs) rememberIdleWindow(res.data.sessionIdleMs)
    markTabOpen()
    noteActivity()
    renewedTokenRef.current = null
    setSessionExpired(false)
    setToken(newToken)
    setUser(userData)
    setConnectionIssue(false)
    return userData
  }

  // Registration does not sign the user in: the account is stored as
  // 'Pending Approval' and the server issues no token, so the applicant stays
  // on the public pages until an administrator approves them.
  //
  // `options.reapply` asks the server to move an existing rejected account back
  // to 'Pending Approval' instead of creating anything new. The server owns that
  // decision: it is the only place that knows whether the address was rejected.
  const register = async (name, email, password, options = {}) => {
    const res = await api.post('/auth/register', { name, email, password, ...options })
    return { ...res.data.data, isReapplication: Boolean(res.data.isReapplication) }
  }

  // Unchanged behaviour: an explicit sign-out always ends the session at once,
  // with no timeout involved. The extra record here is only so a deliberate
  // logout is not later mistaken for a tab that was closed.
  //
  // The local session is cleared first and unconditionally, so signing out is
  // immediate and never waits on the network. The server is then told to drop
  // the refresh cookie, which is what actually ends the session on its side -
  // without that, a signed-out browser would still be able to renew itself.
  const logout = () => {
    clearSession()
    renewedTokenRef.current = null
    setConnectionIssue(false)
    setSessionExpired(false)
    navigate('/login')
    // Best effort by design: the local session is already gone, so a failure
    // here changes nothing about what the user sees. The cookie is scoped and
    // short-lived, and it is overwritten on the next real sign-in.
    api.post('/auth/logout', {}).catch(() => {})
  }

  const updateUser = (userData) => {
    setUser((prev) => {
      const next = { ...prev, ...userData }
      writeCachedUser(next)
      return next
    })
  }

  /** Retry after a temporary failure without forcing a new sign-in. */
  const retrySession = useCallback(() => {
    setSessionRefresh((n) => n + 1)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        connectionIssue,
        sessionExpired,
        login,
        register,
        logout,
        updateUser,
        retrySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
