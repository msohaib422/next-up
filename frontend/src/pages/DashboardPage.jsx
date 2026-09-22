import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import api from '../api/axios'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import {
  CheckSquare, Clock, HelpCircle, Megaphone,
  Plus, AlertTriangle, CheckCircle2, PlayCircle,
  Users, FileCheck, Paperclip, Pin, Calendar,
  BookOpen
} from 'lucide-react'
import { format, formatDistanceToNow, isPast, isToday, addDays, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'

// ============================================================
// SKELETON COMPONENTS
// ============================================================

function StatCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
        <div className="space-y-2">
          <div className="h-8 w-16 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-4 w-28 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function ListSkeleton({ rows = 4 }) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3.5">
          <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse mb-1.5" />
          <div className="h-3 w-full bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse mb-2" />
          <div className="flex items-center justify-between mt-2">
            <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
            <div className="h-6 w-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CompletedActivitySkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
          <div className="h-4 w-20 bg-gray-200 dark:bg-gray-600 rounded-lg animate-pulse mb-3" />
          <div className="flex items-baseline gap-1.5 mb-3">
            <div className="h-8 w-12 bg-gray-200 dark:bg-gray-600 rounded-lg animate-pulse" />
            <div className="h-4 w-8 bg-gray-200 dark:bg-gray-600 rounded-lg animate-pulse" />
          </div>
          <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full animate-pulse" />
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-600 rounded-lg animate-pulse mt-2" />
        </div>
      ))}
    </div>
  )
}

// ============================================================
// HELPERS
// ============================================================

function getItemRoute(item) {
  switch (item._type) {
    case 'Task': return '/tasks'
    case 'Quiz': return '/quizzes'
    case 'Assignment': return '/assignments'
    case 'Announcement': return '/announcements'
    case 'Essential': return '/essentials'
    default: return '/'
  }
}

// ============================================================
// SHARED ITEM CARD — Recent items
// ============================================================

