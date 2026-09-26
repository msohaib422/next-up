import { useNavigate } from 'react-router-dom'
import { GraduationCap, Clock, ShieldOff, LogOut, RotateCcw } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Button from '../components/ui/Button'

/**
 * Shown instead of the application when an account is not approved yet, or was
 * rejected. The server already refuses every protected route for these
 * accounts; this screen simply explains why instead of showing a blank or
 * looping page.
 */
export default function AccountStatusPage() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  // A protected request for an unapproved account bounces here and clears the
  // token, so this screen can also be reached with nobody signed in. In that
  // case there is no status to report, so offer the way back in rather than
  // claiming the visitor is "awaiting approval".
  const signedIn = Boolean(user)
  const rejected = user?.status === 'Rejected'
  const Icon = rejected ? ShieldOff : Clock

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <GraduationCap className="w-12 h-12 text-primary-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NextUp</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">University Productivity System</p>
        </div>

        {!signedIn && !loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              <LogOut className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">You are not signed in</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Sign in to check the status of your registration, or create an account if you have not applied yet.
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate('/register')}>
              Create an account
            </Button>
          </div>
        ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          <div className={`w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ${
            rejected
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300'
              : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
          }`}>
            <Icon className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {rejected ? 'Registration not approved' : 'Awaiting approval'}
          </h2>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {rejected
              ? 'Your previous registration application was not approved. You can review your information and submit a new application for approval.'
              : 'Your registration has been received and is waiting for an administrator to confirm it. You will be able to use the system once it is approved.'}
          </p>

          <div className="mt-5 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-4 py-3 text-left space-y-1.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">Signed in as</span>{' '}
              {user?.email}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">Status</span>{' '}
              {user?.status || 'Pending Approval'}
            </p>
          </div>

          {user?.status === 'Rejected' && user?.rejectionReason && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-left text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              <strong>Reason:</strong> {user.rejectionReason}
            </div>
          )}

          {/* A rejected applicant is not blocked forever: they can put forward a
              fresh application, which returns to Pending Approval for review. */}
          {rejected && (
            <Button
              className="mt-6 w-full"
              onClick={() => navigate(`/register?reapply=1&email=${encodeURIComponent(user?.email || '')}`)}
            >
              <RotateCcw className="w-4 h-4" /> Apply Again
            </Button>
          )}

          <Button
            variant="secondary"
            className={`${rejected ? 'mt-2' : 'mt-6'} w-full`}
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
        )}
      </div>
    </div>
  )
}
