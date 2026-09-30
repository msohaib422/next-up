import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useHighlightSync } from '../hooks/useHighlightSync'
import { Plus, CheckSquare, Search, X, Paperclip, Download } from 'lucide-react'
import { parseISO, isPast, isToday, format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { hasList, readList, rememberList, forgetList } from '../utils/listCache'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import DateFilter from '../components/ui/DateFilter'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import AssignmentModal from '../components/AssignmentModal'
import AssignmentViewModal from '../components/AssignmentViewModal'

const PRIORITY_ORDER = ['High', 'Medium', 'Low']

const normalizePriority = (p) => {
  if (!p) return 'Medium'
  const lower = p.toLowerCase()
  if (lower === 'high') return 'High'
  if (lower === 'medium') return 'Medium'
  if (lower === 'low') return 'Low'
  return 'Medium'
}

const sortByDeadline = (a, b) => {
  if (!a.deadline && !b.deadline) return 0
  if (!a.deadline) return 1
  if (!b.deadline) return -1
  return new Date(a.deadline) - new Date(b.deadline)
}

export default function AssignmentsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'collaborator'
  // See TasksPage: the dashboard reads this same list, so returning to this tab
  // used to mean fetching it all over again and drawing nothing until the
  // answer arrived.
  const [assignments, setAssignments] = useState(() => readList('/assignments') || [])
  const [loading, setLoading] = useState(() => !hasList('/assignments'))
  const [showModal, setShowModal] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState(null)
  const [viewingAssignment, setViewingAssignment] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const processedHighlight = useRef(null)
  // Id whose row was missing on the first attempt (one retry, then drop the link).
  const missingHighlight = useRef(null)

  useEffect(() => { fetchAssignments() }, [])

  // A notification may point at an item this page has not loaded yet
  // (e.g. another admin published it while this page was already open).
  useHighlightSync(assignments.map((item) => item._id), loading, () => fetchAssignments())

  // Highlight item from dashboard navigation.
  //
  // A row that is not on the page yet is retried once the data settles (see
  // useHighlightSync: that happens when the item was created by another admin
  // while this page was already open). After that single retry the link is
  // dropped exactly as before, so a genuinely missing row cannot leave the
  // effect re-running.
  useEffect(() => {
    if (loading) return
    const highlightId = searchParams.get('highlight')
    if (!highlightId || highlightId === processedHighlight.current) return
    if (missingHighlight.current === highlightId) {
      searchParams.delete('highlight')
      setSearchParams(searchParams, { replace: true })
      return
    }
    const timer = setTimeout(() => {
      const element = document.getElementById(`item-${highlightId}`)
      if (!element) {
        missingHighlight.current = highlightId
        return
      }
      processedHighlight.current = highlightId
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('highlight-glow')
      setTimeout(() => {
        element.classList.remove('highlight-glow')
      }, 3000)
      searchParams.delete('highlight')
      setSearchParams(searchParams, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [loading, assignments, searchParams, setSearchParams])

  const fetchAssignments = async () => {
    try {
      const res = await api.get('/assignments')
      setAssignments(rememberList('/assignments', Array.isArray(res.data) ? res.data : (res.data.data || [])))
    } catch (err) {
      toast.error('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (assignmentData) => {
    try {
      if (editingAssignment) {
        await api.put(`/assignments/${editingAssignment._id}`, assignmentData)
        toast.success('Assignment updated')
      } else {
        await api.post('/assignments', assignmentData)
        toast.success('Assignment created')
      }
      setShowModal(false)
      setEditingAssignment(null)
      fetchAssignments()
    } catch (err) {
      throw err
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this assignment?')) return
    try {
      await api.delete(`/assignments/${id}`)
      toast.success('Assignment deleted')
      fetchAssignments()
    } catch (err) {
      toast.error('Failed to delete assignment')
    }
  }

  const handleToggleComplete = async (assignment) => {
    try {
      const newStatus = assignment.status === 'Completed' ? 'Pending' : 'Completed'
      const res = await api.put(`/assignments/${assignment._id}`, { status: newStatus })
      const updated = res.data?.data
      setAssignments(prev => prev.map(a =>
        a._id === assignment._id ? { ...a, status: updated?.status || newStatus } : a
      ))
      // Only this list's own view was corrected in place, so the copy kept for
      // display is dropped and the next reader asks the server again.
      forgetList('/assignments')
      toast.success(assignment.status === 'Completed' ? 'Assignment restored' : 'Assignment completed')
    } catch (err) {
      toast.error('Failed to update assignment')
    }
  }

  const subjects = useMemo(() => {
    const set = new Set(assignments.map(a => a.subject).filter(Boolean))
    return Array.from(set).sort()
  }, [assignments])

  const filtered = useMemo(() => {
    return assignments.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false
      if (subjectFilter !== 'all' && a.subject !== subjectFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = a.title?.toLowerCase().startsWith(q)
        const matchSubject = a.subject?.toLowerCase().startsWith(q)
        if (!matchTitle && !matchSubject) return false
      }
      return true
    })
  }, [assignments, statusFilter, priorityFilter, subjectFilter, search])

  const activeAssignments = useMemo(() =>
    filtered.filter(a => a.status !== 'Completed'),
    [filtered]
  )

  const completedAssignments = useMemo(() =>
    [...filtered.filter(a => a.status === 'Completed')].sort(sortByDeadline),
    [filtered]
  )

  const groupedAssignments = useMemo(() => {
    const groups = { High: [], Medium: [], Low: [] }
    activeAssignments.forEach(assignment => {
      const priority = normalizePriority(assignment.priority)
      groups[priority].push(assignment)
    })
    Object.keys(groups).forEach(key => {
      groups[key].sort(sortByDeadline)
    })
    return groups
  }, [activeAssignments])

  const isDateFilterActive = !!dateFilter

  const selectedDateItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(a => {
      if (!a.deadline) return false
      return format(new Date(a.deadline), 'yyyy-MM-dd') === dateFilter
    }).sort(sortByDeadline)
  }, [filtered, dateFilter])

  const ongoingItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(a => {
      if (a.status === 'Completed') return false
      if (!a.deadline) return true
      return format(new Date(a.deadline), 'yyyy-MM-dd') !== dateFilter
    }).sort(sortByDeadline)
  }, [filtered, dateFilter])

  const dateFilteredCompletedItems = useMemo(() => {
    if (!dateFilter) return []
    return filtered.filter(a => {
      if (a.status !== 'Completed') return false
      if (!a.deadline) return true
      return format(new Date(a.deadline), 'yyyy-MM-dd') !== dateFilter
    }).sort(sortByDeadline)
  }, [filtered, dateFilter])

  const getDeadlineBadge = (assignment) => {
    if (assignment.deadlineMode === 'Upcoming Lecture') return <Badge bgColor="#2DD4BF" textColor="#0F172A" size="sm">Upcoming Lecture</Badge>
    if (assignment.deadlineMode === 'As Possible') return <Badge bgColor="#8B5CF6" textColor="#FFFFFF" size="sm">As Possible</Badge>
    if (assignment.deadline) {
      const d = parseISO(assignment.deadline)
      const dateStr = format(d, 'MMM d, yyyy')
      if (isPast(d) && !isToday(d)) return <Badge bgColor="#64748B" textColor="#FFFFFF" size="sm">{dateStr}</Badge>
      if (isToday(d)) return <Badge bgColor="#64748B" textColor="#FFFFFF" size="sm">Today</Badge>
      return <Badge bgColor="#64748B" textColor="#FFFFFF" size="sm">{dateStr}</Badge>
    }
    return null
  }

  const priorityColor = (p) => {
    if (p === 'High') return 'danger'
    return undefined
  }

  const priorityBgColor = (p) => {
    if (p === 'Medium') return '#F04438'
    if (p === 'Low') return '#EAB308'
    return undefined
  }

  const priorityTextColor = (p) => {
    if (p === 'Medium') return '#FFFFFF'
    if (p === 'Low') return '#0F172A'
    return undefined
  }

  const statusBgColor = (s) => {
    if (s === 'Pending') return '#F59E0B'
    if (s === 'In Progress') return '#800080'
    return undefined
  }

  const statusTextColor = (s) => {
    if (s === 'Pending') return '#0F172A'
    if (s === 'In Progress') return '#FFFFFF'
    return undefined
  }

  const statusColor = (s) => {
    if (s === 'Completed') return 'success'
    return 'neutral'
  }

  const handleAttachmentOpen = (attachment) => {
    if (!attachment?.url) return
    window.open(attachment.url, '_blank', 'noopener,noreferrer')
  }

  const handleDownload = async (attachment) => {
    if (!attachment?.url) return
    try {
      const response = await fetch(attachment.url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = attachment.name || 'attachment'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Failed to download attachment')
    }
  }

  const renderAssignmentCard = (assignment) => (
    <Card
      id={`item-${assignment._id}`}
      key={assignment._id}
      className="p-4 flex flex-col h-full min-w-0"
      onClick={isAdmin
        ? () => { setEditingAssignment(assignment); setShowModal(true) }
        : () => setViewingAssignment(assignment)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2">
        <Badge color={priorityColor(assignment.priority)} bgColor={priorityBgColor(assignment.priority)} textColor={priorityTextColor(assignment.priority)} size="sm">{assignment.priority}</Badge>
        <Badge color={statusColor(assignment.status)} bgColor={statusBgColor(assignment.status)} textColor={statusTextColor(assignment.status)} size="sm">{assignment.status}</Badge>
        {getDeadlineBadge(assignment)}
      </div>
      <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{assignment.title}</span></h3>
      {assignment.subject && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-bold">Course:</span> <span className="font-normal">{assignment.subject}</span></p>}
      {assignment.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-normal">Description:</span> <span className="font-normal">{assignment.description}</span></p>}
      {assignment.attachment?.name && (
        <div className="flex items-center gap-2 mt-2 pt-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleAttachmentOpen(assignment.attachment) }}
            className="flex items-center gap-1.5 text-[13px] text-primary-600 dark:text-primary-400 hover:underline min-w-0"
          >
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate min-w-0">{assignment.attachment.name}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(assignment.attachment) }}
            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 shrink-0 ml-auto"
            aria-label="Download attachment"
            title="Download"
          >
            <Download className="w-[21px] h-[21px]" />
          </button>
        </div>
      )}
      <div className="flex-1" />
      {isAdmin && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t dark:border-gray-700">
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleComplete(assignment) }}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
              assignment.status === 'Completed'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {assignment.status === 'Completed' ? '✓ Done' : 'Mark Done'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(assignment._id) }}
            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            Delete
          </button>
        </div>
      )}
    </Card>
  )

  if (loading) return <LoadingSpinner />

  const hasAnyAssignments = filtered.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assignments</h1>
        {isAdmin && (
          <Button onClick={() => { setEditingAssignment(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Add Assignment
          </Button>
        )}
      </div>

      {/* The search box, the date control and the dropdowns share one track (see
          .filter-bar-track): in the compact layout each one is an equal-width
          column instead of being sized by the length of its own option text, and
          the track wraps instead of overflowing. From lg up the track drops out
          of the layout, so this row is the desktop one, unchanged. The trailing
          actions stay as wide as their own label. */}
      <div className="flex flex-wrap gap-3">
        <div className="filter-bar-track">
          <div className="filter-bar-item filter-bar-search sm:flex-[2_1_16rem] sm:min-w-0">
            <Input icon={Search} placeholder="Search assignments..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="filter-bar-item sm:basis-[220px] sm:grow-0 sm:shrink-0">
            <DateFilter value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} title="Filter by due date" />
          </div>
          <div className="filter-bar-item sm:basis-36 sm:grow-0 sm:shrink-0">
            <Select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Courses' },
                ...subjects.map(s => ({ value: s, label: s })),
              ]}
            />
          </div>
          <div className="filter-bar-item sm:basis-32 sm:grow-0 sm:shrink-0">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Status' },
                { value: 'Pending', label: 'Pending' },
                { value: 'In Progress', label: 'In Progress' },
                { value: 'Completed', label: 'Completed' },
              ]}
            />
          </div>
          <div className="filter-bar-item sm:basis-32 sm:grow-0 sm:shrink-0">
            <Select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Priority' },
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' },
              ]}
            />
          </div>
        </div>
        {(search || dateFilter || statusFilter !== 'all' || priorityFilter !== 'all' || subjectFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setDateFilter(''); setStatusFilter('all'); setPriorityFilter('all'); setSubjectFilter('all') }}
            className="flex shrink-0 items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {!hasAnyAssignments ? (
        <EmptyState
          icon={CheckSquare}
          title="No assignments found"
          description={(search || dateFilter || statusFilter !== 'all' || priorityFilter !== 'all' || subjectFilter !== 'all')
            ? 'No assignments match your current filters. Try adjusting your search or filters.'
            : 'Create your first assignment to get started'}
          action={
            isAdmin ? <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Assignment</Button> : undefined
          }
        />
      ) : isDateFilterActive ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Selected Date
            </h2>
            {selectedDateItems.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No assignments found for this date.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {selectedDateItems.map(renderAssignmentCard)}
              </div>
            )}
          </div>

          {ongoingItems.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Ongoing
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ongoingItems.map(renderAssignmentCard)}
              </div>
            </div>
          )}

          {dateFilteredCompletedItems.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Completed Assignments
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {dateFilteredCompletedItems.map(renderAssignmentCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {PRIORITY_ORDER.map(priority => {
            const items = groupedAssignments[priority]
            if (items.length === 0) return null
            return (
              <div key={priority}>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  {priority} Priority
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(renderAssignmentCard)}
                </div>
              </div>
            )
          })}

          {completedAssignments.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Completed Assignments
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedAssignments.map(renderAssignmentCard)}
              </div>
            </div>
          )}
        </div>
      )}

      <AssignmentModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingAssignment(null) }} onSave={handleSave} assignment={editingAssignment} />
      <AssignmentViewModal isOpen={!!viewingAssignment} onClose={() => setViewingAssignment(null)} assignment={viewingAssignment} />
    </div>
  )
}
