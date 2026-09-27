import { useEffect, useState } from 'react'

/**
 * Reactive CSS media query, used only where a purely visual responsive
 * decision needs to reach JavaScript (the compact header layout).
 * Returns false during server-side rendering, where there is no window.
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const list = window.matchMedia(query)
    const onChange = (event) => setMatches(event.matches)
    // Re-read on mount: the viewport can change between first render and this
    // effect (a rotation, a window resize during hydration).
    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}
