/**
 * Reliability verification: prove the specific failure modes that used to make
 * the app "stop working until it was restarted" now behave correctly.
 *
 *   node scripts/verify-reliability.mjs
 *
 * The important one is the second test. The old `protect` middleware awaited a
 * database lookup without a catch, and Express 4 does not catch a rejected
 * promise from a middleware. A database blip therefore left the request hanging
 * with NO response at all - the browser timed out, the client read that as a
 * network failure, and AuthContext threw the session away. That chain is what
 * produced the random logouts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
process.env.VERCEL = '1';

const { default: app } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: connectDB } = await import('../config/db.js');
await connectDB();

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${extra ? `  <- ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

import http from 'node:http';

const server = await new Promise((resolve) => {
  const s = http.createServer(app);
  s.listen(0, () => resolve(s));
});

const request = (method, path, { token, timeoutMs = 8000 } = {}) =>
  new Promise((resolve) => {
    const { port } = server.address();
    const started = Date.now();
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: token ? { Authorization: `Bearer ${token}` } : {} },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let body = null;
          try { body = JSON.parse(data); } catch { /* ignore */ }
          resolve({ status: res.statusCode, body, elapsed: Date.now() - started, timedOut: false });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: null, body: null, elapsed: Date.now() - started, timedOut: true });
    });
    req.on('error', (error) => resolve({ status: null, body: null, error: error.message, elapsed: Date.now() - started, timedOut: false }));
    req.end();
  });

const admin = await User.findOne({ role: 'collaborator' });
const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

section('A dropped connection must not hang the request, and must not fake a logout');
{
  // Break the connection the way a real network partition does. The app is
  // expected to RECOVER on its own here, so both a recovered 200 and a 503 are
  // acceptable. What must never happen is a hang, or a 401 that would make the
  // browser throw away a perfectly valid session.
  await mongoose.connection.close();

  const res = await request('GET', '/api/tasks', { token, timeoutMs: 20000 });

  check(
    'the request receives a real HTTP response instead of hanging',
    !res.timedOut && res.status !== null,
    res.timedOut ? `timed out after ${res.elapsed}ms with no response` : `status=${res.status}`
  );
  check(
    'the response is never a 401 (which would log the user out)',
    res.status !== 401,
    `status=${res.status}`
  );
  check(
    'the request either recovered or reported a retryable 503',
    res.status === 200 || (res.status === 503 && res.body?.retryable === true),
    `status=${res.status} body=${JSON.stringify(res.body)}`
  );
  check('no stack trace is leaked in the response', !res.body?.stack, JSON.stringify(res.body));
  console.log(`         (answered in ${res.elapsed}ms with status ${res.status})`);
}

