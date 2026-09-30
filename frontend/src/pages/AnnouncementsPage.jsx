import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useHighlightSync } from '../hooks/useHighlightSync'
import { Plus, Megaphone, Search, X, Paperclip, Download, Pin, Bookmark, ExternalLink } from 'lucide-react'
import { format, parseISO } from 'date-fns'
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
import AnnouncementModal from '../components/AnnouncementModal'
import AnnouncementViewModal from '../components/AnnouncementViewModal'

const ANNOUNCEMENT_TYPES = [
  { value: 'General', label: 'General' },
  { value: 'Academic', label: 'Academic' },
  { value: 'Assignment', label: 'Assignment' },
  { value: 'Quiz', label: 'Quiz' },
  { value: 'Task', label: 'Task' },
  { value: 'Exam', label: 'Exam' },
  { value: 'Event', label: 'Event' },
]

const TYPE_COLOR = {
  General: 'neutral',
  Academic: 'info',
  Assignment: 'warning',
  Quiz: 'success',
  Task: 'neutral',
  Exam: 'danger',
  Event: 'info',
}

const TYPE_BG_COLOR = {
  General: '#7E22CE',
  Academic: '#0D9488',
  Assignment: '#EA580C',
  Quiz: '#BE123C',
  Task: '#CA8A04',
  Exam: '#DC2626',
  Event: '#DB2777',
}

const TYPE_TEXT_COLOR = {
  General: '#FFFFFF',
  Academic: '#FFFFFF',
  Assignment: '#FFFFFF',
  Quiz: '#FFFFFF',
  Task: '#0F172A',
  Exam: '#FFFFFF',
  Event: '#FFFFFF',
}

