import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useHighlightSync } from '../hooks/useHighlightSync'
import { Plus, CheckSquare, Search, Calendar, X, Paperclip, Download } from 'lucide-react'
import { parseISO, isPast, isToday, format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import TaskModal from '../components/TaskModal'
import TaskViewModal from '../components/TaskViewModal'

const PRIORITY_ORDER = ['High', 'Medium', 'Low']

const normalizePriority = (p) => {
  if (!p) return 'Medium'
  const lower = p.toLowerCase()
  if (lower === 'high') return 'High'
  if (lower === 'medium') return 'Medium'
  if (lower === 'low') return 'Low'
  return 'Medium'
}

const sortByDeadline = (a, b) => {
  if (!a.deadline && !b.deadline) return 0
  if (!a.deadline) return 1
  if (!b.deadline) return -1
  return new Date(a.deadline) - new Date(b.deadline)
}

export default function TasksPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'collaborator'
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [viewingTask, setViewingTask] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const processedHighlight = useRef(null)
  // Id whose row was missing on the first attempt (one retry, then drop the link).
  const missingHighlight = useRef(null)

  useEffect(() => { fetchTasks() }, [])

  // A notification may point at an item this page has not loaded yet
  // (e.g. another admin published it while this page was already open).
  useHighlightSync(tasks.map((item) => item._id), loading, () => fetchTasks())

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
  }, [loading, tasks, searchParams, setSearchParams])

  const fetchTasks = async () => {
    try {
      const res = await api.get('/tasks')
      setTasks(Array.isArray(res.data) ? res.data : (res.data.data || []))
    } catch (err) {
      toast.error('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (taskData) => {
    try {
      if (editingTask) {
        await api.put(`/tasks/${editingTask._id}`, taskData)
        toast.success('Task updated')
      } else {
        await api.post('/tasks', taskData)
        toast.success('Task created')
      }
      setShowModal(false)
      setEditingTask(null)
      fetchTasks()
    } catch (err) {
      throw err
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this task?')) return
    try {
      await api.delete(`/tasks/${id}`)
      toast.success('Task deleted')
      fetchTasks()
    } catch (err) {
      toast.error('Failed to delete task')
    }
  }

  const handleToggleComplete = async (task) => {
    try {
      const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed'
      const res = await api.put(`/tasks/${task._id}`, { status: newStatus })
      const updated = res.data?.data
      setTasks(prev => prev.map(t =>
        t._id === task._id ? { ...t, status: updated?.status || newStatus } : t
      ))
      toast.success(task.status === 'Completed' ? 'Task restored' : 'Task completed')
    } catch (err) {
      toast.error('Failed to update task')
    }
  }

  const subjects = useMemo(() => {
    const set = new Set(tasks.map(t => t.subject).filter(Boolean))
    return Array.from(set).sort()
  }, [tasks])

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (subjectFilter !== 'all' && t.subject !== subjectFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = t.title?.toLowerCase().startsWith(q)
        const matchSubject = t.subject?.toLowerCase().startsWith(q)
        if (!matchTitle && !matchSubject) return false
      }
      return true
    })
  }, [tasks, statusFilter, priorityFilter, subjectFilter, search])

  const activeTasks = useMemo(() =>
    filtered.filter(t => t.status !== 'Completed'),
    [filtered]
  )

  const completedTasks = useMemo(() =>
    [...filtered.filter(t => t.status === 'Completed')].sort(sortByDeadline),
    [filtered]
  )

  const groupedTasks = useMemo(() => {
    const groups = { High: [], Medium: [], Low: [] }
    activeTasks.forEach(task => {
      const priority = normalizePriority(task.priority)
      groups[priority].push(task)
    })
    Object.keys(groups).forEach(key => {
      groups[key].sort(sortByDeadline)
    })
    return groups
  }, [activeTasks])

  const isDateFilterActive = !!dateFilter

  const selectedDateItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(t => {
      if (!t.deadline) return false
      return format(new Date(t.deadline), 'yyyy-MM-dd') === dateFilter
    }).sort(sortByDeadline)
  }, [filtered, dateFilter])

  const ongoingItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(t => {
      if (t.status === 'Completed') return false
      if (!t.deadline) return true
      return format(new Date(t.deadline), 'yyyy-MM-dd') !== dateFilter
    }).sort(sortByDeadline)
  }, [filtered, dateFilter])

  const dateFilteredCompletedItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(t => {
      if (t.status !== 'Completed') return false
      if (!t.deadline) return true
      return format(new Date(t.deadline), 'yyyy-MM-dd') !== dateFilter
    }).sort(sortByDeadline)
  }, [filtered, dateFilter])

  const getDeadlineBadge = (task) => {
    if (task.deadlineMode === 'Upcoming Lecture') return <Badge bgColor="#2DD4BF" textColor="#0F172A" size="sm">Upcoming Lecture</Badge>
    if (task.deadlineMode === 'As Possible') return <Badge bgColor="#8B5CF6" textColor="#FFFFFF" size="sm">As Possible</Badge>
    if (task.deadline) {
      const d = parseISO(task.deadline)
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
    return undefined
  }

  const statusTextColor = (s) => {
    if (s === 'Pending') return '#0F172A'
    if (s === 'In Progress') return '#FFFFFF'
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

  const renderTaskCard = (task) => (
    <Card
      id={`item-${task._id}`}
      key={task._id}
      className="p-4 flex flex-col h-full min-w-0"
      onClick={isAdmin
        ? () => { setEditingTask(task); setShowModal(true) }
        : () => setViewingTask(task)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2">
        <Badge color={priorityColor(task.priority)} bgColor={priorityBgColor(task.priority)} textColor={priorityTextColor(task.priority)} size="sm">{task.priority}</Badge>
        <Badge color={statusColor(task.status)} bgColor={statusBgColor(task.status)} textColor={statusTextColor(task.status)} size="sm">{task.status}</Badge>
        {getDeadlineBadge(task)}
      </div>
      <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{task.title}</span></h3>
      {task.subject && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-bold">Course:</span> <span className="font-normal">{task.subject}</span></p>}
      {task.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-normal">Description:</span> <span className="font-normal">{task.description}</span></p>}
      {task.attachment?.name && (
        <div className="flex items-center gap-2 mt-2 pt-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleAttachmentOpen(task.attachment) }}
            className="flex items-center gap-1.5 text-[13px] text-primary-600 dark:text-primary-400 hover:underline min-w-0"
          >
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate min-w-0">{task.attachment.name}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(task.attachment) }}
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
            onClick={(e) => { e.stopPropagation(); handleToggleComplete(task) }}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
              task.status === 'Completed'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {task.status === 'Completed' ? '✓ Done' : 'Mark Done'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(task._id) }}
            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            Delete
          </button>
        </div>
      )}
    </Card>
  )

  if (loading) return <LoadingSpinner />

  const hasAnyTasks = filtered.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h1>
        {isAdmin && (
          <Button onClick={() => { setEditingTask(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Add Task
          </Button>
        )}
      </div>

      {/* Below sm every control is full width; from sm up they share one row
          and wrap to a second line rather than overflowing when the fixed
          widths no longer fit. On lg+ the row is exactly as it was. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="w-full sm:flex-[2_1_16rem] sm:min-w-0">
          <Input icon={Search} placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="relative w-full sm:w-auto sm:basis-[220px] sm:grow-0 sm:shrink-0">
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
        <div className="w-full sm:w-auto sm:basis-36 sm:grow-0 sm:shrink-0">
          <Select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Courses' },
              ...subjects.map(s => ({ value: s, label: s })),
            ]}
          />
        </div>
        <div className="w-full sm:w-auto sm:basis-32 sm:grow-0 sm:shrink-0">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Status' },
              { value: 'Pending', label: 'Pending' },
              { value: 'In Progress', label: 'In Progress' },
              { value: 'Completed', label: 'Completed' },
            ]}
          />
        </div>
        <div className="w-full sm:w-auto sm:basis-32 sm:grow-0 sm:shrink-0">
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
            className="flex shrink-0 items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {!hasAnyTasks ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks found"
          description={(search || dateFilter || statusFilter !== 'all' || priorityFilter !== 'all' || subjectFilter !== 'all')
            ? 'No tasks match your current filters. Try adjusting your search or filters.'
            : 'Create your first task to get started'}
          action={
            isAdmin ? <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Task</Button> : undefined
          }
        />
      ) : isDateFilterActive ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Selected Date
            </h2>
            {selectedDateItems.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No tasks found for this date.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selectedDateItems.map(renderTaskCard)}
              </div>
            )}
          </div>

          {ongoingItems.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Ongoing
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ongoingItems.map(renderTaskCard)}
              </div>
            </div>
          )}

          {dateFilteredCompletedItems.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Completed Tasks
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dateFilteredCompletedItems.map(renderTaskCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {PRIORITY_ORDER.map(priority => {
            const tasks = groupedTasks[priority]
            if (tasks.length === 0) return null
            return (
              <div key={priority}>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  {priority} Priority
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tasks.map(renderTaskCard)}
                </div>
              </div>
            )
          })}

          {completedTasks.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Completed Tasks
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedTasks.map(renderTaskCard)}
              </div>
            </div>
          )}
        </div>
      )}

      <TaskModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingTask(null) }} onSave={handleSave} task={editingTask} />
      <TaskViewModal isOpen={!!viewingTask} onClose={() => setViewingTask(null)} task={viewingTask} />
    </div>
  )
}
