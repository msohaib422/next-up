const colorMap = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  purple: 'text-white',
  magenta: 'text-white',
  teal: 'text-white',
  gold: 'text-gray-900',
}

const sizeMap = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

export default function Badge({ children, color = 'neutral', size = 'md', className = '', bgColor }) {
  const bgStyle = bgColor ? { backgroundColor: bgColor } : {}
  const colorClass = bgColor ? '' : colorMap[color] || colorMap.neutral
  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${colorClass} ${sizeMap[size]} ${className}`}
      style={bgStyle}
    >
      {children}
    </span>
  )
}
