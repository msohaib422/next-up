import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeMap = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <Loader2 className={`${sizeMap[size]} animate-spin text-primary-600`} />
    </div>
  )
}
