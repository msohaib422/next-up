/**
 * Production-readiness verification against the real database and the real
 * Express app. Nothing is stubbed except the SMTP transport, so what is checked
 * here is the behaviour that actually ships.
 *
 *   node scripts/verify-production.mjs
 *
 * Covered:
 *   - the app connects to the production database, not `test`
 *   - every account survived the content reset
 *   - both administrators are present, correctly named, and hold the same role
 *   - both administrators can reach every admin-only endpoint
 *   - a normal user is refused by every admin-only endpoint
 *   - the content collections are empty
 *   - 401 handling distinguishes a rejected credential from a server failure
 *   - one registration event produces ONE email containing BOTH admin addresses
 *   - the login endpoint's own 401 is not treated as an expired session
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

// Nothing leaves the machine: the transport is replaced, but the real sendMail
// logic - recipient vetting, suppression, templating - still runs.
const sent = [];
nodemailer.createTransport = () => ({
  verify: async () => true,
  close: () => {},
  sendMail: async (opts) => {
    sent.push({
      to: Array.isArray(opts.to) ? opts.to.map(String) : [String(opts.to)],
      subject: opts.subject,
      html: opts.html,
    });
    return { messageId: `stub-${sent.length}` };
  },
});

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Run the app exactly as Vercel runs it: no listen(), no persistent process,
// just the exported handler. That way this suite verifies the serverless path
// that production actually uses, not the local one.
process.env.VERCEL = '1';

const { default: app } = await import('../server.js');
const { default: connectDB, isDbConnected } = await import('../config/db.js');
const { resolveAdminRecipients, configuredAdminEmails } = await import('../config/adminRecipients.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');

await connectDB();

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${extra ? `  <- ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

/* ------------------------------------------------------------------ *
 * A real HTTP request against the real app, in-process.
 * ------------------------------------------------------------------ */
import http from 'node:http';

const listen = () =>
  new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });

