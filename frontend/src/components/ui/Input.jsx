import { forwardRef } from 'react'

/**
 * Text input with a shared shell: an optional left icon, an optional control
 * rendered inside the field on the right, and an optional label/error.
 *
 * The right-hand control is used by PasswordInput for the show/hide toggle and
 * keeps the same look as the left icon, so a field with a trailing control is
 * padded the same way as one with a leading icon.
 */
const Input = forwardRef(({ label, error, icon: Icon, trailing, className = '', inputClassName = '', ...props }, ref) => {
  const hasTrailing = Boolean(trailing)

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-5 w-5 text-gray-400" />
          </div>
        )}
        <input
          ref={ref}
          className={`w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${Icon ? 'pl-10' : ''} ${hasTrailing ? 'pr-11' : ''} ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} ${inputClassName} ${className}`}
          {...props}
        />
        {hasTrailing && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">{trailing}</div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  )
})

Input.displayName = 'Input'
export default Input
