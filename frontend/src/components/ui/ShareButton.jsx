import { useState, useRef, useEffect } from 'react'
import { Share2, Copy, MessageCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ShareButton({ id, path, title = 'Share item', className = '' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const getBaseUrl = () => {
    const envUrl =
      (typeof import.meta !== 'undefined' && import.meta.env && (
        import.meta.env.VITE_APP_URL ||
        import.meta.env.VITE_FRONTEND_URL ||
        import.meta.env.VITE_PUBLIC_APP_URL
      )) || ''
    const trimmed = String(envUrl).trim().replace(/\/+$/, '')
    const isPrivateHost = (host) =>
      /^(localhost|0\.0\.0\.0|::1|\[::1\])$/i.test(host) ||
      /^127(\.\d{1,3}){3}$/.test(host) ||
      /^10(\.\d{1,3}){3}$/.test(host) ||
      /^192\.168(\.\d{1,3}){2}$/.test(host) ||
      /\.(local|internal|localhost)$/i.test(host)
    if (trimmed) {
      try {
        const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
        if (!isPrivateHost(parsed.hostname)) {
          return `${parsed.protocol}//${parsed.host}`
        }
      } catch {
        // fall through
      }
    }
    if (typeof window !== 'undefined' && window.location && window.location.hostname && !isPrivateHost(window.location.hostname)) {
      return window.location.origin
    }
    return 'https://next-up-suf.vercel.app'
  }

  const url = `${getBaseUrl()}${path}?highlight=${id}`

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleShare = async (e) => {
    e.stopPropagation()
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // fall through to custom popover
      }
    }
    setOpen((prev) => !prev)
  }

  const handleWhatsApp = (e) => {
    e.stopPropagation()
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`
    window.open(waUrl, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  const handleCopy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy link')
    }
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleShare}
        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label="Share"
        title="Share"
      >
        <Share2 className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleWhatsApp}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            <Copy className="w-4 h-4" /> Copy Link
          </button>
        </div>
      )}
    </div>
  )
}
