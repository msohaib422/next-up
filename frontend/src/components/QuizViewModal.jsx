import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import DetailField from './ui/DetailField'
import AttachmentField from './ui/AttachmentField'
import ContributorAttribution from './ui/ContributorAttribution'
import { Calendar, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'

// Badge colors mirror the quiz card styling used in QuizzesPage
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
  if (s === 'Postponed') return '#E11D48'
  if (s === 'Possible') return '#FF00FF'
  return undefined
}

const statusTextColor = (s) => {
  if (s === 'Pending') return '#0F172A'
  if (s === 'In Progress') return '#FFFFFF'
  if (s === 'Postponed') return '#FFFFFF'
  return undefined
}

const getDateText = (quiz) => {
  if (quiz.date) {
    const d = parseISO(quiz.date)
    if (!isNaN(d)) {
      // Seeded quizzes store the clock time separately; datetime-created
      // quizzes carry the time inside `date` itself.
      return quiz.time ? format(d, 'MMM d, yyyy') : format(d, 'MMM d, yyyy, h:mm a')
    }
  }
  if (quiz.deadlineMode) return quiz.deadlineMode
  return '—'
}

// Read-only quiz details viewer. Renders plain text/badges only — no
// inputs, forms, or mutation actions. Follows the TaskViewModal pattern.
export default function QuizViewModal({ isOpen, onClose, quiz }) {
  if (!isOpen || !quiz) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quiz Details"
      actions={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-5">
        <ContributorAttribution contributor={quiz.contributor} />
        {/* Title — prominent by size only; value is never bold.
            break-words: long unbroken titles stay inside the modal */}
        <DetailField label="Title">
          <p className="text-[19px] font-medium leading-snug text-gray-900 dark:text-white break-words">
            {quiz.title || '—'}
          </p>
        </DetailField>

        {/* Course — distinct metadata field; value is never bold */}
        <DetailField label="Course">
          <p className="text-[15px] font-medium text-gray-800 dark:text-gray-200 break-words">
            {quiz.subject || '—'}
          </p>
        </DetailField>

        {/* Description — contained section, clearly separated from metadata.
            whitespace-pre-wrap keeps line breaks; break-words safely breaks
            very long continuous text so nothing overflows horizontally. */}
        <DetailField label="Description">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3.5 py-3">
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
              {quiz.description?.trim() ? quiz.description : '—'}
            </p>
          </div>
        </DetailField>

        {/* Priority Level + Status — balanced two-column layout on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Priority Level" labelSize="text-[10px]">
            <Badge
              size="sm"
              color={priorityColor(quiz.priority)}
              bgColor={priorityBgColor(quiz.priority)}
              textColor={priorityTextColor(quiz.priority)}
              className="uppercase tracking-wide"
            >
              {quiz.priority || '—'}
            </Badge>
          </DetailField>

          <DetailField label="Status" labelSize="text-[10px]">
            <Badge
              size="sm"
              color={statusColor(quiz.status)}
              bgColor={statusBgColor(quiz.status)}
              textColor={statusTextColor(quiz.status)}
              className="uppercase tracking-wide"
            >
              {quiz.status || '—'}
            </Badge>
          </DetailField>
        </div>

        {/* Date + Time — same icon + value rhythm, separated by a divider.
            The Date value alone conveys the deadline (e.g. "Surprise"). */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-5">
          <DetailField label="Date">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {getDateText(quiz)}
              </span>
            </div>
          </DetailField>

          <DetailField label="Time">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {quiz.time || '—'}
              </span>
            </div>
          </DetailField>

          <AttachmentField attachment={quiz.attachment} />
        </div>
      </div>
    </Modal>
  )
}