export default function AnnouncementsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'collaborator'
  // See TasksPage: the dashboard reads this same list, so returning to this tab
  // used to mean fetching it all over again and drawing nothing until the
  // answer arrived.
  const [announcements, setAnnouncements] = useState(() => readList('/announcements') || [])
  const [loading, setLoading] = useState(() => !hasList('/announcements'))
  const [showModal, setShowModal] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [viewingAnnouncement, setViewingAnnouncement] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [savedFilter, setSavedFilter] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const processedHighlight = useRef(null)
  // Id whose row was missing on the first attempt (one retry, then drop the link).
  const missingHighlight = useRef(null)

  useEffect(() => { fetchAnnouncements() }, [])

  // A notification may point at an item this page has not loaded yet
  // (e.g. another admin published it while this page was already open).
  useHighlightSync(announcements.map((item) => item._id), loading, () => fetchAnnouncements())

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
  }, [loading, announcements, searchParams, setSearchParams])

  const fetchAnnouncements = async () => {
    try {
      const res = await api.get('/announcements')
      setAnnouncements(rememberList('/announcements', Array.isArray(res.data) ? res.data : (res.data.data || [])))
    } catch (err) {
      toast.error('Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (announcementData) => {
    try {
      if (editingAnnouncement) {
        await api.put(`/announcements/${editingAnnouncement._id}`, announcementData)
        toast.success('Announcement updated')
      } else {
        await api.post('/announcements', announcementData)
        toast.success('Announcement created')
      }
      setShowModal(false)
      setEditingAnnouncement(null)
      fetchAnnouncements()
    } catch (err) {
      throw err
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return
    try {
      await api.delete(`/announcements/${id}`)
      toast.success('Announcement deleted')
      fetchAnnouncements()
    } catch (err) {
      toast.error('Failed to delete announcement')
    }
  }

  const handleTogglePin = async (e, announcement) => {
    e.stopPropagation()
    try {
      const res = await api.put(`/announcements/${announcement._id}/pin`)
      const updated = res.data?.data
      setAnnouncements(prev =>
        prev.map(a => a._id === announcement._id ? { ...a, pinned: updated?.pinned ?? !a.pinned } : a)
      )
      // Only this list's own view was corrected in place, so the copy kept for
      // display is dropped and the next reader asks the server again.
      forgetList('/announcements')
      toast.success(updated?.pinned ? 'Announcement pinned' : 'Announcement unpinned')
    } catch (err) {
      toast.error('Failed to update pin')
    }
  }

  const handleToggleSave = async (e, announcement) => {
    e.stopPropagation()
    try {
      const res = await api.put(`/announcements/${announcement._id}/save`)
      const updated = res.data?.data
      setAnnouncements(prev =>
        prev.map(a => a._id === announcement._id ? { ...a, savedBy: updated?.savedBy || [] } : a)
      )
      // Only this list's own view was corrected in place, so the copy kept for
      // display is dropped and the next reader asks the server again.
      forgetList('/announcements')
      const isSaved = updated?.savedBy?.some(id => String(id) === String(user?._id))
      toast.success(isSaved ? 'Announcement saved' : 'Announcement unsaved')
    } catch (err) {
      toast.error('Failed to update save')
    }
  }

  const handleToggleExpire = async (e, announcement) => {
    e.stopPropagation()
    try {
      await api.put(`/announcements/${announcement._id}/expire`)
      await fetchAnnouncements()
      toast.success(announcement.expired ? 'Announcement restored' : 'Announcement marked as expired')
    } catch (err) {
      toast.error('Failed to update expire status')
    }
  }

  const isSaved = (announcement) => {
    // savedBy holds ObjectIds, so compare as strings rather than by identity.
    return announcement.savedBy?.some(id => String(id) === String(user?._id))
  }

  const filtered = useMemo(() => {
    return announcements.filter(a => {
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = a.title?.toLowerCase().includes(q)
        if (!matchTitle) return false
      }
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      if (dateFilter) {
        if (!a.date) return false
        if (format(new Date(a.date), 'yyyy-MM-dd') !== dateFilter) return false
      }
      if (savedFilter) {
        if (!isSaved(a)) return false
      }
      return true
    })
  }, [announcements, search, typeFilter, dateFilter, savedFilter, user])

  const sortByDateDesc = (a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0
    const dateB = b.date ? new Date(b.date).getTime() : 0
    return dateB - dateA
  }

  const pinnedAnnouncements = useMemo(() =>
    filtered.filter(a => a.pinned && !a.expired).sort(sortByDateDesc),
    [filtered]
  )

  const recentAnnouncements = useMemo(() =>
    filtered.filter(a => !a.pinned && !a.expired).sort(sortByDateDesc),
    [filtered]
  )

  const expiredAnnouncements = useMemo(() =>
    filtered.filter(a => a.expired).sort(sortByDateDesc),
    [filtered]
  )

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

  const renderAnnouncementCard = (ann) => (
    <Card id={`item-${ann._id}`} key={ann._id} className="p-4 flex flex-col h-full min-w-0" onClick={isAdmin ? () => { setEditingAnnouncement(ann); setShowModal(true) } : () => setViewingAnnouncement(ann)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <Badge bgColor={TYPE_BG_COLOR[ann.type]} textColor={TYPE_TEXT_COLOR[ann.type]} size="sm">{ann.type}</Badge>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <button
              onClick={(e) => handleTogglePin(e, ann)}
              className={`p-1 rounded transition-colors ${ann.pinned ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 hover:text-primary-600 dark:hover:text-primary-400'}`}
              title={ann.pinned ? 'Unpin' : 'Pin'}
            >
              <Pin className="w-4 h-4" fill={ann.pinned ? 'currentColor' : 'none'} />
            </button>
          )}
          <button
            onClick={(e) => handleToggleSave(e, ann)}
            className={`p-1 rounded transition-colors ${isSaved(ann) ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
            title={isSaved(ann) ? 'Unsave' : 'Save'}
          >
            <Bookmark className="w-4 h-4" fill={isSaved(ann) ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
      <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{ann.title}</span></h3>
      {ann.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-normal">Description:</span> <span className="font-normal">{ann.description}</span></p>}
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span className="font-normal">Date:</span> <span className="font-normal">{format(new Date(ann.date), 'MMM d, yyyy')}</span>
      </p>
      {ann.attachment?.name && (
        <div className="flex items-center gap-2 mt-2 pt-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleAttachmentOpen(ann.attachment) }}
            className="flex items-center gap-1.5 text-[13px] text-primary-600 dark:text-primary-400 hover:underline min-w-0"
          >
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate min-w-0">{ann.attachment.name}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(ann.attachment) }}
            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 shrink-0 ml-auto"
            aria-label="Download attachment"
            title="Download"
          >
            <Download className="w-[21px] h-[21px]" />
          </button>
        </div>
      )}
      {ann.link && (
        <div className="mt-2 pt-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); window.open(ann.link, '_blank', 'noopener,noreferrer') }}
            className="flex max-w-full items-center gap-1.5 text-[13px] text-primary-600 dark:text-primary-400 hover:underline min-w-0"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate min-w-0">{ann.link}</span>
          </button>
        </div>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-2 mt-3 pt-3 border-t dark:border-gray-700">
        {ann.createdBy && (
          <p className="text-xs text-gray-400 dark:text-gray-500 min-w-0 break-words">
            Posted by: {ann.createdBy}
          </p>
        )}
        {isAdmin && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleExpire(e, ann) }}
              className={`text-xs px-2 py-1 rounded ml-auto ${
                ann.expired
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {ann.expired ? 'Expired' : 'Mark as Expire'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(ann._id) }}
              className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
            >
              Delete
            </button>
          </>
        )}
      </div>
    </Card>
  )

  if (loading) return <LoadingSpinner />

  const hasAnyAnnouncements = filtered.length > 0
  const hasActiveFilters = search || typeFilter !== 'all' || dateFilter || savedFilter

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Announcements</h1>
        {isAdmin && (
          <Button onClick={() => { setEditingAnnouncement(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Add Announcement
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
            <Input icon={Search} placeholder="Search announcements..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="filter-bar-item sm:basis-[220px] sm:grow-0 sm:shrink-0">
            <DateFilter value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} title="Filter by date" />
          </div>
          <div className="filter-bar-item sm:basis-36 sm:grow-0 sm:shrink-0">
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Types' },
                ...ANNOUNCEMENT_TYPES,
              ]}
            />
          </div>
        </div>
        <button
          onClick={() => setSavedFilter(!savedFilter)}
          className={`flex shrink-0 items-center justify-center gap-1 text-sm px-3 py-2 rounded-lg border transition-colors ${
            savedFilter
              ? 'border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-600'
              : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <Bookmark className="w-4 h-4" fill={savedFilter ? 'currentColor' : 'none'} />
          Saved
        </button>
        {hasActiveFilters && (
          <button
            onClick={() => { setSearch(''); setDateFilter(''); setTypeFilter('all'); setSavedFilter(false) }}
            className="flex shrink-0 items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {!hasAnyAnnouncements ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements found"
          description={hasActiveFilters
            ? 'No announcements match your current filters. Try adjusting your search or filters.'
            : 'Create your first announcement to get started'}
          action={
            isAdmin ? <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Announcement</Button> : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {pinnedAnnouncements.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Pinned Announcements
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pinnedAnnouncements.map(renderAnnouncementCard)}
              </div>
            </div>
          )}

          {recentAnnouncements.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Recent Announcements
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentAnnouncements.map(renderAnnouncementCard)}
              </div>
            </div>
          )}

          {expiredAnnouncements.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Expired Announcements
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {expiredAnnouncements.map(renderAnnouncementCard)}
              </div>
            </div>
          )}
        </div>
      )}

      <AnnouncementModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingAnnouncement(null) }} onSave={handleSave} announcement={editingAnnouncement} />
      <AnnouncementViewModal isOpen={!!viewingAnnouncement} onClose={() => setViewingAnnouncement(null)} announcement={viewingAnnouncement} />
    </div>
  )
}
