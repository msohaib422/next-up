import { useState, useEffect, useRef } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Select from './ui/Select'
import Button from './ui/Button'
import { Upload, X, FileText } from 'lucide-react'

const TIMELINE_OPTIONS = [
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Continued till next change', label: 'Continued till next change' },
]

export default function TimetableModal({ isOpen, onClose, onSave, lecture }) {
  const [form, setForm] = useState({
    subject: '', timeline: 'Weekly', notes: '',
  })
  const [attachment, setAttachment] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (lecture) {
      setForm({
        subject: lecture.subject || '',
        timeline: lecture.timeline || 'Weekly',
        notes: lecture.notes || '',
      })
      if (lecture.fileUrl) {
        setAttachmentPreview({ name: lecture.fileName || 'Attachment', url: lecture.fileUrl, type: lecture.fileType })
      } else {
        setAttachmentPreview(null)
      }
    } else {
      setForm({ subject: '', timeline: 'Weekly', notes: '' })
      setAttachmentPreview(null)
    }
    setAttachment(null)
  }, [lecture, isOpen])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachment(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setAttachmentPreview({ name: file.name, url: reader.result, type: file.type.startsWith('image') ? 'image' : 'other' })
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveAttachment = () => {
    setAttachment(null)
    setAttachmentPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = { ...form }
      if (attachmentPreview && !attachment) {
        payload.fileUrl = lecture?.fileUrl || ''
        payload.fileName = lecture?.fileName || ''
        payload.fileType = lecture?.fileType || 'other'
      } else if (attachment) {
        payload.fileUrl = attachmentPreview.url
        payload.fileName = attachment.name
        payload.fileType = attachment.type.startsWith('image') ? 'image' : 'other'
      }
      await onSave(payload)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lecture ? 'Edit Timetable' : 'Add Timetable'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>{lecture ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Timetable" required />
        <Select
          label="Timeline"
          value={form.timeline}
          onChange={(e) => setForm({ ...form, timeline: e.target.value })}
          options={TIMELINE_OPTIONS}
        />
        <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attachment</label>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} className="hidden" />
          {attachmentPreview ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
              {attachmentPreview.type === 'image' ? (
                <img src={attachmentPreview.url} alt="" className="w-12 h-12 rounded object-cover" />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{attachmentPreview.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{attachment ? `${(attachment.size / 1024).toFixed(1)} KB` : 'Existing file'}</p>
              </div>
              <button type="button" onClick={handleRemoveAttachment} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-500 dark:hover:border-primary-500 dark:hover:text-primary-400 transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span className="text-sm">Click to upload image or PDF</span>
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
