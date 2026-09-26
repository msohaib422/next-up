import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { BellOff, CheckCheck, ChevronRight, Inbox, MailOpen } from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { useNotifications } from '../hooks/useNotifications'
import { formatDateTime, getTypeMeta, NOTIFICATION_FILTERS, timeAgo } from '../components/notifications/notificationTypes'

const PAGE_SIZE = 20

const emptyCopy = {
  all: { icon: Inbox, title: 'No notifications yet', description: 'You’re all caught up. New activity will appear here.' },
  unread: { icon: BellOff, title: 'You’re all caught up', description: 'You have no unread notifications right now.' },
  read: { icon: MailOpen, title: 'No read notifications', description: 'Notifications you open will be listed here.' },
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex animate-pulse gap-4 px-5 py-4">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-100 dark:bg-gray-700" />
          <div className="min-w-0 flex-1 space-y-2 py-1">
            <div className="h-3.5 w-1/3 rounded bg-gray-100 dark:bg-gray-700" />
            <div className="h-3 w-4/5 rounded bg-gray-100 dark:bg-gray-700" />
            <div className="h-2.5 w-24 rounded bg-gray-100 dark:bg-gray-700" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function NotificationsPage() {
  const { unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(
    async ({ nextPage = 1, append = false } = {}) => {
      append ? setLoadingMore(true) : setLoading(true)
      try {
        const res = await api.get('/notifications', { params: { filter, page: nextPage, limit: PAGE_SIZE } })
        const data = res.data.data || []
        setItems((prev) => (append ? [...prev, ...data] : data))
        setHasMore(Boolean(res.data.pagination?.hasMore))
        setPage(nextPage)
        setError(null)
      } catch {
        setError('We could not load your notifications. Please try again.')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [filter]
  )

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const handleMarkAll = async () => {
    if (markingAll) return
    setMarkingAll(true)
    try {
      await markAllAsRead()
      setItems((prev) => prev.map((item) => ({ ...item, read: true })))
      toast.success('All notifications marked as read.')
    } catch (err) {
      toast.error(err.message || 'Could not mark notifications as read.')
    } finally {
      setMarkingAll(false)
    }
  }

  const handleToggleRead = async (event, notification) => {
    event.stopPropagation()
    try {
      await api.patch(`/notifications/${notification.id}/read`, { read: !notification.read })
      setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: !notification.read } : item)))
      refresh({ silent: true })
    } catch {
      toast.error('Could not update that notification.')
    }
  }

  const handleOpen = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id).catch(() => toast.error('Could not mark that notification as read.'))
      setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item)))
    }
    if (notification.link) navigate(notification.link)
  }

  const copy = emptyCopy[filter]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section aria-labelledby="notifications-heading" className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 id="notifications-heading" className="text-2xl font-semibold text-gray-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Stay updated with recent activity and changes.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleMarkAll} loading={markingAll} disabled={unreadCount === 0}>
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </Button>
      </section>

      <section aria-label="Notification filters" className="flex flex-wrap items-center gap-2" role="tablist">
        {NOTIFICATION_FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? 'primary' : 'secondary'}
            onClick={() => setFilter(option.value)}
            aria-selected={filter === option.value}
            role="tab"
          >
            {option.label}
            {option.value === 'unread' && unreadCount > 0 && <span className="ml-1 rounded-full bg-primary-600/10 px-1.5 text-xs dark:bg-white/10">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </Button>
        ))}
      </section>

      <Card className="overflow-hidden">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => fetchNotifications()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={copy.icon} title={copy.title} description={copy.description} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((notification) => {
              const meta = getTypeMeta(notification.type)
              const Icon = meta.icon
              return (
                <li
                  key={notification.id}
                  className={`group flex items-start gap-4 px-4 py-4 transition-colors sm:px-5 ${
                    notification.read ? 'hover:bg-gray-50 dark:hover:bg-gray-700/40' : 'bg-primary-50/40 hover:bg-primary-50/70 dark:bg-primary-900/10 dark:hover:bg-primary-900/20'
                  }`}
                >
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={`text-sm ${notification.read ? 'font-medium text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>
                        {notification.title}
                      </h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {meta.label}
                      </span>
                      {!notification.read && <span className="h-2 w-2 rounded-full bg-primary-600" aria-label="Unread" />}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">{notification.message}</p>
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500" title={formatDateTime(notification.createdAt)}>
                      {timeAgo(notification.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 self-center">
                    <button
                      type="button"
                      onClick={(event) => handleToggleRead(event, notification)}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 opacity-0 transition-opacity hover:bg-gray-100 hover:text-primary-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-700 group-hover:opacity-100 dark:hover:text-primary-400"
                    >
                      {notification.read ? 'Mark unread' : 'Mark read'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpen(notification)}
                      disabled={!notification.link}
                      aria-label={notification.link ? `Open ${notification.title}` : notification.title}
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-default disabled:opacity-40 dark:hover:bg-gray-700 dark:hover:text-primary-400"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => fetchNotifications({ nextPage: page + 1, append: true })} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
