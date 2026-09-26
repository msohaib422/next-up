import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { CheckSquare, HelpCircle, FileCheck, BookOpen, Megaphone, Send, ArrowRight, Clock, CheckCircle2, XCircle, Layers, Paperclip, X } from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'

const TYPES = [
  { type: 'Task', Icon: CheckSquare, description: 'Add a focused piece of work to help everyone stay on track.' },
  { type: 'Quiz', Icon: HelpCircle, description: 'Share a useful practice quiz with the community.' },
  { type: 'Assignment', Icon: FileCheck, description: 'Contribute an assignment and its supporting details.' },
  { type: 'Essential', Icon: BookOpen, description: 'Add a reference, note, or learning essential.' },
  { type: 'Announcement', Icon: Megaphone, description: 'Share timely news or an important update.' },
]
const statusColor = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Deleted: 'neutral' }
const today = new Date()
const minSelectableDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024
const initialForm = { title: '', subject: '', course: '', description: '', deadlineMode: '', date: '', priority: 'Medium', type: 'General', link: '' }

function ContributionForm({ type, onClose, onSubmitted }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState(null)
  const [attachment, setAttachment] = useState(null)
  const fileInputRef = useRef(null)
  const dated = ['Task', 'Quiz', 'Assignment'].includes(type)
  const modes = type === 'Quiz' ? ['Date', 'Upcoming Lecture', 'Surprise'] : ['Date', 'Upcoming Lecture', 'As Possible']
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0]
    if (!selected) return
    if (!ALLOWED_FILE_TYPES.includes(selected.type)) {
      setErrors(prev => ({ ...prev, file: 'Only PDF, JPG, JPEG, PNG, WEBP files are allowed.' }))
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setErrors(prev => ({ ...prev, file: 'File must be under 10 MB.' }))
      return
    }
    setErrors(prev => ({ ...prev, file: undefined }))
    setFile(selected)
    setAttachment(null)
  }

  const handleRemoveFile = () => {
    setFile(null)
    setAttachment(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadFile = async () => {
    if (!file) return attachment
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/contributions/upload', formData)
    return response.data.data
  }

  const submit = async (event) => {
    event.preventDefault()
    const next = {}
    if (!form.title.trim()) next.title = 'Title is required.'
    if (dated && !form.subject.trim()) next.subject = 'Course is required.'
    if (type === 'Essential' && !form.course.trim()) next.course = 'Course is required.'
    if (dated && !form.deadlineMode) next.deadlineMode = 'Please select a deadline.'
    if (dated && form.deadlineMode === 'Date' && !form.date) next.date = 'Please select a date.'
    if (type === 'Announcement' && !form.date) next.date = 'Date is required.'
    if (Object.keys(next).length) { setErrors(next); return }
    setErrors({}); setLoading(true)
    try {
      let uploadedAttachment = attachment
      if (file) {
        setUploading(true)
        uploadedAttachment = await uploadFile()
      }
      const content = { title: form.title.trim(), description: form.description.trim(), date: form.date || undefined }
      if (dated) Object.assign(content, { subject: form.subject.trim(), deadlineMode: form.deadlineMode, priority: form.priority })
      if (type === 'Essential') Object.assign(content, { course: form.course.trim(), tag: 'Topic' })
      if (type === 'Announcement') Object.assign(content, { type: form.type, link: form.link.trim() })
      if (uploadedAttachment) content.attachment = uploadedAttachment
      await api.post('/contributions', { type, title: form.title.trim(), content })
      toast.success('Contribution submitted successfully — it is now waiting for admin review.', { duration: 5000 })
      onSubmitted(); onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit your contribution. Please try again.')
    } finally { setUploading(false); setLoading(false) }
  }

  return <Modal isOpen onClose={onClose} title={`Contribute ${type}`} actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={loading || uploading}><Send className="w-4 h-4" />Submit for review</Button></>}>
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-5 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">Your submission stays private until an administrator reviews and approves it.</div>
      <Input label="Title" value={form.title} onChange={e => update('title', e.target.value)} placeholder={`${type} title`} error={errors.title} required />
      {dated && <Input label="Course / Subject" value={form.subject} onChange={e => update('subject', e.target.value)} placeholder="e.g. Mathematics" error={errors.subject} />}
      {type === 'Essential' && <Input label="Course" value={form.course} onChange={e => update('course', e.target.value)} placeholder="e.g. Computer Science" error={errors.course} />}
      <div><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="contribution-description">Description</label><textarea id="contribution-description" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" rows="4" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Add useful context for reviewers" /></div>
      {type === 'Task' && <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attachment</label>
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 cursor-pointer">
            <Paperclip className="w-4 h-4 shrink-0" />
            <span className="truncate">{file ? file.name : (attachment?.name || 'Choose PDF or Image')}</span>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} className="hidden" />
          </label>
          {(file || attachment) && <button type="button" onClick={handleRemoveFile} className="text-gray-400 hover:text-red-500" aria-label="Remove attachment"><X className="w-4 h-4" /></button>}
        </div>
        {errors.file && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.file}</p>}
      </div>}
      {dated && <><Select label="Deadline" value={form.deadlineMode} onChange={e => update('deadlineMode', e.target.value)} options={[{ value: '', label: 'Select deadline' }, ...modes.map(mode => ({ value: mode, label: mode }))]} />{form.deadlineMode === 'Date' && <Input label="Due date" type="date" min={minSelectableDate} value={form.date} onChange={e => update('date', e.target.value)} error={errors.date} />}{errors.deadlineMode && <p className="-mt-2 text-xs text-red-600">{errors.deadlineMode}</p>}</>}
      {type === 'Announcement' && <><Select label="Announcement type" value={form.type} onChange={e => update('type', e.target.value)} options={['General', 'Academic', 'Assignment', 'Quiz', 'Task', 'Exam', 'Event'].map(value => ({ value, label: value }))} /><Input label="Date" type="date" min={minSelectableDate} value={form.date} onChange={e => update('date', e.target.value)} error={errors.date} /><Input label="Link (optional)" type="url" value={form.link} onChange={e => update('link', e.target.value)} placeholder="https://" /></>}
      {dated && <Select label="Priority" value={form.priority} onChange={e => update('priority', e.target.value)} options={['High', 'Medium', 'Low'].map(value => ({ value, label: value }))} />}
    </form>
  </Modal>
}

