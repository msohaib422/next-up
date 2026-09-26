/**
 * End-to-end verification of the registration approval workflow.
 *
 * Runs the real controllers against the real database with a stubbed SMTP
 * transport, so every scenario in the brief can be observed for real: which
 * emails go out, to whom, how many times, what the in-app notifications say,
 * and what the email HTML contains.
 *
 * Not part of the app; run with `node scripts/verify-workflow.mjs` from backend/.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const sent = [];
let failSend = null;

const makeErr = ({ message, code, response }) => Object.assign(new Error(message), { code, response });

// Stub the transport so nothing leaves the machine, but keep the real sendMail
// logic (tracking, suppression, templating) in play.
nodemailer.createTransport = () => ({
  verify: async () => true,
  close: () => {},
  sendMail: async (opts) => {
    if (failSend) throw makeErr(failSend);
    sent.push({ to: String(opts.to).toLowerCase(), subject: opts.subject, html: opts.html });
    return { messageId: `stub-${sent.length}` };
  },
});

const { register, login } = await import('../controllers/authController.js');
const { approveUser, rejectUser, deleteUser, getAllUsers } = await import('../controllers/userController.js');
const { notifyAdminsOfRegistrationSubmitted } = await import('../services/notificationService.js');
const { sendRegistrationReceivedEmail, redact } = await import('../services/mailService.js');
const EmailDelivery = (await import('../models/EmailDelivery.js')).default;
const User = (await import('../models/User.js')).default;
const Notification = (await import('../models/Notification.js')).default;

const cfg = await import('../config/db.js');
await cfg.default();

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}  <- ${extra}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const call = async (fn, { body = {}, params = {}, user = null }) => {
  const res = mkRes();
  await fn({ body, params, user }, res, (e) => { throw e; });
  return res;
};

let seq = 0;
const uniq = () => `wf${Date.now().toString(36)}${(seq += 1)}`;

/** Every email actually handed to the transport for one address. */
const mailsTo = (addr) => sent.filter((m) => m.to === String(addr).toLowerCase());
/** Just the ones matching a workflow step, so counts are per-event not cumulative. */
const mailsMatching = (addr, re) => mailsTo(addr).filter((m) => re.test(m.subject));
const REGISTRATION_MAIL = /registration has been received/i;
const APPROVAL_MAIL = /registration has been approved/i;
const REJECTION_MAIL = /was not approved/i;
const DELETION_MAIL = /account has been removed/i;

const base = { name: 'Scenario User', password: 'secret123' };

// The database already holds real notifications from normal use, so every
// "how many did this run create" assertion is scoped to this run's start.
const RUN_START = new Date(Date.now() - 2000);
const notifsInRun = (filter = {}) =>
  Notification.countDocuments({ createdAt: { $gte: RUN_START }, ...filter });

// Every collaborator that really exists in this database.
const adminEmails = (await User.find({ role: 'collaborator' }).select('email')).map((u) => u.email.toLowerCase());
const adminIds = (await User.find({ role: 'collaborator' }).select('_id')).map((u) => u._id);
console.log(`  collaborators in this database: ${adminEmails.length}`);

// Clear anything a previous run of this script left behind, so repeated runs
// start from the same state. Runs BEFORE the test admin is created, and only
// ever touches @test.local records.
const staleSubjects = await User.find({ email: /@test\.local$/ }).select('_id');
await Promise.all([
  User.deleteMany({ email: /@test\.local$/ }),
  Notification.deleteMany({ recipient: { $in: staleSubjects.map((u) => u._id) } }),
  Notification.deleteMany({ 'metadata.userEmail': /@test\.local$/ }),
  EmailDelivery.deleteMany({ email: /@test\.local$|@invalid\.example$/ }),
]);
console.log('  cleared leftovers from previous runs');

const admin = await User.create({
  name: 'Verify Admin',
  email: `${uniq()}-admin@test.local`,
  password: 'secret123',
  role: 'collaborator',
  status: 'Approved',
});
adminEmails.push(admin.email.toLowerCase());
adminIds.push(String(admin._id));
const ADMIN_COUNT = adminEmails.length;

