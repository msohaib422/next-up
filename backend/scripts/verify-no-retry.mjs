/**
 * Verification that a failed email is attempted EXACTLY ONCE, per recipient.
 *
 * The bug this exists for: a delivery that failed for one recipient stayed
 * eligible, so the next run handed the same message to the same address again -
 * tomorrow's notification, next week's, after a restart, after re-running the
 * process - producing the same failure over and over plus a fresh round of
 * failure noise each time.
 *
 * What is asserted, using the real controllers/services against a real database
 * with the SMTP transport replaced (nothing leaves the machine):
 *
 *   1. one failed recipient in a fan-out does not stop the others;
 *   2. that recipient is attempted exactly once and is persisted as stopped;
 *   3. a later run, a later day and a restarted PROCESS all skip it;
 *   4. re-running the very same notification skips it too;
 *   5. no email is ever generated about the failure, to the admin or anyone;
 *   6. a deliberate administrator resend still works, and does not re-arm the
 *      automatic retries.
 *
 * DATA SAFETY
 * -----------
 * This runs against a THROWAWAY database, never the real one. The database name
 * in MONGODB_URI is swapped for `nextup_emailretry_probe` (override with
 * EMAIL_RETRY_TEST_DB), the swap is asserted, and the probe database is dropped
 * at the end. It refuses to run if the name it would use is the real one.
 *
 * Run with `node scripts/verify-no-retry.mjs` from backend/.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

/* ------------------------------------------------------------------ *
 * Isolation: point at a throwaway database and prove it.
 * ------------------------------------------------------------------ */
const REAL_DB = 'nextup';
const TEST_DB = String(process.env.EMAIL_RETRY_TEST_DB || 'nextup_emailretry_probe');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(2);
}
if (TEST_DB === REAL_DB) {
  console.error(`Refusing to run: EMAIL_RETRY_TEST_DB is the real database name ("${REAL_DB}")`);
  process.exit(2);
}
const TEST_URI = String(process.env.MONGODB_URI).replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);
if (!new RegExp(`/${TEST_DB}([?]|$)`).test(TEST_URI)) {
  console.error('Refusing to run: could not confirm the test database name in the connection string');
  process.exit(2);
}
process.env.MONGODB_URI = TEST_URI;
console.log(`isolated database: ${TEST_DB} (the real "${REAL_DB}" database is never opened)`);

/* ------------------------------------------------------------------ *
 * SMTP stub. Every attempt is recorded so "how many times was this
 * address actually handed to the mail server" is a fact, not a guess.
 * ------------------------------------------------------------------ */
const failing = new Set();
const failFor = (...addresses) => addresses.forEach((a) => failing.add(String(a).trim().toLowerCase()));
let attempts = [];
nodemailer.createTransport = () => ({
  verify: async () => true,
  close: () => {},
  sendMail: async (opts) => {
    const to = String(opts.to).toLowerCase();
    attempts.push({ to, subject: opts.subject });
    if (failing.has(to)) {
      // The "temporary-looking" case: the connection is refused. It must be
      // treated exactly like a hard rejection.
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    return { messageId: `stub-${attempts.length}` };
  },
});

const attemptsTo = (addr) => attempts.filter((a) => a.to === String(addr).toLowerCase()).length;

let pass = 0; let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}  <- ${extra}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

/* ------------------------------------------------------------------ *
 * Child process: a genuine cold boot against the same database, which is
 * what a server restart / serverless cold start looks like.
 * ------------------------------------------------------------------ */
if (process.env.EMAIL_RETRY_RESTART_PROBE) {
  failFor(process.env.EMAIL_RETRY_FAIL_TO);
  const { sendContentChangeEmail } = await import('../services/mailService.js');
  const { getDeliveryStatus } = await import('../services/emailStatusService.js');
  await mongoose.connect(process.env.MONGODB_URI);

  attempts = [];
  const entityId = process.env.EMAIL_RETRY_ENTITY_ID;
  for (const spec of [
    { entityType: 'Task', action: 'added', subject: 'Restart probe task' },
    { entityType: 'Quiz', action: 'added', subject: 'Restart probe quiz' },
    // The very same notification again, as a re-trigger of one event.
    { entityType: 'Task', action: 'added', subject: 'Restart probe task' },
  ]) {
    await sendContentChangeEmail({
      entityType: spec.entityType,
      entity: { _id: entityId, title: spec.subject, subject: spec.subject, course: 'Probe 101' },
      action: spec.action,
    });
  }

  process.stdout.write(`__RESULT__${JSON.stringify({
    attempts: attempts.map((a) => a.to),
    subjects: attempts.map((a) => a.subject),
    deliveries: (await getDeliveryStatus(process.env.EMAIL_RETRY_FAILED_ADDRESS)).suppressed,
  })}__END__`);
  await mongoose.disconnect();
  process.exit(0);
}

