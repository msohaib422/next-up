import { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  Eye,
  ExternalLink,
  FileCheck,
  HelpCircle,
  Inbox,
  Layers,
  BookOpen,
  Megaphone,
  Search,
  User,
  XCircle,
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import AttachmentField from '../components/ui/AttachmentField'

const statusColor = { Pending: 'warning', Approved: 'success', Rejected: 'danger' }
const TYPES = ['Task', 'Quiz', 'Assignment', 'Essential', 'Announcement']
const typeIcon = { Task: CheckSquare, Quiz: HelpCircle, Assignment: FileCheck, Essential: BookOpen, Announcement: Megaphone }

const formatDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const formatDateTime = (value) => value ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <Card className="flex min-h-[112px] items-center gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value || 0}</p></div>
    </Card>
  )
}

function ReviewModal({ item, onClose, onDone, initialReject = false }) {
  const [busy, setBusy] = useState('')
  const [showReject, setShowReject] = useState(initialReject)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  if (!item) return null

  const content = item.content || {}
  const dated = ['Task', 'Quiz', 'Assignment'].includes(item.type)
  const dateValue = content.deadline || content.date

  const approve = async () => {
    if (busy) return
    setBusy('approve')
    try {
      await api.post(`/admin/contributions/${item._id}/approve`)
      toast.success('Contribution approved and published.')
      onDone()
      onClose()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not approve the contribution.')
    } finally {
      setBusy('')
    }
  }

  const reject = async () => {
    if (!reason.trim()) {
      setReasonError('A rejection reason is required.')
      return
    }
    if (busy) return
    setBusy('reject')
    try {
      await api.post(`/admin/contributions/${item._id}/reject`, { rejectionReason: reason.trim() })
      toast.success('Contribution rejected.')
      onDone()
      onClose()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not reject the contribution.')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <Modal
        isOpen={!showReject}
        onClose={onClose}
        title="Review contribution"
        actions={<>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {item.status === 'Pending' && <>
            <Button variant="danger" onClick={() => setShowReject(true)} disabled={Boolean(busy)}><XCircle className="h-4 w-4" />Reject</Button>
            <Button onClick={approve} loading={busy === 'approve'} disabled={Boolean(busy)}><CheckCircle2 className="h-4 w-4" />Approve & publish</Button>
          </>}
        </>}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-gray-500 dark:text-gray-400">Contributor</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{item.user?.name || 'Unknown contributor'}{item.user?.email && <span className="block font-normal text-gray-500 dark:text-gray-400">{item.user.email}</span>}</p></div>
            <div><p className="text-gray-500 dark:text-gray-400">Status</p><div className="mt-1"><Badge color={statusColor[item.status]}>{item.status}</Badge></div></div>
            <div><p className="text-gray-500 dark:text-gray-400">Type</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{item.type}</p></div>
            <div><p className="text-gray-500 dark:text-gray-400">Submitted</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{formatDateTime(item.submittedAt || item.createdAt)}</p></div>
            {item.status !== 'Pending' && <div><p className="text-gray-500 dark:text-gray-400">Reviewed</p><p className="mt-1 font-medium text-gray-900 dark:text-white">{item.reviewedBy?.name ? `${item.reviewedBy.name} · ${formatDateTime(item.reviewedAt)}` : formatDateTime(item.reviewedAt)}</p></div>}
          </div>

          <div className="border-t border-gray-200 pt-5 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{item.title || content.title || 'Untitled contribution'}</h3>
            <div className="mt-4 space-y-4 text-sm">
              {(content.subject || content.course) && <div><p className="font-medium text-gray-700 dark:text-gray-300">Course / Subject</p><p className="mt-1 text-gray-600 dark:text-gray-400">{content.subject || content.course}</p></div>}
              <div><p className="font-medium text-gray-700 dark:text-gray-300">Description</p><p className="mt-1 whitespace-pre-wrap leading-relaxed text-gray-600 dark:text-gray-400">{content.description?.trim() || 'No description provided.'}</p></div>
              {dated && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><p className="font-medium text-gray-700 dark:text-gray-300">Deadline</p><p className="mt-1 text-gray-600 dark:text-gray-400">{dateValue ? formatDateTime(dateValue) : content.deadlineMode || '—'}</p></div><div><p className="font-medium text-gray-700 dark:text-gray-300">Priority</p><p className="mt-1 text-gray-600 dark:text-gray-400">{content.priority || '—'}</p></div></div>}
              {item.type === 'Announcement' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><p className="font-medium text-gray-700 dark:text-gray-300">Announcement type</p><p className="mt-1 text-gray-600 dark:text-gray-400">{content.type || '—'}</p></div><div><p className="font-medium text-gray-700 dark:text-gray-300">Date</p><p className="mt-1 text-gray-600 dark:text-gray-400">{formatDateTime(content.date)}</p></div></div>}
              {content.link && <div><p className="font-medium text-gray-700 dark:text-gray-300">Link</p><a href={content.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400">{content.link}<ExternalLink className="h-3.5 w-3.5" /></a></div>}
            </div>
            {content.attachment && <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700"><AttachmentField attachment={content.attachment} /></div>}
          </div>

          {item.rejectionReason && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"><strong>Rejection reason:</strong> {item.rejectionReason}</div>}
        </div>
      </Modal>

      <Modal
        isOpen={showReject}
        onClose={() => setShowReject(false)}
        title="Reject contribution"
        actions={<><Button variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button><Button variant="danger" onClick={reject} loading={busy === 'reject'}><XCircle className="h-4 w-4" />Reject contribution</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"><AlertCircle className="mr-2 inline h-4 w-4" />This contribution will not be published. The contributor will see your reason.</div>
          <div><label htmlFor="rejection-reason" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Rejection reason</label><textarea id="rejection-reason" rows="4" value={reason} onChange={(e) => { setReason(e.target.value); setReasonError('') }} placeholder="Explain why this contribution cannot be published" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />{reasonError && <p className="mt-1 text-sm text-red-500">{reasonError}</p>}</div>
        </div>
      </Modal>
    </>
  )
}

export default function ApprovalsPage() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState({ total: 0, Pending: 0, Approved: 0, Rejected: 0 })
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [review, setReview] = useState(null)

  const load = async () => {
    try {
      const response = await api.get('/admin/contributions')
      setItems(response.data.data || [])
      setStats(response.data.stats || {})
    } catch {
      toast.error('Could not load contributions. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const [processingId, setProcessingId] = useState(null)

  const filtered = useMemo(() => items.filter((item) => {
    const matchesStatus = status === 'all' || item.status === status
    const matchesType = type === 'all' || item.type === type
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${item.title} ${item.user?.name || ''} ${item.user?.email || ''}`.toLowerCase().includes(query)
    return matchesStatus && matchesType && matchesSearch
  }), [items, status, type, search])

  const approveContribution = async (item) => {
    if (processingId) return
    setProcessingId(item._id)
    try {
      await api.post(`/admin/contributions/${item._id}/approve`)
      toast.success('Contribution approved and published.')
      await load()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not approve the contribution.')
    } finally {
      setProcessingId(null)
    }
  }

  const openReview = (item, action = 'view') => setReview({ item, action })

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Approvals</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">Review user contributions submitted through UniProductive and decide what gets published for the community.</p>
      </section>

      <section aria-labelledby="approval-summary-heading">
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end"><div><h2 id="approval-summary-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Contribution overview</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">A live view of all community submissions.</p></div><span className="text-sm text-gray-400">Updates after each review</span></div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total contributions" value={stats.total} icon={Layers} tone="bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300" /><StatCard label="Pending review" value={stats.Pending} icon={Clock} tone="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300" /><StatCard label="Approved" value={stats.Approved} icon={CheckCircle2} tone="bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300" /><StatCard label="Rejected" value={stats.Rejected} icon={XCircle} tone="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300" /></div>
      </section>

      <section aria-labelledby="approval-filters-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 id="approval-filters-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Contribution queue</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Filter submissions by status, content type, or contributor.</p></div><span className="text-sm text-gray-400">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</span></div>
        <Card className="mt-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, name, or email" className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" /></div>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 lg:w-48"><option value="all">All types</option>{TYPES.map((value) => <option key={value} value={value}>{value === 'Essential' ? 'Essentials' : value}</option>)}</select>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter contributions by status">{['all', 'Pending', 'Approved', 'Rejected'].map((value) => <Button key={value} size="sm" variant={status === value ? 'primary' : 'secondary'} onClick={() => setStatus(value)}>{value === 'all' ? 'All statuses' : value}</Button>)}</div>
        </Card>
      </section>

      <section aria-labelledby="approval-list-heading">
        <div className="flex items-center justify-between gap-4"><div><h2 id="approval-list-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Submitted contributions</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Open a submission to review its complete content before taking action.</p></div></div>
        <div className="mt-4">{loading ? <div className="rounded-xl border border-gray-200 bg-white py-10 dark:border-gray-700 dark:bg-gray-800"><LoadingSpinner /></div> : filtered.length === 0 ? <Card><EmptyState icon={Inbox} title="No Contributions Found" description="There are no contributions matching the selected filters." /></Card> : <div className="space-y-3">{filtered.map((item) => { const Icon = typeIcon[item.type] || Layers; const content = item.content || {}; return <Card key={item._id} className="p-5 transition-shadow hover:shadow-md"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300"><Icon className="h-4 w-4" /></div><h3 className="font-semibold text-gray-900 dark:text-white">{item.title || content.title || 'Untitled contribution'}</h3><Badge color={statusColor[item.status]}>{item.status}</Badge></div><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400"><span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{item.user?.name || 'Unknown contributor'}{item.user?.email && ` · ${item.user.email}`}</span><span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Submitted {formatDate(item.submittedAt || item.createdAt)}</span><span>{item.type === 'Essential' ? 'Essentials' : item.type}</span></div>{content.description && <p className="mt-3 max-w-3xl truncate text-sm leading-6 text-gray-600 dark:text-gray-400">{content.description}</p>}{item.rejectionReason && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"><strong>Reason:</strong> {item.rejectionReason}</p>}</div><div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end"><Button variant="secondary" size="sm" onClick={() => openReview(item)}><Eye className="h-4 w-4" />{item.status === 'Pending' ? 'View / Review' : 'View'}</Button>{item.status === 'Pending' && <><Button size="sm" onClick={() => approveContribution(item)} loading={processingId === item._id} disabled={Boolean(processingId)}><CheckCircle2 className="h-4 w-4" />Approve</Button><Button variant="danger" size="sm" onClick={() => openReview(item, 'reject')} disabled={Boolean(processingId)}><XCircle className="h-4 w-4" />Reject</Button></>}</div></div></Card> })}</div>}</div>
      </section>
      {review && <ReviewModal item={review.item} initialReject={review.action === 'reject'} onClose={() => setReview(null)} onDone={load} />}
    </div>
  )
}
