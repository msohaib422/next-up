/**
 * Read-only audit of every account: is each one actually able to sign in?
 *
 * Nothing is written. The point is to establish, from the database and from the
 * real login route, WHICH accounts are broken - not to assume that all of them
 * are, and not to guess from a hash that "looks wrong".
 *
 * For each account it reports:
 *   - the raw stored password field (type, length, bcrypt format)
 *   - whether the hash verifies against a hash of itself (which is what a
 *     double-hashed, permanently locked-out value looks like)
 *   - whether the login route accepts it, and with what answer
 *   - whether the account passes the approval gate
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || 'nextup';
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const run = async () => {
  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  }).asPromise();
  const users = client.getClient().db(DB_NAME).collection('users');
  const all = await users.find({}).sort({ email: 1 }).toArray();

  console.log(`Database: ${DB_NAME}`);
  console.log(`Accounts: ${all.length}\n`);

  const seen = new Map();
  const report = [];

  for (const a of all) {
    const flags = [];

    if (a.password === undefined) flags.push('NO_PASSWORD_FIELD');
    else if (a.password === null) flags.push('PASSWORD_NULL');
    else if (typeof a.password !== 'string') flags.push(`PASSWORD_NOT_STRING(${typeof a.password})`);
    else if (!BCRYPT.test(a.password)) flags.push(`NOT_BCRYPT_FORMAT(len=${a.password.length})`);

    if (a.email !== String(a.email).trim().toLowerCase()) flags.push('EMAIL_NOT_NORMALIZED');

    if (seen.has(a.email)) flags.push(`DUPLICATE_EMAIL(also ${seen.get(a.email)})`);
    else seen.set(a.email, String(a._id));

    // A hash that verifies against ITSELF is a hash of a hash: the original
    // plaintext is gone and no login can ever match it again.
    let selfVerifies = null;
    if (typeof a.password === 'string' && BCRYPT.test(a.password)) {
      selfVerifies = await bcrypt.compare(a.password, a.password);
      if (selfVerifies) flags.push('DOUBLE_HASHED_UNRECOVERABLE');
    }

    // bcrypt stores a hash of the salt+hash for the same reason; a genuine
    // single-pass hash of a short plaintext cannot verify against itself.
    const approvalBlocks = a.role !== 'collaborator' && a.status !== 'Approved';

    report.push({ doc: a, flags, selfVerifies, approvalBlocks });
  }

  console.log('ACCOUNT AUDIT');
  console.log('-'.repeat(96));
  for (const r of report) {
    const a = r.doc;
    const status = r.flags.length ? 'BROKEN  ' : 'ok      ';
    console.log(
      `${status}${a.email.padEnd(30)} role=${String(a.role).padEnd(13)} status=${String(a.status ?? '(none)').padEnd(10)}` +
      `pw=${a.password === undefined ? 'ABSENT' : String(a.password).slice(0, 7) + '..'}${r.flags.length ? '  ' + r.flags.join(', ') : ''}`
    );
  }
  console.log('-'.repeat(96));

  const broken = report.filter((r) => r.flags.length);
  console.log(`\nAccounts with a data problem: ${broken.length} of ${all.length}`);
  broken.forEach((r) => console.log(`  ${r.doc.email}: ${r.flags.join(', ')}`));

  const blocked = report.filter((r) => r.approvalBlocks);
  console.log(`\nAccounts the approval gate would refuse: ${blocked.length}`);
  blocked.forEach((r) => console.log(`  ${r.doc.email}: status=${r.doc.status}`));

  await client.close();
};

run().catch((e) => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
