import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/axios'
import { useAuth } from './AuthContext'

/**
 * Single source of truth for notification state, shared by the header bell,
 * the bell popover and the Notifications page so the unread count can never
 * drift between them.
 *
 * The project has no WebSocket layer yet, so live updates are delivered by a
 * lightweight poll (plus a refresh whenever the tab regains focus). New items
 * are applied through `applyIncoming`, which is the exact entry point a future
 * Socket.IO event should call — no component would need to change.
 */

const POLL_INTERVAL = 30000
const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user, token } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const countRef = useRef(0)

  useEffect(() => { countRef.current = unreadCount }, [unreadCount])

  const loadRecent = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const res = await api.get('/notifications/recent')
      setRecent(res.data.data || [])
      setUnreadCount(res.data.unreadCount || 0)
      setError(null)
    } catch {
      setError('Could not load your notifications.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Clear state on logout / account switch so notifications never leak between users.
  useEffect(() => {
    if (!token || !user) {
      setRecent([])
      setUnreadCount(0)
      setLoading(false)
      return
    }
    loadRecent()
  }, [token, user?._id, loadRecent])

  // Poll the unread count; fetch the preview list only when something is new.
  useEffect(() => {
    if (!token || !user) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await api.get('/notifications/unread-count')
        if (cancelled) return
        const next = res.data.data?.unreadCount || 0
        if (next > countRef.current) await loadRecent({ silent: true })
        else setUnreadCount(next)
      } catch {
        /* keep the last known count; the UI already exposes an error state */
      }
    }
    const timer = setInterval(poll, POLL_INTERVAL)
    const onFocus = () => poll()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [token, user?._id, loadRecent])

  /** Entry point for any new notification (poll diff today, socket event later). */
  const applyIncoming = useCallback((notification) => {
    if (!notification) return
    setRecent((prev) => [notification, ...prev.filter((item) => item.id !== notification.id)].slice(0, 5))
    if (!notification.read) setUnreadCount((prev) => prev + 1)
  }, [])

  // Works for any notification id, including rows on the Notifications page
  // that are older than the five shown in the popover preview.
  const markAsRead = useCallback(async (id) => {
    const inPreview = recent.some((item) => item.id === id)
    // Optimistic: the badge must respond instantly, the API confirms afterwards.
    if (inPreview) {
      setRecent((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)))
      setUnreadCount((prev) => Math.max(prev - 1, 0))
    }
    try {
      const res = await api.patch(`/notifications/${id}/read`, { read: true })
      if (typeof res.data.unreadCount === 'number') setUnreadCount(res.data.unreadCount)
    } catch {
      if (inPreview) {
        setRecent((prev) => prev.map((item) => (item.id === id ? { ...item, read: false } : item)))
        setUnreadCount((prev) => prev + 1)
      }
      throw new Error('Could not mark that notification as read.')
    }
  }, [recent])

  const markAllAsRead = useCallback(async () => {
    if (!unreadCount) return
    const previous = recent
    setRecent((prev) => prev.map((item) => ({ ...item, read: true })))
    setUnreadCount(0)
    try {
      await api.patch('/notifications/read-all')
    } catch {
      setRecent(previous)
      setUnreadCount(previous.filter((item) => !item.read).length)
      throw new Error('Could not mark notifications as read.')
    }
  }, [recent, unreadCount])

  const refresh = useCallback((options) => loadRecent(options || {}), [loadRecent])

  const value = useMemo(
    () => ({ unreadCount, recent, loading, error, refresh, applyIncoming, markAsRead, markAllAsRead }),
    [unreadCount, recent, loading, error, refresh, applyIncoming, markAsRead, markAllAsRead]
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}
