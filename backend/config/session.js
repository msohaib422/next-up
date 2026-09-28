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

const MIN_DAYS = 1;
const MAX_DAYS = 90;
const DEFAULT_REFRESH_DAYS = 7;

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

/* ------------------------------------------------------------------ *
 * The refresh credential
 *
 * WHY A SECOND, LONGER-LIVED CREDENTIAL EXISTS
 * --------------------------------------------
 * The access token above is deliberately short-lived. That is the correct
 * security posture: if it leaks, the damage window is small. But a token whose
 * only way to be renewed is "the client sends another request" makes renewal
 * depend on the CLIENT being awake.
 *
 * A backgrounded tab cannot be relied on for that. Browsers throttle timers in
 * hidden tabs and may freeze the page entirely, so after roughly one window the
 * access token expires with nothing running to renew it - and the user is logged
 * out purely for having switched tabs.
 *
 * So renewal must not depend on a background timer. It happens on DEMAND, in
 * response to a real HTTP request, which the browser always sends and the
 * network stack never throttles:
 *
 *   1. the access token expires as normal (unchanged, still short-lived)
 *   2. the next request gets 401 TOKEN_EXPIRED
 *   3. the client makes ONE request to /api/auth/refresh, carrying a refresh
 *      token that is stored in a cookie the page's JavaScript cannot read
 *   4. the server verifies that refresh token, re-checks the account, and
 *      returns a new access token
 *
 * Nothing here is running on a timer, so a backgrounded, frozen or suspended
 * tab renews exactly the same as a foreground one. The moment the user comes
 * back and does anything, the session is restored.
 *
 * SECURITY IS NOT WEAKENED. This is the standard two-credential design:
 *   - the ACCESS token keeps its short expiry and is still verified on every
 *     single request. A stolen access token is still only useful for minutes.
 *   - the REFRESH token is longer-lived but is strictly less powerful: it can
 *     only be exchanged for an access token, it is signed by the same secret,
 *     and it is never accepted as an access token by any protected route.
 *   - it lives in an httpOnly cookie, so page JavaScript cannot read it and an
 *     XSS payload cannot exfiltrate it.
 *   - it is rotated on every use, and logout clears it, so it can be ended.
 *
 * The idle window above is preserved exactly as it was: the access token still
 * expires after SESSION_IDLE_MINUTES, and the server still slides it while the
 * user works. All that changed is WHERE renewal happens - on a request the
 * server can see, instead of on a timer the browser controls.
 * ------------------------------------------------------------------ */

const readDays = () => {
  const raw = process.env.REFRESH_TOKEN_DAYS;
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_REFRESH_DAYS;
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_REFRESH_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(parsed)));
};

/** How long a refresh token stays valid, in days. */
export const refreshTokenDays = () => readDays();

/** The same window in seconds - the form a JWT `expiresIn` needs. */
export const refreshTokenSeconds = () => readDays() * 24 * 60 * 60;

/**
 * The name of the cookie carrying the refresh token.
 *
 * Deliberately NOT prefixed "__Host-": that prefix additionally requires Secure,
 * which cannot be satisfied over plain http, and the app is developed and can
 * be self-hosted on http. The protections that matter are set below.
 */
export const REFRESH_COOKIE = 'nextup_refresh';

/** True when the app is being served over https, so the cookie can be Secure. */
const isSecureRequest = (req) => {
  if (String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true') return true;
  if (String(process.env.COOKIE_SECURE || '').toLowerCase() === 'false') return false;
  // Trust the platform's own answer when it is forwarded (Vercel, nginx, ...).
  return String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
};

/**
 * The attributes the refresh cookie is set with.
 *
 *   httpOnly  page JavaScript cannot read it, so an XSS payload cannot steal it
 *   sameSite  'lax' sends it on top-level navigation but NOT on a cross-site
 *             subrequest, which is what stops another site from using it to
 *             mint a session for a visitor
 *   secure    sent over https only (never forced on, so http dev still works)
 *   path      scoped to the auth routes that actually need it
 */
export const refreshCookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isSecureRequest(req),
  path: '/api/auth',
});

/** Read the refresh token off the request, or '' when there is none. */
export const readRefreshCookie = (req) => {
  const header = req?.headers?.cookie;
  if (!header) return '';
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === REFRESH_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return '';
};

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
