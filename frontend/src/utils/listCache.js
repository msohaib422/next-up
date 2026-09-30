/**
 * The last list this tab received for each endpoint, kept in memory only.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard and the list pages ask the server for the very same
 * collections. `/tasks` is read by the dashboard, and then read again - in full,
 * from scratch - every time the Tasks tab is opened; the same is true of
 * `/assignments`, `/quizzes`, `/announcements` and `/essentials`. Navigating
 * between two tabs therefore threw away an answer the app was already holding
 * and spent a full network round trip getting it again, during which the page
 * had nothing to draw.
 *
 * WHAT IT IS NOT
 * --------------
 * It is a display cache, never a source of truth. Every reader still makes its
 * request; this only decides what is on screen until that request comes back -
 * which is exactly the window the pages previously spent showing a spinner. The
 * moment the server answers, it replaces what is shown.
 *
 * SAFETY
 * ------
 *  - Only successful GET responses are stored, keyed by the exact path that was
 *    requested.
 *  - Anything that changes a list drops it, so the next reader refetches.
 *  - Signing out drops all of it, so one account's data can never appear for
 *    the next.
 *  - Nothing is written to storage: this lives and dies with the tab.
 */

const lists = new Map()

/** True when this tab already has the list for this path. */
export function hasList(path) {
  return lists.has(path)
}

/** The last list fetched for this path, or undefined if there is none. */
export function readList(path) {
  return lists.get(path)
}

/**
 * Record a freshly fetched list.
 * Returns the list so a caller can hand it straight to a state setter.
 */
export function rememberList(path, list) {
  lists.set(path, list)
  return list
}

/** Drop one list, for when something has just changed it. */
export function forgetList(path) {
  lists.delete(path)
}

/** Drop every list, for when the session ends. */
export function forgetAllLists() {
  lists.clear()
}