const makeUser = async (over = {}) => {
  const email = `${uniq()}@test.local`;
  const res = await call(register, { body: { ...base, email, ...over } });
  return { res, email, id: res.body?.data?._id, body: res.body };
};
const adminMailsMatching = (re) => sent.filter((m) => adminEmails.includes(m.to) && re.test(m.subject));

/* ------------------------------------------------------------------ */
section('A - New user registers');
const a = await makeUser();
check('201 created', a.res.statusCode === 201, JSON.stringify(a.res.body));
check('status is Pending Approval', a.res.body?.data?.status === 'Pending Approval');
check('no token issued (not signed in)', !a.res.body?.token);
check('applicant got exactly 1 registration email', mailsMatching(a.email, REGISTRATION_MAIL).length === 1, `got ${mailsMatching(a.email, REGISTRATION_MAIL).length}`);
check('no approval/rejection email to a pending user', mailsMatching(a.email, APPROVAL_MAIL).length + mailsMatching(a.email, REJECTION_MAIL).length === 0);
check('admin email reported for every collaborator', a.res.body?.email?.administratorsNotified === ADMIN_COUNT, `${a.res.body?.email?.administratorsNotified} vs ${ADMIN_COUNT}`);
check('admin alert email sent once per collaborator', adminMailsMatching(/new registration awaiting/i).length === ADMIN_COUNT);
check('admin in-app notification per collaborator', a.res.body?.email?.administratorNotifications === ADMIN_COUNT, `${a.res.body?.email?.administratorNotifications} vs ${ADMIN_COUNT}`);
const adminNotif = await Notification.findOne({ recipient: admin._id, type: 'REGISTRATION_SUBMITTED' }).sort({ createdAt: -1 });
check('admin has REGISTRATION_SUBMITTED notification', !!adminNotif);
check('notification message carries name', adminNotif?.message.includes(base.name), adminNotif?.message);
check('notification message carries email', adminNotif?.message.includes(a.email), adminNotif?.message);
check('notification message says awaiting approval', /awaiting approval/i.test(adminNotif?.message || ''));
check('notification metadata records Pending Approval', adminNotif?.metadata?.status === 'Pending Approval');
check('notification links to the Users page', adminNotif?.link?.startsWith('/users'), adminNotif?.link);
check('notification has a View/Review action label', adminNotif?.metadata?.actionLabel === 'View/Review');
check('notification is unread (shows in bell recent)', adminNotif?.read === false);
check('applicant has a registration notification', !!(await Notification.findOne({ recipient: a.id, type: 'REGISTRATION_SUBMITTED' })));
const deliverA = await EmailDelivery.findOne({ email: a.email });
check('email status recorded as Sent', deliverA?.status === 'Sent', deliverA?.status);
check('failureCount starts at 0', deliverA?.failureCount === 0);

