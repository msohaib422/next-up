import { useEffect, useRef, useState } from 'react'
import { Upload, X, FileText } from 'lucide-react'

/**
 * The single file-upload UI for the whole application.
 *
 * It is the Admin → Timetable → Add form design, extracted into one shared
 * component so every "Choose File" input (Task, Quiz, Assignment, Announcement,
 * Essentials, Timetable, and the user-side contribution form) is pixel
 * identical: same dashed trigger, same icon, same file-name/size preview card,
 * same remove control, same hover and focus states.
 *
 * The component is presentational — validation and uploading stay with the
 * caller, which already owns that logic. It only reports the picked file and
 * removals through callbacks.
 */
export default function FileUploadField({
  label = 'Attachment',
  file = null,
  attachment = null,
  onSelect,
  onRemove,
  accept = 'image/*,.pdf',
  prompt = 'Click to upload image or PDF',
  id,
  disabled = false,
  error,
}) {
  const [preview, setPreview] = useState(null)
  const fileInputRef = useRef(null)
  const inputId = id || 'file-upload-field'

  // A freshly picked file is previewed locally (data URL); a file that is
  // already stored on the record is previewed from its own URL.
  useEffect(() => {
    if (!file) {
      setPreview(
        attachment?.name
          ? {
              name: attachment.name,
              url: attachment.url,
              type: attachment.type?.startsWith('image') ? 'image' : 'other',
            }
          : null
      )
      return
    }
    let cancelled = false
    const reader = new FileReader()
    reader.onloadend = () => {
      if (cancelled) return
      setPreview({
        name: file.name,
        url: reader.result,
        type: file.type.startsWith('image') ? 'image' : 'other',
      })
    }
    reader.readAsDataURL(file)
    return () => { cancelled = true }
  }, [file, attachment])

  const openPicker = () => {
    if (disabled) return
    fileInputRef.current?.click()
  }

  const handleChange = (event) => {
    const selected = event.target.files?.[0]
    // The native input is always cleared: the picked file is held by the caller,
    // and clearing means re-picking the same file (or the same invalid file)
    // fires onChange again instead of silently doing nothing.
    event.target.value = ''
    if (!selected) return
    onSelect?.(selected)
  }

  const handleRemove = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    onRemove?.()
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      {preview ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
          {preview.type === 'image' ? (
            <img src={preview.url} alt="" className="w-12 h-12 rounded object-cover" />
          ) : (
            <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
              <FileText className="w-6 h-6 text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{preview.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{file ? `${(file.size / 1024).toFixed(1)} KB` : 'Existing file'}</p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Remove attachment"
            title="Remove"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-500 dark:hover:border-primary-500 dark:hover:text-primary-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-5 h-5" />
          <span className="text-sm">{prompt}</span>
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
