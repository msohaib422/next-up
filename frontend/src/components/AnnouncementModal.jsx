import { useState, useEffect, useRef } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Select from './ui/Select'
import Button from './ui/Button'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Paperclip, X } from 'lucide-react'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024

const ANNOUNCEMENT_TYPES = [
  { value: 'General', label: 'General' },
  { value: 'Academic', label: 'Academic' },
  { value: 'Assignment', label: 'Assignment' },
  { value: 'Quiz', label: 'Quiz' },
  { value: 'Task', label: 'Task' },
  { value: 'Exam', label: 'Exam' },
  { value: 'Event', label: 'Event' },
]

export default function AnnouncementModal({ isOpen, onClose, onSave, announcement }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'General',
    date: '',
    link: '',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setErrors({})
    setFile(null)
    setAttachment(null)
    if (announcement) {
      setForm({
        title: announcement.title || '',
        description: announcement.description || '',
        type: announcement.type || 'General',
        date: announcement.date ? new Date(announcement.date).toISOString().slice(0, 10) : '',
        link: announcement.link || '',
      })
      if (announcement.attachment?.name) {
        setAttachment(announcement.attachment)
      }
    } else {
      setForm({ title: '', description: '', type: 'General', date: '', link: '' })
    }
  }, [announcement, isOpen])

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setErrors(prev => ({ ...prev, file: 'Only PDF, JPG, JPEG, PNG, WEBP files are allowed.' }))
      return
    }
    if (selected.size > MAX_SIZE) {
      setErrors(prev => ({ ...prev, file: 'File must be under 10 MB.' }))
      return
    }
    setErrors(prev => { const n = { ...prev }; delete n.file; return n })
    setFile(selected)
    setAttachment(null)
  }

  const handleRemoveFile = () => {
    setFile(null)
    setAttachment(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadFile = async () => {
    if (!file) return attachment
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post('/announcements/upload', formData)
    return res.data.data
  }

  const getMinDate = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.title.trim()) {
      newErrors.title = 'Title is required.'
    }
    if (!form.type) {
      newErrors.type = 'Type is required.'
    }
    if (!form.date) {
      newErrors.date = 'Date is required.'
    }
    if (form.date) {
      const today = new Date()
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const selected = new Date(form.date + 'T00:00:00')
      if (selected < todayDate) {
        newErrors.date = 'Date cannot be in the past.'
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      let uploadedAttachment = attachment
      if (file) {
        setUploading(true)
        uploadedAttachment = await uploadFile()
        setUploading(false)
      }
      await onSave({
        ...form,
        attachment: uploadedAttachment || null,
        link: form.link || '',
      })
    } catch (err) {
      setUploading(false)
      const msg = err.response?.data?.message || err.message || 'Upload failed. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={announcement ? 'Edit Announcement' : 'New Announcement'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading || uploading}>{announcement ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Announcement title"
          required
        />
        {errors.title && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="announcement-description">Description</label>
          <textarea id="announcement-description" rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        </div>

        <Select
          label="Type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          options={ANNOUNCEMENT_TYPES}
        />
        {errors.type && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.type}</p>}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
          <input
            type="date"
            value={form.date}
            min={getMinDate()}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary-500 focus:ring-primary-500"
          />
          {errors.date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.date}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attachment</label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <Paperclip className="w-4 h-4" />
              {file ? file.name : (attachment?.name || 'Choose PDF or Image')}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {(file || attachment) && (
              <button type="button" onClick={handleRemoveFile} className="text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {errors.file && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.file}</p>}
        </div>

        <Input
          label="Link"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
          placeholder="https://example.com (optional)"
        />
      </form>
    </Modal>
  )
}