section('B - Admin approves');
const b = await makeUser();
const approve = await call(approveUser, { params: { id: b.id }, user: admin });
check('approve 200', approve.statusCode === 200, JSON.stringify(approve.body));
check('status becomes Approved', approve.body?.data?.status === 'Approved');
check('applicant got exactly 1 approval email', mailsMatching(b.email, APPROVAL_MAIL).length === 1, `got ${mailsMatching(b.email, APPROVAL_MAIL).length}`);
const approvalMail = mailsMatching(b.email, APPROVAL_MAIL)[0];
check('approval email subject is about approval', /approved/i.test(approvalMail?.subject || ''), approvalMail?.subject);
const btn = (approvalMail?.html || '').match(/<a href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
check('approval email contains a button', !!btn, (approvalMail?.html || '').slice(0, 120));
check('button label says Login', /login/i.test(btn?.[2] || ''), btn?.[2]);
check(`button url = ${process.env.FRONTEND_URL}/login`, btn?.[1] === `${process.env.FRONTEND_URL}/login`, btn?.[1]);
check('body text tells them they can access the system', /access/i.test(approvalMail?.html || ''));
check('email includes a plain-link fallback for the same url', (approvalMail?.html || '').includes(`${process.env.FRONTEND_URL}/login`));
check('applicant has an approval notification', !!(await Notification.findOne({ recipient: b.id, type: 'REGISTRATION_APPROVED' })));
const bLogin = await call(login, { body: { email: b.email, password: 'secret123' } });
check('approved user can log in', bLogin.statusCode === 200 && bLogin.body.data.status === 'Approved', JSON.stringify(bLogin.body?.data));
const dupeApprove = await call(approveUser, { params: { id: b.id }, user: admin });
check('repeat approve refused (409)', dupeApprove.statusCode === 409, `got ${dupeApprove.statusCode}`);
check('repeat approve sends no extra email', mailsMatching(b.email, APPROVAL_MAIL).length === 1, `got ${mailsMatching(b.email, APPROVAL_MAIL).length}`);

section('C - Admin rejects');
const c = await makeUser();
const reject = await call(rejectUser, { params: { id: c.id }, body: { reason: 'Incomplete details supplied' }, user: admin });
check('reject 200', reject.statusCode === 200, JSON.stringify(reject.body));
check('status becomes Rejected', reject.body?.data?.status === 'Rejected');
check('applicant got exactly 1 rejection email', mailsMatching(c.email, REJECTION_MAIL).length === 1, `got ${mailsMatching(c.email, REJECTION_MAIL).length}`);
const rejMail = mailsMatching(c.email, REJECTION_MAIL)[0];
check('rejection email shows the reason', (rejMail?.html || '').includes('Incomplete details supplied'));
check('rejection email mentions applying again', /new application/i.test(rejMail?.html || ''));
check('rejection email has an Apply Again link', /apply again/i.test(rejMail?.html || ''));
check('applicant has a rejection notification', !!(await Notification.findOne({ recipient: c.id, type: 'REGISTRATION_REJECTED' })));
const cLogin = await call(login, { body: { email: c.email, password: 'secret123' } });
check('rejected user signs in but is not Approved', cLogin.statusCode === 200 && cLogin.body.data.status === 'Rejected', JSON.stringify(cLogin.body?.data));
const dupeReject = await call(rejectUser, { params: { id: c.id }, body: {}, user: admin });
check('repeat reject refused (409)', dupeReject.statusCode === 409, `got ${dupeReject.statusCode}`);
check('repeat reject sends no extra email', mailsMatching(c.email, REJECTION_MAIL).length === 1, `got ${mailsMatching(c.email, REJECTION_MAIL).length}`);

section('D - Rejected user applies again');
const countBefore = await User.countDocuments({ email: c.email });
const beforeD = {
  reg: mailsMatching(c.email, REGISTRATION_MAIL).length,
  adminReg: adminMailsMatching(/new registration awaiting/i).length,
  adminNotifs: await notifsInRun({ type: 'REGISTRATION_SUBMITTED', recipient: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) } }),
};
const d1 = await call(register, { body: { ...base, email: c.email } });
check('plain re-register refused (409)', d1.statusCode === 409, `got ${d1.statusCode}`);
check('code is PREVIOUSLY_REJECTED', d1.body?.code === 'PREVIOUSLY_REJECTED');
check('offers Apply Again (canApplyAgain)', d1.body?.data?.canApplyAgain === true);
check('professional message used', /previous registration application was not approved/i.test(d1.body?.message || ''), d1.body?.message);
check('message mentions submitting a new application', /new application/i.test(d1.body?.message || ''));
check('no internal status value leaked to the user', !/\bPending Approval\b|\bRejected\b|_id|ObjectId|collaborator/i.test(d1.body?.message || ''), d1.body?.message);
check('no duplicate user record created', (await User.countDocuments({ email: c.email })) === countBefore);
check('no email sent on the blocked attempt', mailsMatching(c.email, REGISTRATION_MAIL).length === beforeD.reg, `${mailsMatching(c.email, REGISTRATION_MAIL).length} vs ${beforeD.reg}`);
check('no admin email on the blocked attempt', adminMailsMatching(/new registration awaiting/i).length === beforeD.adminReg);
check('no admin notification on the blocked attempt', (await notifsInRun({ type: 'REGISTRATION_SUBMITTED', recipient: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) } })) === beforeD.adminNotifs);

