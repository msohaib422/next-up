import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useHighlightSync } from '../hooks/useHighlightSync'
import { Plus, HelpCircle, Search, Calendar, X, Paperclip, Download } from 'lucide-react'
import { parseISO, isPast, isToday, format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import QuizModal from '../components/QuizModal'
import QuizViewModal from '../components/QuizViewModal'

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
  const { user } = useAuth()
  const isAdmin = user?.role === 'collaborator'
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingQuiz, setEditingQuiz] = useState(null)
  const [viewingQuiz, setViewingQuiz] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const processedHighlight = useRef(null)
  // Id whose row was missing on the first attempt (one retry, then drop the link).
  const missingHighlight = useRef(null)

  useEffect(() => { fetchQuizzes() }, [])

  // A notification may point at an item this page has not loaded yet
  // (e.g. another admin published it while this page was already open).
  useHighlightSync(quizzes.map((item) => item._id), loading, () => fetchQuizzes())

  // Highlight item from dashboard navigation.
  //
  // A row that is not on the page yet is retried once the data settles (see
  // useHighlightSync: that happens when the item was created by another admin
  // while this page was already open). After that single retry the link is
  // dropped exactly as before, so a genuinely missing row cannot leave the
  // effect re-running.
  useEffect(() => {
    if (loading) return
    const highlightId = searchParams.get('highlight')
    if (!highlightId || highlightId === processedHighlight.current) return
    if (missingHighlight.current === highlightId) {
      searchParams.delete('highlight')
      setSearchParams(searchParams, { replace: true })
      return
    }
    const timer = setTimeout(() => {
      const element = document.getElementById(`item-${highlightId}`)
      if (!element) {
        missingHighlight.current = highlightId
        return
      }
      processedHighlight.current = highlightId
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('highlight-glow')
      setTimeout(() => {
        element.classList.remove('highlight-glow')
      }, 3000)
      searchParams.delete('highlight')
      setSearchParams(searchParams, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [loading, quizzes, searchParams, setSearchParams])

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
      return true
    })
  }, [quizzes, statusFilter, priorityFilter, subjectFilter, search])

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

  const isDateFilterActive = !!dateFilter

  const selectedDateItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(q => {
      if (!q.date) return false
      return format(new Date(q.date), 'yyyy-MM-dd') === dateFilter
    }).sort(sortByDate)
  }, [filtered, dateFilter])

  const ongoingItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(q => {
      if (q.status === 'Completed') return false
      if (!q.date) return true
      return format(new Date(q.date), 'yyyy-MM-dd') !== dateFilter
    }).sort(sortByDate)
  }, [filtered, dateFilter])

  const dateFilteredCompletedItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(q => {
      if (q.status !== 'Completed') return false
      if (!q.date) return true
      return format(new Date(q.date), 'yyyy-MM-dd') !== dateFilter
    }).sort(sortByDate)
  }, [filtered, dateFilter])

  const getDeadlineBadge = (quiz) => {
    if (quiz.deadlineMode === 'Upcoming Lecture') return <Badge bgColor="#2DD4BF" textColor="#0F172A" size="sm">Upcoming Lecture</Badge>
    if (quiz.deadlineMode === 'Surprise' || quiz.isSurprise) return <Badge bgColor="#EC4899" textColor="#0F172A" size="sm">Surprise</Badge>
    if (quiz.date) {
      const d = parseISO(quiz.date)
      const dateStr = format(d, 'MMM d, yyyy')
      if (isPast(d) && !isToday(d)) return <Badge bgColor="#64748B" textColor="#FFFFFF" size="sm">{dateStr}</Badge>
      if (isToday(d)) return <Badge bgColor="#64748B" textColor="#FFFFFF" size="sm">Today</Badge>
      return <Badge bgColor="#64748B" textColor="#FFFFFF" size="sm">{dateStr}</Badge>
    }
    return null
  }

  const priorityColor = (p) => {
    if (p === 'High') return 'danger'
    return undefined
  }

  const priorityBgColor = (p) => {
    if (p === 'Medium') return '#F04438'
    if (p === 'Low') return '#EAB308'
    return undefined
  }

  const priorityTextColor = (p) => {
    if (p === 'Medium') return '#FFFFFF'
    if (p === 'Low') return '#0F172A'
    return undefined
  }

  const statusBgColor = (s) => {
    if (s === 'Pending') return '#F59E0B'
    if (s === 'In Progress') return '#800080'
    if (s === 'Postponed') return '#E11D48'
    if (s === 'Possible') return '#FF00FF'
    return undefined
  }

  const statusTextColor = (s) => {
    if (s === 'Pending') return '#0F172A'
    if (s === 'In Progress') return '#FFFFFF'
    if (s === 'Postponed') return '#FFFFFF'
    return undefined
  }

  const statusColor = (s) => {
    if (s === 'Completed') return 'success'
    return 'neutral'
  }

  const handleAttachmentOpen = (attachment) => {
    if (!attachment?.url) return
    window.open(attachment.url, '_blank', 'noopener,noreferrer')
  }

  const handleDownload = async (attachment) => {
    if (!attachment?.url) return
    try {
      const response = await fetch(attachment.url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = attachment.name || 'attachment'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Failed to download attachment')
    }
  }

  const renderQuizCard = (quiz) => (
    <Card
      id={`item-${quiz._id}`}
      key={quiz._id}
      className="p-4 flex flex-col h-full"
      onClick={isAdmin
        ? () => { setEditingQuiz(quiz); setShowModal(true) }
        : () => setViewingQuiz(quiz)}
    >
      <div className="flex items-center justify-between mb-2">
        <Badge color={priorityColor(quiz.priority)} bgColor={priorityBgColor(quiz.priority)} textColor={priorityTextColor(quiz.priority)} size="sm">{quiz.priority}</Badge>
        <Badge color={statusColor(quiz.status)} bgColor={statusBgColor(quiz.status)} textColor={statusTextColor(quiz.status)} size="sm">{quiz.status}</Badge>
        {getDeadlineBadge(quiz)}
      </div>
      <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{quiz.title}</span></h3>
      {quiz.subject && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-bold">Course:</span> <span className="font-normal">{quiz.subject}</span></p>}
      {quiz.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-normal">Description:</span> <span className="font-normal">{quiz.description}</span></p>}
      {quiz.attachment?.name && (
        <div className="flex items-center gap-2 mt-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleAttachmentOpen(quiz.attachment) }}
            className="flex items-center gap-1.5 text-[13px] text-primary-600 dark:text-primary-400 hover:underline min-w-0"
          >
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{quiz.attachment.name}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(quiz.attachment) }}
            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 shrink-0 ml-auto"
            aria-label="Download attachment"
            title="Download"
          >
            <Download className="w-[21px] h-[21px]" />
          </button>
        </div>
      )}
      <div className="flex-1" />
      {isAdmin && (
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
      )}
    </Card>
  )

  if (loading) return <LoadingSpinner />

  const hasAnyQuizzes = filtered.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quizzes</h1>
        {isAdmin && (
          <Button onClick={() => { setEditingQuiz(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Add Quiz
          </Button>
        )}
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
            title="Filter by due date"
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
            isAdmin ? <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Quiz</Button> : undefined
          }
        />
      ) : isDateFilterActive ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Selected Date
            </h2>
            {selectedDateItems.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No quizzes found for this date.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selectedDateItems.map(renderQuizCard)}
              </div>
            )}
          </div>

          {ongoingItems.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Ongoing
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ongoingItems.map(renderQuizCard)}
              </div>
            </div>
          )}

          {dateFilteredCompletedItems.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Completed Quizzes
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dateFilteredCompletedItems.map(renderQuizCard)}
              </div>
            </div>
          )}
        </div>
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
      <QuizViewModal isOpen={!!viewingQuiz} onClose={() => setViewingQuiz(null)} quiz={viewingQuiz} />
    </div>
  )
}
