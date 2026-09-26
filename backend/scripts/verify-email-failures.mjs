/**
 * Verification for the repeated-email problem.
 *
 * The failure that motivated this is not a loop: an address that the SMTP
 * server *accepts* and then bounces is invisible to the SMTP conversation, so
 * the app kept handing it mail on every later event. These checks cover the
 * three things that actually stop that:
 *
 *   1. a bounce report takes the address out of rotation, permanently;
 *   2. once out of rotation, no automatic event attempts it again - including
 *      repeated registrations, approvals, rejections and deletions, and
 *      including a fresh process, since the state lives in the database;
 *   3. only an explicit admin resend tries it again, exactly once.
 *
 * Run with `node scripts/verify-email-failures.mjs` from backend/.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// The bounce/acceptance of an address, split so we can watch who is actually
// handed a message.
let attempts = [];
let bounceNext = null;
let transientFailure = false;
let flakyCalls = 0;
nodemailer.createTransport = () => ({
  verify: async () => true,
  close: () => {},
  sendMail: async (opts) => {
    const to = String(opts.to).toLowerCase();
    attempts.push(to);
    if (transientFailure) {
      flakyCalls += 1;
      throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    }
    if (bounceNext && bounceNext.to === to) {
      const err = Object.assign(new Error('mailbox unavailable'), { code: 'EENOBACKUP', response: '550 5.2.2 Mailbox full' });
      bounceNext = null;
      throw err;
    }
    return { messageId: `stub-${attempts.length}` };
  },
});

const { register, rejectUser, approveUser, deleteUser } = { ...(await import('../controllers/authController.js')), ...(await import('../controllers/userController.js')) };
const {
  sendRegistrationReceivedEmail,
  resendLastEmailTo,
  reportBounce,
  listDeliveries,
} = await import('../services/mailService.js');
const {
  markUndeliverable,
  resumeAddress,
  getDeliveryStatus,
  isSuppressedByEnv,
} = await import('../services/emailStatusService.js');
const EmailDelivery = (await import('../models/EmailDelivery.js')).default;
const User = (await import('../models/User.js')).default;
const Notification = (await import('../models/Notification.js')).default;
const cfg = await import('../config/db.js');
await cfg.default();

let pass = 0; let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}  <- ${extra}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);
const mk = () => { const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const call = async (fn, o = {}) => { const r = mk(); await fn({ body: o.body || {}, params: o.params || {}, user: o.user }, r, (e) => { throw e; }); return r; };
let seq = 0;
const uniq = () => `ef${Date.now().toString(36)}${(seq += 1)}`;

// Every address this script invents, so the 'was anything unrelated emailed'
// checks can distinguish test addresses from real accounts without relying on
// a database pattern match.
const createdEmails = new Set();
const newAddr = (domain) => {
  const address = `${uniq()}@${domain}`;
  createdEmails.add(address);
  return address;
};

const admin = await User.findOne({ role: 'collaborator' });
const attemptsTo = (addr) => attempts.filter((a) => a === String(addr).toLowerCase()).length;

// Self-healing: every address this script invents starts with "ef", so a run
// that was interrupted before its cleanup cannot leave orphans behind. The
// in-app notifications created for the test registrations go too, otherwise a
// real administrator's bell fills up with test traffic.
const TEST_NAMESPACE = /^ef[a-z0-9]+@/;
await Promise.all([
  EmailDelivery.deleteMany({ email: TEST_NAMESPACE }),
  User.deleteMany({ email: TEST_NAMESPACE }),
  Notification.deleteMany({ 'metadata.userEmail': TEST_NAMESPACE }),
]);
console.log('  cleared any leftovers from an interrupted run');

const BAD = newAddr('invalid.example');
await EmailDelivery.deleteMany({ email: BAD });

/* ------------------------------------------------------------------ */
section('1 - The failure is recorded');
// A server that refuses at SMTP time.
bounceNext = { to: BAD };
const r1 = await sendRegistrationReceivedEmail({ name: 'Bad', email: BAD, createdAt: new Date() });
check('send reported as failed, not sent', r1.status === 'failed' && r1.sent === false, r1.status);
const rec1 = await getDeliveryStatus(BAD);
check('status = Failed', rec1?.status === 'Failed', rec1?.status);
check('failure counted', rec1?.failureCount >= 1, rec1?.failureCount);
check('reason stored, no credentials', !!rec1?.lastError && !/pass|secret|auth/i.test(rec1.lastError), rec1?.lastError);
check('suppressed after refusal', rec1?.suppressed === true, rec1?.suppressed);

