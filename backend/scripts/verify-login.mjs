/**
 * Real end-to-end login verification, including both administrators and a
 * normal user, using the actual password form.
 *
 * Passwords are unknown to this script, and it never permanently changes one.
 * For each account it saves the exact stored hash, sets a temporary known
 * password, performs the real HTTP login, exercises an authenticated request
 * and a logout, then writes the ORIGINAL HASH BACK and asserts it is
 * byte-for-byte identical. The net effect on the database is nothing.
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

const TEMP_PASSWORD = `tmp-verify-${Date.now().toString(36)}!A`;

/**
 * Run the full session for one account with a temporary password, then restore
 * the original hash exactly.
 */
const exerciseAccount = async (email, { expectAdmin }) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    check(`${email} exists`, false, 'account not found');
    return;
  }

  const originalHash = user.password;
  const originalUpdatedAt = user.updatedAt;

  // updateOne, not save(): the schema's pre('save') hook re-hashes a modified
  // password, so save() would hash the hash and the login would never match.
  const tempHash = await bcrypt.hash(TEMP_PASSWORD, 10);
  await User.updateOne({ _id: user._id }, { $set: { password: tempHash, updatedAt: originalUpdatedAt } });

  try {
    // --- Login -------------------------------------------------------------
    const login = await call('POST', '/api/auth/login', { body: { email, password: TEMP_PASSWORD } });
    check(`${email}: login succeeds`, login.status === 200, `status=${login.status} ${JSON.stringify(login.body)}`);

    const token = login.body?.token;
    check(`${email}: a JWT is issued`, typeof token === 'string' && token.split('.').length === 3);
    check(`${email}: the correct account is returned`, login.body?.data?.email === email, login.body?.data?.email);
    check(
      `${email}: the expected role is returned`,
      login.body?.data?.role === (expectAdmin ? 'collaborator' : 'user'),
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

    // --- Re-login after the token is discarded (logout) ---------------------
    // The client drops the token; the server must then refuse it, and a fresh
    // login with the same credentials must work.
    const afterLogout = await call('GET', '/api/tasks');
    check(`${email}: without a token the session is refused`, afterLogout.status === 401, `status=${afterLogout.status}`);

    const reLogin = await call('POST', '/api/auth/login', { body: { email, password: TEMP_PASSWORD } });
    check(`${email}: re-login works`, reLogin.status === 200, `status=${reLogin.status}`);
    const afterReLogin = await call('GET', '/api/auth/me', { token: reLogin.body?.token });
    check(`${email}: the new session works`, afterReLogin.status === 200, `status=${afterReLogin.status}`);
  } finally {
    // --- Restore the original credential, byte for byte --------------------
    await User.updateOne({ _id: user._id }, { $set: { password: originalHash, updatedAt: originalUpdatedAt } });
    const restored = await User.findById(user._id).select('+password');
    check(`${email}: the original password hash is restored exactly`, restored.password === originalHash);
  }
};

section('Admin 1 login and full session');
await exerciseAccount('msohaib.ai.dev@gmail.com', { expectAdmin: true });

section('Admin 2 login and full session');
await exerciseAccount('anki.inola@gmail.com', { expectAdmin: true });

section('Normal user login and full session');
const normal = await User.findOne({ role: 'user' });
if (normal) await exerciseAccount(normal.email, { expectAdmin: false });
else check('a normal user account exists to test', false);

section('Credential handling');
{
  // A wrong password must not invalidate an existing session for anyone else.
  const user = await User.findOne({ role: 'collaborator' });
  const bad = await call('POST', '/api/auth/login', { body: { email: user.email, password: 'not-the-password' } });
  check('a wrong password is refused with 401', bad.status === 401);
  check('and carries no session-invalidating reason', !bad.body?.reason, JSON.stringify(bad.body));

  const unknown = await call('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'x' } });
  check('an unknown address is refused with 401', unknown.status === 401);
  check('without revealing that the address is unknown or not',
    /invalid credentials/i.test(unknown.body?.message || ''), JSON.stringify(unknown.body));
}

console.log(`\n${'='.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56));

server.close();
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
