import toast from 'react-hot-toast'
import { Paperclip, Download } from 'lucide-react'
import DetailField from './DetailField'

// Shared "File" detail row — same icon + value rhythm as the Task detail
// view, with open/download actions for the read-only viewers.
export default function AttachmentField({ attachment }) {
  const handleOpen = () => {
    if (!attachment?.url) return
    window.open(attachment.url, '_blank', 'noopener,noreferrer')
  }

  const handleDownload = async () => {
    if (!attachment?.url) return
    try {
      const response = await fetch(attachment.url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = attachment.name || 'attachment'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Failed to download attachment')
    }
  }

  if (!attachment?.name) {
    return (
      <DetailField label="File">
        <span className="text-[14px] text-gray-500 dark:text-gray-400">—</span>
      </DetailField>
    )
  }

  return (
    <DetailField label="File">
      <div className="flex items-center gap-2">
        <Paperclip className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
        <button
          type="button"
          onClick={handleOpen}
          className="min-w-0 flex-1 flex items-center text-left text-[14px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
          title={attachment.name}
        >
          <span className="truncate">{attachment.name}</span>
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="shrink-0 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          aria-label="Download attachment"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </DetailField>
  )
}
