import {
  Inbox, CheckCircle2, XCircle, Send, Megaphone, PencilLine, Trash2, Bell, PlusCircle, RotateCcw,
} from 'lucide-react'

/**
 * Single source of truth for notification presentation on the client.
 * Mirrors NOTIFICATION_TYPES in backend/models/Notification.js.
 */
export const NOTIFICATION_TYPES = {
  CONTRIBUTION_SUBMITTED: {
    label: 'New Contribution',
    icon: Send,
    iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
  },
  CONTRIBUTION_PUBLISHED: {
    label: 'Published',
    icon: CheckCircle2,
    iconClass: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300',
  },
  CONTRIBUTION_APPROVED: {
    label: 'Approved',
    icon: CheckCircle2,
    iconClass: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300',
  },
  CONTRIBUTION_REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    iconClass: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300',
  },
  CONTRIBUTION_UPDATED: {
    label: 'Updated',
    icon: PencilLine,
    iconClass: 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300',
  },
  CONTRIBUTION_DELETED: {
    label: 'Removed',
    icon: Trash2,
    iconClass: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  },
  CONTENT_ADDED: {
    label: 'Added',
    icon: PlusCircle,
    iconClass: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300',
  },
  CONTENT_UPDATED: {
    label: 'Updated',
    icon: PencilLine,
    iconClass: 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300',
  },
  CONTENT_COMPLETED: {
    label: 'Completed',
    icon: CheckCircle2,
    iconClass: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300',
  },
  CONTENT_REOPENED: {
    label: 'Incomplete',
    icon: RotateCcw,
    iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
  },
}

const FALLBACK = {
  label: 'Notification',
  icon: Bell,
  iconClass: 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300',
}

export const NOTIFICATION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
]

export const getTypeMeta = (type) => NOTIFICATION_TYPES[type] || FALLBACK

/** 99+ style compact badge for the header bell. */
export const formatCount = (count) => (count > 99 ? '99+' : String(count))

/** "Just now" / "5 min ago" / "Yesterday" / "12 Mar 2025" */
export const timeAgo = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 0) return 'Just now'
  if (seconds < 45) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24 && new Date().getDate() === date.getDate()) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
