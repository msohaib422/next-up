import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import LoadingSpinner from './components/ui/LoadingSpinner'

/*
 * Every page is a separate chunk that is fetched the first time it is actually
 * opened, so signing in no longer downloads the whole application up front.
 * The shell (layout, sidebar, header, dialogs) stays eager because it is
 * needed immediately, and LoadingSpinner is the same placeholder the app
 * already shows while a session is being confirmed.
 */
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const AccountStatusPage = lazy(() => import('./pages/AccountStatusPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const QuizzesPage = lazy(() => import('./pages/QuizzesPage'))
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'))
const TimetablePage = lazy(() => import('./pages/TimetablePage'))
const AssignmentsPage = lazy(() => import('./pages/AssignmentsPage'))
const EssentialsPage = lazy(() => import('./pages/EssentialsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const ContributePage = lazy(() => import('./pages/ContributePage'))
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))

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
