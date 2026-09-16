import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, HelpCircle, Search, Calendar, X } from 'lucide-react'
import { parseISO, isPast, isToday } from 'date-fns'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import QuizModal from '../components/QuizModal'

const PRIORITY_ORDER = ['High', 'Medium', 'Low']

const normalizePriority = (p) => {
  if (!p) return 'Medium'
  const lower = p.toLowerCase()
  if (lower === 'high') return 'High'
  if (lower === 'medium') return 'Medium'
  if (lower === 'low') return 'Low'
  return 'Medium'
}

const sortByDate = (a, b) => {
  if (!a.date && !b.date) return 0
  if (!a.date) return 1
  if (!b.date) return -1
  return new Date(a.date) - new Date(b.date)
}

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingQuiz, setEditingQuiz] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => { fetchQuizzes() }, [])

  const fetchQuizzes = async () => {
    try {
      const res = await api.get('/quizzes')
      setQuizzes(Array.isArray(res.data) ? res.data : (res.data.data || []))
    } catch (err) {
      toast.error('Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (quizData) => {
    try {
      if (editingQuiz) {
        await api.put(`/quizzes/${editingQuiz._id}`, quizData)
        toast.success('Quiz updated')
      } else {
        await api.post('/quizzes', quizData)
        toast.success('Quiz created')
      }
      setShowModal(false)
      setEditingQuiz(null)
      fetchQuizzes()
    } catch (err) {
      throw err
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this quiz?')) return
    try {
      await api.delete(`/quizzes/${id}`)
      toast.success('Quiz deleted')
      fetchQuizzes()
    } catch (err) {
      toast.error('Failed to delete quiz')
    }
  }

  const handleToggleComplete = async (quiz) => {
    try {
      const newStatus = quiz.status === 'Completed' ? 'Pending' : 'Completed'
      const res = await api.put(`/quizzes/${quiz._id}`, { status: newStatus })
      const updated = res.data?.data
      setQuizzes(prev => prev.map(q =>
        q._id === quiz._id ? { ...q, status: updated?.status || newStatus } : q
      ))
      toast.success(quiz.status === 'Completed' ? 'Quiz restored' : 'Quiz completed')
    } catch (err) {
      toast.error('Failed to update quiz')
    }
  }

  const subjects = useMemo(() => {
    const set = new Set(quizzes.map(q => q.subject).filter(Boolean))
    return Array.from(set).sort()
  }, [quizzes])

  const filtered = useMemo(() => {
    return quizzes.filter(q => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false
      if (priorityFilter !== 'all' && q.priority !== priorityFilter) return false
      if (subjectFilter !== 'all' && q.subject !== subjectFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const matchTitle = q.title?.toLowerCase().startsWith(s)
        const matchSubject = q.subject?.toLowerCase().startsWith(s)
        if (!matchTitle && !matchSubject) return false
      }
      if (dateFilter) {
        if (!q.createdAt) return false
        const d = new Date(q.createdAt)
        const created = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        if (created !== dateFilter) return false
      }
      return true
    })
  }, [quizzes, statusFilter, priorityFilter, subjectFilter, search, dateFilter])

  const activeQuizzes = useMemo(() =>
    filtered.filter(q => q.status !== 'Completed'),
    [filtered]
  )

  const completedQuizzes = useMemo(() =>
    [...filtered.filter(q => q.status === 'Completed')].sort(sortByDate),
    [filtered]
  )

  const groupedQuizzes = useMemo(() => {
    const groups = { High: [], Medium: [], Low: [] }
    activeQuizzes.forEach(quiz => {
      const priority = normalizePriority(quiz.priority)
      groups[priority].push(quiz)
    })
    Object.keys(groups).forEach(key => {
      groups[key].sort(sortByDate)
    })
    return groups
  }, [activeQuizzes])

  const getDeadlineBadge = (quiz) => {
    if (quiz.deadlineMode === 'Upcoming Lecture') return <Badge color="info" size="sm">Upcoming Lecture</Badge>
    if (quiz.deadlineMode === 'Surprise' || quiz.isSurprise) return <Badge color="warning" size="sm">Surprise</Badge>
    if (quiz.date) {
      const d = parseISO(quiz.date)
      if (isPast(d) && !isToday(d)) return <Badge color="danger" size="sm">Overdue</Badge>
      if (isToday(d)) return <Badge color="warning" size="sm">Due Today</Badge>
    }
    return null
  }

  const priorityColor = (p) => p === 'High' ? 'danger' : p === 'Medium' ? 'info' : 'success'

  const statusColor = (s) => {
    if (s === 'Completed') return 'success'
    if (s === 'Postponed') return 'warning'
    return 'neutral'
  }

  const renderQuizCard = (quiz) => (
    <Card key={quiz._id} className="p-4 flex flex-col h-full" onClick={() => { setEditingQuiz(quiz); setShowModal(true) }}>
      <div className="flex items-center justify-between mb-2">
        <Badge color={priorityColor(quiz.priority)} size="sm">{quiz.priority}</Badge>
        <Badge color={statusColor(quiz.status)} size="sm">{quiz.status}</Badge>
        {getDeadlineBadge(quiz)}
      </div>
      <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{quiz.title}</span></h3>
      {quiz.subject && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-bold">Course:</span> <span className="font-normal">{quiz.subject}</span></p>}
      {quiz.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-bold">Description:</span> <span className="font-normal">{quiz.description}</span></p>}
      <div className="flex-1" />
      <div className="flex items-center gap-2 mt-3 pt-3 border-t dark:border-gray-700">
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleComplete(quiz) }}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
            quiz.status === 'Completed'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {quiz.status === 'Completed' ? '✓ Done' : 'Mark Done'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(quiz._id) }}
          className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
        >
          Delete
        </button>
      </div>
    </Card>
  )

  if (loading) return <LoadingSpinner />

  const hasAnyQuizzes = filtered.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quizzes</h1>
        <Button onClick={() => { setEditingQuiz(null); setShowModal(true) }}>
          <Plus className="w-4 h-4" /> Add Quiz
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-[2] min-w-0">
          <Input icon={Search} placeholder="Search quizzes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="relative w-[220px] shrink-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Calendar className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by exact added date"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-colors"
          />
        </div>
        <div className="w-36 shrink-0">
          <Select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Courses' },
              ...subjects.map(s => ({ value: s, label: s })),
            ]}
          />
        </div>
        <div className="w-32 shrink-0">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Status' },
              { value: 'Pending', label: 'Pending' },
              { value: 'Postponed', label: 'Postponed' },
              { value: 'Completed', label: 'Completed' },
            ]}
          />
        </div>
        <div className="w-32 shrink-0">
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Priority' },
              { value: 'High', label: 'High' },
              { value: 'Medium', label: 'Medium' },
              { value: 'Low', label: 'Low' },
            ]}
          />
        </div>
        {(search || dateFilter || statusFilter !== 'all' || priorityFilter !== 'all' || subjectFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setDateFilter(''); setStatusFilter('all'); setPriorityFilter('all'); setSubjectFilter('all') }}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {!hasAnyQuizzes ? (
        <EmptyState
          icon={HelpCircle}
          title="No quizzes found"
          description={(search || dateFilter || statusFilter !== 'all' || priorityFilter !== 'all' || subjectFilter !== 'all')
            ? 'No quizzes match your current filters. Try adjusting your search or filters.'
            : 'Create your first quiz to get started'}
          action={
            <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Quiz</Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {PRIORITY_ORDER.map(priority => {
            const items = groupedQuizzes[priority]
            if (items.length === 0) return null
            return (
              <div key={priority}>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  {priority} Priority
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(renderQuizCard)}
                </div>
              </div>
            )
          })}

          {completedQuizzes.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Completed Quizzes
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedQuizzes.map(renderQuizCard)}
              </div>
            </div>
          )}
        </div>
      )}

      <QuizModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingQuiz(null) }} onSave={handleSave} quiz={editingQuiz} />
    </div>
  )
}