const StatCard = ({ label, value, icon: Icon, tone }) => <Card className="flex min-h-[112px] items-center gap-4 p-5"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div><div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value || 0}</p></div></Card>

export default function ContributePage() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState({ total: 0, Pending: 0, Approved: 0, Rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [searchParams, setSearchParams] = useSearchParams()
  const processedHighlight = useRef(null)
  const load = async () => {
    try { const response = await api.get('/contributions'); setItems(response.data.data || []); setStats(response.data.stats || {}) }
    catch { toast.error('Could not load your contributions. Please refresh and try again.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => filter === 'all' ? items : items.filter(item => item.status === filter), [items, filter])

  // Highlight a contribution opened from a notification
  useEffect(() => {
    if (loading) return
    const highlightId = searchParams.get('highlight')
    if (!highlightId || highlightId === processedHighlight.current) return
    // A status filter may be hiding the target row; fall back to "All" so the
    // notification always lands on a visible card.
    if (filter !== 'all' && !filtered.some((item) => item._id === highlightId)) {
      setFilter('all')
      return
    }
    processedHighlight.current = highlightId
    const timer = setTimeout(() => {
      const element = document.getElementById(`contribution-${highlightId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        element.classList.add('highlight-glow')
        setTimeout(() => element.classList.remove('highlight-glow'), 3000)
      }
      searchParams.delete('highlight')
      setSearchParams(searchParams, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [loading, items, filtered, filter, searchParams, setSearchParams])

  return <div className="mx-auto max-w-7xl space-y-8">
    <section aria-labelledby="contribution-summary-heading">
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-end"><div><h2 id="contribution-summary-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Contribution summary</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track your submissions and their review status.</p></div></div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total contributions" value={stats.total} icon={Layers} tone="bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300" /><StatCard label="Pending review" value={stats.Pending} icon={Clock} tone="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300" /><StatCard label="Approved" value={stats.Approved} icon={CheckCircle2} tone="bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300" /><StatCard label="Rejected" value={stats.Rejected} icon={XCircle} tone="bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300" /></div>
    </section>

    <section aria-labelledby="contribution-types-heading">
      <div><h2 id="contribution-types-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Choose what to contribute</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pick a format and share something useful with the community.</p></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{TYPES.map(({ type, Icon, description }) => <button key={type} type="button" onClick={() => setSelected(type)} className="group h-full text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"><Card className="flex h-full min-h-[250px] flex-col p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-primary-400 group-hover:shadow-md"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300"><Icon className="h-6 w-6" /></div><h3 className="font-semibold text-gray-900 dark:text-white">{type}</h3><p className="mt-2 flex-1 text-sm leading-5 text-gray-500 dark:text-gray-400">{description}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 dark:text-primary-400">Contribute <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Card></button>)}</div>
    </section>

    <section aria-labelledby="contribution-history-heading">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 id="contribution-history-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Your contribution history</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">A read-only record of your submissions and moderation decisions.</p></div><div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter contributions by status">{['all', 'Pending', 'Approved', 'Rejected'].map(value => <Button key={value} size="sm" variant={filter === value ? 'primary' : 'secondary'} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value}</Button>)}</div></div>
      <div className="mt-4">{loading ? <div className="rounded-xl border border-gray-200 bg-white py-10 dark:border-gray-700 dark:bg-gray-800"><LoadingSpinner /></div> : filtered.length === 0 ? <Card><EmptyState title="No Contributions Yet" description="Your contributions will appear here after you submit them." /></Card> : <div className="space-y-3">{filtered.map(item => <Card key={item._id} id={`contribution-${item._id}`} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3><Badge color={statusColor[item.status]}>{item.status}</Badge></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.type} · Submitted {new Date(item.submittedAt || item.createdAt).toLocaleDateString()}</p>{item.rejectionReason && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"><strong>Reason:</strong> {item.rejectionReason}</p>}</div><Badge color={item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : item.status === 'Deleted' ? 'neutral' : 'warning'}>{item.status === 'Pending' ? 'Awaiting review' : item.status === 'Approved' ? 'Published' : item.status === 'Deleted' ? 'Deleted' : 'Not published'}</Badge></div></Card>)}</div>}</div>
    </section>
    {selected && <ContributionForm type={selected} onClose={() => setSelected(null)} onSubmitted={load} />}
  </div>
}
