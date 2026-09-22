import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, User } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { format } from 'date-fns'

export default function Header({ onMenuToggle }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-4 h-16 px-4 lg:px-6">
        <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 ml-auto">
          <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:block">
            {format(time, 'EEE, MMM d · h:mm a')}
          </span>
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2"
          >
            {user?.profileImage ? (
              <img src={user.profileImage} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <User className="w-4 h-4 text-primary-600" />
              </div>
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