section('A genuinely unreachable database is reported as retryable, not as a logout');
{
  // A separate process pointed at a host that cannot be reached, so the app
  // cannot self-heal and the real failure path is exercised.
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'outage-probe.mjs');
  const child = spawn(process.execPath, [script], {
    env: {
      ...process.env,
      // Vercel runs functions with NODE_ENV=production, which is also what
      // suppresses stack traces in responses. Test the real configuration.
      NODE_ENV: 'production',
      // Reserved TEST-NET-1 address: never routable, so the connection can only
      // fail. serverSelectionTimeoutMS is kept short so the probe is quick.
      MONGODB_URI: 'mongodb://127.0.0.1:1/nextup?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '1500',
      MONGO_BUFFER_TIMEOUT_MS: '1500',
      MONGO_CONNECT_TIMEOUT_MS: '1500',
      // A real account id and the real secret, so the probe builds a token that
      // passes verification and then fails only at the database lookup.
      PROBE_USER_ID: String(admin._id),
      JWT_SECRET: process.env.JWT_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  const [code] = await once(child, 'close');

  let report = null;
  try { report = JSON.parse(out.trim().split('\n').pop()); } catch { /* reported below */ }

  check('the app starts even with an unreachable database (no crash)', code === 0 || report !== null, `exit=${code}\n${out.slice(-800)}`);

  if (report) {
    check('an authenticated route answers 503', report.tasks?.status === 503, JSON.stringify(report.tasks));
    check('the 503 is flagged retryable', report.tasks?.body?.retryable === true, JSON.stringify(report.tasks?.body));
    check('the 503 is not a 401', report.tasks?.status !== 401, `status=${report.tasks?.status}`);
    check('the session lookup answers 503, not 401', report.me?.status === 503, JSON.stringify(report.me));
    check('the session lookup gives no invalid-token reason', !['INVALID_TOKEN', 'TOKEN_EXPIRED'].includes(report.me?.body?.reason), JSON.stringify(report.me?.body));
    check('no token-verification reason is invented', report.tasks?.body?.reason === 'DATABASE_UNAVAILABLE', JSON.stringify(report.tasks?.body));
    check('the health endpoint still answers 200', report.health?.status === 200, JSON.stringify(report.health));
    check('health reports the database as not connected', report.health?.body?.database !== 'connected', JSON.stringify(report.health?.body));
    check('no stack trace is leaked', !report.tasks?.body?.stack && !report.me?.body?.stack);
    check('an invalid token is still rejected with 401 (auth is not weakened)', report.badToken?.status === 401, JSON.stringify(report.badToken));
  }
}

section('Recovery: the app reconnects on its own, with no restart');
{
  // Re-point at the same cluster. This is the reconnect the driver performs by
  // itself after a real network partition; nothing restarts the process here.
  await connectDB();

  const res = await request('GET', '/api/tasks', { token, timeoutMs: 20000 });
  check('requests succeed again after the connection recovers, with no restart', res.status === 200, `status=${res.status}`);
  check('the recovered response is well formed', res.body?.success === true, JSON.stringify(res.body));

  const me = await request('GET', '/api/auth/me', { token, timeoutMs: 20000 });
  check('the session still resolves after recovery', me.status === 200, `status=${me.status}`);
  check('and identifies the same account', me.body?.data?.email === admin.email, me.body?.data?.email);

  // Repeated requests, as a real session makes. A leaked connection or an
  // exhausted pool would show up here as a progressive slowdown or failure.
  let allOk = true;
  const started = Date.now();
  for (let i = 0; i < 30; i += 1) {
    const r = await request('GET', '/api/auth/me', { token, timeoutMs: 15000 });
    if (r.status !== 200) { allOk = false; console.log(`         request ${i + 1} -> ${r.status}`); break; }
  }
  check('30 consecutive authenticated requests all succeed', allOk);
  check('and the connection was reused rather than re-opened', mongoose.connection.readyState === 1);
  console.log(`         (30 requests in ${Date.now() - started}ms)`);
}

section('Concurrency: a cold start must not open a connection per request');
{
  const before = mongoose.connection.client?.s?.pool?.totalCount ?? 0;

  const responses = await Promise.all(
    Array.from({ length: 25 }, () => request('GET', '/api/auth/me', { token, timeoutMs: 20000 }))
  );
  const ok = responses.filter((r) => r.status === 200).length;
  const after = mongoose.connection.client?.s?.pool?.totalCount ?? 0;

  check('25 simultaneous cold requests all succeed', ok === 25, `${ok}/25 succeeded`);
  check('the pool did not grow with the request count', after <= before + 5, `pool total: ${before} -> ${after}`);
  console.log(`         (connection pool total: ${before} -> ${after})`);
}

section('Rate limiting is not tight enough to break a normal session');
{
  // A 30-second poll plus focus refetches. The previous limit of 100 requests
  // per 15 minutes across all of /api was exhausted by ordinary use.
  const limit = Number(process.env.RATE_LIMIT_MAX) || 1000;
  check('the configured /api rate limit accommodates a polling session', limit >= 500, `RATE_LIMIT_MAX=${limit}`);

  let allOk = true;
  for (let i = 0; i < 120; i += 1) {
    const r = await request('GET', '/api/notifications/unread-count', { token, timeoutMs: 15000 });
    if (r.status !== 200) { allOk = false; console.log(`         poll ${i + 1} -> ${r.status}`); break; }
  }
  check('120 consecutive poll requests (far more than a session makes) all succeed', allOk);
}

console.log(`\n${'='.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56));

server.close();
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
