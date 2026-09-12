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
import RemindersPage from './pages/RemindersPage'
import EventsPage from './pages/EventsPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import ReferencesPage from './pages/ReferencesPage'
import TimetablePage from './pages/TimetablePage'
import ImportantDatesPage from './pages/ImportantDatesPage'
import SubmissionsPage from './pages/SubmissionsPage'
import ProfilePage from './pages/ProfilePage'
import SearchPage from './pages/SearchPage'
import ActivityPage from './pages/ActivityPage'

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
      <Route path="/reminders" element={<ProtectedRoute><Layout><RemindersPage /></Layout></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><Layout><EventsPage /></Layout></ProtectedRoute>} />
      <Route path="/announcements" element={<ProtectedRoute><Layout><AnnouncementsPage /></Layout></ProtectedRoute>} />
      <Route path="/references" element={<ProtectedRoute><Layout><ReferencesPage /></Layout></ProtectedRoute>} />
      <Route path="/timetable" element={<ProtectedRoute><Layout><TimetablePage /></Layout></ProtectedRoute>} />
      <Route path="/important-dates" element={<ProtectedRoute><Layout><ImportantDatesPage /></Layout></ProtectedRoute>} />
      <Route path="/submissions" element={<ProtectedRoute role="collaborator"><Layout><SubmissionsPage /></Layout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><Layout><SearchPage /></Layout></ProtectedRoute>} />
      <Route path="/activity" element={<ProtectedRoute><Layout><ActivityPage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
