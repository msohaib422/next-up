import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Input from './Input'

/**
 * Password field with a show/hide toggle rendered inside the field.
 *
 * Used everywhere a password is typed (admin Add/Edit User and the public
 * registration form) so the behaviour and the icon treatment are identical.
 * The value, the name and the validation are unchanged: this only controls
 * whether the characters are masked.
 */
export default function PasswordInput({ value, onChange, label, error, placeholder, ...props }) {
  const [visible, setVisible] = useState(false)

  const toggle = (
    <button
      type="button"
      onClick={() => setVisible((prev) => !prev)}
      // Announced as one control that reports the action, not the current state,
      // so it reads sensibly out of context.
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible}
      title={visible ? 'Hide password' : 'Show password'}
      className="p-1 rounded-md text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-gray-500 dark:hover:text-gray-300"
    >
      {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  )

  return (
    <Input
      type={visible ? 'text' : 'password'}
      label={label}
      error={error}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      trailing={toggle}
      {...props}
    />
  )
}
