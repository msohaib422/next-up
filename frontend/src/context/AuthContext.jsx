import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { isAuthRejection, isTransient, UNAUTHORIZED_EVENT, APPROVAL_REQUIRED_EVENT } from '../api/axios'

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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedUser)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)
  // Bumped to re-run the session lookup without changing the token.
  const [sessionRefresh, setSessionRefresh] = useState(0)
  // Non-blocking: true when the server could not be reached. The session is
  // still valid, so nothing navigates away.
  const [connectionIssue, setConnectionIssue] = useState(false)
  const navigate = useNavigate()

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    writeCachedUser(null)
    setToken(null)
    setUser(null)
  }, [])

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
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    window.addEventListener(APPROVAL_REQUIRED_EVENT, onApprovalRequired)
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
      window.removeEventListener(APPROVAL_REQUIRED_EVENT, onApprovalRequired)
    }
  }, [clearSession, navigate])

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

  const logout = () => {
    clearSession()
    setConnectionIssue(false)
    navigate('/login')
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
      value={{ user, token, loading, connectionIssue, login, register, logout, updateUser, retrySession }}
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
