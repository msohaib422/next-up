import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { safeDestination } from '../utils/redirectDestination'
import { GraduationCap, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
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
      // Navigate first, then let the destination paint before the welcome
      // message appears. The Toaster lives above the router, so toasting
      // before this used to show "Welcome back!" over the login form, and
      // then leave it hanging over the destination while it was still loading.
      navigate(next || '/', { replace: true })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.success('Welcome back!'))
      })
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
          <p className="text-gray-500 dark:text-gray-400 mt-1">Never Miss What’s Next</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              icon={Mail}
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <PasswordInput
              label="Password"
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
