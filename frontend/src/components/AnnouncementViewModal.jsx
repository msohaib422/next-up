import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import DetailField from './ui/DetailField'
import AttachmentField from './ui/AttachmentField'
import { Calendar, User, ExternalLink } from 'lucide-react'
import { format, parseISO } from 'date-fns'

// Badge colors mirror the announcement card styling used in AnnouncementsPage
const TYPE_BG_COLOR = {
  General: '#7E22CE',
  Academic: '#0D9488',
  Assignment: '#EA580C',
  Quiz: '#BE123C',
  Task: '#CA8A04',
  Exam: '#DC2626',
  Event: '#DB2777',
}

const TYPE_TEXT_COLOR = {
  General: '#FFFFFF',
  Academic: '#FFFFFF',
  Assignment: '#FFFFFF',
  Quiz: '#FFFFFF',
  Task: '#0F172A',
  Exam: '#FFFFFF',
  Event: '#FFFFFF',
}

const getDateText = (announcement) => {
  if (!announcement.date) return '—'
  const d = parseISO(announcement.date)
  if (isNaN(d)) return '—'
  return format(d, 'MMM d, yyyy')
}

// Read-only announcement details viewer. Renders plain text/badges only — no
// inputs, forms, or mutation actions. Follows the TaskViewModal pattern.
export default function AnnouncementViewModal({ isOpen, onClose, announcement }) {
  if (!isOpen || !announcement) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Announcement Details"
      actions={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-5">
        {/* Title — prominent by size only; value is never bold */}
        <DetailField label="Title">
          <p className="text-[19px] font-medium leading-snug text-gray-900 dark:text-white">
            {announcement.title || '—'}
          </p>
        </DetailField>

        {/* Type + Date — balanced two-column layout on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailField label="Type" labelSize="text-[10px]">
            <Badge
              bgColor={TYPE_BG_COLOR[announcement.type]}
              textColor={TYPE_TEXT_COLOR[announcement.type]}
              className="uppercase tracking-wide"
            >
              {announcement.type || '—'}
            </Badge>
          </DetailField>

          <DetailField label="Date">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {getDateText(announcement)}
              </span>
            </div>
          </DetailField>
        </div>

        {/* Description — contained section, clearly separated from metadata */}
        <DetailField label="Description">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3.5 py-3">
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {announcement.description?.trim() ? announcement.description : '—'}
            </p>
          </div>
        </DetailField>

        {/* Pinned / Expired state — shown only when set, like the card groups */}
        {(announcement.pinned || announcement.expired) && (
          <DetailField label="Status" labelSize="text-[10px]">
            <div className="flex items-center gap-2">
              {announcement.pinned && (
                <Badge color="info" className="uppercase tracking-wide">Pinned</Badge>
              )}
              {announcement.expired && (
                <Badge color="danger" className="uppercase tracking-wide">Expired</Badge>
              )}
            </div>
          </DetailField>
        )}

        {/* Link + Posted by + File — separated by a divider for easy scanning */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-5">
          <DetailField label="Link">
            {announcement.link ? (
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                <button
                  type="button"
                  onClick={() => window.open(announcement.link, '_blank', 'noopener,noreferrer')}
                  className="min-w-0 flex-1 flex items-center text-left text-[14px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  title={announcement.link}
                >
                  <span className="truncate">{announcement.link}</span>
                </button>
              </div>
            ) : (
              <span className="text-[14px] text-gray-500 dark:text-gray-400">—</span>
            )}
          </DetailField>

          <DetailField label="Posted by">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="text-[14px] font-semibold text-gray-900 dark:text-white">
                {announcement.createdBy || '—'}
              </span>
            </div>
          </DetailField>

          <AttachmentField attachment={announcement.attachment} />
        </div>
      </div>
    </Modal>
  )
}