function DashboardItemCard({ item }) {
  const navigate = useNavigate()

  const handleView = (e) => {
    e.stopPropagation()
    const route = getItemRoute(item)
    navigate(`${route}?highlight=${item._id}`)
  }

  const typeBadgeProps = {
    Task: { color: 'info' },
    Quiz: { color: 'purple' },
    Assignment: { color: 'warning' },
    Announcement: { color: 'neutral' },
    Essential: { color: 'teal' },
  }

  // Course: use subject field from data, fallback to 'General'
  const courseName = item.subject?.trim() || 'General'

  return (
    <div className="px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
      <div className="flex items-center">
        {/* Column 1 — Title + Course (flexible, takes remaining space) */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2">
            {item._type === 'Announcement' && item.pinned && (
              <Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            )}
            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {item.title}
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {courseName}
          </p>
        </div>

        {/* Right side — Type | Status | View with equal spacing */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="flex items-center justify-center w-24">
            <Badge {...typeBadgeProps[item._type]} size="sm">
              {item._type}
            </Badge>
          </div>
          <div className="flex items-center justify-center w-24">
            {item.status === 'Completed' && (
              <span className="text-green-500 dark:text-green-400" title="Completed">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            )}
          </div>
          <div className="flex items-center justify-center w-24">
            <button
              onClick={handleView}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 px-2.5 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// COMING UP ITEM CARD — matches Recent layout, priority instead of tick
// ============================================================

function ComingUpItemCard({ item }) {
  const navigate = useNavigate()

  const handleView = (e) => {
    e.stopPropagation()
    const route = getItemRoute(item)
    navigate(`${route}?highlight=${item._id}`)
  }

  const typeBadgeProps = {
    Task: { color: 'info' },
    Quiz: { color: 'purple' },
    Assignment: { color: 'warning' },
    Announcement: { color: 'neutral' },
    Essential: { color: 'teal' },
  }

  const priorityBadgeProps = {
    High: { color: 'danger' },
    Medium: { color: 'warning' },
    Low: { color: 'success' },
  }

  // Course: use subject field from data, fallback to 'General'
  const courseName = item.subject?.trim() || 'General'

  return (
    <div className="px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
      <div className="flex items-center">
        {/* Column 1 — Title + Course (flexible, takes remaining space) */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2">
            {item._type === 'Announcement' && item.pinned && (
              <Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            )}
            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {item.title}
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {courseName}
          </p>
        </div>

        {/* Right side — Type | Priority | View with equal spacing */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="flex items-center justify-center w-24">
            <Badge {...typeBadgeProps[item._type]} size="sm">
              {item._type}
            </Badge>
          </div>
          <div className="flex items-center justify-center w-24">
            {item.priority && (
              <Badge {...priorityBadgeProps[item.priority]} size="sm">
                {item.priority}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-center w-24">
            <button
              onClick={handleView}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 px-2.5 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================

function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [tasks, setTasks] = useState([])
  const [assignments, setAssignments] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, tasksRes, assignmentsRes, quizzesRes, annRes] = await Promise.all([
          api.get('/users/admin/users').catch(() => ({ data: { data: [] } })),
          api.get('/tasks').catch(() => ({ data: { data: [] } })),
          api.get('/assignments/my').catch(() => ({ data: { data: [] } })),
          api.get('/quizzes').catch(() => ({ data: { data: [] } })),
          api.get('/announcements').catch(() => ({ data: { data: [] } })),
        ])

        const normalize = (res) => {
          if (!res?.data) return []
          return Array.isArray(res.data) ? res.data : (res.data.data || [])
        }

        setUsers(normalize(usersRes))
        setTasks(normalize(tasksRes))
        setAssignments(normalize(assignmentsRes))
        setQuizzes(normalize(quizzesRes))
        setAnnouncements(normalize(annRes))
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Computed statistics
  const totalUsers = users.length
  const completedTasks = tasks.filter(t => t.status === 'Completed').length
  const completedAssignments = assignments.filter(a => a.status === 'Completed').length
  const completedQuizzes = quizzes.filter(q => q.status === 'Completed').length
  const totalTasks = tasks.length
  const totalAssignments = assignments.length
  const totalQuizzes = quizzes.length

  // Recent items — all types combined, newest first, max 8
  const recentItems = useMemo(() => {
    return [
      ...tasks.map(t => ({ ...t, _type: 'Task' })),
      ...quizzes.map(q => ({ ...q, _type: 'Quiz' })),
      ...assignments.map(a => ({ ...a, _type: 'Assignment' })),
      ...announcements.map(a => ({ ...a, _type: 'Announcement' })),
    ]
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.date || 0).getTime()
        const dateB = new Date(b.createdAt || b.date || 0).getTime()
        return dateB - dateA
      })
      .slice(0, 8)
  }, [tasks, quizzes, assignments, announcements])

  // Coming Up items — High or Medium priority, not completed (deadline irrelevant)
  const comingUpItems = useMemo(() => {
    const isActive = (item) =>
      item.status !== 'Completed' &&
      (item.priority === 'High' || item.priority === 'Medium')

    return [
      ...tasks.filter(isActive).map(t => ({ ...t, _type: 'Task' })),
      ...assignments.filter(isActive).map(a => ({ ...a, _type: 'Assignment' })),
      ...quizzes.filter(isActive).map(q => ({ ...q, _type: 'Quiz' })),
    ].sort((a, b) => {
      // High first, then Medium
      const order = { High: 0, Medium: 1 }
      return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
    })
  }, [tasks, assignments, quizzes])

  // ── Loading State ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-80 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
              <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <ListSkeleton rows={4} />
          </Card>
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
              <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-1.5" />
              <div className="h-3 w-56 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <ListSkeleton rows={4} />
          </Card>
        </div>
        <Card className="p-5">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-4" />
          <CompletedActivitySkeleton />
        </Card>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Overview of your NextUp activity and academic progress.
        </p>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Users',
            value: totalUsers,
            icon: Users,
            color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
          },
          {
            label: 'Completed Tasks',
            value: completedTasks,
            icon: CheckCircle2,
            color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
          },
          {
            label: 'Completed Assignments',
            value: completedAssignments,
            icon: FileCheck,
            color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400',
          },
          {
            label: 'Completed Quizzes',
            value: completedQuizzes,
            icon: HelpCircle,
            color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400',
          },
        ].map((stat, i) => (
          <Card key={i} className="p-5 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-1">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {stat.label}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Two-Column: Recent + Coming Up ─────────────────── */}
      {/* Default stretch keeps both cards equal height; Recent defines
          the row height and Coming Up scrolls internally when full. */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent */}
        <Card className="overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Recent
            </h2>
          </div>

          {recentItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">No recent items</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your recent activity will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {recentItems.map((item) => (
                <DashboardItemCard
                  key={item._id}
                  item={item}
                  showDeadline={true}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Coming Up */}
        <Card className="overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Coming Up
            </h2>
          </div>

          {comingUpItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">All clear</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No upcoming deadlines right now.</p>
              </div>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0">
              {/* Below lg: in flow, card grows with content (no scroll).
                  lg+: absolute fills the card's shared height and scrolls
                  only when there are more items than Recent has room for. */}
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50 overflow-y-auto lg:absolute lg:inset-0">
                {comingUpItems.map((item) => (
                  <ComingUpItemCard
                    key={item._id}
                    item={item}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Completed Activity ───────────────────────────────── */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Completed Activity
        </h2>

        {totalTasks === 0 && totalAssignments === 0 && totalQuizzes === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No completed activity yet"
            description="Complete tasks, assignments, and quizzes to see your progress here."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: 'Tasks',
                completed: completedTasks,
                total: totalTasks,
                barColor: 'bg-green-500',
                bgColor: 'bg-green-50 dark:bg-green-900/10',
              },
              {
                label: 'Assignments',
                completed: completedAssignments,
                total: totalAssignments,
                barColor: 'bg-emerald-500',
                bgColor: 'bg-emerald-50 dark:bg-emerald-900/10',
              },
              {
                label: 'Quizzes',
                completed: completedQuizzes,
                total: totalQuizzes,
                barColor: 'bg-violet-500',
                bgColor: 'bg-violet-50 dark:bg-violet-900/10',
              },
            ].map((item, i) => {
              const percentage = item.total > 0
                ? Math.round((item.completed / item.total) * 100)
                : 0

              return (
                <div
                  key={i}
                  className={`${item.bgColor} rounded-xl p-4`}
                >
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {item.label}
                  </p>
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
                      {item.completed}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      / {item.total}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.barColor} rounded-full transition-all duration-500 ease-out`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {percentage}% completed
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ============================================================
// USER DASHBOARD
// ============================================================

function UserDashboard() {
  const [stats, setStats] = useState(null)
  const [schedule, setSchedule] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksRes, quizzesRes, annRes, timetableRes, assignmentsRes] = await Promise.all([
          api.get('/tasks').catch(() => ({ data: [] })),
          api.get('/quizzes').catch(() => ({ data: [] })),
          api.get('/announcements').catch(() => ({ data: [] })),
          api.get('/lectures').catch(() => ({ data: [] })),
          api.get('/assignments').catch(() => ({ data: [] })),
        ])

        const tasks = Array.isArray(tasksRes.data) ? 
        tasksRes.data : (tasksRes.data.data || [])
        const quizzesData = Array.isArray(quizzesRes.data) ? quizzesRes.data : (quizzesRes.data.data || [])
        const annData = Array.isArray(annRes.data) ? annRes.data : (annRes.data.data || [])
        const timetable = Array.isArray(timetableRes.data) ? timetableRes.data : (timetableRes.data.data || [])
        const assignmentsData = Array.isArray(assignmentsRes.data) ? assignmentsRes.data : (assignmentsRes.data.data || [])

        setStats({
          totalTasks: tasks.length + assignmentsData.length,
          pendingTasks: tasks.filter(t => t.status !== 'Completed').length + assignmentsData.filter(a => a.status !== 'Completed').length,
          upcomingQuizzes: quizzesData.filter(q => !isPast(parseISO(q.date || q.quizDate))).length,
        })

        const todaySchedule = timetable.slice(0, 5)
        setSchedule(todaySchedule)

        const allDeadlines = [
          ...tasks.filter(t => t.status !== 'Completed' && t.deadline).map(t => ({ ...t, _type: 'task' })),
          ...assignmentsData.filter(a => a.status !== 'Completed' && a.deadline).map(a => ({ ...a, _type: 'assignment' })),
        ].sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 5)
        setDeadlines(allDeadlines)

        setQuizzes(
          quizzesData
            .filter(q => !isPast(parseISO(q.date || q.quizDate)))
            .sort((a, b) => new Date(a.date || a.quizDate) - new Date(b.date || b.quizDate))
            .slice(0, 3)
        )

        setAnnouncements(annData.slice(0, 3))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const getLectureStatus = () => {
    return 'upcoming'
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {format(currentTime, 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Tasks', value: stats?.totalTasks || 0, icon: CheckSquare, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
          { label: 'Pending Tasks', value: stats?.pendingTasks || 0, icon: Clock, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30' },
          { label: 'Upcoming Quizzes', value: stats?.upcomingQuizzes || 0, icon: HelpCircle, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
        ].map((stat, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {schedule.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Today's Schedule</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {format(currentTime, 'h:mm a')}
            </span>
          </div>
          <div className="space-y-3">
            {schedule.map((lecture, i) => {
              const status = getLectureStatus(lecture)
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  status === 'ongoing'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                    : status === 'completed'
                    ? 'border-gray-200 dark:border-gray-700 opacity-60'
                    : 'border-gray-200 dark:border-gray-700'
                }`}>
                  {status === 'ongoing' && <PlayCircle className="w-5 h-5 text-green-600 animate-pulse" />}
                  {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-gray-400" />}
                  {status === 'upcoming' && <Clock className="w-5 h-5 text-primary-600" />}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{lecture.subject}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {lecture.timeline}{lecture.notes ? ` · ${lecture.notes}` : ''}
                    </p>
                  </div>
                  <Badge color={status === 'ongoing' ? 'success' : status === 'completed' ? 'neutral' : 'info'} size="sm">
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Badge>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upcoming Deadlines</h2>
          {deadlines.length === 0 ? (
            <EmptyState icon={CheckSquare} title="No pending deadlines" description="All caught up!" />
          ) : (
            <div className="space-y-2">
              {deadlines.map(item => (
                <div key={item._id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{item.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.subject}{item._type === 'assignment' ? ' · Assignment' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-medium ${
                      isPast(parseISO(item.deadline)) ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {isToday(parseISO(item.deadline))
                        ? 'Due Today'
                        : isPast(parseISO(item.deadline))
                        ? 'Overdue'
                        : formatDistanceToNow(parseISO(item.deadline), { addSuffix: true })}
                    </p>
                    <Badge
                      color={item.priority === 'High' ? 'danger' : undefined}
                      bgColor={item.priority === 'High' ? undefined : item.priority === 'Medium' ? '#F04438' : '#EAB308'}
                      textColor={item.priority === 'Medium' ? '#FFFFFF' : item.priority === 'Low' ? '#0F172A' : undefined}
                      size="sm"
                    >
                      {item.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upcoming Quizzes</h2>
          {quizzes.length === 0 ? (
            <EmptyState icon={HelpCircle} title="No upcoming quizzes" />
          ) : (
            <div className="space-y-2">
              {quizzes.map(quiz => (
                <div key={quiz._id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{quiz.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{quiz.subject}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(parseISO(quiz.date || quiz.quizDate), 'MMM d, h:mm a')}
                    </p>
                    {quiz.isSurprise && <Badge bgColor="#EC4899" textColor="#0F172A" size="sm">Surprise</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Announcements</h2>
          {announcements.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements" />
          ) : (
            <div className="space-y-2">
              {announcements.map(ann => (
                <div key={ann._id} className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{ann.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {ann.subject} · {format(parseISO(ann.createdAt), 'MMM d')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Add Task', to: '/tasks', icon: CheckSquare },
          { label: 'Timetable', to: '/timetable', icon: Clock },
        ].map(action => (
          <button
            key={action.to}
            onClick={() => navigate(action.to)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// PAGE EXPORT
// ============================================================

export default function DashboardPage() {
  const { user } = useAuth()
  return user?.role === 'collaborator' ? <AdminDashboard /> : <UserDashboard />
}
