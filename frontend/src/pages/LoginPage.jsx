import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { safeDestination } from '../utils/redirectDestination'
import { GraduationCap, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const { login } = useAuth()
  const navigate = useNavigate()

  // Where the visitor was originally heading, e.g. Admin -> Users, when they
  // arrived here from a protected deep link such as an email button. Only
  // internal paths are honoured, so a crafted link cannot bounce somebody off
  // to another site after they sign in.
  const next = safeDestination(searchParams.get('next'))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(email, password)
      // Credentials are valid but the account is not approved yet, so send the
      // user to the status screen instead of the application.
      if (user?.role !== 'collaborator' && user?.status && user.status !== 'Approved') {
        toast.success('Welcome! Your account is awaiting approval.')
        navigate('/account-status')
        return
      }
      toast.success('Welcome back!')
      // Continue to the requested page, or the dashboard as before.
      navigate(next || '/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <GraduationCap className="w-12 h-12 text-primary-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NextUp</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">University Productivity System</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button type="submit" loading={loading} className="w-full">
              Sign In
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary-600 hover:text-primary-500 font-medium">Register</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
