import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import DetailField from './ui/DetailField'
import AttachmentField from './ui/AttachmentField'
import { Calendar, User } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const getDateText = (essential) => {
  if (!essential.date) return '—'
  const d = parseISO(essential.date)
  if (isNaN(d)) return '—'
  return format(d, 'MMM d, yyyy')
}

// Read-only essential details viewer. Renders plain text/badges only — no
// inputs, forms, or mutation actions. Follows the TaskViewModal pattern.
export default function EssentialViewModal({ isOpen, onClose, essential }) {
  if (!isOpen || !essential) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Essential Details"
      actions={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-5">
        {/* Title — prominent by size only; value is never bold */}
        <DetailField label="Title">
          <p className="text-[19px] font-medium leading-snug text-gray-900 dark:text-white">
            {essential.title || '—'}
          </p>
        </DetailField>

        {/* Course — distinct metadata field; value is never bold */}
        <DetailField label="Course">
          <p className="text-[15px] font-medium text-gray-800 dark:text-gray-200">
            {essential.course || '—'}
          </p>
        </DetailField>

        {/* Description — contained section, clearly separated from metadata */}
        <DetailField label="Description">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3.5 py-3">
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {essential.description?.trim() ? essential.description : '—'}
            </p>
          </div>
        </DetailField>

        {/* Tag + Date — balanced two-column layout on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Tag" labelSize="text-[10px]">
            {/* Badge styling mirrors the essential card tag badge */}
            <Badge
              size="sm"
              className="uppercase tracking-wide !bg-purple-100 dark:!bg-purple-900/60 !text-purple-700 dark:!text-purple-300"
            >
              {essential.tag || 'Topic'}
            </Badge>
          </DetailField>

          <DetailField label="Date">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {getDateText(essential)}
              </span>
            </div>
          </DetailField>
        </div>

        {/* Posted by + File — separated by a divider so they are easy to scan */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-5">
          <DetailField label="Posted by">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {essential.createdBy || '—'}
              </span>
            </div>
          </DetailField>

          <AttachmentField attachment={essential.attachment} />
        </div>
      </div>
    </Modal>
  )
}
