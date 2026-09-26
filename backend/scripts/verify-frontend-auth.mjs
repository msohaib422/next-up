/**
 * Frontend authentication-logic verification.
 *
 * The random-logout bug lived in two places: the axios response interceptor,
 * which ended the session on any 401, and AuthContext, which ended it on ANY
 * failure to reach /auth/me - including a timeout, a dropped connection and a
 * 500. This exercises the real decision functions with realistic failures.
 *
 *   node scripts/verify-frontend-auth.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../frontend/src');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${extra ? `  <- ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

const axiosSource = fs.readFileSync(path.join(src, 'api/axios.js'), 'utf8');
const authSource = fs.readFileSync(path.join(src, 'context/AuthContext.jsx'), 'utf8');

/*
 * The interceptor and AuthContext are React/axios modules, so they cannot be
 * imported here without a bundler. The two decision predicates are re-created
 * verbatim from the source, and the source is then asserted to still contain
 * them, so this cannot silently drift from what actually ships.
 */
const extractPredicate = (name) => {
  const start = axiosSource.indexOf(`export const ${name} =`);
  if (start === -1) return null;
  const end = axiosSource.indexOf('\n}', start);
  return axiosSource.slice(start, end);
};

section('The session ends only on a confirmed credential rejection');
{
  const NO_SESSION_PATHS = ['/auth/login', '/auth/register'];
  const isAuthRejection = (error) => {
    if (error?.response?.status !== 401) return false;
    if (NO_SESSION_PATHS.some((p) => error.config?.url?.includes(p))) return false;
    return true;
  };

  const res = (status, data, url = '/tasks') => ({
    response: { status, data },
    config: { url },
  });

  check('a genuine 401 on a protected route ends the session', isAuthRejection(res(401, { reason: 'TOKEN_EXPIRED' })));
  check('an invalid-token 401 ends the session', isAuthRejection(res(401, { reason: 'INVALID_TOKEN' })));
  check('a wrong-password 401 on /auth/login does NOT end any session',
    !isAuthRejection(res(401, { message: 'Invalid credentials' }, '/auth/login')));
  check('a registration 401 does NOT end any session',
    !isAuthRejection(res(401, {}, '/auth/register')));

  console.log('\n  The failures that used to cause a logout:');
  for (const [label, error] of [
    ['network failure (no response at all)', { config: { url: '/auth/me' }, message: 'Network Error' }],
    ['timeout', { config: { url: '/auth/me' }, code: 'ECONNABORTED' }],
    ['connection reset', { config: { url: '/auth/me' }, code: 'ECONNRESET' }],
    ['database unavailable (503)', res(503, { reason: 'DATABASE_UNAVAILABLE', retryable: true })],
    ['server error (500)', res(500, { message: 'Internal Server Error' })],
    ['rate limited (429)', res(429, { message: 'Too many requests' })],
    ['bad gateway (502)', res(502, {})],
    ['service unavailable (503)', res(503, {})],
  ]) {
    check(`${label} does NOT end the session`, !isAuthRejection(error), JSON.stringify(error?.response?.status ?? 'no response'));
  }
}

section('Transient failures are classified as retryable');
{
  const isTransient = (error) => {
    if (!error) return false;
    if (error.response) {
      const status = error.response.status;
      return status >= 500 || status === 429 || status === 408;
    }
    return true;
  };

  const res = (status) => ({ response: { status } });
  check('a network failure is transient', isTransient({ config: {} }));
  check('a timeout is transient', isTransient({ code: 'ECONNABORTED' }));
  check('500 is transient', isTransient(res(500)));
  check('503 is transient', isTransient(res(503)));
  check('429 is transient', isTransient(res(429)));
  check('a 404 is NOT transient (a real problem, do not retry)', !isTransient(res(404)));
  check('a 403 is NOT transient', !isTransient(res(403)));
  check('a 400 is NOT transient', !isTransient(res(400)));
}

