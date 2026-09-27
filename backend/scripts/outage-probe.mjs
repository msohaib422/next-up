/**
 * Probe used by verify-reliability.mjs. Started with an MONGODB_URI that cannot
 * be reached, so the genuine database-failure path is exercised.
 *
 * Prints one JSON line describing what each route answered, and exits cleanly:
 * the point being that an unreachable database does not crash the process.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.VERCEL = '1';

const { default: app } = await import('../server.js');
const { default: connectDB } = await import('../config/db.js');
const jwt = (await import('jsonwebtoken')).default;

await connectDB();

const server = await new Promise((resolve) => {
  const s = http.createServer(app);
  s.listen(0, () => resolve(s));
});

const request = (path_, { token } = {}) =>
  new Promise((resolve) => {
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, method: 'GET', path: path_, headers: token ? { Authorization: `Bearer ${token}` } : {} },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let body = null;
          try { body = JSON.parse(data); } catch { /* ignore */ }
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: null, body: null, timedOut: true }); });
    req.on('error', (error) => resolve({ status: null, body: null, error: error.message }));
    req.end();
  });

// A well-formed token for a real account id, so the request gets past token
// verification and fails only at the database lookup - which is the point.
// The id is passed in by the parent, because reading it from the database is
// exactly what is unavailable in this scenario.
const token = process.env.PROBE_USER_ID
  ? jwt.sign({ id: process.env.PROBE_USER_ID }, process.env.JWT_SECRET, { expiresIn: '30d' })
  : null;

const report = {
  tasks: await request('/api/tasks', { token }),
  me: await request('/api/auth/me', { token }),
  health: await request('/api/health'),
  badToken: await request('/api/tasks', { token: 'not.a.valid.token' }),
};

console.log(JSON.stringify(report));

server.close();
process.exit(0);