/* ------------------------------------------------------------------ */
const { sendContentChangeEmail } = await import('../services/mailService.js');
const { resendLastEmailTo } = await import('../services/mailService.js');
const { getDeliveryStatus, listDeliveries, resumeAddress } = await import('../services/emailStatusService.js');
const EmailDelivery = (await import('../models/EmailDelivery.js')).default;
const User = (await import('../models/User.js')).default;
await mongoose.connect(process.env.MONGODB_URI);

/*
 * Four recipients: three ordinary approved users (A, B, C) and one
 * administrator (D). Only B's address is refused by the stub.
 */
const stamp = Date.now().toString(36);
const A = `nr-a-${stamp}@probe.example`;
const B = `nr-b-${stamp}@probe.example`;
const C = `nr-c-${stamp}@probe.example`;
const D = `nr-d-${stamp}@probe.example`;
const ALL = [A, B, C, D];
process.env.EMAIL_RETRY_FAIL_TO = B;
failFor(B);

const entityId = new mongoose.Types.ObjectId().toString();
const fire = (type, title) =>
  sendContentChangeEmail({
    entityType: type,
    entity: { _id: entityId, title, subject: title, course: 'Probe 101' },
    action: 'added',
  });

await User.create([
  { name: 'Probe A', email: A, password: 'probe12345', role: 'user', status: 'Approved' },
  { name: 'Probe B', email: B, password: 'probe12345', role: 'user', status: 'Approved' },
  { name: 'Probe C', email: C, password: 'probe12345', role: 'user', status: 'Approved' },
  { name: 'Probe Admin', email: D, password: 'probe12345', role: 'collaborator' },
]);

section('1 - The failure is recorded per recipient, and only for that recipient');
const first = await fire('Task', 'Probe task one');
check('B failed', (await getDeliveryStatus(B))?.status === 'Failed', (await getDeliveryStatus(B))?.status);
check('A succeeded', (await getDeliveryStatus(A))?.status === 'Sent', (await getDeliveryStatus(A))?.status);
check('C succeeded', (await getDeliveryStatus(C))?.status === 'Sent', (await getDeliveryStatus(C))?.status);
check('the administrator succeeded', (await getDeliveryStatus(D))?.status === 'Sent', (await getDeliveryStatus(D))?.status);
check('B was attempted exactly once', attemptsTo(B) === 1, `${attemptsTo(B)}`);
check('A, C and the admin were each delivered exactly once', attemptsTo(A) === 1 && attemptsTo(C) === 1 && attemptsTo(D) === 1, `${attemptsTo(A)}/${attemptsTo(C)}/${attemptsTo(D)}`);
check('B is persisted as stopped (suppressed)', (await getDeliveryStatus(B))?.suppressed === true);
check('the streak shows a single attempt', (await getDeliveryStatus(B))?.failureCount === 1, (await getDeliveryStatus(B))?.failureCount);
check('A is NOT marked stopped', (await getDeliveryStatus(A))?.suppressed === false);
check('C is NOT marked stopped', (await getDeliveryStatus(C))?.suppressed === false);
check('the fan-out reported the failure without throwing', first.results.some((r) => r.email === B && r.status === 'failed'), JSON.stringify(first.results?.map((r) => r.email)));
check('and the other recipients reported as sent', first.results.filter((r) => r.status === 'sent').length === 3, JSON.stringify(first.results));

section('2 - Tomorrow\'s run skips B and still delivers to everyone else');
const beforeSecond = Object.fromEntries(ALL.map((e) => [e, attemptsTo(e)]));
const second = await fire('Quiz', 'Probe quiz two');
check('B was not handed to the mail server again', attemptsTo(B) === beforeSecond[B], `${beforeSecond[B]} -> ${attemptsTo(B)}`);
check('B is reported as skipped', second.results.find((r) => r.email === B)?.status === 'skipped', second.results.find((r) => r.email === B)?.status);
check('A still got the new email', attemptsTo(A) === beforeSecond[A] + 1, `${beforeSecond[A]} -> ${attemptsTo(A)}`);
check('C still got the new email', attemptsTo(C) === beforeSecond[C] + 1, `${beforeSecond[C]} -> ${attemptsTo(C)}`);
check('the admin still got the new email', attemptsTo(D) === beforeSecond[D] + 1, `${beforeSecond[D]} -> ${attemptsTo(D)}`);
check('B\'s failed delivery was not re-recorded as a new attempt', (await getDeliveryStatus(B))?.failureCount === 1, (await getDeliveryStatus(B))?.failureCount);

