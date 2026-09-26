import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/Layout/ProtectedRoute'
import LoadingSpinner from './components/ui/LoadingSpinner'

import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import TasksPage from './pages/TasksPage'
import QuizzesPage from './pages/QuizzesPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import TimetablePage from './pages/TimetablePage'
import AssignmentsPage from './pages/AssignmentsPage'
import EssentialsPage from './pages/EssentialsPage'
import ProfilePage from './pages/ProfilePage'
import SearchPage from './pages/SearchPage'
import UsersPage from './pages/UsersPage'
import ContributePage from './pages/ContributePage'
import ApprovalsPage from './pages/ApprovalsPage'
import NotificationsPage from './pages/NotificationsPage'

export default function App() {
  const { loading } = useAuth()

  if (loading) return <LoadingSpinner />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
  )
}
