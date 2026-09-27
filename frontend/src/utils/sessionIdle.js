/**
 * Ten-minute session bookkeeping, in the browser.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The rule the product asked for is precise: a session that the user walked away
 * from expires after ten minutes, and a session the user is *using* never does.
 *
 * The server already decides the real thing - see backend/config/session.js,
 * where the credential carries the idle window and is re-signed on every
 * authenticated request, so working keeps you signed in and stopping lets the
 * credential lapse. That is the authority, and nothing here can extend it.
 *
 * What this file adds is the browser's own knowledge of one fact the server
 * cannot see: whether the tab that started the session is still open.
 *
 *   sessionStorage  lives and dies with a single tab. It is gone the moment the
 *                   user closes the tab or the browser, and it survives a
 *                   refresh of the same tab. That is exactly the distinction
 *                   the requirement turns on.
 *   localStorage    the token and the time of the last confirmed activity, both
 *                   of which outlive the tab.
 *
 * So on start-up:
 *   - a tab is still open (the marker is there) -> nothing to decide, this is a
 *     refresh or a second tab, and the server validates the token as usual
 *   - the marker is gone -> the previous tab was closed. If more than the idle
 *     window has passed since the last activity, the session is dropped before
 *     a single protected request is made, so the user is asked to sign in
 *     immediately instead of seeing a protected page flash and then bounce.
 *
 * A user who is working has the marker the whole time, which is why nothing here
 * can log out somebody in the middle of using the site - including on a plain
 * page refresh, where the marker deliberately survives.
 */

/** localStorage keys. Namespaced so nothing collides with the existing ones. */
const LAST_ACTIVE_KEY = 'nextup.session.lastActiveAt'
const IDLE_WINDOW_KEY = 'nextup.session.idleMs'

/** sessionStorage marker: "this tab is open". Never leaves the tab. */
const OPEN_TAB_KEY = 'nextup.session.openTab'

/**
 * Used only before the server has ever told us its window (a first visit, or
 * storage that was cleared). It matches the server's own default; the first
 * authenticated response replaces it with the real value.
 */
export const DEFAULT_IDLE_MS = 10 * 60 * 1000

const readNumber = (store, key) => {
  const raw = readRaw(store, key)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

const write = (store, key, value) => {
  try {
    if (value === null) window[store].removeItem(key)
    else window[store].setItem(key, String(value))
  } catch {
    /* storage unavailable (private mode, quota) - the server still enforces the
       window, so this is only ever a convenience. */
  }
}

/** The idle window in milliseconds, as the server last reported it. */
export function idleWindowMs() {
  return readNumber('localStorage', IDLE_WINDOW_KEY) || DEFAULT_IDLE_MS
}

/** Record the server's own idle window so the browser stops keeping a copy. */
export function rememberIdleWindow(ms) {
  const value = Number(ms)
  if (Number.isFinite(value) && value > 0) write('localStorage', IDLE_WINDOW_KEY, Math.round(value))
}

/** Mark this tab as the live one holding the session. */
export function markTabOpen() {
  write('sessionStorage', OPEN_TAB_KEY, '1')
}

const readRaw = (store, key) => {
  try {
    return window[store].getItem(key)
  } catch {
    return null
  }
}

/** True when a tab in this browser is still holding the session open. */
export function isTabOpen() {
  return readRaw('sessionStorage', OPEN_TAB_KEY) === '1'
}

/** A timestamp of confirmed activity (a login, or a request the server took). */
export function noteActivity(at = Date.now()) {
  write('localStorage', LAST_ACTIVE_KEY, at)
}

/** When activity was last confirmed, or null when there is no record. */
export function lastActivityAt() {
  return readNumber('localStorage', LAST_ACTIVE_KEY)
}

/**
 * The tab is being closed or navigated away from.
 *
 * `pagehide` is the reliable one (it also fires when the page enters the back/
 * forward cache, where `beforeunload` does not). The time is stamped here as
 * well as on every authenticated response, so a tab the user walked away from is
 * measured from the moment they left it, and the open marker is dropped so the
 * next start-up knows this tab is gone.
 */
export function noteTabClosed(at = Date.now()) {
  noteActivity(at)
  try {
    window.sessionStorage.removeItem(OPEN_TAB_KEY)
  } catch {
    /* nothing to do */
  }
}

/**
 * True when the stored session belongs to a tab that has been closed and has
 * now been idle for longer than the window.
 *
 * Only ever true for a closed tab. A tab that is open, a refresh, or a second
 * tab all fail the first test and are left entirely alone.
 */
export function isClosedSessionExpired({ now = Date.now(), idleMs = idleWindowMs() } = {}) {
  if (isTabOpen()) return false
  const last = lastActivityAt()
  if (last === null) return false
  return now - last >= idleMs
}

/** Forget every trace of a session in this browser. Used on logout. */
export function clearSessionRecord() {
  write('localStorage', LAST_ACTIVE_KEY, null)
  write('localStorage', IDLE_WINDOW_KEY, null)
  write('sessionStorage', OPEN_TAB_KEY, null)
}
