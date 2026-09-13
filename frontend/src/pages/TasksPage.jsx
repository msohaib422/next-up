import { useState, useEffect } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, CheckSquare, Search, Filter } from 'lucide-react'
import { format, parseISO, isPast, isToday } from 'date-fns'
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

  useEffect(() => { fetchTasks() }, [])

  const fetchTasks = async () => {
    try {
      const res = await api.get('/tasks')
      setTasks(Array.isArray(res.data) ? res.data : (res.data.tasks || []))
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
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.subject?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const getDeadlineBadge = (deadline) => {
    if (!deadline) return null
    const d = parseISO(deadline)
    if (isPast(d) && !isToday(d)) return <Badge color="danger" size="sm">Overdue</Badge>
    if (isToday(d)) return <Badge color="warning" size="sm">Due Today</Badge>
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
        <div className="flex-1">
          <Input icon={Search} placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Status' },
            { value: 'Pending', label: 'Pending' },
            { value: 'In Progress', label: 'In Progress' },
            { value: 'Completed', label: 'Completed' },
          ]}
        />
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Priority' },
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks found" description="Create your first task to get started" action={
          <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Task</Button>
        } />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(task => (
            <Card key={task._id} className="p-4" onClick={() => { setEditingTask(task); setShowModal(true) }}>
              <div className="flex items-start justify-between mb-2">
                <Badge color={priorityColor(task.priority)} size="sm">{task.priority}</Badge>
                {getDeadlineBadge(task.deadline)}
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{task.title}</h3>
              {task.subject && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{task.subject}</p>}
              {task.deadline && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Due: {format(parseISO(task.deadline), 'MMM d, h:mm a')}
                </p>
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
    </div>
  )
}
