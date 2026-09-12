import { useState, useEffect } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Megaphone, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAnnouncements() }, [])

  const fetchAnnouncements = async () => {
    try {
      const res = await api.get('/announcements')
      setAnnouncements(Array.isArray(res.data) ? res.data : (res.data.announcements || []))
    } catch (err) {
      toast.error('Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }

  const filtered = announcements.filter(a => {
    if (search && !a.title?.toLowerCase().includes(search.toLowerCase()) && !a.subject?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Announcements</h1>
      </div>

      <div className="max-w-md">
        <Input icon={Search} placeholder="Search announcements..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements" description="No announcements yet" />
      ) : (
        <div className="space-y-4">
          {filtered.map(ann => (
            <Card key={ann._id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{ann.title}</h3>
                  {ann.subject && <p className="text-sm text-primary-600 dark:text-primary-400">{ann.subject}</p>}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {format(parseISO(ann.createdAt || ann.date), 'MMM d, yyyy')}
                </span>
              </div>
              {ann.content && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{ann.content}</p>
              )}
              {ann.createdBy && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  By {ann.createdBy.name || ann.createdBy}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
