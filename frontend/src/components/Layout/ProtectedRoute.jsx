import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" replace />

  // Defence in depth. The server already rejects unapproved accounts with a 403
  // on every protected route; this keeps a pending or rejected user from ever
  // rendering a page they are not entitled to.
  if (user.role !== 'collaborator' && user.status && user.status !== 'Approved') {
    return <Navigate to="/account-status" replace />
  }

  if (role && user.role !== role) return <Navigate to="/" replace />

  return children
}
