import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import ContributorAttribution from './ui/ContributorAttribution'
import { Calendar, Paperclip, Download } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

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

const handleAttachmentOpen = (attachment) => {
  if (!attachment?.url) return
  window.open(attachment.url, '_blank', 'noopener,noreferrer')
}

const handleDownload = async (attachment) => {
  if (!attachment?.url) return
  try {
    const response = await fetch(attachment.url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = attachment.name || 'attachment'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(blobUrl)
  } catch {
    toast.error('Failed to download attachment')
  }
}

// Label → value hierarchy: small uppercase metadata label on top,
// stronger/larger value underneath. Never on the same visual level.
function DetailField({ label, children, className = '', labelSize = 'text-[11px]' }) {
  return (
    <div className={className}>
      <p className={`${labelSize} font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-1.5`}>
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
        <ContributorAttribution contributor={task.contributor} />
        {/* Title — prominent by size only; value is never bold */}
        <DetailField label="Title">
          <p className="text-[19px] font-medium leading-snug text-gray-900 dark:text-white">
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
          <DetailField label="Priority Level" labelSize="text-[10px]">
            <Badge
              size="sm"
              color={priorityColor(task.priority)}
              bgColor={priorityBgColor(task.priority)}
              textColor={priorityTextColor(task.priority)}
              className="uppercase tracking-wide"
            >
              {task.priority || '—'}
            </Badge>
          </DetailField>

          <DetailField label="Status" labelSize="text-[10px]">
            <Badge
              size="sm"
              color={statusColor(task.status)}
              bgColor={statusBgColor(task.status)}
              textColor={statusTextColor(task.status)}
              className="uppercase tracking-wide"
            >
              {task.status || '—'}
            </Badge>
          </DetailField>
        </div>

        {/* Deadline + File — separated by a divider so they are easy to scan */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-5">
          <DetailField label="Deadline">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {getDeadlineText(task)}
              </span>
            </div>
          </DetailField>

          {/* File — same icon + value rhythm as Deadline so alignment matches */}
          <DetailField label="File">
            {task.attachment?.name ? (
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                <button
                  type="button"
                  onClick={() => handleAttachmentOpen(task.attachment)}
                  className="min-w-0 flex-1 flex items-center text-left text-[14px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  title={task.attachment.name}
                >
                  <span className="truncate">{task.attachment.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(task.attachment)}
                  className="shrink-0 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                  aria-label="Download attachment"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <span className="text-[14px] text-gray-500 dark:text-gray-400">—</span>
            )}
          </DetailField>
        </div>
      </div>
    </Modal>
  )
}