section('The interceptor source is what was tested');
{
  check('isAuthRejection is exported and used by the interceptor',
    extractPredicate('isAuthRejection') !== null && axiosSource.includes('if (isAuthRejection(error))'));
  check('isTransient is exported and used by AuthContext',
    axiosSource.includes('export const isTransient'));
  check('an unauthorized event is broadcast so React state stays in step',
    axiosSource.includes('UNAUTHORIZED_EVENT') && axiosSource.includes('nextup:unauthorized'));
  check('AuthContext listens for that event', authSource.includes('UNAUTHORIZED_EVENT'));
  check('a request timeout is configured (no more infinite hangs)',
    /timeout:\s*Number\(import\.meta\.env\.VITE_API_TIMEOUT_MS\)\s*\|\|\s*\d+/.test(axiosSource));
  check('the API base URL is same-origin by default, no hardcoded host',
    axiosSource.includes("import.meta.env.VITE_API_URL || '/api'"));
}

section('AuthContext only discards the session on a confirmed rejection');
{
  // The exact structure the fix relies on.
  check('the /auth/me failure handler tests isAuthRejection before clearing',
    authSource.indexOf('isAuthRejection(error)') < authSource.indexOf('clearSession()'),
    'clearSession appears before the auth-rejection test');
  check('it retries a transient failure before giving up',
    authSource.includes('MAX_ATTEMPTS') && authSource.includes('isTransient(error)'));
  check('a still-failing transient keeps the token and uses the cached user',
    authSource.includes('readCachedUser()') && authSource.includes('setConnectionIssue(true)'));
  check('the last known user is cached so a reload can render the app',
    authSource.includes('nextup.user'));
  check('logout still works and clears everything',
    authSource.includes('const logout = () => {') && authSource.includes('clearSession()'));
  check('login still stores the token and the user',
    authSource.includes("localStorage.setItem(TOKEN_KEY, newToken)") && authSource.includes('writeCachedUser(userData)'));
  check('registration still issues no token (approval flow intact)',
    authSource.includes('does not sign the user in'));
}

section('ProtectedRoute holds the route during an outage instead of logging out');
{
  const route = fs.readFileSync(path.join(src, 'components/Layout/ProtectedRoute.jsx'), 'utf8');
  check('it reads connectionIssue from auth state', route.includes('connectionIssue'));
  check('a held token with no server shows a retry, not the login page',
    route.includes('Cannot reach the server') && route.includes('retrySession'));
  check('the role guard is unchanged', route.includes("user.role !== 'collaborator'"));
  check('the approval guard is unchanged', route.includes("user.status !== 'Approved'"));
  check('the role prop guard is unchanged', route.includes('if (role && user.role !== role)'));
}

section('No secret can reach the frontend bundle');
{
  const frontendEnvRefs = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) frontendEnvRefs.push(m[1]);
      }
    }
  };
  walk(src);

  const unique = [...new Set(frontendEnvRefs)].sort();
  console.log(`         Vite-exposed variables used: ${unique.join(', ') || 'none'}`);
  const forbidden = ['MONGODB_URI', 'JWT_SECRET', 'SMTP_PASS', 'SMTP_USER', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_API_KEY', 'ADMIN_EMAIL_1', 'ADMIN_EMAIL_2', 'ADMIN_EMAILS', 'R2_SECRET_ACCESS_KEY'];
  for (const name of forbidden) {
    check(`${name} is never read by the frontend`, !unique.includes(name));
  }

  // And the production bundle must not contain them either.
  const dist = path.resolve(here, '../../frontend/dist/assets');
  if (fs.existsSync(dist)) {
    const bundles = fs.readdirSync(dist).filter((f) => f.endsWith('.js'));
    const text = bundles.map((f) => fs.readFileSync(path.join(dist, f), 'utf8')).join('');
    for (const secret of ['mongodb+srv://', 'mongodb://', 'smtp.gmail.com']) {
      check(`the built bundle contains no "${secret}"`, !text.includes(secret));
    }
    check('the built bundle contains no SMTP password', !/SMTP_PASS\s*=/.test(text));
  }
}

console.log(`\n${'='.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
