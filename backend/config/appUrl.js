/**
 * The one place the absolute, public address of this web app is worked out.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every email link (the admin "View Registration" button, the approval "Login"
 * button, "Apply Again", "Register Again") has to be an absolute URL, and it
 * has to point at the deployment the reader is actually on. Building those URLs
 * from a single variable meant one mistake was invisible: a `localhost` value
 * left in the production environment produced emails whose buttons led the
 * administrator to `http://localhost:5173/users?highlight=...` on their own
 * machine, where nothing is running. The link was not broken in the code - the
 * code did exactly what the environment told it to.
 *
 * So the address is resolved here, once, from several sources, and a
 * development-only value can never escape into a production email.
 *
 * RESOLUTION ORDER
 * ----------------
 *   1. FRONTEND_URL          the documented name; set it in Vercel to the
 *                            deployed origin
 *   2. APP_URL               accepted alias, for deployments that prefer it
 *   3. NEXT_PUBLIC_APP_URL   accepted alias (holds no secret, despite the name)
 *   4. PUBLIC_APP_URL        accepted alias
 *   5. VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL
 *                            set by the platform itself, so a project that
 *                            forgot FRONTEND_URL still gets real links
 *   6. the local dev server  development ONLY
 *
 * Each candidate is validated before it is accepted, and the first one that
 * passes wins. A rejected candidate never stops the search: a `localhost`
 * FRONTEND_URL in production simply falls through to the Vercel-provided
 * origin, which is the whole point.
 *
 * WHAT IS REFUSED IN PRODUCTION
 * -----------------------------
 *   - loopback / private hosts: localhost, 127.x, ::1, 0.0.0.0, *.local
 *   - anything that is not http(s)
 *   - embedded credentials (a URL must never carry a user:password)
 *
 * A refused value is logged, not silently used. If nothing at all is usable the
 * result is an empty string, and callers omit the button rather than emailing a
 * link that cannot work.
 */

/** The Vite dev server. Only ever used when this is not a production run. */
const DEV_ORIGIN = 'http://localhost:5173';

/** Hosts that only ever exist on one developer's machine. */
const isPrivateHost = (hostname) =>
  /^(localhost|0\.0\.0\.0|::1|\[::1\])$/i.test(hostname) ||
  /^127(\.\d{1,3}){3}$/.test(hostname) ||
  /^10(\.\d{1,3}){3}$/.test(hostname) ||
  /^192\.168(\.\d{1,3}){2}$/.test(hostname) ||
  /\.(local|internal|localhost)$/i.test(hostname);

/**
 * True when this process is serving a real deployment.
 *
 * Vercel sets VERCEL on every function invocation and NODE_ENV=production for a
 * production build, so either one is enough. Both are checked because a preview
 * build has VERCEL but no NODE_ENV, and a self-hosted production container can
 * have NODE_ENV with no Vercel at all.
 */
export const isProduction = () =>
  process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

/**
 * Turn a raw environment value into a usable origin, or return null with the
 * reason it was refused.
 */
const normalize = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return { error: 'not set' };

  // A bare host such as `nextup.vercel.app` is a common paste; give it a scheme
  // rather than throwing the value away.
  const withScheme = /^https?:\/\//i.test(value) ? value : `${isProduction() ? 'https' : 'http'}://${value}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { error: 'not a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `unsupported protocol ${parsed.protocol.replace(':', '')}` };
  }
  // A URL that carries a username/password is a credential, and credentials
  // never belong in an emailed link.
  if (parsed.username || parsed.password) {
    return { error: 'it contains embedded credentials' };
  }
  if (parsed.search || parsed.hash) {
    return { error: 'it carries a query string or fragment' };
  }
  // A private host is a legitimate local development URL and a dead link in
  // every real email, so it is accepted only outside production.
  if (isPrivateHost(parsed.hostname)) {
    return isProduction()
      ? { error: 'it points at localhost or a private address' }
      : { origin: `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}` };
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  return { origin: `${parsed.protocol}//${parsed.host}${path}` };
};

/** Every configured candidate, in priority order. */
const candidates = () => {
  const list = [
    ['FRONTEND_URL', process.env.FRONTEND_URL],
    ['APP_URL', process.env.APP_URL],
    ['NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL],
    ['PUBLIC_APP_URL', process.env.PUBLIC_APP_URL],
  ];

  // Provided by Vercel itself. Used as a bare host, so it gets https://.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    list.push(['VERCEL_PROJECT_PRODUCTION_URL', process.env.VERCEL_PROJECT_PRODUCTION_URL]);
  }
  if (process.env.VERCEL_URL) {
    list.push(['VERCEL_URL', process.env.VERCEL_URL]);
  }

  return list.filter(([, value]) => String(value || '').trim());
};

/**
 * The resolved public base URL, with no trailing slash.
 *
 * Returns '' when nothing usable is configured. The value is worked out on every
 * call (it is a few string operations) so a value changed at runtime is picked
 * up immediately rather than cached from a previous environment.
 *
 * @returns {{ baseUrl: string, source: string, rejected: Array<{source: string, value: string, reason: string}> }}
 */
export const resolveAppBaseUrl = () => {
  const rejected = [];

  for (const [source, value] of candidates()) {
    const result = normalize(value);
    if (result.origin) {
      if (rejected.length) {
        console.warn(
          `[app-url] ignoring unusable app URL(s) and using ${source}: ` +
            rejected.map((r) => `${r.source} (${r.reason})`).join(', ')
        );
      }
      return { baseUrl: result.origin, source, rejected };
    }
    rejected.push({ source, value: String(value).trim(), reason: result.error });
  }

  // Development convenience only. Never reached on Vercel, because step 5
  // always has a real value there, and step 6 is guarded below regardless.
  if (!isProduction()) {
    if (rejected.length) {
      console.warn(
        `[app-url] no usable app URL in development, using ${DEV_ORIGIN}: ` +
          rejected.map((r) => `${r.source} (${r.reason})`).join(', ')
      );
    }
    return { baseUrl: DEV_ORIGIN, source: 'development-default', rejected };
  }

  console.error(
    `[app-url] no usable public app URL in production, so email links will be omitted. ` +
      `Set FRONTEND_URL to the deployed origin. Ignored: ` +
      (rejected.map((r) => `${r.source} (${r.reason})`).join(', ') || 'nothing was configured')
  );
  return { baseUrl: '', source: 'none', rejected };
};

/** Convenience wrapper: just the origin, or '' when unconfigured. */
export const getAppBaseUrl = () => resolveAppBaseUrl().baseUrl;

/**
 * An absolute link into the web app, or null when no public URL is available.
 *
 * `path` is appended to the resolved origin, so `/users?highlight=123` becomes
 * `https://the-deployment/users?highlight=123`. Callers pass null when there is
 * no URL, which is how a link is omitted rather than emailed broken.
 */
export const buildAppUrl = (path = '') => {
  const { baseUrl } = resolveAppBaseUrl();
  if (!baseUrl) return null;
  const suffix = String(path || '');
  if (!suffix) return baseUrl;
  return `${baseUrl}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
};

/**
 * A non-secret description of how links are being built, for startup logging
 * and for the mail status report. It contains the public address only.
 */
export const describeAppUrl = () => {
  const { baseUrl, source } = resolveAppBaseUrl();
  return { baseUrl: baseUrl || null, source, production: isProduction() };
};
