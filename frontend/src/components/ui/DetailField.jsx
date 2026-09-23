// Label → value hierarchy used by the read-only detail views:
// small uppercase metadata label on top, stronger/larger value underneath.
// Never on the same visual level. Mirrors the Task detail view styling.
export default function DetailField({ label, children, className = '', labelSize = 'text-[11px]' }) {
  return (
    <div className={className}>
      <p className={`${labelSize} font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-1.5`}>
        {label}
      </p>
      <div className="text-[15px] font-medium text-gray-900 dark:text-white">
        {children}
      </div>
    </div>
  )
}
