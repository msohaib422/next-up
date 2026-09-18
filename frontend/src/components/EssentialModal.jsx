import { useState, useEffect, useRef } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Paperclip, X } from 'lucide-react'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024

export default function EssentialModal({ isOpen, onClose, onSave, essential }) {
  const [form, setForm] = useState({
    course: '',
    title: '',
    description: '',
    date: '',
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const fileInputRef = useRef(null)

  const getTodayDate = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  useEffect(() => {
    setErrors({})
    setFile(null)
    setAttachment(null)
    if (essential) {
      setForm({
        course: essential.course || '',
        title: essential.title || '',
        description: essential.description || '',
        date: essential.date ? new Date(essential.date).toISOString().slice(0, 10) : getTodayDate(),
      })
      if (essential.attachment?.name) {
        setAttachment(essential.attachment)
      }
    } else {
      setForm({ course: '', title: '', description: '', date: getTodayDate() })
    }
  }, [essential, isOpen])

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
    const res = await api.post('/essentials/upload', formData)
    return res.data.data
  }

  const getMinDate = () => {
    return getTodayDate()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.course.trim()) {
      newErrors.course = 'Course is required.'
    }
    if (!form.title.trim()) {
      newErrors.title = 'Title is required.'
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
        course: form.course.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        attachment: uploadedAttachment || null,
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
      title={essential ? 'Edit Essential' : 'New Essential'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading || uploading}>{essential ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Course"
          value={form.course}
          onChange={(e) => setForm({ ...form, course: e.target.value })}
          placeholder="e.g. Mathematics"
          required
        />
        {errors.course && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.course}</p>}

        <Input
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Essential title"
          required
        />
        {errors.title && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title}</p>}

        <Input
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional description"
        />

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
      </form>
    </Modal>
  )
}
