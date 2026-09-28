import { Calendar } from 'lucide-react'

/**
 * Date control for the shared filter bars.
 *
 * It is the same native date input as before, with the same value, the same
 * onChange and the same picker, and the input still covers the whole control, so
 * tapping it anywhere opens the same date dialog. What it adds is a short
 * caption beside the calendar icon: while the field is empty the caption stands
 * in for the browser's mm/dd/yyyy hint, so the control explains itself instead
 * of looking like a bare icon; once a date is picked the date itself is shown in
 * its place. It carries the same shell as Input and Select, which keeps it the
 * same height and, inside a filter bar track, the same width as them.
 */
export default function DateFilter({ value, onChange, caption = 'Date', className = '', ...props }) {
  const isEmpty = value === '' || value === null || value === undefined

  return (
    <div className={`relative ${className}`.trim()}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center gap-1.5 pointer-events-none">
        <Calendar className="h-5 w-5 shrink-0 text-gray-400" />
        {isEmpty && <span className="whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{caption}</span>}
      </div>
      <input
        type="date"
        value={value}
        onChange={onChange}
        aria-label="Filter by date"
        data-empty={isEmpty ? '' : undefined}
        /* h-[42px] is the box a text input and a dropdown get from py-2 plus a
           1.5rem line; the native date field measures 2px taller at the same
           padding, so it is pinned to the same height to keep the row aligned. */
        className={`w-full h-[42px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-colors ${isEmpty ? 'pl-20' : 'pl-10'}`}
        {...props}
      />
    </div>
  )
}