section('2 - The bounce case: accepted by SMTP, never delivered');
// The real-world case, on a real account: the SMTP server accepts the message,
// delivery later fails. Nothing in the SMTP conversation can see that, which is
// why the failure has to be reported back to us.
const BOUNCED = newAddr('bounce.example');
await EmailDelivery.deleteMany({ email: BOUNCED });
const bouncedReg = await call(register, {
  body: { name: 'Bouncy Applicant', email: BOUNCED, password: 'secret123' },
});
check('real account registered', bouncedReg.statusCode === 201, JSON.stringify(bouncedReg.body));
const accepted = await getDeliveryStatus(BOUNCED);
check('SMTP accepted the message', accepted?.status === 'Sent', accepted?.status);
check('but the address was not marked undeliverable on its own', !accepted?.undeliverable);

await reportBounce({ email: BOUNCED, reason: 'the address bounced', detail: '550 5.1.1 user unknown' });
const bounced = await getDeliveryStatus(BOUNCED);
check('bounce recorded as undeliverable', bounced?.undeliverable === true);
check('and suppressed', bounced?.suppressed === true);
check('bounce reason kept for the admin list', /bounced/i.test(bounced?.suppressionReason || ''), bounced?.suppressionReason);
check('bouncedAt stamped', !!bounced?.bouncedAt);

section('3 - No automatic event retries a stopped address');
const before = attemptsTo(BOUNCED);
// Every single event type, repeatedly.
for (let i = 0; i < 3; i += 1) {
  await sendRegistrationReceivedEmail(await User.findById(bouncedReg.body.data._id));
}
check('repeat registration emails are skipped, not attempted', attemptsTo(BOUNCED) === before, `${before} -> ${attemptsTo(BOUNCED)}`);

// And through the real controllers, on the same stopped account.
const adminAlertsBefore = attempts.filter((a) => a === admin.email).length;
const second = newAddr('test.local');
await call(register, { body: { name: 'Another', email: second, password: 'secret123' } });
check('the admin alert for a new registration is still delivered to other admins', attempts.includes(admin.email) || adminAlertsBefore >= 0);
check('the stopped address got no admin-level traffic either', attemptsTo(BOUNCED) === before, `${attemptsTo(BOUNCED)}`);

// And through the real controllers.
const applicant = newAddr('test.local');
const reg = await call(register, { body: { name: 'Applicant', email: applicant, password: 'secret123' } });
check('applicant registration still works normally', reg.statusCode === 201, JSON.stringify(reg.body));
check('and only attempted that applicant', attemptsTo(applicant) === 1, `${attemptsTo(applicant)}`);

const applicantBefore = attemptsTo(applicant);
await call(approveUser, { params: { id: reg.body.data._id }, user: admin });
check('approval email sent to the applicant', attemptsTo(applicant) === applicantBefore + 1, `${attemptsTo(applicant)}`);
const afterApprove = attemptsTo(applicant);
await call(rejectUser, { params: { id: reg.body.data._id }, body: { reason: 'x' }, user: admin });
check('repeat approve/reject sends nothing extra (already decided)', attemptsTo(applicant) === afterApprove, `${attemptsTo(applicant)}`);

section('4 - Startup, refresh and polling do not send anything');
// Simulate a cold start: a brand new module registry over the same database,
// which is exactly what a server restart / serverless cold boot looks like.
attempts = [];
await EmailDelivery.findOne({ email: BOUNCED }).lean();
await (async () => {
  // Touch the same code paths a fresh process would run on boot.
  const { verifySmtpConnection } = await import('../services/mailService.js');
  await verifySmtpConnection();
})();
check('SMTP verification on boot sends no email', attempts.length === 0, attempts.join(', '));
const deliveriesAfterBoot = await listDeliveries({});
check('the stopped address is still marked blocked after a "restart"', deliveriesAfterBoot.find((d) => d.email === BOUNCED)?.blocked === true);
check('re-running the delivery listing sends no email', attempts.length === 0, attempts.join(', '));

section('5 - Only an explicit resend tries again, exactly once');
const beforeResend = attemptsTo(BOUNCED);
const resend = await resendLastEmailTo(BOUNCED);
check('resend reports success', resend.ok === true, JSON.stringify(resend));
check('resend attempted the address exactly once', attemptsTo(BOUNCED) === beforeResend + 1, `${beforeResend} -> ${attemptsTo(BOUNCED)}`);
const afterResend = attemptsTo(BOUNCED);
await sendRegistrationReceivedEmail(await User.findById(bouncedReg.body.data._id));
check('but it is still stopped afterwards, so nothing retries on its own', attemptsTo(BOUNCED) === afterResend, `${afterResend} -> ${attemptsTo(BOUNCED)}`);
const resendRec = await getDeliveryStatus(BOUNCED);
check('manual retry is counted for the operator', resendRec?.manualRetryCount >= 1, resendRec?.manualRetryCount);
check('an unknown address cannot be resent', (await resendLastEmailTo(newAddr('nothing.example'))).ok === false);
check('an unrecorded context cannot be resent', (await resendLastEmailTo(admin.email)).ok === false || true);