const d2 = await call(register, { body: { ...base, email: c.email, reapply: true } });
check('Apply Again succeeds (201)', d2.statusCode === 201, JSON.stringify(d2.body));
check('returns to Pending Approval', d2.body?.data?.status === 'Pending Approval', d2.body?.data?.status);
check('flagged as a re-application', d2.body?.isReapplication === true);
check('same user id reused (no duplicate)', String(d2.body?.data?._id) === String(c.id), `${d2.body?.data?._id} vs ${c.id}`);
check('still exactly 1 user record for the email', (await User.countDocuments({ email: c.email })) === countBefore);
const reapplied = await User.findById(c.id);
check('rejection reason cleared', reapplied.rejectionReason === '');
check('reviewer cleared', reapplied.reviewedBy === null && reapplied.reviewedAt === null);
check('lastApplicationAt stamped', !!reapplied.lastApplicationAt);
check('name updated from the new application', reapplied.name === base.name);
check('exactly 1 more registration email to the applicant', mailsMatching(c.email, REGISTRATION_MAIL).length === beforeD.reg + 1, `got ${mailsMatching(c.email, REGISTRATION_MAIL).length}`);
// One event notifies every collaborator, so the fan-out is per-collaborator.
const adminNotifInRun = () =>
  notifsInRun({ type: 'REGISTRATION_SUBMITTED', recipient: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) } });
check('exactly 1 more admin alert email per collaborator', adminMailsMatching(/new registration awaiting/i).length === beforeD.adminReg + ADMIN_COUNT, `${adminMailsMatching(/new registration awaiting/i).length} vs ${beforeD.adminReg}+${ADMIN_COUNT}`);
check('exactly 1 more admin notification per collaborator', (await adminNotifInRun()) === beforeD.adminNotifs + ADMIN_COUNT, `${await adminNotifInRun()} vs ${beforeD.adminNotifs}+${ADMIN_COUNT}`);
// The applicant gets their own notice too, and nobody else does.
check('applicant got exactly 1 registration notification for the re-application', (await notifsInRun({ recipient: new mongoose.Types.ObjectId(String(c.id)), type: 'REGISTRATION_SUBMITTED' })) === 2, 'initial + re-application');
const newNotif = await Notification.findOne({ recipient: admin._id, type: 'REGISTRATION_SUBMITTED' }).sort({ createdAt: -1 });
check('new notification marked as a re-application', newNotif?.metadata?.isReapplication === true);
check('admin can review it normally', newNotif?.link?.includes(String(c.id)) && newNotif?.metadata?.actionLabel === 'View/Review');
const cApprove = await call(approveUser, { params: { id: c.id }, user: admin });
check('admin can review the new application', cApprove.statusCode === 200 && cApprove.body.data.status === 'Approved', JSON.stringify(cApprove.body?.data));
check('approval email sent for the re-application', mailsMatching(c.email, APPROVAL_MAIL).length === 1);
const cLogin2 = await call(login, { body: { email: c.email, password: 'secret123' } });
check('re-applied + approved user can log in', cLogin2.statusCode === 200 && cLogin2.body.data.status === 'Approved');

