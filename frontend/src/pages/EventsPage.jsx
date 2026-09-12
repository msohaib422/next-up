import { useState, useEffect } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, Calendar, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function EventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', date: '', location: '', type: 'academic' })
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchEvents() }, [])

  const fetchEvents = async () => {
    try {
      const res = await api.get('/events')
      setEvents(Array.isArray(res.data) ? res.data : (res.data.events || []))
    } catch (err) {
      toast.error('Failed to load events')
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
        location: item.location || '', type: item.type || 'academic',
      })
    } else {
      setEditing(null)
      setForm({ title: '', description: '', date: '', location: '', type: 'academic' })
    }
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/events/${editing._id}`, form)
        toast.success('Event updated')
      } else {
        await api.post('/events', form)
        toast.success('Event created')
      }
      setShowModal(false)
      fetchEvents()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return
    try {
      await api.delete(`/events/${id}`)
      toast.success('Event deleted')
      fetchEvents()
    } catch (err) {
      toast.error('Failed to delete')
    }
  }

  const filtered = events.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false
    if (search && !e.title?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const typeColor = (t) => {
    const map = { academic: 'info', social: 'success', sports: 'warning', cultural: 'danger' }
    return map[t] || 'neutral'
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Events</h1>
        <Button onClick={() => openModal()}><Plus className="w-4 h-4" /> Add Event</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input icon={Search} placeholder="Search events..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Types' },
            { value: 'academic', label: 'Academic' },
            { value: 'social', label: 'Social' },
            { value: 'sports', label: 'Sports' },
            { value: 'cultural', label: 'Cultural' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Calendar} title="No events" description="Add your first event" action={
          <Button onClick={() => openModal()}><Plus className="w-4 h-4" /> Add Event</Button>
        } />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(item => (
            <Card key={item._id} className="p-4 cursor-pointer" onClick={() => openModal(item)}>
              <div className="flex items-start justify-between mb-2">
                <Badge color={typeColor(item.type)} size="sm">{item.type}</Badge>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{item.title}</h3>
              {item.description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">{item.description}</p>}
              {item.date && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {format(parseISO(item.date), 'MMM d, yyyy · h:mm a')}
                </p>
              )}
              {item.location && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">📍 {item.location}</p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(item._id) }}
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
        title={editing ? 'Edit Event' : 'New Event'}
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
          <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Room 101" />
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={[
            { value: 'academic', label: 'Academic' }, { value: 'social', label: 'Social' }, { value: 'sports', label: 'Sports' }, { value: 'cultural', label: 'Cultural' },
          ]} />
        </form>
      </Modal>
    </div>
  )
}
