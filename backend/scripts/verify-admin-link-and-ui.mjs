/**
 * Verification for the "View Registration" email link, the sign-in redirect,
 * the NextUp branding and the password visibility toggle.
 *
 * Run with `node scripts/verify-admin-link-and-ui.mjs` from backend/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const frontendSrc = path.join(repo, 'frontend/src');

dotenv.config({ path: path.resolve(here, '../.env') });

const mails = [];
nodemailer.createTransport = () => ({
  verify: async () => true,
  close: () => {},
  sendMail: async (o) => { mails.push({ to: String(o.to).toLowerCase(), subject: o.subject, html: o.html }); return { messageId: 'x' }; },
});

const { register } = await import('../controllers/authController.js');
const { sendRegistrationApprovedEmail, sendAccountDeletedEmail } = await import('../services/mailService.js');
const User = (await import('../models/User.js')).default;
const cfg = await import('../config/db.js');
await cfg.default();

let pass = 0; let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}  <- ${extra}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);
const read = (rel) => fs.readFileSync(path.join(frontendSrc, rel), 'utf8');
/** index.html sits at the frontend root, not under src/. */
const readRoot = (rel) => fs.readFileSync(path.join(repo, 'frontend', rel), 'utf8');
const mk = () => { const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

/* ------------------------------------------------------------------ */
section('1 - The admin email has a working "View Registration" button');
const applicant = `vf${Date.now().toString(36)}@test.local`;
const res = mk();
await register({ body: { name: 'Link Applicant', email: applicant, password: 'secret123' } }, res, (e) => { throw e; });
check('applicant registered', res.statusCode === 201, JSON.stringify(res.body));
const admin = (await User.findOne({ role: 'collaborator' })).email.toLowerCase();
const adminMail = mails.find((m) => m.to === admin && /new registration awaiting/i.test(m.subject));
check('admin received the registration alert', !!adminMail, adminMail?.subject);
const button = (adminMail?.html || '').match(/<a href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
check('the button is labelled "View Registration"', button?.[2]?.trim() === 'View Registration', button?.[2]);
const url = button?.[1] || '';
check('it points at the Users page, not the dashboard', /\/users(\?|$)/.test(url), url);
check('it deep-links to this specific registration', url.includes('highlight=') && url.includes(String(res.body.data._id)), url);
check('built from the configured frontend URL', url.startsWith(process.env.FRONTEND_URL), `${url} vs ${process.env.FRONTEND_URL}`);
// A localhost value is the correct *development* setting; what matters is that
// the link is built from configuration rather than baked into the source. (The
// production guard that drops a localhost URL is covered by the mail tests.)
check('no URL is hardcoded in the email templates', !/https?:\/\/localhost/.test(fs.readFileSync(path.join(here, '../services/mailService.js'), 'utf8')));
check('copy tells the admin they will be asked to sign in', /sign in/i.test(adminMail?.html || ''));

section('2 - Sign-in redirect keeps the destination, safely');
const { safeDestination, loginUrlWithNext } = await import(path.join(frontendSrc, 'utils/redirectDestination.js'));
check('the email destination survives the round trip', safeDestination('/users?highlight=abc123') === '/users?highlight=abc123');
check('a plain path is accepted', safeDestination('/users') === '/users');
check('an absolute URL is rejected', safeDestination('https://evil.example/steal') === null);
check('a protocol-relative URL is rejected', safeDestination('//evil.example') === null);
check('a backslash trick is rejected', safeDestination('/\\evil.example') === null);
check('a non-string is rejected', safeDestination(null) === null && safeDestination(42) === null);
check('plain text is rejected', safeDestination('users') === null);
const loginUrl = loginUrlWithNext('/users?highlight=abc123');
check('the sign-in URL carries the destination', loginUrl.startsWith('/login?next='), loginUrl);
check('the destination is encoded', loginUrl.includes(encodeURIComponent('/users?highlight=abc123')), loginUrl);
check('sign-in with no destination is just /login', loginUrlWithNext(undefined) === '/login');
check('a rejected destination falls back to /login', loginUrlWithNext('https://evil.example') === '/login');
// And the decoded value still has to survive the validator.
const decoded = decodeURIComponent(new URL(loginUrl, 'http://x').searchParams.get('next'));
check('decoded value passes the validator unchanged', safeDestination(decoded) === '/users?highlight=abc123', decoded);

section('3 - Login page and route actually use it');
const loginPage = read('pages/LoginPage.jsx');
check('LoginPage reads the next parameter', /searchParams\.get\('next'\)/.test(loginPage));
check('LoginPage navigates to it after signing in', /navigate\(next \|\| '\/', \{ replace: true \}\)/.test(loginPage));
check('LoginPage validates it first', /safeDestination\(searchParams\.get\('next'\)\)/.test(loginPage));
const protectedRoute = read('components/Layout/ProtectedRoute.jsx');
check('ProtectedRoute preserves pathname and query', /location\.pathname\}\$\{location\.search\}/.test(protectedRoute));
check('ProtectedRoute redirects to the remembering sign-in URL', /loginUrlWithNext\(/.test(protectedRoute));
const app = read('App.jsx');
check('Users page still exists as the single registration-management screen', /path="\/users"/.test(app));
check('Users page is still admin-only', /path="\/users" element=\{<ProtectedRoute role="collaborator">/.test(app));
check('no separate registration page was added', !/RegistrationPage|path="\/registrations"/.test(app));

section('4 - Branding is NextUp everywhere it is visible');
const brand = 'NextUp';
const checks = [
  ['index.html', /<title>NextUp<\/title>/, readRoot],
  ['pages/LoginPage.jsx', />NextUp</, read],
  ['pages/RegisterPage.jsx', />NextUp</, read],
  ['pages/AccountStatusPage.jsx', />NextUp</, read],
  ['components/Layout/Sidebar.jsx', />NextUp</, read],
];
for (const [file, re, reader] of checks) {
  check(`${file} shows the product name`, re.test(reader(file)), file);
}
const old = [];
for (const [file, , reader] of checks) {
  if (/UniProductive/.test(reader(file))) old.push(file);
}
check('no old product name left in visible branding', old.length === 0, old.join(', '));

const mailSrc = fs.readFileSync(path.join(here, '../services/mailService.js'), 'utf8');
check('email templates use the new name', /const BRAND = 'NextUp'/.test(mailSrc));
check('no old product name in email copy', !/UniProductive/.test(mailSrc));

section('5 - Emails still say NextUp end to end');
mails.length = 0;
const u = { _id: res.body.data._id, name: 'Link Applicant', email: applicant, createdAt: new Date(), rejectionReason: '' };
await sendRegistrationApprovedEmail(u);
await sendAccountDeletedEmail(u);
check('approval email says NextUp', /NextUp/.test(mails[0].subject) && /NextUp/.test(mails[0].html), mails[0].subject);
check('deletion email says NextUp', /NextUp/.test(mails[1].subject) && /NextUp/.test(mails[1].html), mails[1].subject);
check('approval email still has the Login button', /Login to NextUp/.test(mails[0].html));
const loginLink = mails[0].html.match(/<a href="([^"]+)"[^>]*>\s*Login to NextUp/);
check('Login button targets the configured frontend /login', loginLink?.[1] === `${process.env.FRONTEND_URL}/login`, loginLink?.[1]);

section('6 - Password visibility toggle');
const pw = read('components/ui/PasswordInput.jsx');
check('a dedicated password input component exists', pw.includes('export default function PasswordInput'));
check('it starts hidden', /useState\(false\)/.test(pw) && /type=\{visible \? 'text' : 'password'\}/.test(pw));
check('it toggles on click', pw.includes('onClick') && pw.includes('setVisible((prev) => !prev)'));
check('it uses the installed icon library', /from 'lucide-react'/.test(pw) && /Eye/.test(pw) && /EyeOff/.test(pw));
check('the toggle is announced to assistive tech', /aria-label=\{visible \? 'Hide password' : 'Show password'\}/.test(pw));
check('the toggle renders inside the field', /trailing=\{toggle\}/.test(pw));

const input = read('components/ui/Input.jsx');
check('Input supports a trailing control', /trailing/.test(input) && /hasTrailing \? 'pr-11'/.test(input));
check('Input renders the trailing control inside the field', /absolute inset-y-0 right-0[\s\S]{0,80}\{trailing\}/.test(input));
check('Input keeps its existing left-icon behaviour', /pl-10/.test(input));

const modal = read('components/UserModal.jsx');
check('Add/Edit User uses the toggle', /PasswordInput/.test(modal));
check('Add/Edit User no longer hardcodes type="password"', !/type="password"/.test(modal));
check('Add/Edit User password logic unchanged', /form\.password\.length < 6/.test(modal) && /payload\.password = form\.password/.test(modal));

const registerPage = read('pages/RegisterPage.jsx');
const pwFields = (registerPage.match(/<PasswordInput/g) || []).length;
check('registration uses the toggle for both password fields', pwFields === 2, `${pwFields} fields`);
check('registration no longer hardcodes type="password"', !/type="password"/.test(registerPage));
check('registration validation unchanged', /password !== confirmPassword/.test(registerPage) && /password\.length < 6/.test(registerPage));

section('7 - Email delivery panel is on the existing Users page');
const users = read('pages/UsersPage.jsx');
check('Users page renders the delivery panel', /EmailDeliveryPanel/.test(users));
check('no new page or route for email management', !/path="\/emails"/.test(app) && !/EmailPage/.test(app));
const panel = read('components/EmailDeliveryPanel.jsx');
check('panel only fetches when opened', /if \(!collapsed && !loaded\) load\(\)/.test(panel));
check('panel exposes Stop, Resume and Re-send', /'stop'/.test(panel) && /'resume'/.test(panel) && /'resend'/.test(panel));
check('panel states that nothing retries automatically', /Nothing here retries/i.test(panel));

section('Cleanup');
// Remove this run's account, its delivery record and the in-app notifications
// the registration produced, plus anything an interrupted earlier run left in
// the same namespace.
const TEST_NAMESPACE = /^vf[a-z0-9]+@|^x@y\.com$/;
const Notification = (await import('../models/Notification.js')).default;
const EmailDelivery = (await import('../models/EmailDelivery.js')).default;
await Promise.all([
  User.deleteMany({ email: TEST_NAMESPACE }),
  EmailDelivery.deleteMany({ email: TEST_NAMESPACE }),
  Notification.deleteMany({ 'metadata.userEmail': TEST_NAMESPACE }),
]);
console.log('  cleaned up');

console.log(`\n${'='.repeat(46)}\n  passed: ${pass}   failed: ${fail}\n${'='.repeat(46)}`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