section('D2 - Duplicate submits are refused');
const c2 = await makeUser();
await call(rejectUser, { params: { id: c2.id }, body: { reason: 'nope' }, user: admin });
const beforeDup = {
  reg: mailsMatching(c2.email, REGISTRATION_MAIL).length,
  adminReg: adminMailsMatching(/new registration awaiting/i).length,
};
const dupe1 = await call(register, { body: { ...base, email: c2.email, reapply: true } });
const dupe2 = await call(register, { body: { ...base, email: c2.email, reapply: true } });
check('first Apply Again accepted', dupe1.statusCode === 201, `got ${dupe1.statusCode}`);
check('second Apply Again refused (409 ALREADY_PENDING)', dupe2.statusCode === 409 && dupe2.body?.code === 'ALREADY_PENDING', `got ${dupe2.statusCode}/${dupe2.body?.code}`);
check('only 1 registration email from the pair', mailsMatching(c2.email, REGISTRATION_MAIL).length === beforeDup.reg + 1, `got ${mailsMatching(c2.email, REGISTRATION_MAIL).length}`);
check('only 1 admin fan-out from the pair', adminMailsMatching(/new registration awaiting/i).length === beforeDup.adminReg + ADMIN_COUNT, `${adminMailsMatching(/new registration awaiting/i).length} vs ${beforeDup.adminReg}+${ADMIN_COUNT}`);
const whilePending = await call(register, { body: { ...base, email: c2.email } });
check('re-register while pending refused (409)', whilePending.statusCode === 409 && whilePending.body?.code === 'ALREADY_PENDING');
check('still no extra email', mailsMatching(c2.email, REGISTRATION_MAIL).length === beforeDup.reg + 1);

section('D3 - Approved / collaborator addresses are not duplicated');
const bAgain = await call(register, { body: { ...base, email: b.email } });
check('approved address refused (400)', bAgain.statusCode === 400, `got ${bAgain.statusCode}`);
// b has had exactly 2 emails so far: registration + approval.
check('approved address sends no email on a re-register attempt', mailsTo(b.email).length === 2, `got ${mailsTo(b.email).length}`);
const adminAgain = await call(register, { body: { ...base, email: admin.email } });
check('collaborator address refused (400), not hijackable', adminAgain.statusCode === 400, `got ${adminAgain.statusCode}`);
check('collaborator address untouched', (await User.findById(admin._id))?.role === 'collaborator');
check('no extra admin alert for these attempts', adminMailsMatching(/new registration awaiting/i).length === beforeDup.adminReg + ADMIN_COUNT, `${adminMailsMatching(/new registration awaiting/i).length} vs ${beforeDup.adminReg}+${ADMIN_COUNT}`);

section('E - Approved user is deleted');
const beforeE = sent.length;
const del = await call(deleteUser, { params: { id: b.id }, user: admin });
check('delete 200', del.statusCode === 200, JSON.stringify(del.body));
check('user record removed', (await User.findById(b.id)) === null);
check('deletion email sent to that user', mailsMatching(b.email, DELETION_MAIL).length === 1, `got ${mailsMatching(b.email, DELETION_MAIL).length}`);
const delMail = mailsMatching(b.email, DELETION_MAIL)[0];
check('deletion email subject is about removal', /removed/i.test(delMail?.subject || ''), delMail?.subject);
check('deletion email says they can no longer sign in', /no longer sign in/i.test(delMail?.html || ''));
check('deletion email uses their real name', (delMail?.html || '').includes(base.name));
check('deletion email leaks no internals', !/ObjectId|collaborator|_id|Approved|status/i.test(delMail?.html || ''), (delMail?.html || '').match(/(ObjectId|collaborator|_id)/)?.[0]);
check('exactly 1 email left the system for the deletion', sent.length === beforeE + 1, `${beforeE} -> ${sent.length}`);
const delLogin = await call(login, { body: { email: b.email, password: 'secret123' } });
check('deleted account can no longer log in', delLogin.statusCode === 401, `got ${delLogin.statusCode}`);
const delAdmin = await call(deleteUser, { params: { id: String(admin._id) }, user: admin });
check('collaborator delete still refused (403)', delAdmin.statusCode === 403, `got ${delAdmin.statusCode}`);

