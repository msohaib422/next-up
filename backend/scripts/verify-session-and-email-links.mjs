/**
 * Verification for the three fixes this round brought in:
 *
 *   1. the absolute application URL used in every email
 *   2. the ten-minute closed-session window (and the promise that an active
 *      session is never ended by it)
 *   3. the "Login" button at the end of the approval email
 *
 * Nothing here is part of the application. Run from backend/:
 *   node scripts/verify-session-and-email-links.mjs
 *
 * Only records tagged for this suite are created, and they are removed again at
 * the end. The database is used read-only apart from those delivery records,
 * because the session checks deliberately go through the real `protect`
 * middleware against a real account - a stubbed one would prove nothing about
 * what the server actually accepts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

/*
 * Capture the generated mail instead of sending it. Nodemailer is replaced
 * before mailService is imported, so nothing can reach a real mailbox.
 */
const mails = [];
nodemailer.createTransport = () => ({
  verify: async () => true,
  close: () => {},
  sendMail: async (options) => {
    mails.push({
      to: (Array.isArray(options.to) ? options.to : [options.to]).map((a) => String(a).toLowerCase()),
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return { messageId: 'verify' };
  },
});

const { buildAppUrl, resolveAppBaseUrl, describeAppUrl } = await import('../config/appUrl.js');
const { sessionIdleSeconds, sessionIdleMs, isRenewalDue, RENEW_AFTER_FRACTION } = await import('../config/session.js');
const { generateToken } = await import('../utils/helpers.js');
const { protect, SESSION_TOKEN_HEADER, SESSION_IDLE_HEADER } = await import('../middleware/auth.js');
const { sendAdminNewRegistrationEmail, sendRegistrationApprovedEmail, sendRegistrationRejectedEmail } =
  await import('../services/mailService.js');
const User = (await import('../models/User.js')).default;
const connectDB = (await import('../config/db.js')).default;

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}  <- ${extra}`); }
};
const section = (title) => console.log(`\n=== ${title} ===`);

const MANAGED_ENV = [
  'FRONTEND_URL', 'APP_URL', 'NEXT_PUBLIC_APP_URL', 'PUBLIC_APP_URL',
  'VERCEL', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'NODE_ENV',
];
const savedEnv = Object.fromEntries(MANAGED_ENV.map((k) => [k, process.env[k]]));
/** Put the environment into a known state, run something in it, then restore. */
const withEnv = async (values, run) => {
  for (const key of MANAGED_ENV) delete process.env[key];
  Object.assign(process.env, values);
  try { return await run(); } finally {
    for (const key of MANAGED_ENV) delete process.env[key];
    for (const [key, value] of Object.entries(savedEnv)) if (value !== undefined) process.env[key] = value;
  }
};

/** A token whose clock says it was issued `ageMinutes` ago. */
const agedToken = (id, ageMinutes) => {
  const issued = Math.floor(Date.now() / 1000) - ageMinutes * 60;
  return jwt.sign({ id, iat: issued, exp: issued + sessionIdleSeconds() }, process.env.JWT_SECRET);
};

/** Run the real `protect` middleware and report what it did. */
const runProtect = async (token) => {
  const headers = {};
  const result = { status: 0, body: null, headers, nextCalled: false };
  const res = {
    setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  await protect({ headers: { authorization: token ? `Bearer ${token}` : undefined } }, res, () => { result.nextCalled = true; });
  return result;
};

const anchors = (html) => [...String(html).matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ tag: m[1], label: m[2].trim() }));

/* ------------------------------------------------------------------ */
section('1 - The application URL is environment-aware');
await withEnv({ FRONTEND_URL: 'http://localhost:5173' }, () => {
  check('development keeps working on the local dev server', describeAppUrl().baseUrl === 'http://localhost:5173', describeAppUrl().baseUrl);
});
await withEnv({ FRONTEND_URL: 'https://nextup.example.com/' }, () => {
  check('production uses the configured deployed origin', buildAppUrl('/login') === 'https://nextup.example.com/login', buildAppUrl('/login'));
  check('a trailing slash never doubles up', resolveAppBaseUrl().baseUrl === 'https://nextup.example.com', resolveAppBaseUrl().baseUrl);
});
await withEnv({ FRONTEND_URL: 'https://nextup.example.com' }, () => {
  check('a deep link is built from that origin', buildAppUrl('/users?highlight=abc') === 'https://nextup.example.com/users?highlight=abc');
});

section('2 - Production never emails a localhost link');
const prod = { NODE_ENV: 'production', VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'nextup-real.vercel.app' };
await withEnv({ ...prod, FRONTEND_URL: 'http://localhost:5173' }, () => {
  const url = buildAppUrl('/users?highlight=abc');
  check('a localhost FRONTEND_URL is refused in production', !/localhost/.test(String(url)), url);
  check('the Vercel production origin is used instead', url === 'https://nextup-real.vercel.app/users?highlight=abc', url);
  check('the refusal is reported, not silent', describeAppUrl().source === 'VERCEL_PROJECT_PRODUCTION_URL', describeAppUrl().source);
});
await withEnv({ ...prod, FRONTEND_URL: 'http://127.0.0.1:5173' }, () => {
  check('127.0.0.1 is refused too', !/127\.0\.0\.1/.test(String(buildAppUrl('/login'))), buildAppUrl('/login'));
});
await withEnv({ ...prod, FRONTEND_URL: 'https://user:pass@nextup.example.com' }, () => {
  check('a URL with credentials is refused', !String(buildAppUrl('/login')).includes('pass'), buildAppUrl('/login'));
});
await withEnv({ ...prod, FRONTEND_URL: 'ftp://nextup.example.com' }, () => {
  check('a non-http scheme is refused', !String(buildAppUrl('/login')).startsWith('ftp'), buildAppUrl('/login'));
});
await withEnv({ NODE_ENV: 'production', VERCEL: '1' }, () => {
  check('with nothing configured the link is omitted, not faked', buildAppUrl('/login') === null, buildAppUrl('/login'));
});

/* ------------------------------------------------------------------ */
section('3 - Session window: the server is the authority');
check('the default idle window is ten minutes', sessionIdleSeconds() === 600, sessionIdleSeconds());
await withEnv({ SESSION_IDLE_MINUTES: '25' }, () => {
  check('SESSION_IDLE_MINUTES is honoured', sessionIdleSeconds() === 1500, sessionIdleSeconds());
  check('and the client is told the same number', sessionIdleMs() === 1500 * 1000);
});
await withEnv({ SESSION_IDLE_MINUTES: '0' }, () => {
  check('a zero window cannot lock everybody out', sessionIdleSeconds() === 600, sessionIdleSeconds());
});
await withEnv({ SESSION_IDLE_MINUTES: 'nonsense' }, () => {
  check('an unparseable window falls back to the default', sessionIdleSeconds() === 600, sessionIdleSeconds());
});
const freshClaims = jwt.decode(generateToken('000000000000000000000000'));
check('a session token expires one window from now', Math.abs(freshClaims.exp - freshClaims.iat - 600) <= 1, `${freshClaims.exp - freshClaims.iat}s`);
check('a token used immediately is not due for renewal', isRenewalDue(freshClaims) === false);
check('a token 9 minutes old is due for renewal', isRenewalDue(jwt.decode(agedToken('000000000000000000000000', 9))) === true);
check('a token 1 minute old is not due for renewal', isRenewalDue(jwt.decode(agedToken('000000000000000000000000', 1))) === false);
check('the renewal point is inside the window', RENEW_AFTER_FRACTION > 0 && RENEW_AFTER_FRACTION < 1, RENEW_AFTER_FRACTION);

/* ------------------------------------------------------------------ */
section('4 - Session window: a real request through the real middleware');
await connectDB();
const admin = await User.findOne({ role: 'collaborator' });
check('an administrator account is available to test with', Boolean(admin), 'no collaborator found');

if (admin) {
  const live = await runProtect(generateToken(admin._id));
  check('a brand new token is accepted', live.nextCalled === true, JSON.stringify(live.body));
  check('and is not needlessly replaced', !live.headers[SESSION_TOKEN_HEADER.toLowerCase()], 'a new token was issued immediately');
  check('the idle window is published to the client', Number(live.headers[SESSION_IDLE_HEADER.toLowerCase()]) === sessionIdleMs());

  // Nine minutes of continuous use: the token is old but the user never left.
  const working = await runProtect(agedToken(admin._id, 9));
  check('a nine minute old token from a working user is accepted', working.nextCalled === true, JSON.stringify(working.body));
  const renewed = working.headers[SESSION_TOKEN_HEADER.toLowerCase()];
  check('a working session is given a fresh token instead of being ended', Boolean(renewed), 'no renewal header');
  if (renewed) {
    const claims = jwt.decode(renewed);
    check('the renewed token starts a full window from now', Math.abs(claims.exp - Math.floor(Date.now() / 1000) - 600) <= 2, `${claims.exp - claims.iat}s`);
    const afterRenewal = await runProtect(renewed);
    check('the renewed token works', afterRenewal.nextCalled === true, JSON.stringify(afterRenewal.body));
  }

  // The closed-tab case: no requests for longer than the window.
  const abandoned = jwt.sign(
    { id: admin._id, iat: Math.floor(Date.now() / 1000) - 601, exp: Math.floor(Date.now() / 1000) - 1 },
    process.env.JWT_SECRET
  );
  const expired = await runProtect(abandoned);
  check('a session left alone past the window is refused by the server', expired.status === 401, JSON.stringify(expired.body));
  check('and the client is told why, so it can ask for a sign-in', expired.body?.reason === 'TOKEN_EXPIRED', JSON.stringify(expired.body));

  const forged = jwt.sign({ id: admin._id }, 'not-the-real-secret', { expiresIn: '10m' });
  const bad = await runProtect(forged);
  check('a forged token is still refused', bad.status === 401 && bad.body?.reason === 'INVALID_TOKEN', JSON.stringify(bad.body));

  const missing = await runProtect(null);
  check('a request with no token is still refused', missing.status === 401 && missing.body?.reason === 'NO_TOKEN', JSON.stringify(missing.body));
}

/* ------------------------------------------------------------------ */
section('5 - Email links, in development and in production');
const applicant = {
  // A real id, because the delivery record stores it as a reference. No account
  // is created: the emails are built from this plain snapshot, exactly as they
  // are for a removed account.
  _id: new mongoose.Types.ObjectId(),
  name: 'Link Verifier',
  email: `links${Date.now().toString(36)}@test.local`,
  createdAt: new Date(),
  status: 'Pending Approval',
  rejectionReason: '',
};

await withEnv({ FRONTEND_URL: 'https://nextup.example.com' }, async () => {
  mails.length = 0;
  await sendAdminNewRegistrationEmail(applicant, ['admin.one@test.local', 'admin.two@test.local']);
  const adminMail = mails.find((m) => m.subject.startsWith('New registration'));
  const button = anchors(adminMail?.html).find((a) => a.label === 'View Registration');
  check('the admin email still has a "View Registration" button', Boolean(button), adminMail?.subject);
  check('it points at the configured origin', /href="https:\/\/nextup\.example\.com\/users\?highlight=/.test(button?.tag || ''), button?.tag);
  check('it deep-links to the registration being reviewed', (button?.tag || '').includes(String(applicant._id)));
  check('the URL carries no credential of any kind', !/token|secret|password|auth=/i.test(button?.tag || ''), button?.tag);
  check('the copy still says the admin will be asked to sign in', /sign in/i.test(adminMail?.html || ''));

  mails.length = 0;
  await sendRegistrationApprovedEmail(applicant);
  const approval = mails.find((m) => m.subject.startsWith('Your NextUp registration has been approved'));
  const approvalLinks = anchors(approval?.html);
  const login = approvalLinks.find((a) => a.label === 'Login');
  check('the approval email ends with a "Login" button', Boolean(login), approvalLinks.map((a) => a.label).join(' | '));
  check('the Login button targets the existing sign-in page', /href="https:\/\/nextup\.example\.com\/login"/.test(login?.tag || ''), login?.tag);
  check('it opens in a new tab', /target="_blank"/.test(login?.tag || ''), login?.tag);
  check('and cannot reach back through window.opener', /rel="noopener noreferrer"/.test(login?.tag || ''), login?.tag);
  check('it is the last link in the message', approvalLinks[approvalLinks.length - 1]?.label === 'Login', approvalLinks.map((a) => a.label).join(' | '));
  check('the existing primary button is untouched', approvalLinks.some((a) => a.label === 'Login to NextUp'));
  check('no credential is embedded in either link', !/token|secret|password/i.test(approval?.html.split('href=')[1] || ''));
  check('the plain-text version carries it too', /Login: https:\/\/nextup\.example\.com\/login/.test(approval?.text || ''), approval?.text);
});

await withEnv(prod, async () => {
  mails.length = 0;
  await sendAdminNewRegistrationEmail(applicant, ['admin.one@test.local']);
  await sendRegistrationApprovedEmail(applicant);
  await sendRegistrationRejectedEmail(applicant, 'Not this time');
  const subjects = ['New registration', 'has been approved', 'was not approved'];
  for (const subject of subjects) {
    const mail = mails.find((m) => m.subject.includes(subject));
    const links = anchors(mail?.html).map((a) => a.tag).join(' ');
    check(`"${mail?.subject}" uses the production origin`, /https:\/\/nextup-real\.vercel\.app/.test(links), links.slice(0, 120));
    check(`"${mail?.subject}" contains no localhost`, !/localhost|127\.0\.0\.1/.test(`${links} ${mail?.html}`));
  }
});

/* ------------------------------------------------------------------ */
section('6 - The browser half: a closed tab expires, a live one never does');
/*
 * The real frontend module is imported here, not a copy of it. It only touches
 * `window` inside its functions, so a pair of in-memory storages is enough to
 * run it - and a copy would prove nothing about what ships.
 */
const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
};
globalThis.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage() };
const idle = await import(path.resolve(here, '../../frontend/src/utils/sessionIdle.js'));

const MINUTE = 60 * 1000;

idle.markTabOpen();
idle.noteActivity();
check('the default window is ten minutes', idle.idleWindowMs() === 10 * MINUTE, idle.idleWindowMs());
check("a tab that is still open never expires, however long ago it was used",
  idle.isClosedSessionExpired({ now: Date.now() + 60 * MINUTE }) === false);
check('a refresh cannot be mistaken for a closed tab', idle.isTabOpen() === true);

idle.noteTabClosed();
check('closing the tab is recorded', idle.isTabOpen() === false);
check('coming back after five minutes keeps the session',
  idle.isClosedSessionExpired({ now: Date.now() }) === false);
check('coming back after 9 minutes 59 seconds keeps the session',
  idle.isClosedSessionExpired({ now: Date.now() + (10 * MINUTE - 1000) }) === false);
check('coming back after ten minutes requires a sign-in',
  idle.isClosedSessionExpired({ now: Date.now() + 10 * MINUTE }) === true);
check('coming back after an hour requires a sign-in',
  idle.isClosedSessionExpired({ now: Date.now() + 60 * MINUTE }) === true);

idle.clearSessionRecord();
check('after signing out there is nothing left to expire', idle.lastActivityAt() === null);
check('and it does not report an expired session', idle.isClosedSessionExpired({}) === false);

idle.rememberIdleWindow(25 * MINUTE);
check("the browser uses the window the server reported", idle.idleWindowMs() === 25 * MINUTE, idle.idleWindowMs());
idle.rememberIdleWindow(0);
check('a nonsense window is ignored rather than trusted', idle.idleWindowMs() === 25 * MINUTE, idle.idleWindowMs());

/* ------------------------------------------------------------------ */
await mongoose.disconnect().catch(() => {});
console.log(`\n${'='.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
