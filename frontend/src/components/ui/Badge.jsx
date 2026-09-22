const colorMap = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  purple: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  magenta: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  gold: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const sizeMap = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

export default function Badge({ children, color = 'neutral', size = 'md', className = '', bgColor, textColor }) {
  const bgStyle = bgColor ? { backgroundColor: bgColor } : {}
  const textStyle = textColor ? { color: textColor } : {}
  const combinedStyle = { ...bgStyle, ...textStyle }
  const colorClass = bgColor ? '' : colorMap[color] || colorMap.neutral
  return (
    <span
      className={`inline-flex items-center leading-none font-medium rounded-full ${colorClass} ${sizeMap[size]} ${className}`}
      style={combinedStyle}
    >
      {children}
    </span>
  )
}
