import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Bell, CheckCheck, Inbox, ArrowRight } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import useMediaQuery from '../../hooks/useMediaQuery'
import { formatCount, getTypeMeta, timeAgo } from './notificationTypes'

const PANEL_WIDTH = 360
const VIEWPORT_PADDING = 12
const MIN_PANEL_HEIGHT = 160
const HOVER_CLOSE_DELAY = 160
// Below lg the bell sits in the compact header, where the panel is a small
// preview: the newest few items plus "View all notifications". The full list,
// and everything fetched or stored, is untouched.
const COMPACT_LAYOUT = '(max-width: 1023px)'
const COMPACT_PREVIEW_COUNT = 4
// Opening on hover only makes sense where hovering exists at all; a touch
// device opens the panel by tapping the bell, as the click handler already does.
const HOVER_CAPABLE = '(hover: hover) and (pointer: fine)'

function PopoverSkeleton() {
  return (
    <div className="space-y-3 px-4 py-4" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex animate-pulse gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-700" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <div className="h-3 w-2/5 rounded bg-gray-100 dark:bg-gray-700" />
            <div className="h-2.5 w-4/5 rounded bg-gray-100 dark:bg-gray-700" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function NotificationBell() {
  const { unreadCount, recent, loading, error, refresh, markAsRead, markAllAsRead } = useNotifications()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const anchorRef = useRef(null)
  const panelRef = useRef(null)
  const closeTimer = useRef(null)
  const canHover = useMediaQuery(HOVER_CAPABLE)
  const isCompact = useMediaQuery(COMPACT_LAYOUT)

  // The compact header shows a preview; the sidebar-era layout keeps showing
  // the full recent list, so neither view hides or adds any notification.
  const visibleRecent = isCompact ? recent.slice(0, COMPACT_PREVIEW_COUNT) : recent

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    if (pinned || !canHover) return
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY)
  }

  // Keep the panel inside the viewport on every screen size.
  // The panel is anchored to the bell's own wrapper (not the viewport): the
  // header sets `backdrop-filter`, which turns it into the containing block
  // for fixed children, so viewport coordinates would be resolved against a
  // header that is offset by the sidebar and only ~60px tall. All values are
  // therefore measured in viewport space, then converted to wrapper space.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const place = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect()
      const anchorRect = anchorRef.current?.getBoundingClientRect()
      if (!triggerRect || !anchorRect) return
      const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2)
      // Open toward the left of the bell, then clamp so both edges stay on screen.
      const left = Math.min(
        Math.max(triggerRect.right - width, VIEWPORT_PADDING),
        Math.max(window.innerWidth - width - VIEWPORT_PADDING, VIEWPORT_PADDING)
      )
      const spaceBelow = window.innerHeight - triggerRect.bottom
      const flipUp = spaceBelow < 360 && triggerRect.top > spaceBelow
      const maxHeight = Math.max(
        (flipUp ? triggerRect.top : spaceBelow) - VIEWPORT_PADDING * 2,
        MIN_PANEL_HEIGHT
      )
      setPosition({
        left: left - anchorRect.left,
        top: flipUp ? undefined : triggerRect.bottom + 8 - anchorRect.top,
        bottom: flipUp ? anchorRect.bottom - (triggerRect.top - 8) : undefined,
        width,
        maxHeight
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      setOpen(false)
      setPinned(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setPinned(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => () => cancelClose(), [])

  const handleMarkAll = async () => {
    try {
      await markAllAsRead()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleSelect = useCallback(
    (notification) => {
      setOpen(false)
      setPinned(false)
      if (!notification.read) markAsRead(notification.id).catch(() => toast.error('Could not mark that notification as read.'))
      if (notification.link) navigate(notification.link)
    },
    [markAsRead, navigate]
  )

  return (
    <div
      ref={anchorRef}
      className="relative"
      onMouseEnter={() => { if (!canHover) return; cancelClose(); if (!pinned) setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          cancelClose()
          // A hover-opened panel is pinned instead of toggled shut, so the
          // first click never closes what the pointer just revealed.
          if (open && !pinned) {
            setPinned(true)
            return
          }
          setPinned((prev) => !prev)
          setOpen((prev) => !prev)
        }}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-[18px] text-white ring-2 ring-white dark:ring-gray-800">
            {formatCount(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          style={position || undefined}
          className={`absolute z-50 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 ${position ? '' : 'right-0 top-[calc(100%+0.5rem)] w-[360px] max-w-[calc(100vw-24px)]'}`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">Notifications</h2>
              {unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                  {formatCount(unreadCount)} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-primary-400 dark:hover:bg-primary-900/30"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <PopoverSkeleton />
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
                <button onClick={() => refresh()} className="mt-2 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                  Try again
                </button>
              </div>
            ) : visibleRecent.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                  <Inbox className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">No notifications yet</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">You&rsquo;re all caught up. New activity will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {visibleRecent.map((notification) => {
                  const meta = getTypeMeta(notification.type)
                  const Icon = meta.icon
                  const actionLabel = notification.link ? notification.metadata?.actionLabel : ''
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(notification)}
                        className={`flex w-full gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 ${
                          notification.read
                            ? 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                            : 'bg-primary-50/50 hover:bg-primary-50 dark:bg-primary-900/10 dark:hover:bg-primary-900/20'
                        }`}
                      >
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.iconClass}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`truncate text-sm ${notification.read ? 'font-medium text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>
                              {notification.title}
                            </span>
                            {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label="Unread" />}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-gray-500 dark:text-gray-400">{notification.message}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                            <span>{timeAgo(notification.createdAt)}</span>
                            {/* Optional per-notification action, rendered from
                                metadata.actionLabel and pointing at the same
                                link the row already navigates to. */}
                            {actionLabel && (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-primary-50 px-1.5 py-0.5 font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                                {actionLabel}
                                <ArrowRight className="h-3 w-3" />
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-200 px-2 py-2 dark:border-gray-700">
            <button
              type="button"
              onClick={() => { setOpen(false); setPinned(false); navigate('/notifications') }}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-primary-400 dark:hover:bg-primary-900/30"
            >
              <ArrowRight className="h-4 w-4" />
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
