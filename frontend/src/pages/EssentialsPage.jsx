import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { Plus, BookOpen, Search, Calendar, X, Paperclip, Download, Bookmark } from 'lucide-react'
import { format } from 'date-fns'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EssentialModal from '../components/EssentialModal'

export default function EssentialsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'collaborator'
  const [essentials, setEssentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingEssential, setEditingEssential] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [savedFilter, setSavedFilter] = useState(false)

  useEffect(() => { fetchEssentials() }, [])

  const fetchEssentials = async () => {
    try {
      const res = await api.get('/essentials')
      setEssentials(Array.isArray(res.data) ? res.data : (res.data.data || []))
    } catch (err) {
      toast.error('Failed to load essentials')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (essentialData) => {
    try {
      if (editingEssential) {
        await api.put(`/essentials/${editingEssential._id}`, essentialData)
        toast.success('Essential updated')
      } else {
        await api.post('/essentials', essentialData)
        toast.success('Essential created')
      }
      setShowModal(false)
      setEditingEssential(null)
      fetchEssentials()
    } catch (err) {
      throw err
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this essential?')) return
    try {
      await api.delete(`/essentials/${id}`)
      toast.success('Essential deleted')
      fetchEssentials()
    } catch (err) {
      toast.error('Failed to delete essential')
    }
  }

  const handleToggleSave = async (e, essential) => {
    e.stopPropagation()
    try {
      const res = await api.put(`/essentials/${essential._id}/save`)
      const updated = res.data?.data
      setEssentials(prev =>
        prev.map(es => es._id === essential._id ? { ...es, savedBy: updated?.savedBy || [] } : es)
      )
      const isSaved = updated?.savedBy?.some(id => id === user?._id)
      toast.success(isSaved ? 'Essential saved' : 'Essential unsaved')
    } catch (err) {
      toast.error('Failed to update save')
    }
  }

  const isSaved = (essential) => {
    return essential.savedBy?.some(id => id === user?._id)
  }

  const courses = useMemo(() => {
    const set = new Set(essentials.map(e => e.course).filter(Boolean))
    return Array.from(set).sort()
  }, [essentials])

  const filtered = useMemo(() => {
    return essentials.filter(e => {
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = e.title?.toLowerCase().includes(q)
        const matchCourse = e.course?.toLowerCase().includes(q)
        if (!matchTitle && !matchCourse) return false
      }
      if (courseFilter !== 'all' && e.course !== courseFilter) return false
      if (dateFilter) {
        if (!e.date) return false
        if (format(new Date(e.date), 'yyyy-MM-dd') !== dateFilter) return false
      }
      if (savedFilter) {
        if (!isSaved(e)) return false
      }
      return true
    })
  }, [essentials, search, courseFilter, dateFilter, savedFilter, user])

  const sortByDateDesc = (a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0
    const dateB = b.date ? new Date(b.date).getTime() : 0
    return dateB - dateA
  }

  const sortedEssentials = useMemo(() =>
    [...filtered].sort(sortByDateDesc),
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

  const renderEssentialCard = (ess) => (
    <Card key={ess._id} className="p-4 flex flex-col h-full" onClick={isAdmin ? () => { setEditingEssential(ess); setShowModal(true) } : undefined}>
      <div className="flex items-center justify-between mb-2">
        <Badge size="sm" className="!bg-purple-100 dark:!bg-purple-900/60 !text-purple-700 dark:!text-purple-300">{ess.tag || 'Topic'}</Badge>
        <button
          onClick={(e) => handleToggleSave(e, ess)}
          className={`p-1 rounded transition-colors ${isSaved(ess) ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
          title={isSaved(ess) ? 'Unsave' : 'Save'}
        >
          <Bookmark className="w-4 h-4" fill={isSaved(ess) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <h3 className="text-[15px] text-gray-900 dark:text-white mb-1"><span className="font-bold">Title:</span> <span className="font-normal">{ess.title}</span></h3>
      {ess.course && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-bold">Course:</span> <span className="font-normal">{ess.course}</span></p>}
      {ess.description?.trim() && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"><span className="font-normal">Description:</span> <span className="font-normal">{ess.description}</span></p>}

      {ess.attachment?.name && (
        <div className="flex items-center gap-2 mt-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleAttachmentOpen(ess.attachment) }}
            className="flex items-center gap-1.5 text-[13px] text-primary-600 dark:text-primary-400 hover:underline min-w-0"
          >
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{ess.attachment.name}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(ess.attachment) }}
            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 shrink-0 ml-auto"
            aria-label="Download attachment"
            title="Download"
          >
            <Download className="w-[21px] h-[21px]" />
          </button>
        </div>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-2 mt-3 pt-3 border-t dark:border-gray-700">
        {ess.createdBy && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Posted by: {ess.createdBy}
          </p>
        )}
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(ess._id) }}
            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 ml-auto"
          >
            Delete
          </button>
        )}
      </div>
    </Card>
  )

  if (loading) return <LoadingSpinner />

  const hasAnyEssentials = filtered.length > 0
  const hasActiveFilters = search || dateFilter || courseFilter !== 'all' || savedFilter

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Essentials</h1>
        {isAdmin && (
          <Button onClick={() => { setEditingEssential(null); setShowModal(true) }}>
            <Plus className="w-4 h-4" /> Add Essential
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-[2] min-w-0">
          <Input icon={Search} placeholder="Search essentials..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="relative w-[220px] shrink-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Calendar className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by date"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-10 pr-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-colors"
          />
        </div>
        <div className="w-40 shrink-0">
          <Select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Courses' },
              ...courses.map(c => ({ value: c, label: c })),
            ]}
          />
        </div>
        <button
          onClick={() => setSavedFilter(!savedFilter)}
          className={`flex items-center gap-1 text-sm px-3 py-2 rounded-lg border transition-colors ${
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
            onClick={() => { setSearch(''); setDateFilter(''); setCourseFilter('all'); setSavedFilter(false) }}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {!hasAnyEssentials ? (
        <EmptyState
          icon={BookOpen}
          title="No essentials found"
          description={hasActiveFilters
            ? 'No essentials match your current filters. Try adjusting your search or filters.'
            : 'Create your first essential to get started'}
          action={
            isAdmin ? <Button onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> Add Essential</Button> : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedEssentials.map(renderEssentialCard)}
        </div>
      )}

      <EssentialModal isOpen={showModal} onClose={() => { setShowModal(false); setEditingEssential(null) }} onSave={handleSave} essential={editingEssential} />
    </div>
  )
}
