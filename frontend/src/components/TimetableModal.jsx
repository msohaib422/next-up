import { useState, useEffect } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import FileUploadField from './ui/FileUploadField'
import api from '../api/axios'
import toast from 'react-hot-toast'

export default function TimetableModal({ isOpen, onClose, onSave, lecture }) {
  const [form, setForm] = useState({
    subject: '', timeline: 'Weekly', notes: '',
  })
  const [file, setFile] = useState(null)
  const [attachment, setAttachment] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (lecture) {
      setForm({
        subject: lecture.subject || '',
        timeline: lecture.timeline || 'Weekly',
        notes: lecture.notes || '',
      })
      if (lecture.fileUrl) {
        setAttachment({ name: lecture.fileName || 'Attachment', url: lecture.fileUrl, publicId: lecture.publicId, resourceType: lecture.resourceType, type: lecture.fileType })
      } else {
        setAttachment(null)
      }
    } else {
      setForm({ subject: '', timeline: 'Weekly', notes: '' })
      setAttachment(null)
    }
    setFile(null)
  }, [lecture, isOpen])

  const handleFileSelect = (selected) => {
    setFile(selected)
    setAttachment(null)
  }

  const handleRemoveAttachment = () => {
    setFile(null)
    setAttachment(null)
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

        <FileUploadField
          file={file}
          attachment={attachment}
          onSelect={handleFileSelect}
          onRemove={handleRemoveAttachment}
          id="timetable-attachment"
        />
      </form>
    </Modal>
  )
}
