import { GraduationCap } from 'lucide-react'

/**
 * Premium animated loading screen shown while the application is booting.
 *
 * Lightweight by design: only CSS transforms/opacity animations, no JS loops,
 * no extra dependencies. Respects prefers-reduced-motion.
 */
export default function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950"
      role="status"
      aria-live="polite"
      aria-label="Loading application"
    >
      {/* Soft radial glow behind the logo. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 dark:opacity-40"
        style={{
          background:
            'radial-gradient(circle, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0) 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-center">
        {/* Rotating rings / orbits. */}
        <div
          className="absolute h-44 w-44 rounded-full border-2 border-primary-200/50 border-t-primary-600 animate-spin motion-reduce:animate-none dark:border-primary-900/60 dark:border-t-primary-400"
          aria-hidden="true"
        />
        <div
          className="absolute h-60 w-60 rounded-full border border-primary-300/40 border-r-primary-500 animate-[spin_10s_linear_infinite_reverse] motion-reduce:animate-none dark:border-primary-800/50 dark:border-r-primary-400"
          aria-hidden="true"
        />
        <div
          className="absolute h-80 w-80 rounded-full border border-primary-100/40 border-b-primary-400 animate-[spin_16s_linear_infinite] motion-reduce:animate-none dark:border-primary-900/40 dark:border-b-primary-500"
          aria-hidden="true"
        />

        {/* Orbiting particles. */}
        <div
          className="absolute h-80 w-80 animate-[spin_16s_linear_infinite] motion-reduce:animate-none"
          aria-hidden="true"
        >
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
          <span className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary-400 opacity-70" />
        </div>
        <div
          className="absolute h-60 w-60 animate-[spin_10s_linear_infinite_reverse] motion-reduce:animate-none"
          aria-hidden="true"
        >
          <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary-600 opacity-80" />
        </div>

        {/* Logo (existing brand mark) at exact center. */}
        <div className="relative z-10 flex flex-col items-center gap-3 px-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/80 shadow-[0_8px_30px_rgba(37,99,235,0.25)] ring-1 ring-primary-200/60 dark:bg-gray-800/80 dark:ring-primary-900/60">
            <GraduationCap className="h-12 w-12 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              NextUp
            </h1>
          </div>

          {/* Subtle loading indicator. */}
          <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500 motion-reduce:animate-none" style={{ animationDelay: '-0.3s' }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500 motion-reduce:animate-none" style={{ animationDelay: '-0.15s' }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500 motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    </div>
  )
}