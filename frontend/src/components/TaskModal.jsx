import { useState, useEffect } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Select from './ui/Select'
import Button from './ui/Button'

export default function TaskModal({ isOpen, onClose, onSave, task }) {
  const [form, setForm] = useState({
    subject: '', title: '', description: '', deadline: '', deadlineMode: null, priority: 'Medium', status: 'Pending'
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (task) {
      const mode = task.deadlineMode || null
      setForm({
        subject: task.subject || '',
        title: task.title || '',
        description: task.description || '',
        deadline: mode === 'Date' && task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : '',
        deadlineMode: mode,
        priority: task.priority || 'Medium',
        status: task.status || 'Pending',
      })
    } else {
      setForm({ subject: '', title: '', description: '', deadline: '', deadlineMode: null, priority: 'Medium', status: 'Pending' })
    }
  }, [task, isOpen])

  const handleDeadlineModeChange = (mode) => {
    setForm(prev => {
      const newMode = prev.deadlineMode === mode ? null : mode
      return {
        ...prev,
        deadlineMode: newMode,
        deadline: newMode === 'Date' ? prev.deadline : '',
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSave(form)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? 'Edit Task' : 'New Task'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>{task ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" />
        <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" required />
        <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Deadline</label>
          <div className="flex flex-col gap-1">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
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
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
            )}
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.deadlineMode === 'Upcoming Lecture'}
                onChange={() => handleDeadlineModeChange('Upcoming Lecture')}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Due by Upcoming Lecture
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.deadlineMode === 'As Possible'}
                onChange={() => handleDeadlineModeChange('As Possible')}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              As Possible
            </label>
          </div>
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
              { value: 'In Progress', label: 'In Progress' },
              { value: 'Completed', label: 'Completed' },
            ]}
          />
        </div>
      </form>
    </Modal>
  )
}
