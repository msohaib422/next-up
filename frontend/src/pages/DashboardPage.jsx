import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import api from '../api/axios'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import {
  CheckSquare, Clock, HelpCircle, Megaphone,
  Plus, AlertTriangle, CheckCircle2, PlayCircle
} from 'lucide-react'
import { format, formatDistanceToNow, isPast, isToday, addDays, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'

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
                    <Badge color={item.priority === 'High' ? 'danger' : item.priority === 'Medium' ? 'info' : 'success'} size="sm">
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
                    {quiz.isSurprise && <Badge color="warning" size="sm">Surprise</Badge>}
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

function CollaboratorDashboard() {
  const [assignments, setAssignments] = useState([])
  const [stats, setStats] = useState({ pending: 0, approvedWeek: 0, rejectedWeek: 0 })
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/assignments/pending')
        const data = Array.isArray(res.data) ? res.data : (res.data.data || [])
        setAssignments(data)

        const allRes = await api.get('/assignments/my').catch(() => ({ data: [] }))
        const all = Array.isArray(allRes.data) ? allRes.data : (allRes.data.data || [])
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
        setStats({
          pending: all.filter(a => a.approvalStatus === 'Pending').length,
          approvedWeek: all.filter(a => a.approvalStatus === 'Approved' && new Date(a.reviewedAt || a.updatedAt) > weekAgo).length,
          rejectedWeek: all.filter(a => a.approvalStatus === 'Rejected' && new Date(a.reviewedAt || a.updatedAt) > weekAgo).length,
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleApprove = async (id) => {
    try {
      await api.put(`/assignments/${id}/approve`)
      setAssignments(prev => prev.filter(a => a._id !== id))
      setStats(prev => ({ ...prev, pending: prev.pending - 1, approvedWeek: prev.approvedWeek + 1 }))
    } catch (err) {
      console.error(err)
    }
  }

  const handleReject = async (id) => {
    try {
      await api.put(`/assignments/${id}/reject`, { rejectionReason: '' })
      setAssignments(prev => prev.filter(a => a._id !== id))
      setStats(prev => ({ ...prev, pending: prev.pending - 1, rejectedWeek: prev.rejectedWeek + 1 }))
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Collaborator Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400">Welcome, {user?.name}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: stats.pending, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30' },
          { label: 'Approved (Week)', value: stats.approvedWeek, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
          { label: 'Rejected (Week)', value: stats.rejectedWeek, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
        ].map((stat, i) => (
          <Card key={i} className="p-4 text-center">
            <p className={`text-3xl font-bold ${stat.color.split(' ')[0]}`}>{stat.value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pending Assignments</h2>
        {assignments.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No pending assignments" />
        ) : (
          <div className="space-y-3">
            {assignments.map(assignment => (
              <div key={assignment._id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{assignment.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {assignment.subject} · by {assignment.user?.name || 'Unknown'} · {format(parseISO(assignment.createdAt), 'MMM d')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(assignment._id)}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(assignment._id)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  return user?.role === 'collaborator' ? <CollaboratorDashboard /> : <UserDashboard />
}