const request = (server, method, path, { token, body } = {}) =>
  new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { /* non-JSON body */ }
          resolve({ status: res.statusCode, body: parsed, raw: data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const server = await listen();
const results = {};

// The schema marks `password` as select: false, so it must be asked for
// explicitly. Without this the check below would be testing the projection
// rather than the data.
const adminsWithPassword = await User.find({ role: 'collaborator' }).select('+password');
const passwordHashesIntact = adminsWithPassword.every((a) => typeof a.password === 'string' && a.password.length > 20);

/* ------------------------------------------------------------------ */
section('Database');
{
  const name = mongoose.connection.name;
  check('connected to the production database "nextup"', name === 'nextup', `connected to "${name}"`);
  check('connection reports ready', isDbConnected());
  check('MONGODB_URI no longer omits the database name', /\/nextup(\?|$)/.test(process.env.MONGODB_URI));

  const { databases } = await mongoose.connection.getClient().db().admin().listDatabases();
  const names = databases.map((d) => d.name);
  check('the "test" database no longer exists', !names.includes('test'), `present: ${names.join(', ')}`);
  check('the "nextup" database exists', names.includes('nextup'));
  results.databases = names;
}

section('Accounts preserved');
const allUsers = await User.find({}).sort({ email: 1 });
{
  check('all 5 accounts survived', allUsers.length === 5, `found ${allUsers.length}`);
  for (const u of allUsers) console.log(`         ${u.email.padEnd(28)} role=${String(u.role).padEnd(12)} "${u.name}"`);
  const emails = allUsers.map((u) => u.email);
  check('ahsan@gmail.com still exists', emails.includes('ahsan@gmail.com'));
  check('aqib@gmail.com still exists', emails.includes('aqib@gmail.com'));
  check('novi was relocated, not deleted', emails.includes('novi+nextup@gmail.com'));
  check('hasnain@gmail.com is gone as an identity', !emails.includes('hasnain@gmail.com'));
}

section('Administrators');
const admins = await User.find({ role: 'collaborator' }).sort({ email: 1 });
{
  check('exactly two administrator accounts', admins.length === 2, `found ${admins.length}`);
  const emails = admins.map((a) => a.email).sort();
  check('Admin 1 is msohaib.ai.dev@gmail.com', emails.includes('msohaib.ai.dev@gmail.com'));
  check('Admin 2 is anki.inola@gmail.com', emails.includes('anki.inola@gmail.com'));

  const admin1 = admins.find((a) => a.email === 'msohaib.ai.dev@gmail.com');
  const admin2 = admins.find((a) => a.email === 'anki.inola@gmail.com');
  check('Admin 1 is named "M Sohaib"', admin1?.name === 'M Sohaib', admin1?.name);
  check('Admin 2 is named "M Hasnain Ali"', admin2?.name === 'M Hasnain Ali', admin2?.name);
  check('both are Approved', admins.every((a) => !a.status || a.status === 'Approved'));
  check('both have an intact password hash', passwordHashesIntact);
  results.admins = admins.map((a) => ({ email: a.email, name: a.name, role: a.role }));
}

section('Content is fresh');
{
  const counts = {
    tasks: await mongoose.connection.db.collection('tasks').countDocuments(),
    quizzes: await mongoose.connection.db.collection('quizzes').countDocuments(),
    assignments: await mongoose.connection.db.collection('assignments').countDocuments(),
    announcements: await mongoose.connection.db.collection('announcements').countDocuments(),
    contributions: await mongoose.connection.db.collection('contributions').countDocuments(),
    notifications: await Notification.countDocuments(),
    activities: await mongoose.connection.db.collection('activities').countDocuments(),
  };
  for (const [name, count] of Object.entries(counts)) {
    check(`${name} is empty (${count})`, count === 0);
  }
  const dbNames = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  for (const gone of ['events', 'reminders', 'references', 'submissions']) {
    check(`obsolete collection "${gone}" was dropped`, !dbNames.includes(gone));
  }
  results.contentCounts = counts;
}

section('Admin permission parity');
{
  const admin1 = admins.find((a) => a.email === 'msohaib.ai.dev@gmail.com');
  const admin2 = admins.find((a) => a.email === 'anki.inola@gmail.com');
  const normal = await User.findOne({ role: 'user' });

  const adminEndpoints = [
    ['GET', '/api/users/admin/users'],
    ['GET', '/api/admin/contributions'],
    ['GET', '/api/users/admin/email-deliveries'],
    ['GET', '/api/tasks'],
    ['GET', '/api/quizzes'],
    ['GET', '/api/assignments'],
    ['GET', '/api/announcements'],
    ['GET', '/api/essentials'],
    ['GET', '/api/lectures'],
    ['GET', '/api/important-dates'],
    ['GET', '/api/notifications/recent'],
    ['GET', '/api/activities'],
  ];

  const statusesFor = async (user) => {
    const token = tokenFor(user);
    const out = {};
    for (const [method, p] of adminEndpoints) {
      const res = await request(server, method, p, { token });
      out[`${method} ${p}`] = res.status;
    }
    return out;
  };

  const s1 = await statusesFor(admin1);
  const s2 = await statusesFor(admin2);

  for (const key of Object.keys(s1)) {
    check(
      `Admin 1 and Admin 2 get the same result for ${key} (${s1[key]}/${s2[key]})`,
      s1[key] === s2[key] && s1[key] < 400,
      s1[key] === s2[key] ? '' : `Admin 1 -> ${s1[key]}, Admin 2 -> ${s2[key]}`
    );
  }

  // A normal user must be refused everywhere an admin is allowed.
  const normalStatuses = await statusesFor(normal);
  for (const key of ['GET /api/users/admin/users', 'GET /api/admin/contributions', 'GET /api/users/admin/email-deliveries']) {
    check(`normal user is refused ${key} (${normalStatuses[key]})`, normalStatuses[key] === 403);
  }

  // Both admins must be able to act on a user, not merely read the page.
  const editProbe = await Promise.all(
    [admin1, admin2].map((a) =>
      request(server, 'PUT', `/api/users/admin/users/${normal._id}`, {
        token: tokenFor(a),
        body: { name: normal.name, email: normal.email },
      })
    )
  );
  check(
    `Admin 1 can edit a user (${editProbe[0].status})`,
    editProbe[0].status === 200
  );
  check(
    `Admin 2 can edit a user (${editProbe[1].status})`,
    editProbe[1].status === 200
  );

  // The approval actions are admin-only and must reject a normal user.
  const approveProbe = await request(server, 'PUT', `/api/users/admin/users/${normal._id}/approve`, {
    token: tokenFor(normal),
    body: {},
  });
  check(`normal user cannot approve a registration (${approveProbe.status})`, approveProbe.status === 403);

  results.parity = s1;
}

section('Authentication and 401 handling');
{
  const admin1 = admins.find((a) => a.email === 'msohaib.ai.dev@gmail.com');

  // No token at all: a genuine credential problem, clearly marked.
  const noToken = await request(server, 'GET', '/api/tasks');
  check('missing token is refused with 401', noToken.status === 401);
  check('missing token reports reason NO_TOKEN', noToken.body?.reason === 'NO_TOKEN', JSON.stringify(noToken.body));

  // A forged token: also a genuine credential problem.
  const forged = await request(server, 'GET', '/api/tasks', { token: 'not.a.real.token' });
  check('invalid token is refused with 401', forged.status === 401);
  check(
    'invalid token reports INVALID_TOKEN or TOKEN_EXPIRED',
    ['INVALID_TOKEN', 'TOKEN_EXPIRED'].includes(forged.body?.reason),
    JSON.stringify(forged.body)
  );

  // An expired token.
  const expired = jwt.sign({ id: admin1._id }, process.env.JWT_SECRET, { expiresIn: '-1s' });
  const expiredRes = await request(server, 'GET', '/api/tasks', { token: expired });
  check('expired token is refused with 401', expiredRes.status === 401);
  check('expired token reports TOKEN_EXPIRED', expiredRes.body?.reason === 'TOKEN_EXPIRED', JSON.stringify(expiredRes.body));

  // A valid token works, and survives a page refresh (which re-reads /auth/me).
  const valid = await request(server, 'GET', '/api/auth/me', { token: tokenFor(admin1) });
  check('valid token resolves the user', valid.status === 200 && valid.body?.data?.email === 'msohaib.ai.dev@gmail.com');
  const valid2 = await request(server, 'GET', '/api/auth/me', { token: tokenFor(admin1) });
  check('repeated /auth/me (page refresh) keeps working', valid2.status === 200);

  // The login endpoint's own 401 is about the form, not the session. The client
  // must not treat it as an expired token.
  const badLogin = await request(server, 'POST', '/api/auth/login', {
    body: { email: 'msohaib.ai.dev@gmail.com', password: 'definitely-not-the-password' },
  });
  check('wrong password is refused with 401', badLogin.status === 401);
  check(
    'wrong-password 401 carries no session-invalidating reason',
    !badLogin.body?.reason,
    JSON.stringify(badLogin.body)
  );
}

section('Unauthenticated routes still work');
{
  const health = await request(server, 'GET', '/api/health');
  check('health endpoint responds', health.status === 200, JSON.stringify(health.body));
  check('health reports the database is connected', health.body?.database === 'connected', JSON.stringify(health.body));

  const notFound = await request(server, 'GET', '/api/definitely-not-a-route');
  check('unknown API route is a clean 404', notFound.status === 404);
}

section('Admin email recipients');
{
  const env = configuredAdminEmails();
  check('ADMIN_EMAIL_1 is read from the environment', env.includes('msohaib.ai.dev@gmail.com'), env.join(', '));
  check('ADMIN_EMAIL_2 is read from the environment', env.includes('anki.inola@gmail.com'), env.join(', '));
  check('exactly two admin recipients configured', env.length === 2, `${env.length}: ${env.join(', ')}`);

  const resolved = await resolveAdminRecipients();
  check(
    'recipients resolve to both administrators',
    resolved.includes('msohaib.ai.dev@gmail.com') && resolved.includes('anki.inola@gmail.com'),
    resolved.join(', ')
  );
  results.adminRecipients = resolved;
}

section('One event, one email, both administrators');
{
  const { register } = await import('../controllers/authController.js');
  const uniqueEmail = `verify-${Date.now().toString(36)}@example.com`;
  const before = sent.length;
  const notifBefore = await Notification.countDocuments();

  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  await register(
    { body: { name: 'Verify Applicant', email: uniqueEmail, password: 'verify123' } },
    res,
    (e) => { throw e; }
  );

  check('registration succeeded', res.statusCode === 201, JSON.stringify(res.body));

  // Each entry in `sent` is ONE call to the transport, i.e. one message.
  // `to` on that entry is the recipient list of that single message.
  const adminAlerts = sent.slice(before).filter((m) => /awaiting your approval/i.test(m.subject));
  check('an admin alert email was sent', adminAlerts.length > 0);

  if (adminAlerts.length) {
    check(
      'the admin alert is ONE email operation, not one per administrator',
      adminAlerts.length === 1,
      `${adminAlerts.length} separate message(s) were sent`
    );
    const recipients = adminAlerts[0].to.flatMap((t) => String(t).split(',')).map((s) => s.trim().toLowerCase());
    check(
      'that single message is addressed to BOTH administrators',
      recipients.includes('msohaib.ai.dev@gmail.com') && recipients.includes('anki.inola@gmail.com'),
      recipients.join(', ')
    );
    check('and to nobody else', recipients.length === 2, recipients.join(', '));
  }

  // The applicant gets their own separate message: two messages total for the
  // one event, and no business logic was run twice.
  const applicantMail = sent.slice(before).find((m) => /registration has been received/i.test(m.subject));
  check('the applicant receives their own confirmation', Boolean(applicantMail));

  const notifAfter = await Notification.countDocuments();
  check(
    'in-app notifications were created',
    notifAfter > notifBefore,
    `${notifBefore} -> ${notifAfter}`
  );

  // Clean up everything this run created, so the database is left exactly as
  // it was found: fresh content, all accounts intact.
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const applicantPattern = new RegExp(escape(uniqueEmail), 'i');

  const applicant = await User.findOne({ email: uniqueEmail });
  if (applicant) {
    await Notification.deleteMany({
      $or: [
        { recipient: applicant._id },
        { actor: applicant._id },
        { 'metadata.userEmail': uniqueEmail },
        { message: applicantPattern },
      ],
    });
    await mongoose.connection.db.collection('activities').deleteMany({ user: applicant._id });
    await User.deleteOne({ _id: applicant._id });
  }
  await mongoose.connection.db.collection('emaildeliveries').deleteMany({ email: uniqueEmail });
}

section('End state');
{
  const finalUsers = await User.find({}).sort({ email: 1 });
  const finalAdmins = await User.find({ role: 'collaborator' });
  check('accounts still number 5', finalUsers.length === 5, `${finalUsers.length}`);
  check('administrators still number 2', finalAdmins.length === 2, `${finalAdmins.length}`);
  for (const name of ['tasks', 'quizzes', 'assignments', 'announcements', 'contributions', 'activities', 'notifications', 'emaildeliveries']) {
    const count = await mongoose.connection.db.collection(name).countDocuments();
    if (count !== 0) console.log(`         note: ${name} has ${count} document(s) from this verification run`);
  }
}

console.log(`\n${'='.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56));
console.log(JSON.stringify(results, null, 2));

server.close();
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
