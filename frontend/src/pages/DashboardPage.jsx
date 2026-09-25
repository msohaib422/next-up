import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import api from '../api/axios'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import {
  CheckSquare, Clock, HelpCircle, Megaphone,
  AlertTriangle, CheckCircle2, Users, FileCheck,
  Pin, BookOpen, CalendarCheck, CalendarClock,
  ChevronRight
} from 'lucide-react'
import {
  format, formatDistanceToNow,
  parseISO, differenceInCalendarDays
} from 'date-fns'
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

const RECENT_LIMIT = 8
const ANNOUNCEMENT_SCROLL_MAX = '24rem'
const RECENT_SCROLL_MAX = '14rem'

// Type tag colors — shared with the admin dashboard lists
const TYPE_BADGE_PROPS = {
  Task: { color: 'info' },
  Quiz: { color: 'purple' },
  Assignment: { color: 'warning' },
  Announcement: { color: 'neutral' },
  Essential: { color: 'teal' },
}

// Announcement type tags — matches the Announcements page exactly
const ANNOUNCEMENT_BADGE_PROPS = {
  General: { bgColor: '#7E22CE', textColor: '#FFFFFF' },
  Academic: { bgColor: '#0D9488', textColor: '#FFFFFF' },
  Assignment: { bgColor: '#EA580C', textColor: '#FFFFFF' },
  Quiz: { bgColor: '#BE123C', textColor: '#FFFFFF' },
  Task: { bgColor: '#CA8A04', textColor: '#0F172A' },
  Exam: { bgColor: '#DC2626', textColor: '#FFFFFF' },
  Event: { bgColor: '#DB2777', textColor: '#FFFFFF' },
}

const KEY_DATE_BADGE_PROPS = {
  Exam: { color: 'danger' },
  Assignment: { color: 'warning' },
  Quiz: { color: 'success' },
  Presentation: { color: 'teal' },
  Project: { color: 'info' },
  Event: { color: 'purple' },
  Other: { color: 'neutral' },
}

const TYPE_ICONS = {
  Task: CheckSquare,
  Assignment: FileCheck,
  Quiz: HelpCircle,
  Essential: BookOpen,
  Announcement: Megaphone,
}

const TYPE_TILES = {
  Task: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',
  Assignment: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
  Quiz: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400',
  Essential: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30 dark:text-teal-400',
  Announcement: 'text-gray-600 bg-gray-100 dark:bg-gray-700/60 dark:text-gray-300',
  Timetable: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-400',
}

const normalizeList = (res) => {
  if (!res?.data) return []
  return Array.isArray(res.data) ? res.data : (res.data.data || [])
}

const hasValidDate = (value) => !!value && !Number.isNaN(new Date(value).getTime())

// Calendar-day difference between an item's date and today (local time).
// Day-level comparison is timezone-safe: a deadline stored for "today" never
// counts as past just because the clock moved past its time-of-day.
const daysUntil = (iso) => differenceInCalendarDays(parseISO(String(iso)), new Date())

// An item only participates in Upcoming/Needs-attention while it is open.
const isOpen = (item) => item.status !== 'Completed'

// Past-and-uncompleted. Respects BOTH date and status:
//  - a stored 'Overdue' status always wins, and
//  - an open item whose date is before today is overdue.
// Completed items can never be overdue.
const isOverdueWork = (item) => {
  if (!isOpen(item)) return false
  if (item.status === 'Overdue') return true
  return daysUntil(item._date) < 0
}

const getCourseLabel = (item) => {
  if (item._type === 'Essential') return item.course?.trim() || 'General'
  return item.subject?.trim() || 'General'
}

// "By <name>" — author label built from the item's actual createdBy value.
// Never hardcoded; returns '' when the data carries no author.
const formatAuthor = (name) => {
  const n = String(name || '').trim()
  return n ? `By ${n}` : ''
}

// Metadata line: context · By author · relative time
const getRecentMeta = (item) => {
  const parts = []
  if (item._type === 'Announcement') {
    if (item.type) parts.push(item.type)
  } else {
    parts.push(getCourseLabel(item))
  }
  const author = formatAuthor(item.createdBy)
  if (author) parts.push(author)
  const timestamp = item.updatedAt || item.createdAt || item.date
  if (hasValidDate(timestamp)) {
    parts.push(formatDistanceToNow(parseISO(String(timestamp)), { addSuffix: true }))
  }
  return parts.filter(Boolean).join(' · ')
}

