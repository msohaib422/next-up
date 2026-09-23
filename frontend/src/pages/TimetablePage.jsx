import { useState, useEffect } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { Plus, Clock, Trash2, Edit, FileText, Upload } from 'lucide-react'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import TimetableModal from '../components/TimetableModal'

export default function TimetablePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'collaborator'
  const [lectures, setLectures] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingLecture, setEditingLecture] = useState(null)

  useEffect(() => { fetchLectures() }, [])

  const fetchLectures = async () => {
    try {
      const res = await api.get('/lectures')
      setLectures(Array.isArray(res.data) ? res.data : (res.data.data || []))
    } catch (err) {
      toast.error('Failed to load timetable')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (data) => {
    try {
      if (editingLecture) {
        await api.put(`/lectures/${editingLecture._id}`, data)
        toast.success('Timetable updated')
      } else {
        await api.post('/lectures', data)
        toast.success('Timetable added')
      }
      setShowModal(false)
      setEditingLecture(null)
      fetchLectures()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save timetable')
      throw err
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this timetable?')) return
    try {
      await api.delete(`/lectures/${id}`)
      toast.success('Timetable deleted')
      fetchLectures()
    } catch (err) {
      toast.error('Failed to delete timetable')
    }
  }

  if (loading) return <LoadingSpinner />

  const imageLecture = lectures.find(l => l.fileType === 'image' && l.fileUrl)

  const timelineColor = { Weekly: 'info', Monthly: 'warning', 'Continued till next change': 'success' }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            {imageLecture ? imageLecture.subject : 'Timetable'}
          </h1>
          {imageLecture && (
            <Badge bgColor="#0F766E" textColor="#FFFFFF">
              {imageLecture.timeline}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {imageLecture && isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditingLecture(imageLecture); setShowModal(true) }}
              >
                <Edit className="w-4 h-4" /> Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(imageLecture._id)}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            </>
          )}
          {!imageLecture && isAdmin && (
            <Button onClick={() => { setEditingLecture(null); setShowModal(true) }}>
              <Plus className="w-4 h-4" /> Add Timetable
            </Button>
          )}
        </div>
      </div>

      {!imageLecture?.notes && !imageLecture?.fileUrl && (
        <div className="shrink-0 mb-4" />
      )}

      {imageLecture?.notes && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 shrink-0">{imageLecture.notes}</p>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        {!imageLecture ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={Clock}
              title="No timetable yet"
              description="Upload a timetable image to get started."
              action={
                isAdmin ? (
                  <Button onClick={() => setShowModal(true)}>
                    <Upload className="w-4 h-4" /> Upload Timetable
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : imageLecture.fileType === 'image' ? (
          <img
            src={imageLecture.fileUrl}
            alt={imageLecture.fileName || 'Timetable'}
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <a
            href={imageLecture.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <FileText className="w-5 h-5" />
            {imageLecture.fileName || 'View attachment'}
          </a>
        )}
      </div>

      <TimetableModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingLecture(null) }}
        onSave={handleSave}
        lecture={editingLecture}
      />
    </div>
  )
}
