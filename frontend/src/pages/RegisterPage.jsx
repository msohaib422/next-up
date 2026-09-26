import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { GraduationCap, Mail, Lock, User, Clock, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  // Set once the registration is stored, so the form is replaced by a
  // confirmation instead of dropping the user into an unapproved account.
  const [submitted, setSubmitted] = useState(null)
  const { register } = useAuth()
  const navigate = useNavigate()

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
      const user = await register(name, email, password)
      setSubmitted(user)
      toast.success('Registration submitted!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <GraduationCap className="w-12 h-12 text-primary-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">UniProductive</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">University Productivity System</p>
        </div>

        {submitted ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
              <Clock className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Registration received</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Thanks, {submitted?.name}. Your account has been created and is waiting for administrator
              approval. We have emailed <span className="font-medium text-gray-900 dark:text-gray-200">{submitted?.email}</span> to
              confirm this, and you will get another email once a decision has been made.
            </p>
            <div className="mt-5 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-4 py-3 text-left space-y-1.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">Status</span> Pending Approval
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">Next step</span> An administrator will review your registration
              </p>
            </div>
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5 text-left">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" />
              You will be able to sign in and use the system once your registration has been approved.
            </p>
            <Button variant="secondary" className="mt-6 w-full" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Create account</h2>
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
              <Input
                label="Password"
                type="password"
                icon={Lock}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                icon={Lock}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <Button type="submit" loading={loading} className="w-full">
                Create Account
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
