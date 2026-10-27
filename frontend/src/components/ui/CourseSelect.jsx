import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, ChevronDown, Check, Trash2 } from 'lucide-react'
import { useCourses } from '../../hooks/useCourses'
import Modal from './Modal'

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
  const { courses: storeCourses, addCourse, registerCourses, deleteCourse, isCourseDeleted } = useCourses()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (Array.isArray(coursesProp)) registerCourses(coursesProp)
    if (Array.isArray(optionsProp)) registerCourses(optionsProp)
  }, [coursesProp, optionsProp, registerCourses])

  const allCourses = useMemo(() => {
    const isDeleted = (name) => isCourseDeleted(name)
    const merged = new Set([
      ...storeCourses,
      ...(Array.isArray(coursesProp) ? coursesProp : []),
      ...(Array.isArray(optionsProp) ? optionsProp : []),
    ])
    return Array.from(merged)
      .filter((c) => !isDeleted(c))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [storeCourses, coursesProp, optionsProp, isCourseDeleted])

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

  const handleDeleteClick = (e, course) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirmDelete(course)
  }

  const handleConfirmDelete = () => {
    const course = confirmDelete
    if (!course) return
    deleteCourse(course)
    if (value === course) {
      fireChange('')
    }
    setConfirmDelete(null)
  }

  const handleCancelDelete = () => {
    setConfirmDelete(null)
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
                <div
                  key={course}
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(course)}
                    className="flex-1 text-left flex items-center justify-between gap-2 min-w-0"
                  >
                    <span className="truncate">{course}</span>
                    {value === course && <Check className="h-4 w-4 text-primary-600 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteClick(e, course)}
                    aria-label={`Delete ${course}`}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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

      <Modal
        isOpen={!!confirmDelete}
        onClose={handleCancelDelete}
        title="Delete course"
        actions={
          <>
            <button
              type="button"
              onClick={handleCancelDelete}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Are you sure you want to delete the course &quot;{confirmDelete}&quot;? This will remove it from the course list. Existing items will not be changed.
        </p>
      </Modal>
    </div>
  )
}