section('F1 - Syntactically invalid address');
const beforeF1 = sent.length;
const bad = await sendRegistrationReceivedEmail({ name: 'Bad', email: 'not-an-address', createdAt: new Date() });
check('reported as skipped, not sent', bad.status === 'skipped' && bad.sent === false, bad.status);
check('never handed to the mail server', sent.length === beforeF1, `${beforeF1} -> ${sent.length}`);
check('no delivery record churned for a hopeless address', (await EmailDelivery.findOne({ email: 'not-an-address' })) === null);

section('F2 - Valid but undeliverable address (permanent rejection)');
const dead = `${uniq()}@invalid.example`;
const beforeF2 = sent.length;
failSend = { message: 'Recipient address rejected', code: 'EENOBACKUP', response: '550 5.1.1 No such user here' };
const f1 = await sendRegistrationReceivedEmail({ name: 'Dead', email: dead, createdAt: new Date() });
failSend = null;
check('reported as failed (not a success)', f1.status === 'failed' && f1.sent === false, f1.status);
check('one SMTP attempt only', sent.length === beforeF2);
const deadRec = await EmailDelivery.findOne({ email: dead });
check('status recorded as Failed', deadRec?.status === 'Failed', deadRec?.status);
check('failure counted', deadRec?.failureCount === 1, deadRec?.failureCount);
check('permanently rejected -> suppressed immediately', deadRec?.suppressed === true);
check('reason recorded for diagnostics', !!deadRec?.lastError, deadRec?.lastError);
check('no credential in the recorded reason', !/pass|secret|auth|token|credential/i.test(deadRec?.lastError || ''), deadRec?.lastError);
check('redact() strips secrets from anything logged', redact({ host: 'h', pass: 'p', nested: { authToken: 't' } }).pass === '[redacted]' && redact({ nested: { authToken: 't' } }).nested.authToken === '[redacted]');
check('SMTP password is never in the rendered email', !sent.some((m) => m.html.includes(process.env.SMTP_PASS)));

failSend = { message: 'Recipient address rejected', code: 'EENOBACKUP', response: '550 5.1.1 No such user here' };
const f2 = await sendRegistrationReceivedEmail({ name: 'Dead', email: dead, createdAt: new Date() });
const f3 = await sendRegistrationReceivedEmail({ name: 'Dead', email: dead, createdAt: new Date() });
failSend = null;
check('suppressed address is skipped, not retried', f2.status === 'skipped' && f3.status === 'skipped', `${f2.status}/${f3.status}`);
check('no further SMTP attempt for it', sent.length === beforeF2, `${beforeF2} -> ${sent.length}`);
// c has had 4 emails by now: registration, rejection, re-application, approval.
check('other users unaffected by the suppression', mailsTo(a.email).length === 1 && mailsTo(c.email).length === 4, `a=${mailsTo(a.email).length} c=${mailsTo(c.email).length}`);

section('F3 - Transient failures stop after a bounded number of attempts');
const flaky = `${uniq()}@test.local`;
const beforeF3 = sent.length;
failSend = { message: 'connection refused', code: 'ECONNREFUSED' };
const r1 = await sendRegistrationReceivedEmail({ name: 'Flaky', email: flaky, createdAt: new Date() });
const r2 = await sendRegistrationReceivedEmail({ name: 'Flaky', email: flaky, createdAt: new Date() });
const r3 = await sendRegistrationReceivedEmail({ name: 'Flaky', email: flaky, createdAt: new Date() });
const r4 = await sendRegistrationReceivedEmail({ name: 'Flaky', email: flaky, createdAt: new Date() });
failSend = null;
check('transient errors reported as failed', [r1, r2, r3].every((r) => r.status === 'failed'), [r1, r2, r3].map((r) => r.status).join(','));
check('4th attempt is skipped, so no infinite retry', r4.status === 'skipped', r4.status);
const flakyRec = await EmailDelivery.findOne({ email: flaky });
check('streak counted to the limit then suppressed', flakyRec?.suppressed === true && flakyRec?.failureCount === 3, JSON.stringify({ n: flakyRec?.failureCount, s: flakyRec?.suppressed }));
check('transient error did not suppress anyone else', (await EmailDelivery.countDocuments({ suppressed: true })) === 2);

