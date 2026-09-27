import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { loginUrlWithNext } from '../../utils/redirectDestination'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function ProtectedRoute({ children, role }) {
  const { user, loading, connectionIssue, token, retrySession } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner />

  // A token is held but the server could not be reached. The session is very
  // likely still valid - we simply cannot confirm it right now. Sending the
  // visitor to the login page here is what turned a brief outage into a lost
  // session, so instead we hold the route and offer a retry. Nothing about the
  // server's own authorisation changes: every request still carries the token
  // and is still checked.
  if (!user && connectionIssue && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Cannot reach the server
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            You are still signed in. The server did not respond just now, so the page could not be
            loaded. This is usually temporary.
          </p>
          <button
            type="button"
            onClick={retrySession}
            className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    // Send the visitor to sign in, remembering where they were heading, so
    // signing in continues there. This is what makes a deep link from an email -
    // "View Registration" points at /users?highlight=... - land on the page it
    // named rather than on the dashboard.
    return <Navigate to={loginUrlWithNext(`${location.pathname}${location.search}`)} replace />
  }

  // Defence in depth. The server already rejects unapproved accounts with a 403
  // on every protected route; this keeps a pending or rejected user from ever
  // rendering a page they are not entitled to.
  if (user.role !== 'collaborator' && user.status && user.status !== 'Approved') {
    return <Navigate to="/account-status" replace />
  }

  if (role && user.role !== role) return <Navigate to="/" replace />

  return children
}
