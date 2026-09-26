import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { loginUrlWithNext } from '../../utils/redirectDestination'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingSpinner />
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
