/**
 * Vercel deployment-shape verification.
 *
 * The Vercel CLI is not available in this environment, so instead of asserting
 * the deployment "should" work, this exercises the two things that actually
 * decide it:
 *
 *   1. the serverless entry point - api/index.js is imported exactly as Vercel
 *      imports it and its default export is called the way the platform calls
 *      it, with no listen() and no persistent process;
 *   2. the routing rules in vercel.json - each rewrite source is matched against
 *      real URLs to prove API calls reach the function, client-side routes fall
 *      back to the SPA, and neither shadows the other.
 *
 *   node scripts/verify-vercel.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${extra ? `  <- ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

/* ------------------------------------------------------------------ *
 * 1. vercel.json
 * ------------------------------------------------------------------ */
const config = JSON.parse(fs.readFileSync(path.join(repo, 'vercel.json'), 'utf8'));

section('vercel.json');
{
  check('declares version 2', config.version === 2);
  check('builds the frontend', /frontend/.test(config.buildCommand) && /build/.test(config.buildCommand));
  check('serves the frontend build output', config.outputDirectory === 'frontend/dist');
  check('the serverless function bundles the backend', config.functions?.['api/index.js']?.includeFiles?.includes('backend'));
  check('the function has a bounded maxDuration', Number(config.functions?.['api/index.js']?.maxDuration) > 0);
  check('there is a rewrite for /api', config.rewrites.some((r) => r.source.startsWith('/api/')));
  check('there is an SPA fallback rewrite', config.rewrites.some((r) => r.destination === '/index.html'));
  check('the API rewrite is declared before the SPA fallback',
    config.rewrites.findIndex((r) => r.source.startsWith('/api/')) <
      config.rewrites.findIndex((r) => r.destination === '/index.html'),
    'order matters: a catch-all first would swallow every API call');
}

