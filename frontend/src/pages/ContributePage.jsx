import { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { CheckSquare, HelpCircle, FileCheck, BookOpen, Megaphone, Send, Sparkles, ArrowRight } from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'

const TYPES = [
  ['Task', CheckSquare, 'Add a focused piece of work to help everyone stay on track.'],
  ['Quiz', HelpCircle, 'Share a useful practice quiz with the community.'],
  ['Assignment', FileCheck, 'Contribute an assignment and its supporting details.'],
  ['Essential', BookOpen, 'Add a reference, note, or learning essential.'],
  ['Announcement', Megaphone, 'Share timely news or an important update.'],
]
const statusColor = { Pending: 'warning', Approved: 'success', Rejected: 'danger' }
const emptyForm = { title: '', subject: '', course: '', description: '', deadlineMode: '', date: '', priority: 'Medium', type: 'General' }

function ContributionForm({ type, onClose, onSubmitted }) {
  const [form, setForm] = useState({ ...emptyForm, title: '', course: '', type: 'General' })
  const [errors, setErrors] = useState({}); const [loading, setLoading] = useState(false)
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const submit = async (e) => {
    e.preventDefault(); const next = {}
    if (!form.title.trim()) next.title = 'Title is required.'
    if (['Task', 'Quiz', 'Assignment'].includes(type) && !form.subject.trim()) next.subject = 'Course is required.'
    if (type === 'Essential' && !form.course.trim()) next.course = 'Course is required.'
    if (type === 'Announcement' && !form.date) next.date = 'Date is required.'
    if (['Task', 'Quiz', 'Assignment'].includes(type) && !form.deadlineMode) next.deadlineMode = 'Please select a deadline.'
    if (['Task', 'Quiz', 'Assignment'].includes(type) && form.deadlineMode === 'Date' && !form.date) next.date = 'Please select a date.'
    if (Object.keys(next).length) return setErrors(next)
    setLoading(true)
    try {
      const content = { ...form, title: form.title.trim(), subject: form.subject.trim(), course: form.course.trim(), description: form.description.trim(), date: form.date || undefined, deadline: undefined, type: form.type }
      if (form.deadlineMode === 'Date') { content.date = form.date; delete content.deadline }
      if (form.deadlineMode && form.deadlineMode !== 'Date') content.deadline = null
      await api.post('/contributions', { type, title: form.title.trim(), content })
      toast.success('Contribution submitted — it is now waiting for admin review.', { duration: 5000 })
      onSubmitted(); onClose()
    } catch (err) { toast.error(err.response?.data?.message || 'Could not submit contribution.') } finally { setLoading(false) }
  }
  const dated = ['Task', 'Quiz', 'Assignment'].includes(type)
  const modes = type === 'Quiz' ? ['Date', 'Upcoming Lecture', 'Surprise'] : ['Date', 'Upcoming Lecture', 'As Possible']
  return <Modal isOpen onClose={onClose} title={`Contribute ${type}`} actions={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={loading}><Send className="w-4 h-4" />Submit for review</Button></>}>
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-800 dark:text-blue-200">Your submission stays private until an administrator reviews and approves it.</div>
      <Input label="Title" value={form.title} onChange={e => update('title', e.target.value)} placeholder={`${type} title`} required />
      {['Task', 'Quiz', 'Assignment'].includes(type) && <Input label="Course / Subject" value={form.subject} onChange={e => update('subject', e.target.value)} placeholder="e.g. Mathematics" />}
      {type === 'Essential' && <Input label="Course" value={form.course} onChange={e => update('course', e.target.value)} placeholder="e.g. Computer Science" />}
      <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><textarea className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" rows="4" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Add useful context for reviewers" /></div>
      {dated && <><Select label="Deadline" value={form.deadlineMode} onChange={e => update('deadlineMode', e.target.value)} options={[{ value: '', label: 'Select deadline' }, ...modes.map(x => ({ value: x, label: x }))]} />{form.deadlineMode === 'Date' && <Input label="Due date" type="date" value={form.date} onChange={e => update('date', e.target.value)} />}</>}
      {type === 'Announcement' && <><Select label="Announcement type" value={form.type} onChange={e => update('type', e.target.value)} options={['General', 'Academic', 'Assignment', 'Quiz', 'Task', 'Exam', 'Event'].map(x => ({ value: x, label: x }))} /><Input label="Date" type="date" value={form.date} onChange={e => update('date', e.target.value)} /></>}
      {dated && <Select label="Priority" value={form.priority} onChange={e => update('priority', e.target.value)} options={['High', 'Medium', 'Low'].map(x => ({ value: x, label: x }))} />}
      {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}{errors.subject && <p className="text-xs text-red-600">{errors.subject}</p>}{errors.course && <p className="text-xs text-red-600">{errors.course}</p>}{errors.deadlineMode && <p className="text-xs text-red-600">{errors.deadlineMode}</p>}{errors.date && <p className="text-xs text-red-600">{errors.date}</p>}
    </form>
  </Modal>
}

export default function ContributePage() {
  const [items, setItems] = useState([]); const [stats, setStats] = useState({ total: 0, Pending: 0, Approved: 0, Rejected: 0 }); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState(null); const [filter, setFilter] = useState('all')
  const load = async () => { try { const r = await api.get('/contributions'); setItems(r.data.data || []); setStats(r.data.stats || {}) } catch { toast.error('Could not load your contributions') } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const filtered = useMemo(() => filter === 'all' ? items : items.filter(x => x.status === filter), [items, filter])
  return <div className="space-y-6"><div className="rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white p-6 md:p-8"><div className="flex items-center gap-2 text-primary-100 text-sm font-medium"><Sparkles className="w-4 h-4" /> Community-powered</div><h1 className="text-3xl font-bold mt-2">Contribute</h1><p className="mt-2 max-w-2xl text-primary-100">Help improve UniProductive by sharing useful tasks, quizzes, assignments, essentials, and announcements. Every submission is reviewed by an administrator before it becomes available.</p></div>
    <div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Choose a contribution type</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pick the format that best matches what you want to share.</p><div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mt-4">{TYPES.map(([type, Icon, description]) => <button key={type} onClick={() => setSelected(type)} className="text-left group"><Card className="h-full hover:border-primary-400 transition-colors"><Icon className="w-7 h-7 text-primary-600 mb-4" /><h3 className="font-semibold text-gray-900 dark:text-white">{type}</h3><p className="text-sm text-gray-500 dark:text-gray-400 mt-2 min-h-10">{description}</p><span className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-primary-600">Contribute <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span></Card></button>)}</div></div>
    <div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your contributions</h2><div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">{[['Total Contributions', stats.total], ['Pending', stats.Pending], ['Approved', stats.Approved], ['Rejected', stats.Rejected]].map(([label, value]) => <Card key={label}><p className="text-sm text-gray-500 dark:text-gray-400">{label}</p><p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value || 0}</p></Card>)}</div><div className="flex flex-wrap gap-2 mt-5 mb-3">{['all', 'Pending', 'Approved', 'Rejected'].map(x => <Button key={x} size="sm" variant={filter === x ? 'primary' : 'secondary'} onClick={() => setFilter(x)}>{x === 'all' ? 'All' : x}</Button>)}</div>{loading ? <LoadingSpinner /> : filtered.length === 0 ? <Card><EmptyState title="No Contributions Yet" description="Your contributions will appear here after you submit them." /></Card> : <div className="space-y-3">{filtered.map(item => <Card key={item._id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3><Badge color={statusColor[item.status]}>{item.status}</Badge></div><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.type} · Submitted {new Date(item.submittedAt || item.createdAt).toLocaleDateString()}</p>{item.rejectionReason && <p className="text-sm text-red-600 dark:text-red-400 mt-2">Reason: {item.rejectionReason}</p>}</div><Badge color={item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : 'warning'}>{item.status === 'Pending' ? 'Awaiting review' : item.status === 'Approved' ? 'Published' : 'Not published'}</Badge></div></Card>)}</div>}</div>
    {selected && <ContributionForm type={selected} onClose={() => setSelected(null)} onSubmitted={load} />}
  </div>
}
