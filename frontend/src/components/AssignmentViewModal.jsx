import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import DetailField from './ui/DetailField'
import AttachmentField from './ui/AttachmentField'
import ContributorAttribution from './ui/ContributorAttribution'
import { Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'

// Badge colors mirror the assignment card styling used in AssignmentsPage
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

const getDeadlineText = (assignment) => {
  if (assignment.deadline) {
    const d = parseISO(assignment.deadline)
    if (!isNaN(d)) return format(d, 'MMM d, yyyy, h:mm a')
  }
  if (assignment.deadlineMode) return assignment.deadlineMode
  return '—'
}

// Read-only assignment details viewer. Renders plain text/badges only — no
// inputs, forms, or mutation actions. Follows the TaskViewModal pattern.
export default function AssignmentViewModal({ isOpen, onClose, assignment }) {
  if (!isOpen || !assignment) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assignment Details"
      actions={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-5">
        <ContributorAttribution contributor={assignment.contributor} />
        {/* Title — prominent by size only; value is never bold */}
        <DetailField label="Title">
          <p className="text-[19px] font-medium leading-snug text-gray-900 dark:text-white">
            {assignment.title || '—'}
          </p>
        </DetailField>

        {/* Course — distinct metadata field; value is never bold */}
        <DetailField label="Course">
          <p className="text-[15px] font-medium text-gray-800 dark:text-gray-200">
            {assignment.subject || '—'}
          </p>
        </DetailField>

        {/* Description — contained section, clearly separated from metadata */}
        <DetailField label="Description">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3.5 py-3">
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {assignment.description?.trim() ? assignment.description : '—'}
            </p>
          </div>
        </DetailField>

        {/* Priority Level + Status — balanced two-column layout on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Priority Level" labelSize="text-[10px]">
            <Badge
              size="sm"
              color={priorityColor(assignment.priority)}
              bgColor={priorityBgColor(assignment.priority)}
              textColor={priorityTextColor(assignment.priority)}
              className="uppercase tracking-wide"
            >
              {assignment.priority || '—'}
            </Badge>
          </DetailField>

          <DetailField label="Status" labelSize="text-[10px]">
            <Badge
              size="sm"
              color={statusColor(assignment.status)}
              bgColor={statusBgColor(assignment.status)}
              textColor={statusTextColor(assignment.status)}
              className="uppercase tracking-wide"
            >
              {assignment.status || '—'}
            </Badge>
          </DetailField>
        </div>

        {/* Deadline + File — separated by a divider so they are easy to scan */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-5">
          <DetailField label="Deadline">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {getDeadlineText(assignment)}
              </span>
            </div>
          </DetailField>

          <AttachmentField attachment={assignment.attachment} />
        </div>
      </div>
    </Modal>
  )
}
