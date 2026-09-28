import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import useMediaQuery from '../../hooks/useMediaQuery'
import useScrollLock from '../../hooks/useScrollLock'
import {
  LayoutDashboard, CheckSquare, HelpCircle, Megaphone,
  Clock, FileCheck, User, Users, BookOpen,
  LogOut, Sun, Moon, X, GraduationCap, Send, ClipboardCheck, Bell
} from 'lucide-react'

// Same breakpoint the drawer is laid out against: from lg up the sidebar is a
// permanent column and there is no drawer to lock the page behind.
const DESKTOP = '(min-width: 1024px)'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/quizzes', icon: HelpCircle, label: 'Quizzes' },
  { to: '/assignments', icon: FileCheck, label: 'Assignments' },
  { to: '/essentials', icon: BookOpen, label: 'Essentials' },
  { to: '/announcements', icon: Megaphone, label: 'Announcements' },
  { to: '/timetable', icon: Clock, label: 'Timetable' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/contribute', icon: Send, label: 'Contribute', userOnly: true },
  { to: '/approvals', icon: ClipboardCheck, label: 'Approvals', collaboratorOnly: true },
  { to: '/users', icon: Users, label: 'Users', collaboratorOnly: true },
]

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery(DESKTOP)

  // While the drawer covers the page, the page itself must stay exactly where it
  // is, so scrolling is locked for as long as the drawer is open on mobile. The
  // lock is released as soon as it closes, and never applied on desktop, where
  // the sidebar is part of the layout rather than an overlay.
  useScrollLock(isOpen && !isDesktop)

  const handleNavClick = () => {
    if (window.innerWidth < 1024) onClose()
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden overscroll-contain" onClick={onClose} />
      )}

      {/* w-64 on wide screens, never wider than 85vw so the drawer always fits
          the smallest phone in portrait or landscape. sidebar-drawer gives it the
          full visual viewport height, so nothing of the page shows below it, and
          overscroll-contain keeps a scroll gesture inside the drawer from being
          handed on to the page behind. */}
      <aside className={`sidebar-drawer fixed top-0 left-0 z-50 w-64 max-w-[85vw] overscroll-contain bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-8 h-8 text-primary-600" />
            <span className="font-bold text-lg text-gray-900 dark:text-white">NextUp</span>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-1">
          {navItems
            .filter(item => (!item.collaboratorOnly || user?.role === 'collaborator') && (!item.userOnly || user?.role === 'user'))
            .map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t dark:border-gray-700 space-y-2">
          <button
            onClick={() => { navigate('/profile'); handleNavClick() }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
          >
            {user?.profileImage ? (
              <img src={user.profileImage} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <User className="w-4 h-4 text-primary-600" />
              </div>
            )}
            <span className="truncate">{user?.name}</span>
          </button>

          <div className="flex items-center gap-2">
            {/* The compact header carries the theme control, so it is only shown
                here from lg up, where the sidebar is permanently visible. */}
            <button
              onClick={toggleTheme}
              className="hidden lg:flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors select-none"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              onClick={logout}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
