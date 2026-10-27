import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, ChevronDown, Check } from 'lucide-react'
import { useCourses } from '../../hooks/useCourses'

export default function CourseSelect({
  label,
  value,
  onChange,
  error,
  required,
  placeholder = 'Select a course',
  courses: coursesProp,
  options: optionsProp,
  className = '',
  ...props
}) {
  const { courses: storeCourses, addCourse, registerCourses } = useCourses()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (Array.isArray(coursesProp)) registerCourses(coursesProp)
    if (Array.isArray(optionsProp)) registerCourses(optionsProp)
  }, [coursesProp, optionsProp, registerCourses])

  const allCourses = useMemo(() => {
    const set = new Set([...storeCourses, ...(Array.isArray(coursesProp) ? coursesProp : []), ...(Array.isArray(optionsProp) ? optionsProp : [])])
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [storeCourses, coursesProp, optionsProp])

  useEffect(() => {
    if (!open) {
      setCreating(false)
      setNewName('')
      setCreateError('')
    }
  }, [open])

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus()
    }
  }, [creating])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const fireChange = (val) => {
    if (typeof onChange === 'function') {
      onChange(val)
    }
  }

  const handleSelect = (course) => {
    fireChange(course)
    setOpen(false)
    setCreating(false)
  }

  const handleCreateToggle = () => {
    setCreating(true)
    setNewName('')
    setCreateError('')
  }

  const handleConfirm = () => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setCreateError('Course name is required.')
      return
    }
    const result = addCourse(trimmed)
    if (!result.ok) {
      setCreateError(result.error)
      return
    }
    fireChange(result.value)
    setCreating(false)
    setNewName('')
    setCreateError('')
    setOpen(false)
  }

  const handleCancelCreate = () => {
    setCreating(false)
    setNewName('')
    setCreateError('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (creating) handleCancelCreate()
      else setOpen(false)
    }
  }

  return (
    <div className={`w-full ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
          {required ? <span className="text-red-500 ml-0.5">*</span> : null}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left text-gray-900 dark:text-gray-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-colors flex items-center justify-between gap-2 ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          {...props}
        >
          <span className={value ? '' : 'text-gray-400'}>
            {value || placeholder}
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
            <div className="max-h-60 overflow-y-auto">
              {allCourses.length === 0 && !creating && (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No courses yet</div>
              )}
              {allCourses.map((course) => (
                <button
                  key={course}
                  type="button"
                  onClick={() => handleSelect(course)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between gap-2"
                >
                  <span>{course}</span>
                  {value === course && <Check className="h-4 w-4 text-primary-600" />}
                </button>
              ))}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700">
              {!creating ? (
                <button
                  type="button"
                  onClick={handleCreateToggle}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  + Create New Course
                </button>
              ) : (
                <div className="p-3 space-y-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value)
                      if (createError) setCreateError('')
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="New course name"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                  />
                  {createError && <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCancelCreate}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      {createError && !open && null}
    </div>
  )
}