// ============================================================
// SHARED DASHBOARD PIECES
// ============================================================

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </div>
  )
}

function CardEmpty({ icon: Icon, title, description, tone = 'text-gray-400' }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-5 py-10">
      <div className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center mb-3">
        <Icon className={`w-5 h-5 ${tone}`} />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[260px]">{description}</p>
      )}
    </div>
  )
}

function UserStatCard({ label, value, caption, icon: Icon, tone, captionTone = 'text-gray-400 dark:text-gray-500' }) {
  return (
    <Card className="p-4 sm:p-5 h-full min-w-0">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1.5 truncate">{label}</p>
          <p className={`hidden sm:block text-xs mt-1 truncate ${captionTone}`}>{caption}</p>
        </div>
      </div>
    </Card>
  )
}

// ============================================================
// UPCOMING ROW — admin-style list row with whole-row navigation
// ============================================================

function UpcomingRow({ item, onOpen }) {
  const clickable = item._type !== 'KeyDate'
  const Wrapper = clickable ? 'button' : 'div'

  const badgeProps = item._type === 'KeyDate'
    ? (KEY_DATE_BADGE_PROPS[item.type] || { color: 'neutral' })
    : (TYPE_BADGE_PROPS[item._type] || { color: 'neutral' })
  const badgeLabel = item._type === 'KeyDate' ? (item.type || 'Key date') : item._type
  const courseLabel = item._type === 'KeyDate'
    ? (item.description?.trim() || 'Important date')
    : getCourseLabel(item)
  const priorityBadgeProps = {
    High: { color: 'danger' },
    Medium: { color: 'warning' },
    Low: { color: 'success' },
  }

  return (
    <Wrapper
      type={clickable ? 'button' : undefined}
      onClick={clickable ? () => onOpen(item) : undefined}
      className={`group w-full text-left px-5 py-3.5 transition-colors ${
        clickable ? 'hover:bg-gray-50 dark:hover:bg-gray-700/30' : ''
      }`}
    >
      {/* Two equal flexible columns keep the type tag exactly in the
          horizontal middle of the card, whatever the title length. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
        <div className="min-w-0 pr-2 sm:pr-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {item.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {courseLabel}
          </p>
        </div>

        <div className="flex self-stretch items-center justify-center">
          <Badge {...badgeProps} size="sm" className="shrink-0 whitespace-nowrap">
            {badgeLabel}
          </Badge>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
          {item.priority && (
            <Badge {...(priorityBadgeProps[item.priority] || { color: 'neutral' })} size="sm" className="shrink-0 whitespace-nowrap">
              {item.priority}
            </Badge>
          )}
          <span className="flex w-4 items-center justify-center flex-shrink-0">
            {clickable && (
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 shrink-0" />
            )}
          </span>
        </div>
      </div>
    </Wrapper>
  )
}

// ============================================================
// RECENT ROW — recently created / updated item
// ============================================================

function RecentRow({ item, onOpen, centerCompletion = false }) {
  const Icon = TYPE_ICONS[item._type] || Clock
  const completed = item.status === 'Completed'

  const icon = (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${TYPE_TILES[item._type] || TYPE_TILES.Announcement}`}>
      <Icon className="w-4 h-4" />
    </div>
  )

  const typeBadge = (
    <Badge {...(TYPE_BADGE_PROPS[item._type] || { color: 'neutral' })} size="sm" className="shrink-0">
      {item._type}
    </Badge>
  )

  const chevron = (
    <ChevronRight className="hidden sm:block w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 shrink-0" />
  )

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`group w-full text-left gap-3 sm:gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${centerCompletion ? 'grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] items-center' : 'flex items-center'}`}
    >
      {centerCompletion ? (
        <>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {icon}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {item._type === 'Announcement' && item.pinned && (
                  <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                <h3 className="min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate">{item.title}</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{getRecentMeta(item)}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-center">
            {completed && (
              <span className="text-green-500 dark:text-green-400 shrink-0" title="Completed">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-3 sm:gap-4">
            {typeBadge}
            {chevron}
          </div>
        </>
      ) : (
        <>
          {icon}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {item._type === 'Announcement' && item.pinned && (
                <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )}
              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title}</h3>
              {completed && (
                <span className="text-green-500 dark:text-green-400 shrink-0" title="Completed">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{getRecentMeta(item)}</p>
          </div>
          {typeBadge}
          {chevron}
        </>
      )}
    </button>
  )
}

// ============================================================
// LOADING SKELETON
// ============================================================

function UserDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-56 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="h-4 w-72 max-w-full bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
        <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <StatCardSkeleton key={i} />)}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
              <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <ListSkeleton rows={5} />
          </Card>
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
              <div className="h-5 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <ListSkeleton rows={3} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
              <div className="h-5 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            </div>
            <ListSkeleton rows={3} />
          </Card>
          <Card className="p-4">
            <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-4" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3.5">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse mb-2.5" />
                  <div className="h-3.5 w-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse mb-1.5" />
                  <div className="h-3 w-12 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden w-full">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
        <ListSkeleton rows={3} />
      </Card>
    </div>
  )
}

// ============================================================
// USER DASHBOARD
// ============================================================

function UserDashboard() {
  const [tasks, setTasks] = useState([])
  const [assignments, setAssignments] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [essentials, setEssentials] = useState([])
  const [importantDates, setImportantDates] = useState([])
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
        const [
          tasksRes, assignmentsRes, quizzesRes, annRes,
          essRes, datesRes,
        ] = await Promise.all([
          api.get('/tasks').catch(() => ({ data: [] })),
          api.get('/assignments').catch(() => ({ data: [] })),
          api.get('/quizzes').catch(() => ({ data: [] })),
          api.get('/announcements').catch(() => ({ data: [] })),
          api.get('/essentials').catch(() => ({ data: [] })),
          api.get('/important-dates').catch(() => ({ data: [] })),
        ])

        setTasks(normalizeList(tasksRes))
        setAssignments(normalizeList(assignmentsRes))
        setQuizzes(normalizeList(quizzesRes))
        setAnnouncements(normalizeList(annRes))
        setEssentials(normalizeList(essRes))
        setImportantDates(normalizeList(datesRes))
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ── Derived data ──────────────────────────────────────────
  const openTaskList = useMemo(
    () => tasks.filter(isOpen),
    [tasks]
  )
  const openAssignmentList = useMemo(
    () => assignments.filter(isOpen),
    [assignments]
  )
  const openQuizList = useMemo(
    () => quizzes.filter(isOpen),
    [quizzes]
  )

  // Open tasks + assignments that carry a concrete deadline
  const datedWork = useMemo(() => [
    ...openTaskList
      .filter(t => t.deadline && hasValidDate(t.deadline))
      .map(t => ({ ...t, _type: 'Task', _date: t.deadline })),
    ...openAssignmentList
      .filter(a => a.deadline && hasValidDate(a.deadline))
      .map(a => ({ ...a, _type: 'Assignment', _date: a.deadline })),
  ], [openTaskList, openAssignmentList])

  // Open quizzes with a concrete date — same shape as datedWork
  const datedQuizzes = useMemo(() =>
    openQuizList
      .filter(q => q.date && hasValidDate(q.date))
      .map(q => ({ ...q, _type: 'Quiz', _date: q.date })),
    [openQuizList]
  )

  // Open work using a non-date schedule mode (Upcoming Lecture, As Possible,
  // or Surprise). These items are still upcoming, but have no sortable date.
  const undatedOpenWork = useMemo(() => [
    ...openTaskList
      .filter(t => ['Upcoming Lecture', 'As Possible'].includes(t.deadlineMode) && !hasValidDate(t.deadline))
      .map(t => ({ ...t, _type: 'Task', _date: null })),
    ...openAssignmentList
      .filter(a => ['Upcoming Lecture', 'As Possible'].includes(a.deadlineMode) && !hasValidDate(a.deadline))
      .map(a => ({ ...a, _type: 'Assignment', _date: null })),
    ...openQuizList
      .filter(q => ['Upcoming Lecture', 'Surprise'].includes(q.deadlineMode) && !hasValidDate(q.date))
      .map(q => ({ ...q, _type: 'Quiz', _date: null })),
  ], [openTaskList, openAssignmentList, openQuizList])

  // Every open work item that has a real date to compare against
  const datedOpenWork = useMemo(
    () => [...datedWork, ...datedQuizzes],
    [datedWork, datedQuizzes]
  )

  // OVERDUE = past (or flagged Overdue) AND still open — worst first
  const overdueItems = useMemo(() =>
    datedOpenWork
      .filter(isOverdueWork)
      .sort((a, b) => new Date(a._date) - new Date(b._date)),
    [datedOpenWork]
  )

  // UPCOMING WORK = open, dated, not overdue → due today or later,
  // sorted by nearest deadline
  const futureWork = useMemo(() =>
    datedOpenWork
      .filter(w => !isOverdueWork(w))
      .sort((a, b) => new Date(a._date) - new Date(b._date)),
    [datedOpenWork]
  )

  const deadlineStats = useMemo(() => {
    const dueSoon = futureWork.filter(w => daysUntil(w._date) <= 7)
    return {
      overdue: overdueItems,
      dueSoon,
    }
  }, [futureWork, overdueItems])

  // Unified upcoming list: newest additions first across dated items, key
  // dates, and work using a non-date schedule mode. Completed items never enter it.
  const upcomingItems = useMemo(() => {
    const keyDates = importantDates
      .filter(d => d.date && hasValidDate(d.date))
      .filter(d => daysUntil(d.date) >= 0)
      .map(d => ({ ...d, _type: 'KeyDate', _date: d.date }))

    return [...futureWork, ...keyDates, ...undatedOpenWork].sort((a, b) => {
      const createdAtA = new Date(a.createdAt || 0).getTime()
      const createdAtB = new Date(b.createdAt || 0).getTime()
      return (Number.isFinite(createdAtB) ? createdAtB : 0) -
        (Number.isFinite(createdAtA) ? createdAtA : 0)
    })
  }, [futureWork, importantDates, undatedOpenWork])

  const completedItems = useMemo(() => [
    ...tasks.map(x => ({ ...x, _type: 'Task' })),
    ...assignments.map(x => ({ ...x, _type: 'Assignment' })),
    ...quizzes.map(x => ({ ...x, _type: 'Quiz' })),
  ].filter(x => x.status === 'Completed'), [tasks, assignments, quizzes])

  const completedCount = completedItems.length
  const completedTasks = tasks.filter(task => task.status === 'Completed').length
  const completedAssignments = assignments.filter(assignment => assignment.status === 'Completed').length
  const completedQuizzes = quizzes.filter(quiz => quiz.status === 'Completed').length
  const completionActivity = [
    {
      label: 'Tasks',
      completed: completedTasks,
      total: tasks.length,
      barColor: 'bg-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/10',
    },
    {
      label: 'Assignments',
      completed: completedAssignments,
      total: assignments.length,
      barColor: 'bg-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/10',
    },
    {
      label: 'Quizzes',
      completed: completedQuizzes,
      total: quizzes.length,
      barColor: 'bg-violet-500',
      bgColor: 'bg-violet-50 dark:bg-violet-900/10',
    },
  ]

  // Recently created or updated items across all feature areas.
  // Sorted newest → oldest by the item's own timestamp; invalid or missing
  // timestamps sink to the bottom instead of corrupting the order.
  const recentItems = useMemo(() => {
    const tag = (arr, type) => arr.map(x => ({ ...x, _type: type }))
    const ts = (x) => {
      const raw = x.updatedAt || x.createdAt || x.date || 0
      const time = new Date(raw).getTime()
      return Number.isFinite(time) ? time : 0
    }
    return [
      ...tag(tasks, 'Task'),
      ...tag(assignments, 'Assignment'),
      ...tag(quizzes, 'Quiz'),
      ...tag(essentials, 'Essential'),
      ...tag(announcements.filter(a => !a.expired), 'Announcement'),
    ].sort((a, b) => ts(b) - ts(a))
  }, [tasks, assignments, quizzes, essentials, announcements])

  // Pinned announcements first, then most recent, expired excluded
  const topAnnouncements = useMemo(() => {
    const byDateDesc = (a, b) =>
      new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
    const live = announcements.filter(a => !a.expired)
    return [
      ...live.filter(a => a.pinned).sort(byDateDesc),
      ...live.filter(a => !a.pinned).sort(byDateDesc),
    ]
  }, [announcements])

  // Strict cap: only the latest activities are shown, newest first — a new
  // activity pushes the oldest displayed one out. No expansion.
  const visibleRecent = recentItems.slice(0, RECENT_LIMIT)

  const openItem = (item) => {
    if (!item || item._type === 'KeyDate') return
    navigate(`${getItemRoute(item)}?highlight=${item._id}`)
  }

  if (loading) return <UserDashboardSkeleton />

  // ── Header, stats and quick access data ───────────────────
  const hour = currentTime.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name?.split(' ')[0] || 'there'
  const openWorkCount = openTaskList.length + openAssignmentList.length

  let attentionPill
  if (deadlineStats.overdue.length > 0) {
    attentionPill = {
      tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/60',
      icon: AlertTriangle,
      text: `${deadlineStats.overdue.length} overdue`,
    }
  } else if (deadlineStats.dueSoon.length > 0) {
    attentionPill = {
      tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/60',
      icon: CalendarClock,
      text: `${deadlineStats.dueSoon.length} due this week`,
    }
  } else if (upcomingItems.length > 0) {
    attentionPill = {
      tone: 'bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/20 dark:text-primary-400 dark:border-primary-900/40',
      icon: CalendarCheck,
      text: `${upcomingItems.length} upcoming`,
    }
  } else {
    attentionPill = {
      tone: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/60',
      icon: CheckCircle2,
      text: 'All clear',
    }
  }
  const PillIcon = attentionPill.icon

  const statCards = [
    {
      label: 'Tasks',
      value: openTaskList.length,
      icon: CheckSquare,
      tone: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
      caption: openTaskList.length === 0
        ? 'All caught up'
        : `${openTaskList.length} task${openTaskList.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Assignment',
      value: openAssignmentList.length,
      icon: FileCheck,
      tone: TYPE_TILES.Assignment,
      caption: openAssignmentList.length === 0
        ? 'No open assignments'
        : `${openAssignmentList.length} open assignment${openAssignmentList.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Quizzes',
      value: openQuizList.length,
      icon: HelpCircle,
      tone: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400',
      caption: openQuizList.length === 0
        ? 'No open quizzes'
        : `${openQuizList.length} open quiz${openQuizList.length === 1 ? '' : 'zes'}`,
    },
  ]

  const quickTiles = [
    {
      label: 'Tasks', to: '/tasks', icon: CheckSquare,
      tone: TYPE_TILES.Task,
      caption: tasks.length === 0 ? 'Nothing yet' : `${openTaskList.length} open`,
    },
    {
      label: 'Quizzes', to: '/quizzes', icon: HelpCircle,
      tone: TYPE_TILES.Quiz,
      caption: quizzes.length === 0 ? 'Nothing yet' : `${openQuizList.length} open`,
    },
    {
      label: 'Assignments', to: '/assignments', icon: FileCheck,
      tone: TYPE_TILES.Assignment,
      caption: assignments.length === 0 ? 'Nothing yet' : `${openAssignmentList.length} open`,
    },
    {
      label: 'Essentials', to: '/essentials', icon: BookOpen,
      tone: TYPE_TILES.Essential,
      caption: essentials.length === 0 ? 'Nothing yet' : `${essentials.length} resources`,
    },
    {
      label: 'Announcements', to: '/announcements', icon: Megaphone,
      tone: TYPE_TILES.Announcement,
      caption: announcements.filter(a => !a.expired).length === 0
        ? 'Nothing yet'
        : `${announcements.filter(a => !a.expired).length} posts`,
    },
    {
      label: 'Timetable', to: '/timetable', icon: Clock,
      tone: TYPE_TILES.Timetable,
      caption: 'View timetable',
    },
  ]

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* ── Welcome header ──────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {format(currentTime, 'EEEE, MMMM d, yyyy')}
            <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
            {openWorkCount > 0
              ? `${openWorkCount} open item${openWorkCount === 1 ? '' : 's'}`
              : 'Nothing pending'}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 ${attentionPill.tone}`}>
          <PillIcon className="w-3.5 h-3.5" />
          {attentionPill.text}
        </span>
      </div>

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat, i) => (
          <UserStatCard key={i} {...stat} />
        ))}
      </div>

      {/* ── Main content ───────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Left column — Upcoming + Announcements */}
        <div className="min-w-0 lg:col-span-2 space-y-6">
          <Card className="overflow-hidden flex flex-col h-80">
            <SectionHeader title="Upcoming" />
            {upcomingItems.length === 0 ? (
              <CardEmpty
                icon={CalendarCheck}
                tone="text-green-500"
                title="Nothing scheduled ahead"
                description="No upcoming items are scheduled for today or later."
              />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-gray-100 dark:divide-gray-700/50">
                {upcomingItems.map(item => (
                  <UpcomingRow
                    key={`${item._type}-${item._id}`}
                    item={item}
                    onOpen={openItem}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <SectionHeader title="Announcements" />
            {topAnnouncements.length === 0 ? (
              <CardEmpty
                icon={Megaphone}
                title="No announcements"
                description="Updates from your university will appear here."
              />
            ) : (
              <div
                className="h-[24rem] overflow-y-auto overscroll-contain divide-y divide-gray-100 dark:divide-gray-700/50"
                style={{ height: ANNOUNCEMENT_SCROLL_MAX }}
              >
                {topAnnouncements.map(ann => (
                  <button
                    key={ann._id}
                    type="button"
                    onClick={() => openItem({ ...ann, _type: 'Announcement' })}
                    className="group w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ann.pinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {ann.title}
                          </h3>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1.5">
                          {[ann.date && hasValidDate(ann.date)
                            ? format(parseISO(String(ann.date)), 'MMM d, yyyy')
                            : '', formatAuthor(ann.createdBy)]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex justify-center min-w-0">
                        <Badge {...(ANNOUNCEMENT_BADGE_PROPS[ann.type] || {})} size="sm" className="shrink-0">
                          {ann.type || 'General'}
                        </Badge>
                      </div>
                      <div aria-hidden="true" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* Right column — Completed activity + Quick access */}
        <div className="min-w-0 space-y-6">
          <Card className="p-5 flex flex-col h-80">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex-shrink-0">
              Completed Activity
            </h2>
            <div className="grid flex-1 min-h-0 grid-rows-3 gap-3">
              {completionActivity.map(item => {
                const percentage = item.total > 0
                  ? Math.round((item.completed / item.total) * 100)
                  : 0

                return (
                  <div
                    key={item.label}
                    className={`${item.bgColor} rounded-xl px-3 py-2 flex flex-col justify-center min-h-0`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 truncate">
                        {item.label}
                      </p>
                      <div className="flex items-baseline gap-1.5 flex-shrink-0">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white leading-none">
                          {item.completed}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          / {item.total}
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-1.5">
                      <div
                        className={`h-full ${item.barColor} rounded-full transition-all duration-500 ease-out`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-[11px] leading-none text-gray-500 dark:text-gray-400 mt-1">
                      {percentage}% completed
                    </p>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <SectionHeader title="Quick access" />
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
              {quickTiles.map(tile => (
                <button
                  key={tile.to}
                  type="button"
                  onClick={() => navigate(tile.to)}
                  className="flex flex-col items-start gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 text-left hover:border-primary-300 hover:bg-primary-50/60 dark:hover:border-primary-800 dark:hover:bg-primary-900/10 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tile.tone}`}>
                    <tile.icon className="w-[18px] h-[18px]" />
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {tile.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {tile.caption}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Card>

        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* ── Recent activity ───────────────────────────────── */}
        <Card className="overflow-hidden w-full">
        <SectionHeader
          title="Recent activity"
          subtitle="Latest changes across your workspace, newest first"
        />
        {visibleRecent.length === 0 ? (
          <CardEmpty
            icon={Clock}
            title="No recent activity"
            description="Tasks, assignments, quizzes and announcements appear here as they change."
          />
        ) : (
          <div
            className="overflow-y-auto overscroll-contain divide-y divide-gray-100 dark:divide-gray-700/50"
            style={{ maxHeight: RECENT_SCROLL_MAX }}
          >
            {visibleRecent.map(item => (
              <RecentRow
                key={`${item._type}-${item._id}`}
                item={item}
                onOpen={openItem}
                centerCompletion
              />
            ))}
          </div>
        )}
      </Card>

      {/* ── Completed — moved from the top summary cards ────── */}
      <Card className="overflow-hidden">
        <SectionHeader
          title="Completed"
          subtitle="Tasks, assignments and quizzes you have finished"
          action={completedCount > 0 && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              {completedCount} item{completedCount === 1 ? '' : 's'}
            </span>
          )}
        />
        {completedItems.length === 0 ? (
          <CardEmpty
            icon={CheckCircle2}
            tone="text-green-500"
            title="Nothing completed yet"
            description="Completed tasks, assignments, and quizzes will appear here."
          />
        ) : (
          <div
            className="overflow-y-auto overscroll-contain divide-y divide-gray-100 dark:divide-gray-700/50"
            style={{ maxHeight: RECENT_SCROLL_MAX }}
          >
            {completedItems.map(item => (
              <RecentRow
                key={`${item._type}-${item._id}`}
                item={item}
                onOpen={openItem}
                centerCompletion
              />
            ))}
          </div>
        )}
      </Card>
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
