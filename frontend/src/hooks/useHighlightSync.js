import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Whether a highlighted id still needs the list to be reloaded.
 *
 * Split out from the hook below as a pure function so the decision can be read
 * (and checked) without rendering anything:
 *
 *   - no highlight, or a reload already in progress  -> false
 *   - this id was already handled                    -> false (never loops)
 *   - the loaded list already contains the id        -> false, and it is now
 *                                                      handled
 *   - otherwise                                      -> true, and it becomes
 *                                                      handled
 */
export function needsHighlightRefetch({ highlightId, loading, ids, handled }) {
  if (!highlightId || loading) return false
  if (handled === highlightId) return false
  if (Array.isArray(ids) && ids.some((id) => String(id) === String(highlightId))) return false
  return true
}

/**
 * Keeps an already-open list honest when a notification points at one of its
 * items.
 *
 * Every content page loads its data once, on mount. That is enough for a normal
 * navigation, but not for this case: an admin is sitting on /tasks when a
 * colleague creates a task, the notification arrives through the existing poll,
 * and its link re-targets the page the admin is already on - so no remount, no
 * refetch, and the highlighted item is missing from the loaded list.
 *
 * This hook closes exactly that gap and nothing more: when the URL highlights an
 * id the loaded list does not contain, the page's own fetch function runs once
 * more. It reuses the notification the admin already received - there is no
 * second notification system, no socket layer and no polling of its own - and it
 * fires at most one extra request per highlighted id.
 *
 * Usage: useHighlightSync(tasks.map((t) => t._id), loading, fetchTasks)
 */
export function useHighlightSync(ids, loading, refetch) {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  // Refs keep the latest values without making them effect dependencies, so a
  // new array identity on every render cannot re-trigger anything.
  const idsRef = useRef(ids)
  const refetchRef = useRef(refetch)
  idsRef.current = ids
  refetchRef.current = refetch
  // The last id that was either found in the list or refetched for. Guarding on
  // it is what makes a row that never arrives (deleted, or not readable by this
  // account) impossible to turn into a request loop.
  const handled = useRef(null)
  const idsKey = Array.isArray(ids) ? ids.map(String).join('|') : ''

  useEffect(() => {
    const current = idsRef.current
    if (needsHighlightRefetch({ highlightId, loading, ids: current, handled: handled.current })) {
      handled.current = highlightId
      if (typeof refetchRef.current === 'function') refetchRef.current()
      return
    }
    // Loaded and present (or nothing to do): remember it so the next render of
    // the same link does not reload again.
    if (highlightId && !loading && handled.current !== highlightId) {
      const present = Array.isArray(current) && current.some((id) => String(id) === String(highlightId))
      if (present) handled.current = highlightId
    }
  }, [highlightId, loading, idsKey])
}