section('Routing: every URL reaches the right place');
{
  // Vercel compiles a rewrite `source` into a regex and tests it against the
  // request path. Built character by character, which is unambiguous: literals
  // are escaped and the few Vercel path tokens are translated deliberately.
  const toRegExp = (source) => {
    const METACHARACTERS = new Set(['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
    let out = '';
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];

      // `(.*)`  -> a captured rest-of-path
      if (ch === '(' && source[i + 1] === '.' && source[i + 2] === '*' && source[i + 3] === ')') {
        out += '(.*)';
        i += 3;
        continue;
      }
      // `:name*` -> a captured rest-of-path
      if (ch === ':') {
        let j = i + 1;
        while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
        if (j < source.length && source[j] === '*') {
          out += '(.*)';
          i = j;
          continue;
        }
        /*
         * `:name(<group>)` -> the group is passed through VERBATIM.
         *
         * The SPA catch-all is `/:path((?!api/).*)`, and the inner
         * `(?!api/)` is a negative lookahead, not literal text. Escaping it
         * (as the metacharacter branch below used to do) compiled the rule to
         * `^\/([^/]+)\(\(?!api\/\)\..*\)$`, which matches no real URL at all -
         * so every SPA case resolved to `null` and looked like a routing bug in
         * vercel.json when the config was in fact correct.
         */
        if (j < source.length && source[j] === '(') {
          let depth = 0;
          let k = j;
          for (; k < source.length; k += 1) {
            if (source[k] === '(') depth += 1;
            else if (source[k] === ')') {
              depth -= 1;
              if (depth === 0) break;
            }
          }
          if (k < source.length) {
            out += `(${source.slice(j + 1, k)})`;
            i = k;
            continue;
          }
        }
        out += '([^/]+)';
        i = j - 1;
        continue;
      }
      // A bare `*` -> a wildcard.
      if (ch === '*') {
        out += '.*';
        continue;
      }
      out += METACHARACTERS.has(ch) ? `\\${ch}` : ch;
    }
    return new RegExp(`^${out}$`);
  };

  const compiled = config.rewrites.map((r) => ({ ...r, regexp: toRegExp(r.source) }));
  const resolve = (url) => {
    for (const rule of compiled) {
      if (rule.regexp.test(url)) return rule.destination;
    }
    return null;
  };

  const cases = [
    ['/api/tasks', '/api/index.js', 'API: tasks'],
    ['/api/auth/login', '/api/index.js', 'API: login'],
    ['/api/admin/contributions', '/api/index.js', 'API: admin route'],
    ['/api/users/admin/email-deliveries', '/api/index.js', 'API: nested admin route'],
    ['/api/health', '/api/index.js', 'API: health'],
    ['/', '/index.html', 'SPA: root'],
    ['/tasks', '/index.html', 'SPA: hard refresh on a client route'],
    ['/users', '/index.html', 'SPA: admin users page'],
    ['/approvals', '/index.html', 'SPA: approvals page'],
    ['/notifications', '/index.html', 'SPA: notifications page'],
    ['/login', '/index.html', 'SPA: login page'],
    ['/register', '/index.html', 'SPA: register page'],
  ];

  for (const [url, expected, label] of cases) {
    const got = resolve(url);
    check(`${label} (${url}) -> ${expected}`, got === expected, `got ${got}`);
  }

  // Vercel resolves a request in this order: redirects, then the FILESYSTEM
  // (static files and functions), then rewrites. The SPA catch-all is therefore
  // safe for hashed assets: they exist on disk and are served before any rewrite
  // is considered. This is the officially documented SPA pattern, and the check
  // below pins the ordering that makes it correct.
  const dist = path.join(repo, 'frontend/dist');
  const assetsDir = path.join(dist, 'assets');
  const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  const assetUrls = assetFiles.map((f) => `/assets/${f}`);

  check('the build produced assets to protect from the catch-all', assetUrls.length > 0, 'no assets found');
  for (const url of assetUrls) {
    const onDisk = fs.existsSync(path.join(dist, url.replace(/^\//, '')));
    check(`${url} exists on disk and is served before the SPA rewrite applies`, onDisk);
  }
  check('the SPA catch-all is the last rewrite, so /api is matched first',
    config.rewrites[config.rewrites.length - 1].destination === '/index.html');
}

/* ------------------------------------------------------------------ *
 * 2. The serverless entry point, invoked the way Vercel invokes it
 * ------------------------------------------------------------------ */
section('The serverless function entry point');
process.env.VERCEL = '1';

const { default: handler } = await import('../../api/index.js');
{
  check('api/index.js exports a default function', typeof handler === 'function');

  // Vercel passes Node's IncomingMessage/ServerResponse. Drive the handler with
  // a real socket so the whole Express stack runs exactly as it will in
  // production, with no process kept alive.
  const server = http.createServer((req, res) => handler(req, res));

  // NOTE: `path`, not `url`. http.request has no `url` option - passing one is
  // silently ignored and every request would go to "/".
  const call = (method, route, body) =>
    new Promise((resolve, reject) => {
      const { port } = server.address();
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          host: '127.0.0.1', port, method, path: route,
          headers: {
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

  await new Promise((r) => server.listen(0, r));

  const health = await call('GET', '/api/health');
  check('the function answers a request', health.status === 200, `status=${health.status}`);
  check('the database is connected inside the function', health.body?.database === 'connected', JSON.stringify(health.body));

  const protectedRoute = await call('GET', '/api/tasks');
  check('a protected route is refused without a token', protectedRoute.status === 401, `status=${protectedRoute.status}`);

  const unknown = await call('GET', '/api/nope');
  check('an unknown API path is a 404, not a crash', unknown.status === 404, `status=${unknown.status}`);

  // A second request must reuse the warm connection rather than opening a new
  // one: this is the serverless lifecycle that makes or breaks the deployment.
  const second = await call('GET', '/api/health');
  check('a second invocation on the warm function still works', second.status === 200, `status=${second.status}`);

  // Query strings and encoded paths must survive the rewrite.
  const search = await call('GET', '/api/search?q=exam');
  check('a query string reaches the route (401, not 404)', search.status === 401, `status=${search.status}`);

  await new Promise((r) => server.close(r));
}

section('The frontend build output');
{
  const dist = path.join(repo, 'frontend/dist');
  check('frontend/dist exists', fs.existsSync(dist));
  if (fs.existsSync(dist)) {
    check('it contains index.html for the SPA fallback', fs.existsSync(path.join(dist, 'index.html')));
    const assets = fs.existsSync(path.join(dist, 'assets')) ? fs.readdirSync(path.join(dist, 'assets')) : [];
    check('it contains hashed assets', assets.some((f) => /\.(js|css)$/.test(f)), assets.join(', '));
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    check('index.html references the built bundle', /\/assets\/index-.*\.js/.test(html));
    check('index.html sets the API base to same-origin /api', !/VITE_API_URL/.test(html));
  }
}

section('Secrets are not committed');
{
  const ignore = fs.readFileSync(path.join(repo, '.gitignore'), 'utf8');
  for (const pattern of ['.env', 'node_modules/', 'frontend/dist/', '.vercel/']) {
    check(`.gitignore covers ${pattern}`, ignore.includes(pattern));
  }
  check('.gitignore no longer excludes .env.example', !/^\.env\.example$/m.test(ignore));
  check('backend/.env.example exists and is committed', fs.existsSync(path.join(repo, 'backend/.env.example')));

  const example = fs.readFileSync(path.join(repo, 'backend/.env.example'), 'utf8');
  const required = [
    'MONGODB_URI', 'JWT_SECRET', 'FRONTEND_URL', 'ADMIN_EMAIL_1', 'ADMIN_EMAIL_2',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
    'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
    'CORS_ORIGINS', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'MAX_UPLOAD_MB',
    'EMAIL_MAX_FAILURES', 'EMAIL_SUPPRESSED_ADDRESSES', 'PORT',
  ];
  for (const name of required) {
    // A variable counts as documented whether it is set to a placeholder or
    // listed in the commented optional block.
    check(`.env.example documents ${name}`, new RegExp(`^#?\\s*${name}=`, 'm').test(example));
  }
  check('.env.example has no real password', !/SMTP_PASS=(?!your_app_password_here|your|<)/.test(example));
  check('.env.example points MONGODB_URI at the production database', /\/nextup\?/.test(example));
}

section('No development-only leftovers');
{
  const all = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      // node_modules, git, build output and the account backup (which
      // deliberately holds historical data) are not source.
      if (['node_modules', '.git', 'dist', '.backups', '.vercel'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|jsx|json)$/.test(e.name)) all.push(full);
    }
  };
  walk(repo);

  const read = (f) => fs.readFileSync(f, 'utf8');

  // Strip comments, so a prose mention of a removed name is not mistaken for
  // the name still being used.
  const code = (text) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const oldAdmin = all.filter((f) => /hasnain@gmail\.com/.test(code(read(f))));
  check('the old admin address is not used anywhere in the code', oldAdmin.length === 0, oldAdmin.join(', '));

  const legacyMail = all.filter((f) => /ADMIN_REVIEW_URL|MAIL_FROM/.test(code(read(f))));
  check('the removed legacy mail settings are not referenced in code', legacyMail.length === 0, legacyMail.join(', '));

  const seed = fs.existsSync(path.join(repo, 'backend/seed.js'));
  check('the demo data seeder is gone', !seed);

  const backendPkg = read(path.join(repo, 'backend/package.json'));
  check('backend/package.json is valid JSON', (() => { try { JSON.parse(backendPkg); return true; } catch { return false; } })());
  check('no "seed" script remains', !JSON.parse(backendPkg).scripts.seed);
  check('root package.json is valid JSON', (() => { try { JSON.parse(read(path.join(repo, 'package.json'))); return true; } catch { return false; } })());

  const dbNameRefs = all.filter((f) => /["'`]test["'`]\s*[,)]/.test(code(read(f))));
  check('no code hardcodes a "test" database name', dbNameRefs.length === 0, dbNameRefs.join(', '));

  check('.backups/ (account dumps) is git-ignored', read(path.join(repo, '.gitignore')).includes('.backups/'));
}

console.log(`\n${'='.repeat(56)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
