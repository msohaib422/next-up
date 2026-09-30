import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import LoadingSpinner from './components/ui/LoadingSpinner'
import { lazyPage } from './pages/routes'

/*
 * Every page is a separate chunk that is fetched the first time it is actually
 * opened, so signing in no longer downloads the whole application up front.
 * The shell (layout, sidebar, header, dialogs) stays eager because it is
 * needed immediately.
 *
 * The Suspense boundary deliberately sits INSIDE the shell (see Layout), around
 * the page only. It used to be here, above every route, which meant that
 * opening any tab replaced the entire application - sidebar, header and all -
 * with a full-screen spinner while the chunk downloaded. That was the flicker
 * on sidebar navigation. The boundary here now only covers the three public
 * pages, which are rendered without the shell and therefore have nothing to
 * keep on screen.
 */
const LoginPage = lazyPage('/login')
const RegisterPage = lazyPage('/register')
const AccountStatusPage = lazyPage('/account-status')
const DashboardPage = lazyPage('/')
const TasksPage = lazyPage('/tasks')
const QuizzesPage = lazyPage('/quizzes')
const AnnouncementsPage = lazyPage('/announcements')
const TimetablePage = lazyPage('/timetable')
const AssignmentsPage = lazyPage('/assignments')
const EssentialsPage = lazyPage('/essentials')
const UsersPage = lazyPage('/users')
const ContributePage = lazyPage('/contribute')
const ApprovalsPage = lazyPage('/approvals')
const ProfilePage = lazyPage('/profile')
const NotificationsPage = lazyPage('/notifications')
const SearchPage = lazyPage('/search')

export default function App() {
  const { loading } = useAuth()

  if (loading) return <LoadingSpinner />

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/account-status" element={<AccountStatusPage />} />
        <Route path="/" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><Layout><TasksPage /></Layout></ProtectedRoute>} />
        <Route path="/quizzes" element={<ProtectedRoute><Layout><QuizzesPage /></Layout></ProtectedRoute>} />
        <Route path="/announcements" element={<ProtectedRoute><Layout><AnnouncementsPage /></Layout></ProtectedRoute>} />
        <Route path="/essentials" element={<ProtectedRoute><Layout><EssentialsPage /></Layout></ProtectedRoute>} />
        <Route path="/timetable" element={<ProtectedRoute><Layout><TimetablePage /></Layout></ProtectedRoute>} />
        <Route path="/assignments" element={<ProtectedRoute><Layout><AssignmentsPage /></Layout></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute role="collaborator"><Layout><UsersPage /></Layout></ProtectedRoute>} />
        <Route path="/contribute" element={<ProtectedRoute role="user"><Layout><ContributePage /></Layout></ProtectedRoute>} />
        <Route path="/approvals" element={<ProtectedRoute role="collaborator"><Layout><ApprovalsPage /></Layout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage /></Layout></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><Layout><SearchPage /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
