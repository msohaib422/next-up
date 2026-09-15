import { useState, useEffect } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, HelpCircle, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ subject: '', title: '', description: '', date: '', priority: 'Medium', isSurprise: false })
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchQuizzes() }, [])

  const fetchQuizzes = async () => {
    try {
      const res = await api.get('/quizzes')
      setQuizzes(Array.isArray(res.data) ? res.data : (res.data.quizzes || []))
    } catch (err) {
      toast.error('Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }

  const openModal = (quiz = null) => {
    if (quiz) {
      setEditing(quiz)
      setForm({
        subject: quiz.subject || '',
        title: quiz.title || '',
        description: quiz.description || '',
        date: quiz.date ? new Date(quiz.date).toISOString().slice(0, 16) : '',
        priority: quiz.priority || 'Medium',
        isSurprise: quiz.isSurprise || false,
      })
    } else {
      setEditing(null)
      setForm({ subject: '', title: '', description: '', date: '', priority: 'Medium', isSurprise: false })
    }
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/quizzes/${editing._id}`, form)
        toast.success('Quiz updated')
      } else {
        await api.post('/quizzes', form)
        toast.success('Quiz created')
      }
      setShowModal(false)
      fetchQuizzes()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save quiz')
    } finally {
      setSaving(false)
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

  const filtered = quizzes.filter(q => {
    if (statusFilter === 'upcoming' && new Date(q.date || q.quizDate) < new Date()) return false
    if (statusFilter === 'past' && new Date(q.date || q.quizDate) >= new Date()) return false
    if (search && !q.title?.toLowerCase().includes(search.toLowerCase()) && !q.subject?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const priorityColor = (p) => p === 'High' ? 'danger' : p === 'Medium' ? 'info' : 'success'

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quizzes</h1>
        <Button onClick={() => openModal()}><Plus className="w-4 h-4" /> Add Quiz</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input icon={Search} placeholder="Search quizzes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No quizzes found" description="Add your first quiz" action={
          <Button onClick={() => openModal()}><Plus className="w-4 h-4" /> Add Quiz</Button>
        } />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(quiz => (
            <Card key={quiz._id} className="p-4 cursor-pointer" onClick={() => openModal(quiz)}>
              <div className="flex items-start justify-between mb-2">
                <Badge color={priorityColor(quiz.priority)} size="sm">{quiz.priority}</Badge>
                {quiz.isSurprise && <Badge color="warning" size="sm">Surprise</Badge>}
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{quiz.title}</h3>
              {quiz.subject && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{quiz.subject}</p>}
              {(quiz.date || quiz.quizDate) && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {format(parseISO(quiz.date || quiz.quizDate), 'MMM d, yyyy · h:mm a')}
                </p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(quiz._id) }}
                className="mt-3 text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              >
                Delete
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Quiz' : 'New Quiz'}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Physics" />
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Quiz title" />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Date & Time" type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            options={[{ value: 'Low', label: 'Low' }, { value: 'Medium', label: 'Medium' }, { value: 'High', label: 'High' }]}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.isSurprise} onChange={(e) => setForm({ ...form, isSurprise: e.target.checked })} className="rounded" />
            Surprise Quiz
          </label>
        </form>
      </Modal>
    </div>
  )
}
