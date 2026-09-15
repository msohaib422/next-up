import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, CheckSquare, Search, Calendar, X, Paperclip, Download } from 'lucide-react'
import { parseISO, isPast, isToday, startOfDay } from 'date-fns'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import TaskModal from '../components/TaskModal'

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
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => { fetchTasks() }, [])

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
      toast.error(err.response?.data?.message || 'Failed to save task')
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

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = t.title?.toLowerCase().includes(q)
        const matchSubject = t.subject?.toLowerCase().includes(q)
        const matchDescription = t.description?.toLowerCase().includes(q)
        if (!matchTitle && !matchSubject && !matchDescription) return false
      }
      if (dateFilter) {
        if (!t.createdAt) return false
        const created = startOfDay(new Date(t.createdAt))
        const boundary = startOfDay(new Date(dateFilter + 'T00:00:00'))
        if (created < boundary) return false
      }
      return true
    })
  }, [tasks, statusFilter, priorityFilter, search, dateFilter])

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

  const getDeadlineBadge = (task) => {
    if (task.deadlineMode === 'Upcoming Lecture') return <Badge color="info" size="sm">Upcoming Lecture</Badge>
    if (task.deadlineMode === 'As Possible') return <Badge color="warning" size="sm">As Possible</Badge>
    if (task.deadline) {
      const d = parseISO(task.deadline)
      if (isPast(d) && !isToday(d)) return <Badge color="danger" size="sm">Overdue</Badge>
      if (isToday(d)) return <Badge color="warning" size="sm">Due Today</Badge>
    }
    return null
  }

  const priorityColor = (p) => p === 'High' ? 'danger' : p === 'Medium' ? 'info' : 'success'

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
    <Card key={task._id} className="p-4" onClick={() => { setEditingTask(task); setShowModal(true) }}>
      <div className="flex items-start justify-between mb-2">
        <Badge color={priorityColor(task.priority)} size="sm">{task.priority}</Badge>
        {getDeadlineBadge(task)}
      </div>
      <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{task.title}</span></h3>
      {task.subject && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-bold">Subject:</span> <span className="font-normal">{task.subject}</span></p>}
      {task.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-bold">Description:</span> <span className="font-normal">{task.description}</span></p>}
      {task.attachment?.name && (
        <div className="flex items-center gap-2 mt-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleAttachmentOpen(task.attachment) }}
            className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline min-w-0"
          >
            <Paperclip className="w-3 h-3 shrink-0" />
            <span className="truncate">{task.attachment.name}</span>
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
    </Card>
  )

  if (loading) return <LoadingSpinner />

  const hasAnyTasks = filtered.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h1>
        <Button onClick={() => { setEditingTask(null); setShowModal(true) }}>
          <Plus className="w-4 h-4" /> Add Task
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-[2] min-w-0">
          <Input icon={Search} placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="relative w-[220px] shrink-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Calendar className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by added date (shows tasks created on or after this date)"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-colors"
          />
        </div>
        <div className="w-32 shrink-0">
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
        {(search || dateFilter || statusFilter !== 'all' || priorityFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setDateFilter(''); setStatusFilter('all'); setPriorityFilter('all') }}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {!hasAnyTasks ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks found"
          description={(search || dateFilter || statusFilter !== 'all' || priorityFilter !== 'all')
            ? 'No tasks match your current filters. Try adjusting your search or filters.'
            : 'Create your first task to get started'}
          action={
            <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Task</Button>
          }
        />
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
            <div>
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
    </div>
  )
}
