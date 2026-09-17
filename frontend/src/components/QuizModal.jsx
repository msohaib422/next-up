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

export default function QuizModal({ isOpen, onClose, onSave, quiz }) {
  const [form, setForm] = useState({
    subject: '', title: '', description: '', date: '', deadlineMode: null, priority: 'Medium', status: 'Pending'
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
    if (quiz) {
      const mode = quiz.deadlineMode || null
      setForm({
        subject: quiz.subject || '',
        title: quiz.title || '',
        description: quiz.description || '',
        date: mode === 'Date' && quiz.date ? new Date(quiz.date).toISOString().slice(0, 16) : '',
        deadlineMode: mode,
        priority: quiz.priority || 'Medium',
        status: quiz.status || 'Pending',
      })
      if (quiz.attachment?.name) {
        setAttachment(quiz.attachment)
      }
    } else {
      setForm({ subject: '', title: '', description: '', date: '', deadlineMode: null, priority: 'Medium', status: 'Pending' })
    }
  }, [quiz, isOpen])

  const handleDeadlineModeChange = (mode) => {
    setForm(prev => {
      const newMode = prev.deadlineMode === mode ? null : mode
      return {
        ...prev,
        deadlineMode: newMode,
        date: newMode === 'Date' ? prev.date : '',
      }
    })
  }

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
    const res = await api.post('/quizzes/upload', formData)
    return res.data.data
  }

  const getMinDateTime = () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d}T${h}:${min}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.deadlineMode) {
      newErrors.deadlineMode = 'Please select a deadline.'
    } else if (form.deadlineMode === 'Date' && !form.date) {
      newErrors.date = 'Please select a date.'
    }
    if (form.deadlineMode === 'Date' && form.date) {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const selected = new Date(form.date)
      const selectedDate = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate())
      if (selectedDate < today) {
        newErrors.date = 'Due date cannot be in the past.'
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
      await onSave({ ...form, attachment: uploadedAttachment || null })
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
      title={quiz ? 'Edit Quiz' : 'New Quiz'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading || uploading}>{quiz ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Course" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
        <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Quiz title" required />
        <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
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
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Deadline</label>
          <div className="flex flex-col gap-1">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={form.deadlineMode === 'Date'}
                onChange={() => handleDeadlineModeChange('Date')}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Date
            </label>
            {form.deadlineMode === 'Date' && (
              <div className="pl-6 pb-1">
                <input
                  type="datetime-local"
                  value={form.date}
                  min={getMinDateTime()}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary-500 focus:ring-primary-500"
                />
                {errors.date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.date}</p>}
              </div>
            )}
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={form.deadlineMode === 'Upcoming Lecture'}
                onChange={() => handleDeadlineModeChange('Upcoming Lecture')}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Due by Upcoming Lecture
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={form.deadlineMode === 'Surprise'}
                onChange={() => handleDeadlineModeChange('Surprise')}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Surprise
            </label>
          </div>
          {errors.deadlineMode && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.deadlineMode}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            options={[
              { value: 'Low', label: 'Low' },
              { value: 'Medium', label: 'Medium' },
              { value: 'High', label: 'High' },
            ]}
          />
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: 'Pending', label: 'Pending' },
              { value: 'Postponed', label: 'Postponed' },
              { value: 'Completed', label: 'Completed' },
            ]}
          />
        </div>
      </form>
    </Modal>
  )
}