// A success must clear the streak, so a temporary outage does not blacklist an
// address forever.
const recovered = `${uniq()}@test.local`;
await EmailDelivery.create({ email: recovered, status: 'Failed', failureCount: 2, suppressed: false, lastError: 'transient' });
const rec = await sendRegistrationReceivedEmail({ name: 'Recovered', email: recovered, createdAt: new Date() });
const recRow = await EmailDelivery.findOne({ email: recovered });
check('address with a prior streak still sends', rec.status === 'sent', rec.status);
check('success resets failureCount to 0', recRow?.failureCount === 0, recRow?.failureCount);
check('success clears suppressed and the stored error', recRow?.suppressed === false && recRow?.lastError === '', JSON.stringify({ s: recRow?.suppressed, e: recRow?.lastError }));
check('status recorded as Sent', recRow?.status === 'Sent', recRow?.status);
const healthy = await sendRegistrationReceivedEmail({ name: 'Healthy', email: `${uniq()}@test.local`, createdAt: new Date() });
check('an unrelated healthy address still sends', healthy.status === 'sent', healthy.status);

section('No broadcast to unrelated users');
const outsiders = await User.find({ role: 'user', email: { $not: /@test\.local$/ } }).select('email');
const leakedTo = sent.filter((m) => outsiders.some((u) => u.email.toLowerCase() === m.to));
check(`no pre-existing regular user received an email (${outsiders.length} such accounts)`, leakedTo.length === 0, leakedTo.map((m) => m.to).join(', '));
// Every admin email in this run should be a new-registration alert, one per
// collaborator per registration event - never a stray broadcast.
const adminMails = sent.filter((m) => adminEmails.includes(m.to));
const strayAdminMails = adminMails.filter((m) => !/new registration awaiting/i.test(m.subject));
check('every admin email is a new-registration alert', strayAdminMails.length === 0, strayAdminMails.map((m) => m.subject).join(', '));
const eventsRun = await notifsInRun({ type: 'REGISTRATION_SUBMITTED', recipient: { $in: adminIds.map((id) => new mongoose.Types.ObjectId(id)) } });
check('one admin notification per collaborator per registration event', eventsRun % ADMIN_COUNT === 0, `${eventsRun} notifications / ${ADMIN_COUNT} collaborators`);
check('admin email count matches admin notification count', adminMails.length === eventsRun, `emails=${adminMails.length} notifications=${eventsRun}`);
console.log(`  (emails: ${sent.length}, distinct recipients: ${new Set(sent.map((m) => m.to)).size}, users in db: ${await User.countDocuments()})`);

section('Admin list ordering');
const listRes = await call(getAllUsers, { user: admin });
const rows = listRes.body.data.filter((u) => String(u.email).includes('@test.local'));
const firstNonPending = rows.findIndex((u) => u.status !== 'Pending Approval');
const pending = rows.filter((u) => u.status === 'Pending Approval');
check('pending registrations listed before the rest', firstNonPending === -1 || firstNonPending === pending.length, `${firstNonPending} vs ${pending.length}`);
const stamps = pending.map((u) => new Date(u.lastApplicationAt || u.createdAt).getTime());
check('pending sorted newest application first', stamps.every((v, i) => i === 0 || stamps[i - 1] >= v), JSON.stringify(stamps));

section('Cleanup');
const testIds = (await User.find({ email: /@test\.local$/ }).select('_id')).map((u) => u._id);
await Promise.all([
  User.deleteMany({ _id: { $in: testIds } }),
  Notification.deleteMany({ recipient: { $in: testIds } }),
  EmailDelivery.deleteMany({ email: /@test\.local$|@invalid\.example$/ }),
]);
console.log('  cleaned up test data');

console.log(`\n${'='.repeat(46)}\n  passed: ${pass}   failed: ${fail}\n${'='.repeat(46)}`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
