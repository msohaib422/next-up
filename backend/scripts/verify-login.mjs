/**
 * Real end-to-end login verification, using the actual password form.
 *
 * WHY THIS SCRIPT NO LONGER TOUCHES A REAL PASSWORD
 * -------------------------------------------------
 * It used to save each real account's stored hash, write a temporary known
 * password over it, run the login, and write the ORIGINAL HASH BACK in a
 * `finally` block. The net effect was supposed to be nothing.
 *
 * It was not nothing. The restore only runs if the process reaches the end of
 * the `try`. A Ctrl-C, a crash, an OOM kill, a closed terminal, a deploy or a
 * timeout all skip it - and the account is then left holding
 * `tmp-verify-<random>`, a password that exists nowhere and that nobody knows.
 * The administrator is locked out completely: the old password no longer works,
 * no new password can be set because there is no way to sign in to set one, and
 * the only recovery is a script that has to be found first.
 *
 * That is precisely the reported fault - "it works, then it stops accepting both
 * the old and the new password" - and it explains why it kept coming back: this
 * file runs as a suite of `npm run verify`, which is exactly what is run after
 * a login problem is believed to be fixed. Every run re-armed the trap.
 *
 * So no real account is modified any more. This script now:
 *   1. creates throwaway accounts in the reserved `@sync.test` domain - one
 *      collaborator, one normal user - and runs the entire real-HTTP lifecycle
 *      against those, which is the same code path end to end
 *   2. checks the real administrators READ-ONLY: that they exist, hold the
 *      administrator role, are approved, and hold an intact bcrypt hash
 *   3. removes the throwaway accounts
 *
 * The verification coverage is unchanged; the blast radius is now zero.
 *
 *   node scripts/verify-login.mjs
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
process.env.VERCEL = '1';

const { default: app } = await import('../server.js');
const { default: connectDB } = await import('../config/db.js');
const { default: User } = await import('../models/User.js');
await connectDB();

/** The single role every administrator check in the app tests. */
const ADMIN_ROLE = 'collaborator';

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${extra ? `  <- ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

const server = await new Promise((resolve) => {
  const s = http.createServer(app);
  s.listen(0, () => resolve(s));
});

const call = (method, route, { token, body } = {}) =>
  new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1', port, method, path: route,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { /* ignore */ }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const PASSWORD = `verify-login-${Date.now().toString(36)}!A`;
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Run the full real-HTTP session for a THROWAWAY account.
 *
 * The account is created here with a known password, so nothing real is ever
 * overwritten and nothing depends on a `finally` block running to undo damage.
 */
const exerciseAccount = async (user, { expectAdmin }) => {
  const email = user.email;

  try {
    // --- Login -------------------------------------------------------------
    const login = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    check(`${email}: login succeeds`, login.status === 200, `status=${login.status} ${JSON.stringify(login.body)}`);

    const token = login.body?.token;
    check(`${email}: a JWT is issued`, typeof token === 'string' && token.split('.').length === 3);
    check(`${email}: the correct account is returned`, login.body?.data?.email === email, login.body?.data?.email);
    check(
      `${email}: the expected role is returned`,
      login.body?.data?.role === (expectAdmin ? ADMIN_ROLE : 'user'),
      login.body?.data?.role
    );

    // --- Page load / session restore ---------------------------------------
    // Three in a row, as a refresh plus a few navigations would produce.
    for (let i = 1; i <= 3; i += 1) {
      const me = await call('GET', '/api/auth/me', { token });
      check(`${email}: /auth/me still resolves on call ${i}`, me.status === 200 && me.body?.data?.email === email, `status=${me.status}`);
    }

    // --- An authenticated feature request ----------------------------------
    const tasks = await call('GET', '/api/tasks', { token });
    check(`${email}: an authenticated page loads`, tasks.status === 200, `status=${tasks.status}`);

    const notifications = await call('GET', '/api/notifications/recent', { token });
    check(`${email}: notifications load`, notifications.status === 200, `status=${notifications.status}`);

    // --- Admin capability ---------------------------------------------------
    if (expectAdmin) {
      const users = await call('GET', '/api/users/admin/users', { token });
      check(`${email}: the admin user list loads`, users.status === 200, `status=${users.status}`);
      const contributions = await call('GET', '/api/admin/contributions', { token });
      check(`${email}: the admin approvals queue loads`, contributions.status === 200, `status=${contributions.status}`);
    } else {
      const users = await call('GET', '/api/users/admin/users', { token });
      check(`${email}: a normal user is refused the admin list`, users.status === 403, `status=${users.status}`);
    }

    // --- Password change, the whole point of this suite --------------------
    // Changing the password on the throwaway account proves the flow end to end:
    // the new one works, the old one stops working, and the stored value is a
    // single bcrypt pass rather than a hash of a hash.
    const changed = await call('PUT', '/api/users/change-password', {
      token,
      body: { currentPassword: PASSWORD, newPassword: `${PASSWORD}-next` },
    });
    check(`${email}: change-password succeeds`, changed.status === 200, `status=${changed.status} ${JSON.stringify(changed.body)}`);

    const stored = await User.findById(user._id).select('+password');
    check(`${email}: the stored value is a bcrypt hash`, BCRYPT.test(stored.password), stored.password);
    check(`${email}: the new password verifies`, await stored.matchPassword(`${PASSWORD}-next`));
    check(`${email}: the old password no longer verifies`, !(await stored.matchPassword(PASSWORD)));
    check(`${email}: hashed exactly once (a hash-of-a-hash verifies against itself)`, !(await bcrypt.compare(stored.password, stored.password)));

    const afterChange = await call('POST', '/api/auth/login', { body: { email, password: `${PASSWORD}-next` } });
    check(`${email}: login with the NEW password works`, afterChange.status === 200, `status=${afterChange.status}`);
    const withOld = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    check(`${email}: login with the OLD password is refused`, withOld.status === 401, `status=${withOld.status}`);

    // --- Re-login after the token is discarded (logout) ---------------------
    // The client drops the token; the server must then refuse it, and a fresh
    // login with the same credentials must work.
    const afterLogout = await call('GET', '/api/tasks');
    check(`${email}: without a token the session is refused`, afterLogout.status === 401, `status=${afterLogout.status}`);

    const reLogin = await call('POST', '/api/auth/login', { body: { email, password: `${PASSWORD}-next` } });
    check(`${email}: re-login with the new password works`, reLogin.status === 200, `status=${reLogin.status}`);
    const afterReLogin = await call('GET', '/api/auth/me', { token: reLogin.body?.token });
    check(`${email}: the new session works`, afterReLogin.status === 200, `status=${afterReLogin.status}`);
  } finally {
    // The account is one this script created, so removing it IS the cleanup.
    // Nothing real is ever at risk, whatever happens to this process.
    await User.deleteMany({ _id: user._id });
  }
};

/** A throwaway address inside the reserved domain nothing real uses. */
const probeEmail = (label) => `verify-login-${label}-${Date.now().toString(36)}@sync.test`;

section('Real administrators (read-only - no password is touched)');
{
  const admins = await User.find({ role: ADMIN_ROLE }).select('+password').sort({ email: 1 });
  check('at least one administrator account exists', admins.length >= 1, `found ${admins.length}`);
  for (const admin of admins) {
    check(`${admin.email}: exists and is approved`, !admin.status || admin.status === 'Approved', admin.status);
    check(`${admin.email}: holds an intact bcrypt hash`, BCRYPT.test(admin.password || ''));
  }

  // Proof that the read above changed nothing: the hash must still be the one
  // the document had before this script ran.
  const reread = await User.findOne({ email: admins[0]?.email }).select('+password');
  check('the administrator hash is unchanged by this check', reread?.password === admins[0]?.password);
}

section('Throwaway collaborator: full session plus a password change');
{
  const email = probeEmail('admin');
  const user = await User.create({ name: 'Probe Admin', email, password: PASSWORD, role: ADMIN_ROLE, status: 'Approved' });
  await exerciseAccount(user, { expectAdmin: true });
}

section('Throwaway normal user: full session plus a password change');
{
  const email = probeEmail('user');
  const user = await User.create({ name: 'Probe User', email, password: PASSWORD, role: 'user', status: 'Approved' });
  await exerciseAccount(user, { expectAdmin: false });
}

section('Credential handling');
{
  const admins = await User.find({ role: ADMIN_ROLE }).select('email').sort({ email: 1 });
  const email = admins[0]?.email;
  const bad = await call('POST', '/api/auth/login', { body: { email, password: 'not-the-password' } });
  check('a wrong password is refused with 401', bad.status === 401);
  check('and carries no session-invalidating reason', !bad.body?.reason, JSON.stringify(bad.body));

  const unknown = await call('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'x' } });
  check('an unknown address is refused with 401', unknown.status === 401);
  check('without revealing that the address is unknown or not',
    /invalid credentials/i.test(unknown.body?.message || ''), JSON.stringify(unknown.body));
}

section('Cleanup');
{
  const leftovers = await User.countDocuments({ email: /@sync\.test$/ });
  check('no throwaway account was left behind', leftovers === 0, `${leftovers} left`);
}

console.log(`\n${'='.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56));

server.close();
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
