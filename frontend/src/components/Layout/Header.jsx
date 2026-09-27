import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, User, Sun, Moon, GraduationCap } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import NotificationBell from '../notifications/NotificationBell'
import { format } from 'date-fns'

// The clock is its own component so the once-a-minute tick re-renders only the
// time, not the notification bell and the rest of the header row.
function HeaderClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:block truncate">
      {format(time, 'EEE, MMM d · h:mm a')}
    </span>
  )
}

export default function Header({ onMenuToggle }) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 sm:gap-4 h-16 px-4 lg:px-6">
        <button onClick={onMenuToggle} className="lg:hidden shrink-0 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <Menu className="w-5 h-5" />
        </button>

        {/* Compact layout only: the sidebar is a drawer here, so the app name
            and the theme control live in the top bar instead. From lg up both
            stay in the sidebar and this row is hidden, exactly as before. */}
        <div className="flex items-center gap-1.5 lg:hidden min-w-0">
          <GraduationCap className="w-6 h-6 shrink-0 text-primary-600" />
          <span className="font-bold text-base text-gray-900 dark:text-white truncate">
            NextUp
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-4 ml-auto min-w-0 shrink-0">
          <HeaderClock />
          <NotificationBell />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light' : 'Dark'}
            className="lg:hidden p-2 shrink-0 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors select-none dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 shrink-0"
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
