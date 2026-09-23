import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import { Calendar } from 'lucide-react'
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

// Label → value hierarchy: small uppercase metadata label on top,
// stronger/larger value underneath. Never on the same visual level.
function DetailField({ label, children, className = '' }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
      </p>
      <div className="text-[15px] font-medium text-gray-900 dark:text-white">
        {children}
      </div>
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
      <div className="space-y-5">
        {/* Title — prominent by size only; value is never bold */}
        <DetailField label="Title">
          <p className="text-xl font-medium leading-snug text-gray-900 dark:text-white">
            {task.title || '—'}
          </p>
        </DetailField>

        {/* Course — distinct metadata field; value is never bold */}
        <DetailField label="Course">
          <p className="text-[15px] font-medium text-gray-800 dark:text-gray-200">
            {task.subject || '—'}
          </p>
        </DetailField>

        {/* Description — contained section, clearly separated from metadata */}
        <DetailField label="Description">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3.5 py-3">
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {task.description?.trim() ? task.description : '—'}
            </p>
          </div>
        </DetailField>

        {/* Priority Level + Status — balanced two-column layout on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Priority Level">
            <Badge
              color={priorityColor(task.priority)}
              bgColor={priorityBgColor(task.priority)}
              textColor={priorityTextColor(task.priority)}
              className="uppercase tracking-wide"
            >
              {task.priority || '—'}
            </Badge>
          </DetailField>

          <DetailField label="Status">
            <Badge
              color={statusColor(task.status)}
              bgColor={statusBgColor(task.status)}
              textColor={statusTextColor(task.status)}
              className="uppercase tracking-wide"
            >
              {task.status || '—'}
            </Badge>
          </DetailField>
        </div>

        {/* Deadline — separated by a divider so it is easy to scan */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <DetailField label="Deadline">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
                {getDeadlineText(task)}
              </span>
            </div>
          </DetailField>
        </div>
      </div>
    </Modal>
  )
}
