import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, Users, Pencil, Trash2, Search, Check, X, Clock, RotateCcw } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import UserModal from '../components/UserModal'

// Accounts created before the approval workflow have no status field; they are
// approved accounts and must keep behaving exactly as before.
const statusOf = (user) => user.status || 'Approved'

const STATUS_STYLES = {
  'Pending Approval': 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  Approved: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300',
  Rejected: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
}

const PENDING_RANK = { 'Pending Approval': 0, Approved: 1, Rejected: 2 }

// Mirrors the server sort: within a status the most recently submitted
// application first. A re-application restamps lastApplicationAt, so it is
// treated as newer than a plain signup that has waited longer.
const appliedAt = (user) => new Date(user.lastApplicationAt || user.createdAt || 0)

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

export default function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  // review state: { user, action: 'approve' | 'reject' }
  const [review, setReview] = useState(null)
  const [reviewReason, setReviewReason] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  // Delete is a one-shot action: a double click must not fire two requests.
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const highlightedId = searchParams.get('highlight')
  const rowRefs = useRef({})

  useEffect(() => { fetchUsers() }, [])

  // The admin notification links here with ?highlight=<id>, so bring that
  // registration into view and clear the marker once it is on screen.
  useEffect(() => {
    if (!highlightedId) return
    const row = rowRefs.current[highlightedId]
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      next.delete('highlight')
      setSearchParams(next, { replace: true })
    }, 4000)
    return () => clearTimeout(timer)
  }, [highlightedId, searchParams, setSearchParams])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()

    const matched = !query
      ? users
      : users.filter((user) => {
        const searchableText = `${user.name || ''} ${user.email || ''}`.toLowerCase()
        return searchableText.includes(query)
      })

    // Pending registrations first, then most recently submitted.
    return [...matched].sort(
      (a, b) =>
        (PENDING_RANK[statusOf(a)] ?? 3) - (PENDING_RANK[statusOf(b)] ?? 3) ||
        appliedAt(b) - appliedAt(a)
    )
  }, [search, users])

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users/admin/users')
      const list = res.data.data || []
      setUsers(list)
      setPendingCount(list.filter((u) => statusOf(u) === 'Pending Approval').length)
    } catch (err) {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (userData) => {
    try {
      if (editingUser) {
        await api.put(`/users/admin/users/${editingUser._id}`, userData)
        toast.success('User updated successfully')
      } else {
        await api.post('/users/admin/users', userData)
        toast.success('User created successfully')
      }
      setShowModal(false)
      setEditingUser(null)
      fetchUsers()
    } catch (err) {
      const msg = err.response?.data?.message || 'Operation failed'
      toast.error(msg)
      throw err
    }
  }

  const handleDelete = async (id) => {
    if (deletingId) return
    setDeletingId(id)
    setDeleteError('')
    try {
      const res = await api.delete(`/users/admin/users/${id}`)
      toast.success(res.data.message || 'User deleted successfully')
      setUsers(prev => prev.filter(u => u._id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete user'
      setDeleteError(msg)
      toast.error(msg)
    } finally {
      setDeletingId(null)
    }
  }

  const openDelete = (user) => {
    setDeleteError('')
    setDeleteConfirm(user)
  }

  const openReview = (user, action) => {
    setReview({ user, action })
    setReviewReason('')
  }

  const closeReview = () => {
    if (reviewSubmitting) return
    setReview(null)
    setReviewReason('')
  }

  const confirmReview = async () => {
    if (!review) return
    setReviewSubmitting(true)
    const { user, action } = review
    try {
      const res = action === 'approve'
        ? await api.put(`/users/admin/users/${user._id}/approve`)
        : await api.put(`/users/admin/users/${user._id}/reject`, { reason: reviewReason.trim() })

      const updated = res.data.data
      // Reflect the decision in the table straight away, no refetch needed.
      setUsers((prev) =>
        prev.map((u) =>
          u._id === updated._id
            ? { ...u, status: updated.status, rejectionReason: updated.rejectionReason ?? '' }
            : u
        )
      )
      if (updated.status === 'Approved') {
        setPendingCount((n) => Math.max(0, n - 1))
      } else if (updated.status === 'Rejected') {
        setPendingCount((n) => Math.max(0, n - 1))
      }
      toast.success(res.data.message || `Registration ${action === 'approve' ? 'approved' : 'rejected'}.`)
      setReview(null)
      setReviewReason('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update this registration')
    } finally {
      setReviewSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
          {pendingCount > 0 && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
              <Clock className="w-4 h-4" />
              {pendingCount} registration{pendingCount === 1 ? '' : 's'} awaiting approval
            </p>
          )}
        </div>
        <Button onClick={() => { setEditingUser(null); setShowModal(true) }}>
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </div>

      <div className="w-full sm:max-w-md">
        <Input
          icon={Search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name or email..."
          aria-label="Search users by name or email"
        />
      </div>

      {filteredUsers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <EmptyState
            icon={Users}
            title="No users found"
            description={search.trim() ? 'No users match your search criteria.' : 'There are no regular users in the system yet.'}
            action={!search.trim() ? (
              <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add User</Button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Registered</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.map((user) => {
                  const status = statusOf(user)
                  const isPending = status === 'Pending Approval'
                  const isReapplication = isPending && Boolean(user.lastApplicationAt)
                  const isHighlighted = user._id === highlightedId
                  return (
                  <tr
                    key={user._id}
                    ref={(node) => { rowRefs.current[user._id] = node }}
                    className={`transition-colors ${
                      isHighlighted
                        ? 'bg-primary-50 ring-2 ring-inset ring-primary-500 dark:bg-primary-900/20'
                        : isPending
                          ? 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{user.name}</span>
                        {isReapplication && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                            title="This applicant was previously rejected and has submitted a new application"
                          >
                            <RotateCcw className="h-3 w-3" /> Re-applied
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.Approved}`}>
                        {status}
                      </span>
                      {status === 'Rejected' && user.rejectionReason && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-[16rem] mx-auto">{user.rejectionReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isPending && (
                          <>
                            <button
                              onClick={() => openReview(user, 'approve')}
                              disabled={reviewSubmitting}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Approve registration"
                            >
                              <Check className="w-4 h-4" /> Approve
                            </button>
                            <button
                              onClick={() => openReview(user, 'reject')}
                              disabled={reviewSubmitting}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Reject registration"
                            >
                              <X className="w-4 h-4" /> Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { setEditingUser(user); setShowModal(true) }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 dark:hover:text-primary-400 transition-colors"
                          title="Edit user"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDelete(user)}
                          disabled={Boolean(deletingId)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UserModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingUser(null) }}
        onSave={handleSave}
        user={editingUser}
      />

      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {review.action === 'approve' ? 'Approve registration' : 'Reject registration'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              {review.action === 'approve' ? (
                <>
                  Approve <span className="font-medium text-gray-900 dark:text-gray-100">{review.user.name}</span>?
                  They will be able to sign in and use the system immediately, and will be notified by email.
                </>
              ) : (
                <>
                  Reject <span className="font-medium text-gray-900 dark:text-gray-100">{review.user.name}</span>?
                  They will not be able to access the system, and will be notified by email. The registration
                  record is kept so this decision remains on record, and they will be able to submit a new
                  application later with the same email address.
                </>
              )}
            </p>

            {review.action === 'reject' && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Reason <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Let the applicant know why their registration was not approved..."
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-400 text-right">{reviewReason.length}/500</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeReview} disabled={reviewSubmitting}>Cancel</Button>
              <Button
                variant={review.action === 'approve' ? 'primary' : 'danger'}
                onClick={confirmReview}
                loading={reviewSubmitting}
              >
                {review.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete User</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Are you sure you want to delete <span className="font-medium text-gray-900 dark:text-gray-100">{deleteConfirm.name}</span>? This action cannot be undone.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              They will no longer be able to sign in, and an email will be sent to{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100 break-all">{deleteConfirm.email}</span>{' '}
              letting them know their account has been removed.
            </p>
            {deleteError && (
              <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)} disabled={Boolean(deletingId)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteConfirm._id)} loading={deletingId === deleteConfirm._id}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
