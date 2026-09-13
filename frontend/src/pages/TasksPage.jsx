import { useState, useEffect } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, CheckSquare, Search, Filter, Calendar, X, Paperclip } from 'lucide-react'
import { parseISO, isPast, isToday } from 'date-fns'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import TaskModal from '../components/TaskModal'

export default function TasksPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [preview, setPreview] = useState(null)

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
      await api.put(`/tasks/${task._id}`, { status: task.status === 'Completed' ? 'Pending' : 'Completed' })
      fetchTasks()
    } catch (err) {
      toast.error('Failed to update task')
    }
  }

  const filtered = tasks.filter(t => {
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
      const created = new Date(t.createdAt)
      const y = created.getFullYear()
      const m = String(created.getMonth() + 1).padStart(2, '0')
      const d = String(created.getDate()).padStart(2, '0')
      if (`${y}-${m}-${d}` !== dateFilter) return false
    }
    return true
  })

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

  if (loading) return <LoadingSpinner />

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
            title="Filter by added date"
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

      {filtered.length === 0 ? (
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(task => (
            <Card key={task._id} className="p-4" onClick={() => { setEditingTask(task); setShowModal(true) }}>
              <div className="flex items-start justify-between mb-2">
                <Badge color={priorityColor(task.priority)} size="sm">{task.priority}</Badge>
                {getDeadlineBadge(task)}
              </div>
              <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{task.title}</span></h3>
              {task.subject && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-bold">Subject:</span> <span className="font-normal">{task.subject}</span></p>}
              {task.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-bold">Description:</span> <span className="font-normal">{task.description}</span></p>}
              {task.attachment?.name && (
                <button
                  onClick={(e) => { e.stopPropagation(); setPreview(task.attachment) }}
                  className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
                >
                  <Paperclip className="w-3 h-3" /> {task.attachment.name}
                </button>
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
          ))}
        </div>
      )}

      <TaskModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingTask(null) }} onSave={handleSave} task={editingTask} />

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{preview.name}</h3>
              <button onClick={() => setPreview(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {preview.url && preview.type?.startsWith('image/') ? (
                <img src={preview.url} alt={preview.name} className="max-w-full max-h-[70vh] mx-auto rounded object-contain" />
              ) : preview.url && preview.type === 'application/pdf' ? (
                <iframe src={preview.url} className="w-full h-[70vh] rounded border" title={preview.name} />
              ) : (
                <p className="text-sm text-gray-500">Preview unavailable for this attachment.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
