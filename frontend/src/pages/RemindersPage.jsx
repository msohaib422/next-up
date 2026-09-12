import { useState, useEffect } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, Bell, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function RemindersPage() {
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', date: '', type: 'general', priority: 'medium', status: 'pending' })
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchReminders() }, [])

  const fetchReminders = async () => {
    try {
      const res = await api.get('/reminders')
      setReminders(Array.isArray(res.data) ? res.data : (res.data.reminders || []))
    } catch (err) {
      toast.error('Failed to load reminders')
    } finally {
      setLoading(false)
    }
  }

  const openModal = (item = null) => {
    if (item) {
      setEditing(item)
      setForm({
        title: item.title || '', description: item.description || '',
        date: item.date ? new Date(item.date).toISOString().slice(0, 16) : '',
        type: item.type || 'general', priority: item.priority || 'medium', status: item.status || 'pending',
      })
    } else {
      setEditing(null)
      setForm({ title: '', description: '', date: '', type: 'general', priority: 'medium', status: 'pending' })
    }
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/reminders/${editing._id}`, form)
        toast.success('Reminder updated')
      } else {
        await api.post('/reminders', form)
        toast.success('Reminder created')
      }
      setShowModal(false)
      fetchReminders()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save reminder')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this reminder?')) return
    try {
      await api.delete(`/reminders/${id}`)
      toast.success('Reminder deleted')
      fetchReminders()
    } catch (err) {
      toast.error('Failed to delete')
    }
  }

  const filtered = reminders.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (search && !r.title?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const priorityColor = (p) => p === 'high' ? 'danger' : p === 'medium' ? 'info' : 'success'
  const typeColor = (t) => {
    const map = { exam: 'danger', assignment: 'warning', meeting: 'info', general: 'neutral' }
    return map[t] || 'neutral'
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reminders</h1>
        <Button onClick={() => openModal()}><Plus className="w-4 h-4" /> Add Reminder</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input icon={Search} placeholder="Search reminders..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Types' },
            { value: 'general', label: 'General' },
            { value: 'exam', label: 'Exam' },
            { value: 'assignment', label: 'Assignment' },
            { value: 'meeting', label: 'Meeting' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Bell} title="No reminders" description="Create your first reminder" action={
          <Button onClick={() => openModal()}><Plus className="w-4 h-4" /> Add Reminder</Button>
        } />
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <Card key={item._id} className="p-4 cursor-pointer" onClick={() => openModal(item)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                    <Badge color={typeColor(item.type)} size="sm">{item.type}</Badge>
                    <Badge color={priorityColor(item.priority)} size="sm">{item.priority}</Badge>
                  </div>
                  {item.description && <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>}
                </div>
                <div className="text-right">
                  {(item.date || item.reminderDate) && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {format(parseISO(item.date || item.reminderDate), 'MMM d, h:mm a')}
                    </p>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(item._id) }}
                    className="mt-2 text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Reminder' : 'New Reminder'}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Date & Time" type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={[
              { value: 'general', label: 'General' }, { value: 'exam', label: 'Exam' }, { value: 'assignment', label: 'Assignment' }, { value: 'meeting', label: 'Meeting' },
            ]} />
            <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} options={[
              { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
            ]} />
          </div>
        </form>
      </Modal>
    </div>
  )
}
