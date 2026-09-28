import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, children, actions }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* modal-panel keeps the dialog inside the real (mobile browser) viewport,
          and the body scrolls internally so a long form is never cut off. */}
      <div className="modal-panel w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-0 break-words">{title}</h2>
          <button onClick={onClose} className="p-1 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {children}
        </div>
        {actions && (
          <div className="flex flex-wrap justify-end gap-2 p-4 border-t dark:border-gray-700 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
