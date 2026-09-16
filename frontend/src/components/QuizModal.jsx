import { useState, useEffect } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Select from './ui/Select'
import Button from './ui/Button'

export default function QuizModal({ isOpen, onClose, onSave, quiz }) {
  const [form, setForm] = useState({
    subject: '', title: '', description: '', date: '', deadlineMode: null, priority: 'Medium', status: 'Pending'
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    setErrors({})
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!form.deadlineMode) {
      newErrors.deadlineMode = 'Please select a deadline.'
    } else if (form.deadlineMode === 'Date' && !form.date) {
      newErrors.date = 'Please select a date.'
    }
    if (!form.title?.trim()) {
      newErrors.title = 'Please provide a title.'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      await onSave({ ...form })
    } catch (err) {
      // error handled by parent
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
          <Button onClick={handleSubmit} loading={loading}>{quiz ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Course" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
        <div>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Quiz title" required />
          {errors.title && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title}</p>}
        </div>
        <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
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