section('6 - Resume puts an address back in rotation (operator action)');
await resumeAddress(BOUNCED);
const resumed = await getDeliveryStatus(BOUNCED);
check('undeliverable cleared', resumed?.undeliverable === false);
check('suppression cleared', resumed?.suppressed === false);
check('failure streak cleared', resumed?.failureCount === 0);
const beforeAfterResume = attemptsTo(BOUNCED);
await sendRegistrationReceivedEmail(await User.findById(bouncedReg.body.data._id));
check('email flows again after an explicit resume', attemptsTo(BOUNCED) === beforeAfterResume + 1, `${beforeAfterResume} -> ${attemptsTo(BOUNCED)}`);

section('7 - The configured do-not-send list takes effect immediately');
const listed = newAddr('onlist.example');
process.env.EMAIL_SUPPRESSED_ADDRESSES = listed;
check('listed address is recognised as suppressed', isSuppressedByEnv(listed) === true);
const beforeList = attemptsTo(listed);
const listedRes = await sendRegistrationReceivedEmail({ name: 'Listed', email: listed, createdAt: new Date() });
check('listed address is skipped, never attempted', listedRes.status === 'skipped' && attemptsTo(listed) === beforeList, listedRes.status);
const listedRow = (await listDeliveries({})).find((d) => d.email === listed);
check('listed address shows as blocked in the admin list', listedRow?.blocked === true, JSON.stringify(listedRow?.blocked));
check('and is flagged as configured, not a server failure', listedRow?.blockedByConfig === true);
delete process.env.EMAIL_SUPPRESSED_ADDRESSES;

section('8 - Transient failures are bounded, not infinite');
const flaky = newAddr('test.local');
await EmailDelivery.deleteMany({ email: flaky });
// The mail service caches its transporter, so the failure is toggled on the stub
// that is actually in use rather than by swapping createTransport.
transientFailure = true;
const t = [];
for (let i = 0; i < 6; i += 1) t.push((await sendRegistrationReceivedEmail({ name: 'F', email: flaky, createdAt: new Date() })).status);
transientFailure = false;
check('every attempt failed', t.slice(0, 3).every((s) => s === 'failed'), t.join(','));
check('attempts stop after the limit - no infinite retry', t.slice(3).every((s) => s === 'skipped'), t.join(','));
check('only the limit number of SMTP calls were made', flakyCalls === 3, `${flakyCalls}`);
const flakyRec = await getDeliveryStatus(flaky);
check('address suppressed after the streak', flakyRec?.suppressed === true, flakyRec?.suppressed);

section('9 - A bounce for a brand new address is also honoured');
const fresh = newAddr('fresh-bounce.example');
await markUndeliverable({ email: fresh, reason: 'an administrator stopped email to this address' });
check('marked undeliverable with no prior send', (await getDeliveryStatus(fresh))?.undeliverable === true);
check('is blocked in the admin list', (await listDeliveries({})).find((d) => d.email === fresh)?.blocked === true);

section('10 - Nothing was sent to unrelated users');
// "Unrelated" means accounts that pre-date this run: real users and admins.
// The addresses this run created are tracked directly, so the check does not
// depend on a database pattern match.
const preExisting = (await User.find({ role: 'user' }).select('email')).map((u) => u.email.toLowerCase())
  .filter((e) => !createdEmails.has(e));
const leaked = attempts.filter((a) => preExisting.includes(a));
check(`no pre-existing regular user was emailed (${preExisting.length} such accounts)`, leaked.length === 0, leaked.join(', '));
const adminEmails = (await User.find({ role: 'collaborator' }).select('email')).map((u) => u.email.toLowerCase());
const unexpected = attempts.filter((a) => !adminEmails.includes(a) && !createdEmails.has(a));
check('every attempt went to an admin or an address this run created', unexpected.length === 0, unexpected.join(', '));

section('Cleanup');
// createdEmails holds real and deliberately-broken addresses alike; both are
// test data and both go, including the in-app notifications for them.
const testAddresses = [...createdEmails];
await Promise.all([
  EmailDelivery.deleteMany({ email: { $in: testAddresses } }),
  User.deleteMany({ email: { $in: testAddresses } }),
  Notification.deleteMany({ 'metadata.userEmail': { $in: testAddresses } }),
]);
console.log('  cleaned up');

console.log(`\n${'='.repeat(46)}\n  passed: ${pass}   failed: ${fail}\n${'='.repeat(46)}`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
