import { useCallback, useEffect, useState } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Mail, ShieldOff, RotateCcw, Send, Loader2, MailWarning } from 'lucide-react'

/**
 * Admin view of what actually happened to each recipient address.
 *
 * This exists because a plain SMTP conversation cannot tell us that a message
 * was accepted and then bounced: at that point the non-delivery report goes to
 * our own mailbox, not back to the sender. The list makes the recorded state
 * visible so an administrator can put a bad address out of rotation, put it
 * back, or re-send one message by hand.
 *
 * Every button here is a deliberate one-off action. Nothing on this screen
 * schedules anything, and opening the screen sends no email at all - it is a
 * plain read plus the operator's own clicks.
 */

const STATUS_STYLES = {
  Sent: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  Failed: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
}

const formatWhen = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—'

export default function EmailDeliveryPanel({ collapsed, onToggle }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busyEmail, setBusyEmail] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/users/admin/email-deliveries')
      setRows(res.data.data || [])
      setLoaded(true)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load email delivery status')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetched when the panel is first opened, not on mount, so simply visiting the
  // Users page does not add avoidable requests.
  useEffect(() => {
    if (!collapsed && !loaded) load()
  }, [collapsed, loaded, load])

  const act = async (email, path, successFallback) => {
    if (busyEmail) return
    setBusyEmail(email)
    try {
      const res = await api.post(`/users/admin/email-deliveries/${path}`, { email })
      toast.success(res.data.message || successFallback)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'That action could not be completed')
    } finally {
      setBusyEmail('')
    }
  }

  const blocked = rows.filter((r) => r.blocked).length

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email delivery</span>
          {loaded && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {rows.length} address{rows.length === 1 ? '' : 'es'}
              {blocked > 0 && (
                <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {blocked} stopped
                </span>
              )}
            </span>
          )}
        </span>
        {collapsed ? (
          <span className="text-xs text-primary-600 dark:text-primary-400">Show</span>
        ) : (
          <span className="flex items-center gap-2">
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            <span className="text-xs text-gray-500 dark:text-gray-400">Hide</span>
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <p className="flex items-start gap-2 border-b border-gray-100 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Email is only sent when a registration, approval, rejection or deletion happens. Nothing here retries
            automatically - a stopped address stays stopped until you resume it or re-send by hand.
          </p>

          {loading && !loaded ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No email has been sent yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Address</th>
                    <th className="text-center px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last email</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {rows.map((row) => (
                    <tr key={row.email} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100 break-all">{row.email}</div>
                        {row.lastError && (
                          <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">{row.lastError}</div>
                        )}
                        {row.blockedByConfig && (
                          <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                            On the configured do-not-send list
                          </div>
                        )}
                        {row.manualRetryCount > 0 && (
                          <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                            Manually re-sent {row.manualRetryCount} time{row.manualRetryCount === 1 ? '' : 's'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {row.status}
                        </span>
                        {row.blocked && (
                          <span className="mt-1 block text-[11px] text-red-600 dark:text-red-400">
                            {row.suppressionReason || 'stopped'}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">
                          {formatWhen(row.lastAttemptAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        <div className="max-w-[18rem] truncate" title={row.lastSubject || ''}>
                          {row.lastSubject || '—'}
                        </div>
                        {row.failureCount > 0 && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            {row.failureCount} failed attempt{row.failureCount === 1 ? '' : 's'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.blocked ? (
                            <button
                              onClick={() => act(row.email, 'resume', 'Address resumed')}
                              disabled={busyEmail === row.email}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                              title="Allow email to this address again"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Resume
                            </button>
                          ) : (
                            <button
                              onClick={() => act(row.email, 'stop', 'Address stopped')}
                              disabled={busyEmail === row.email}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                              title="Stop emailing this address"
                            >
                              <ShieldOff className="w-3.5 h-3.5" /> Stop
                            </button>
                          )}
                          <button
                            onClick={() => act(row.email, 'resend', 'Email re-sent')}
                            disabled={busyEmail === row.email}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-50"
                            title="Re-send the last email to this address, once"
                          >
                            <Send className="w-3.5 h-3.5" /> Re-send
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
