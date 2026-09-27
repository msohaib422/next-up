/**
 * How long a login lasts, and what "idle" means here.
 *
 * THE RULE THIS ENCODES
 * ---------------------
 * A session ends after the user has been away from the site for the idle
 * window (10 minutes by default). It does NOT end after a fixed amount of time
 * from login. Someone who signs in at 10:00 and works until 10:30 is working,
 * and must never be logged out at 10:10 - their credential is still being used
 * continuously, so it is kept alive continuously.
 *
 * HOW IT IS ENFORCED
 * ------------------
 * The credential itself carries the idle window: a JWT is issued with an
 * `exp` one window ahead, and every authenticated request that the server
 * accepts is answered with a freshly signed one (see middleware/auth.js). So:
 *
 *   - user keeps making requests  -> the token is renewed each time, so it is
 *                                   never allowed to expire, however long the
 *                                   session runs
 *   - user closes the tab/site   -> no requests happen, so the last token
 *                                   expires one window later and the server
 *                                   refuses it with 401 TOKEN_EXPIRED
 *   - user comes back later      -> the refusal is the server's own decision,
 *                                   not a guess made by the browser
 *
 * Nothing here stores a server-side session record, so the database schema is
 * untouched and no new dependency is introduced: the sliding window is carried
 * entirely by the signed token, and the enforcement point is the same
 * middleware that already rejected every invalid token.
 *
 * Configuration:
 *   SESSION_IDLE_MINUTES  how long a session survives without any activity.
 *                         Default 10. Clamped to 1..1440 so a typo cannot
 *                         produce a zero-length or effectively infinite window.
 */

const MIN_MINUTES = 1;
const MAX_MINUTES = 24 * 60;
const DEFAULT_MINUTES = 10;

const readMinutes = () => {
  const raw = process.env.SESSION_IDLE_MINUTES;
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_MINUTES;
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(parsed)));
};

/** The idle window in minutes, read fresh so a change takes effect at once. */
export const sessionIdleMinutes = () => readMinutes();

/** The idle window in seconds - the form a JWT `expiresIn` needs. */
export const sessionIdleSeconds = () => readMinutes() * 60;

/** The idle window in milliseconds - the form the client countdown needs. */
export const sessionIdleMs = () => readMinutes() * 60 * 1000;

/**
 * How far through the window a token must be before it is worth re-signing.
 *
 * At 25% the token still has three quarters of the window left, so a client
 * that keeps working is never anywhere near the edge, while a client that stops
 * still has to wait out the remainder of the window. Re-signing on every
 * request instead would be pure waste: the signature is identical in effect and
 * the only thing that changes is `exp`.
 */
export const RENEW_AFTER_FRACTION = 0.25;

/**
 * True when a verified token has already used up `RENEW_AFTER_FRACTION` of the
 * window and should be replaced with a fresh one.
 *
 * `decoded.exp` and `decoded.iat` come straight from the verified token, so
 * this cannot be influenced by the client. A token with no usable timestamps is
 * treated as not yet due, which fails safe: the token simply expires on its own
 * schedule instead of being renewed in a loop.
 */
export const isRenewalDue = (decoded, { now = Date.now(), windowSeconds = sessionIdleSeconds() } = {}) => {
  const issuedAt = Number(decoded?.iat) * 1000;
  const expiresAt = Number(decoded?.exp) * 1000;
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return false;
  if (expiresAt <= issuedAt) return false;
  const elapsed = now - issuedAt;
  if (elapsed < 0) return false;
  return elapsed >= (expiresAt - issuedAt) * RENEW_AFTER_FRACTION;
};
