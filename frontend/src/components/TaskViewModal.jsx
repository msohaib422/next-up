import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import { format, parseISO } from 'date-fns'

// Badge colors mirror the task card styling used in TasksPage
const priorityColor = (p) => {
  if (p === 'High') return 'danger'
  return undefined
}

const priorityBgColor = (p) => {
  if (p === 'Medium') return '#F04438'
  if (p === 'Low') return '#EAB308'
  return undefined
}

const priorityTextColor = (p) => {
  if (p === 'Medium') return '#FFFFFF'
  if (p === 'Low') return '#0F172A'
  return undefined
}

const statusColor = (s) => {
  if (s === 'Completed') return 'success'
  return 'neutral'
}

const statusBgColor = (s) => {
  if (s === 'Pending') return '#F59E0B'
  if (s === 'In Progress') return '#800080'
  return undefined
}

const statusTextColor = (s) => {
  if (s === 'Pending') return '#0F172A'
  if (s === 'In Progress') return '#FFFFFF'
  return undefined
}

const getDeadlineText = (task) => {
  if (task.deadline) {
    const d = parseISO(task.deadline)
    if (!isNaN(d)) return format(d, 'MMM d, yyyy, h:mm a')
  }
  if (task.deadlineMode) return task.deadlineMode
  return '—'
}

function DetailField({ label, children }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {children}
    </div>
  )
}

// Read-only task details viewer. Renders plain text/badges only — no
// inputs, forms, or mutation actions.
export default function TaskViewModal({ isOpen, onClose, task }) {
  if (!isOpen || !task) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Task Details"
      actions={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <DetailField label="Title">
          <p className="text-gray-900 dark:text-white">{task.title || '—'}</p>
        </DetailField>

        <DetailField label="Course">
          <p className="text-gray-900 dark:text-white">{task.subject || '—'}</p>
        </DetailField>

        <DetailField label="Description">
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {task.description?.trim() ? task.description : '—'}
          </p>
        </DetailField>

        <div className="grid grid-cols-2 gap-4">
          <DetailField label="Priority Level">
            <Badge
              color={priorityColor(task.priority)}
              bgColor={priorityBgColor(task.priority)}
              textColor={priorityTextColor(task.priority)}
            >
              {task.priority || '—'}
            </Badge>
          </DetailField>

          <DetailField label="Status">
            <Badge
              color={statusColor(task.status)}
              bgColor={statusBgColor(task.status)}
              textColor={statusTextColor(task.status)}
            >
              {task.status || '—'}
            </Badge>
          </DetailField>
        </div>

        <DetailField label="Deadline">
          <p className="text-gray-900 dark:text-white">{getDeadlineText(task)}</p>
        </DetailField>
      </div>
    </Modal>
  )
}
