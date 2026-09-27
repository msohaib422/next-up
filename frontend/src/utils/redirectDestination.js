/**
 * Where to send somebody after they sign in.
 *
 * A deep link can carry a destination (the "View Registration" button in the
 * admin email points at /users?highlight=... and lands on the sign-in screen
 * first), so the destination has to travel through the sign-in page. That makes
 * it untrusted input, and it is only ever used as an in-app route, so this
 * rejects anything that is not a plain internal path.
 */

/**
 * Returns the given path when it is a safe internal route, otherwise null so
 * the caller falls back to the dashboard.
 *
 * Rejects: absolute URLs, protocol-relative URLs ("//evil.com"), and anything
 * that is not a path at all.
 */
export function safeDestination(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate.startsWith('/')) return null;
  // "//host" is protocol-relative and would leave the app.
  if (candidate.startsWith('//')) return null;
  // A backslash is normalised to a slash by some browsers, so treat it the same.
  if (candidate.includes('\\')) return null;
  return candidate;
}

/** Builds the sign-in URL that remembers where the visitor was heading. */
export function loginUrlWithNext(from) {
  const destination = safeDestination(from);
  return destination ? `/login?next=${encodeURIComponent(destination)}` : '/login';
}
