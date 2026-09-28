import { useState } from 'react'
import { User, Mail, Lock, Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import toast from 'react-hot-toast'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Button from '../components/ui/Button'

export default function ProfilePage() {
  const { user } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const validate = () => {
    const newErrors = {}

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        newErrors.currentPassword = 'Current password is required'
      }
      if (!newPassword) {
        newErrors.newPassword = 'New password is required'
      } else if (newPassword.length < 6) {
        newErrors.newPassword = 'Password must be at least 6 characters'
      }
      if (newPassword !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const hasChanges = currentPassword || newPassword || confirmPassword

  const handleSave = async (e) => {
    e.preventDefault()
    if (!validate()) return
    if (!hasChanges) return

    setSaving(true)
    try {
      await api.put('/users/change-password', {
        currentPassword,
        newPassword,
      })
      toast.success('Profile updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setErrors({})
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update profile'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Profile Information</h2>
          <div className="space-y-4">
            <Input
              label="Name"
              value={user?.name || ''}
              icon={User}
              disabled
              readOnly
            />
            <Input
              label="Email"
              type="email"
              value={user?.email || ''}
              icon={Mail}
              disabled
              readOnly
            />
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Change Password</h2>
          <div className="space-y-4">
            <PasswordInput
              label="Current Password"
              icon={Lock}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              error={errors.currentPassword}
              autoComplete="current-password"
            />

            <PasswordInput
              label="New Password"
              icon={Lock}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              error={errors.newPassword}
              autoComplete="new-password"
            />

            <PasswordInput
              label="Confirm New Password"
              icon={Lock}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              error={errors.confirmPassword}
              autoComplete="new-password"
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            loading={saving}
            disabled={!hasChanges || saving}
            className="w-full sm:w-auto"
          >
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  )
}