section('3 - Re-running the SAME notification also skips B');
const beforeSame = attemptsTo(B);
await fire('Task', 'Probe task one');
await fire('Task', 'Probe task one');
check('B was never re-attempted', attemptsTo(B) === beforeSame, `${beforeSame} -> ${attemptsTo(B)}`);
check('its total attempt count for the whole run is still 1', attemptsTo(B) === 1, `${attemptsTo(B)}`);

section('4 - A restarted process skips B (the state lives in the database)');
const probe = JSON.parse(
  execFileSync(process.execPath, [path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'verify-no-retry.mjs')], {
    env: {
      ...process.env,
      EMAIL_RETRY_RESTART_PROBE: '1',
      EMAIL_RETRY_ENTITY_ID: entityId,
      EMAIL_RETRY_FAILED_ADDRESS: B,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).match(/__RESULT__(.*)__END__/s)[1]
);
check('the fresh process attempted B zero times', probe.attempts.filter((a) => a === B).length === 0, probe.attempts.filter((a) => a === B).join(','));
check('it still delivered to A, C and the admin', [A, C, D].every((e) => probe.attempts.filter((a) => a === e).length === 3), JSON.stringify(probe.attempts));
check('and it read B as stopped from the database', probe.deliveries === true);

section('5 - No failure notification is emailed, to the admin or anyone');
const failureShaped = attempts.filter((m) => /fail|undeliver|could not be delivered|delivery problem|bounce/i.test(`${m.subject}`));
check('no email about a delivery failure was ever generated', failureShaped.length === 0, failureShaped.map((m) => m.subject).join(' | '));
const adminMails = attempts.filter((m) => m.to === D);
check('the admin received only content notifications', adminMails.every((m) => /Added$/i.test(m.subject)), adminMails.map((m) => m.subject).join(' | '));
check('one admin email per content event and no daily failure repeat', adminMails.length === 4, `${adminMails.length}`);
check('every recipient still got exactly one copy per event', [A, C, D].every((e) => attemptsTo(e) === 4), ALL.map((e) => `${e}=${attemptsTo(e)}`).join(' '));
check('B never got past its single attempt', attemptsTo(B) === 1, `${attemptsTo(B)}`);

section('6 - The admin view reports it, and a deliberate resend still works');
const row = (await listDeliveries({})).find((d) => d.email === B);
check('B shows as blocked for the administrator', row?.blocked === true, JSON.stringify(row?.blocked));
check('A shows as deliverable', (await listDeliveries({})).find((d) => d.email === A)?.blocked === false);

// The operator resend path is defined for the registration emails, so it is
// exercised through one: a first failure there, then the single deliberate retry.
// E is a pending applicant, so it is not part of the content fan-out above and
// cannot disturb those counts.
const E = `nr-e-${stamp}@probe.example`;
failFor(E);
const regUser = await User.create({
  name: 'Probe E', email: E, password: 'probe12345', role: 'user', status: 'Pending Approval',
});
const { sendRegistrationReceivedEmail } = await import('../services/mailService.js');
check('E\'s first delivery failed', (await sendRegistrationReceivedEmail(regUser)).status === 'failed');
check('E attempted once', attemptsTo(E) === 1, `${attemptsTo(E)}`);
const resend = await resendLastEmailTo(E);
check('the explicit admin resend was allowed through the suppression', resend.status === 'failed' && resend.stillStopped === true, JSON.stringify(resend));
check('it was the one and only extra attempt', attemptsTo(E) === 2, `${attemptsTo(E)}`);
const afterResend = attemptsTo(E);
await fire('Assignment', 'Probe assignment three');
await fire('Essential', 'Probe essential four');
check('E is stopped again afterwards, so nothing retries on its own', attemptsTo(E) === afterResend, `${afterResend} -> ${attemptsTo(E)}`);
check('E is still recorded as stopped', (await getDeliveryStatus(E))?.suppressed === true);

// And when the underlying problem is gone, the explicit retry does succeed.
failing.delete(E);
const recovered = await resendLastEmailTo(E);
check('once the problem is gone the deliberate retry succeeds', recovered.ok === true, JSON.stringify(recovered));
check('a successful retry re-opens the address', (await getDeliveryStatus(E))?.suppressed === false);

section('7 - An explicit resume puts an address back, and only then');
await resumeAddress(B);
check('resumed: no longer blocked', (await getDeliveryStatus(B))?.suppressed === false);
const beforeResume = attemptsTo(B);
await fire('Lecture', 'Probe timetable five');
check('email flows again after the explicit resume', attemptsTo(B) === beforeResume + 1, `${beforeResume} -> ${attemptsTo(B)}`);

/* ------------------------------------------------------------------ */
await mongoose.connection.dropDatabase();
console.log(`\n  dropped the throwaway database "${TEST_DB}"`);
console.log(`\n${'='.repeat(46)}\n  passed: ${pass}   failed: ${fail}\n${'='.repeat(46)}`);
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
