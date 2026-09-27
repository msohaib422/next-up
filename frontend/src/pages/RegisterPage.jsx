import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { GraduationCap, Mail, User, Clock, CheckCircle2, ShieldOff, RotateCcw, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Button from '../components/ui/Button'

/**
 * Public registration screen.
 *
 * Handles the whole lifecycle the server owns:
 *   - a brand new application,
 *   - an address whose previous application was rejected, which is explained
 *     with a professional message and can be resubmitted with "Apply Again",
 *   - an address that already has an application waiting for review, which is
 *     reported without creating anything or sending another email.
 *
 * This page only ever displays what the server tells it; the decision to create,
 * reject or re-apply is always made on the server.
 */
export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // Set once the application is stored, so the form is replaced by a
  // confirmation instead of dropping the user into an unapproved account.
  const [submitted, setSubmitted] = useState(null)
  // Set when the server reports that this address was rejected before.
  const [previousRejection, setPreviousRejection] = useState(null)
  // True once the user chooses to re-apply, which unlocks the form and tells
  // the server to reuse the existing account rather than block it.
  const [reapplying, setReapplying] = useState(searchParams.get('reapply') === '1')
  const { register } = useAuth()
  const navigate = useNavigate()

  // Arriving from the "Apply Again" link in the rejection email or from the
  // account-status screen, so the applicant does not retype their address.
  useEffect(() => {
    const prefilled = searchParams.get('email')
    if (prefilled) setEmail(prefilled)
  }, [searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const user = await register(name, email, password, { reapply: reapplying })
      setSubmitted(user)
      setPreviousRejection(null)
      toast.success(user.isReapplication ? 'New application submitted!' : 'Registration submitted!')
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'PREVIOUSLY_REJECTED') {
        // Nothing was created and no email was sent: the server stopped here so
        // the applicant can decide to re-apply rather than hitting a dead end.
        setPreviousRejection({
          message: data.message,
          name: data.data?.name || name,
          email: data.data?.email || email,
        })
        if (!reapplying) toast.error('Your previous application was not approved.')
      } else {
        toast.error(data?.message || 'Registration failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const startReapply = () => {
    setReapplying(true)
    setPreviousRejection(null)
    if (previousRejection?.name) setName(previousRejection.name)
    if (previousRejection?.email) setEmail(previousRejection.email)
  }

  const useDifferentEmail = () => {
    setReapplying(false)
    setPreviousRejection(null)
    setEmail('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <GraduationCap className="w-12 h-12 text-primary-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NextUp</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Never Miss What’s Next</p>
        </div>

        {submitted ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
              <Clock className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {submitted?.isReapplication ? 'New Application Received' : 'Registration Received'}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Thanks, {submitted?.name}. Your{' '}
              {submitted?.isReapplication ? 'new application has' : 'account has been'} submitted and is waiting
              for administrator approval. We have emailed{' '}
              <span className="font-medium text-gray-900 dark:text-gray-200">{submitted?.email}</span> to
              confirm this, and you will get another email once a decision has been made.
            </p>
            <div className="mt-5 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-4 py-3 text-left space-y-1.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">Status</span> Pending Approval
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">Next step</span> An administrator will review your application
              </p>
            </div>
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5 text-left">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" />
              You will be able to sign in and use the system once your application has been approved.
            </p>
            <Button variant="secondary" className="mt-6 w-full" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {previousRejection && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-left dark:border-red-900/60 dark:bg-red-900/20">
                <div className="flex items-start gap-3">
                  <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-red-800 dark:text-red-200">
                      Your previous application was not approved
                    </h2>
                    <p className="mt-1.5 text-sm text-red-700 dark:text-red-300">
                      {previousRejection.message}
                    </p>
                    {previousRejection.email && (
                      <p className="mt-2 text-xs text-red-700/80 dark:text-red-300/80">
                        The address on that application is{' '}
                        <span className="font-medium break-all">{previousRejection.email}</span>.
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button onClick={startReapply} className="sm:flex-1">
                    <RotateCcw className="w-4 h-4" /> Apply Again
                  </Button>
                  <Button variant="ghost" onClick={useDifferentEmail} className="sm:flex-1">
                    Use a different email
                  </Button>
                </div>
              </div>
            )}

            {reapplying && !previousRejection && (
              <div className="mb-5 rounded-lg border border-primary-200 bg-primary-50 p-4 text-left dark:border-primary-900/60 dark:bg-primary-900/20">
                <div className="flex items-start gap-3">
                  <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-300" />
                  <div>
                    <h2 className="text-sm font-semibold text-primary-900 dark:text-primary-200">
                      Applying again
                    </h2>
                    <p className="mt-1 text-sm text-primary-800 dark:text-primary-300">
                      Use the same email address as your previous application. Your details are updated and a new
                      application is sent for approval — it will be reviewed from scratch, and you will receive an
                      email once a decision is made.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
              {reapplying ? 'Submit a new application' : 'Create account'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Name"
                icon={User}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label="Email"
                type="email"
                icon={Mail}
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {reapplying && (
                <p className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Keep the same email address so we know which application to replace.
                </p>
              )}
              <PasswordInput
                label="Password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <PasswordInput
                label="Confirm Password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <Button type="submit" loading={loading} className="w-full">
                {reapplying ? 'Submit Application' : 'Create Account'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-500 font-medium">Sign in</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
