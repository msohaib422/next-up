import { useState, useEffect, useRef } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Upload, X, FileText } from 'lucide-react'

export default function TimetableModal({ isOpen, onClose, onSave, lecture }) {
  const [form, setForm] = useState({
    subject: '', timeline: 'Weekly', notes: '',
  })
  const [file, setFile] = useState(null)
  const [attachment, setAttachment] = useState(null)
  const [attachmentPreview, setAttachmentPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (lecture) {
      setForm({
        subject: lecture.subject || '',
        timeline: lecture.timeline || 'Weekly',
        notes: lecture.notes || '',
      })
      if (lecture.fileUrl) {
        setAttachment({ name: lecture.fileName || 'Attachment', url: lecture.fileUrl, publicId: lecture.publicId, resourceType: lecture.resourceType, type: lecture.fileType })
        setAttachmentPreview({ name: lecture.fileName || 'Attachment', url: lecture.fileUrl, type: lecture.fileType })
      } else {
        setAttachment(null)
        setAttachmentPreview(null)
      }
    } else {
      setForm({ subject: '', timeline: 'Weekly', notes: '' })
      setAttachment(null)
      setAttachmentPreview(null)
    }
    setFile(null)
  }, [lecture, isOpen])

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setAttachment(null)
    const reader = new FileReader()
    reader.onloadend = () => {
      setAttachmentPreview({ name: selected.name, url: reader.result, type: selected.type.startsWith('image') ? 'image' : 'other' })
    }
    reader.readAsDataURL(selected)
  }

  const handleRemoveAttachment = () => {
    setFile(null)
    setAttachment(null)
    setAttachmentPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadFile = async () => {
    if (!file) return attachment
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post('/lectures/upload', formData)
    return res.data.data
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      let uploadedAttachment = attachment
      if (file) {
        setUploading(true)
        uploadedAttachment = await uploadFile()
        setUploading(false)
      }
      const payload = { ...form }
      if (uploadedAttachment) {
        payload.fileUrl = uploadedAttachment.url
        payload.fileName = uploadedAttachment.name
        payload.fileType = uploadedAttachment.type?.startsWith('image') ? 'image' : 'other'
        payload.publicId = uploadedAttachment.publicId
        payload.resourceType = uploadedAttachment.resourceType
      } else {
        payload.fileUrl = ''
        payload.fileName = ''
        payload.fileType = 'other'
        payload.publicId = ''
        payload.resourceType = ''
      }
      await onSave(payload)
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
      title={lecture ? 'Edit Timetable' : 'Add Timetable'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading || uploading}>{lecture ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Course" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Timetable" required />
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{file ? `${(file.size / 1024).toFixed(1)} KB` : 'Existing file'}</p>
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
