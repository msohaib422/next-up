import { useState, useEffect } from 'react'
import Modal from './ui/Modal'
import Input from './ui/Input'
import PasswordInput from './ui/PasswordInput'
import Button from './ui/Button'

export default function UserModal({ isOpen, onClose, onSave, user }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    setErrors({})
    if (user) {
      setForm({ name: user.name || '', email: user.email || '', password: '' })
    } else {
      setForm({ name: '', email: '', password: '' })
    }
  }, [user, isOpen])

  const validate = () => {
    const newErrors = {}
    if (!form.name.trim()) newErrors.name = 'Name is required'
    if (!form.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email'
    }
    if (!user && !form.password) {
      newErrors.password = 'Password is required'
    } else if (form.password && form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const payload = { name: form.name.trim(), email: form.email.trim() }
      if (form.password) payload.password = form.password
      await onSave(payload)
    } catch (err) {
      // parent handles error
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={user ? 'Edit User' : 'Add User'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>{user ? 'Update' : 'Create'}</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Full name"
          error={errors.name}
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="user@example.com"
          error={errors.email}
        />
        <PasswordInput
          label={user ? 'New Password (leave blank to keep current)' : 'Password'}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder={user ? 'Enter new password' : 'Enter password'}
          error={errors.password}
          autoComplete="new-password"
        />
      </form>
    </Modal>
  )
}
