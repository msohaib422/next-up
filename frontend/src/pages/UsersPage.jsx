import { useState, useEffect, useMemo } from 'react'
import api from '../api/axios'
import toast from 'react-hot-toast'
import { Plus, Users, Pencil, Trash2, Search } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import UserModal from '../components/UserModal'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchUsers() }, [])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return users

    return users.filter((user) => {
      const searchableText = `${user.name || ''} ${user.email || ''}`.toLowerCase()
      return searchableText.includes(query)
    })
  }, [search, users])

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users/admin/users')
      setUsers(res.data.data || [])
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
    try {
      await api.delete(`/users/admin/users/${id}`)
      toast.success('User deleted successfully')
      setUsers(prev => prev.filter(u => u._id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete user'
      toast.error(msg)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
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
                  <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setEditingUser(user); setShowModal(true) }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 dark:hover:text-primary-400 transition-colors"
                          title="Edit user"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(user)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete User</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete <span className="font-medium text-gray-900 dark:text-gray-100">{deleteConfirm.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteConfirm._id)}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
