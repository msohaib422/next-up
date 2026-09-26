/**
 * Run every verification suite in this directory and summarise the result.
 *
 *   node scripts/verify-all.mjs
 *
 * Each suite is a separate process, so one crashing cannot mask another, and the
 * exit code is non-zero if anything failed.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ['verify-shared-admin.mjs', 'shared multi-admin visibility, cross-admin edits, admin notifications, privacy'],
  ['verify-production.mjs', 'database, accounts, admin parity, auth, dual-admin email'],
  ['verify-login.mjs', 'real password login for both admins and a normal user'],
  ['verify-reliability.mjs', 'outage handling, reconnection, pooling, rate limiting'],
  ['verify-frontend-auth.mjs', 'session survival, secret exposure'],
  ['verify-vercel.mjs', 'deployment shape, routing, serverless entry point'],
];

const run = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { out += c; });
    child.on('close', (code) => resolve({ code, out }));
  });

const results = [];

for (const [file, description] of SUITES) {
  process.stdout.write(`\n${'#'.repeat(70)}\n# ${file}\n# ${description}\n${'#'.repeat(70)}\n`);
  const { code, out } = await run(file);
  process.stdout.write(out.endsWith('\n') ? out : `${out}\n`);

  const summary = out.match(/(\d+) passed, (\d+) failed/);
  results.push({
    file,
    code,
    passed: summary ? Number(summary[1]) : 0,
    failed: summary ? Number(summary[2]) : code === 0 ? 0 : 1,
  });
}

process.stdout.write(`\n${'='.repeat(70)}\n  OVERALL\n${'='.repeat(70)}\n`);
let failed = 0;
let passed = 0;
for (const r of results) {
  const status = r.code === 0 && r.failed === 0 ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${r.file.padEnd(30)} ${r.passed} passed, ${r.failed} failed`);
  passed += r.passed;
  failed += r.failed;
}
console.log(`${'='.repeat(70)}`);
console.log(`  ${passed} checks passed, ${failed} failed, across ${results.length} suites`);
console.log(`${'='.repeat(70)}\n`);

process.exit(failed || results.some((r) => r.code !== 0) ? 1 : 0);
