/**
 * Delete and recreate ONE administrator account, by email, with a known password.
 *
 * WHY THIS EXISTS
 * ---------------
 * An administrator whose password is unknown cannot be recovered: the stored
 * value is a one-way bcrypt hash. Deleting the account and making a new one is
 * the only way to start from a known state - and doing that by hand is exactly
 * how an account ends up with NO password at all (see the note on upsert below).
 * So the whole sequence is done here, with the guards that make it safe.
 *
 * SCOPE - READ THIS BEFORE RUNNING IT
 * ----------------------------------
 *   node scripts/recreate-admin.mjs --email a@b.com --password secret
 *   node scripts/recreate-admin.mjs --email a@b.com --password secret --apply
 *
 * It touches EXACTLY the one account named by --email and nothing else:
 *
 *   - it refuses to run without an explicit --email
 *   - it records every account's _id before and after and FAILS if any
 *     account other than the named one appeared, disappeared or changed role
 *   - every other account's password hash is compared before and after and must
 *     be byte-for-byte identical
 *   - no other collection is read or written
 *
 * The password is hashed with the model's own hashPassword(), the same function
 * registration and the change-password route use, and the result is read back
 * and verified with bcrypt exactly the way the login handler verifies it. No
 * plain text is ever written to MongoDB.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || process.env.MONGODB_URI.split('/').pop().split('?')[0];
const APPLY = process.argv.includes('--apply');

const argOf = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const EMAIL = (argOf('email') || '').trim().toLowerCase();
const PASSWORD = argOf('password') || '';

/** The single role every administrator check in the app tests. */
const ADMIN_ROLE = 'collaborator';
const ADMIN_NAME = 'M Sohaib';

const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};

/** Every account except the named one, as a stable fingerprint for comparison. */
const fingerprintOthers = async (users) =>
  (await users.find({ email: { $ne: EMAIL } }, { projection: { password: 1 } }).sort({ _id: 1 }).toArray()).map((u) => ({
    _id: String(u._id),
    email: u.email,
    role: u.role ?? null,
    status: u.status ?? null,
    password: u.password ?? null,
  }));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const run = async () => {
  if (!EMAIL || !PASSWORD) fail('both --email and --password are required.');
  if (PASSWORD.length < 6) fail('the password must be at least 6 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) fail(`"${EMAIL}" is not a valid email address.`);

  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  }).asPromise();
  const users = client.getClient().db(DB_NAME).collection('users');

  console.log(`Database:  ${DB_NAME}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Account:   ${EMAIL}\n`);

  const before = await fingerprintOthers(users);
  const existing = await users.find({ email: EMAIL }).toArray();

  if (existing.length > 1) {
    fail(`${existing.length} documents hold ${EMAIL}; refusing to guess which one to replace.`);
  }

  console.log('Plan:');
  if (existing.length === 1) {
    console.log(`  Delete the existing account ${existing[0]._id} (${existing[0].email}).`);
  } else {
    console.log(`  No account holds ${EMAIL} - nothing to delete.`);
  }
  console.log(`  Create ${EMAIL} fresh with role="${ADMIN_ROLE}" and a bcrypt hash of the given password.`);
  console.log(`  ${before.length} other account(s) are left completely untouched (verified by hash comparison).`);
  console.log('  No other collection is read or written.');

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply.');
    await client.close();
    return;
  }

  // Delete ONLY the named account. The password is removed with the document,
  // which is why the new one is set below rather than left unset: a document
  // with no password field cannot sign in and cannot be recovered from the UI.
  if (existing.length === 1) {
    const removed = await users.deleteOne({ email: EMAIL });
    if (removed.deletedCount !== 1) fail(`the delete removed ${removed.deletedCount} document(s), expected 1.`);
    console.log(`\n  deleted ${EMAIL} (${existing[0]._id})`);
  }

  const User = (await import('../models/User.js')).default;
  const connectDB = (await import('../config/db.js')).default;
  await connectDB();
  const hash = await User.hashPassword(PASSWORD);

  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
    fail('the value produced by the model is not a bcrypt hash; refusing to write it.');
  }

  // Created through the model, so the schema's validators and its pre('save')
  // hashing hook both apply - exactly like a registration.
  //
  // The model uses mongoose's default connection, which this script has not
  // opened (it talks to the database through `client` so it can bypass the
  // model for the read-back checks). It is connected here first: without it the
  // insert would sit in the driver's buffer and time out, leaving the account
  // deleted and nothing in its place.
  const created = await User.create({
    name: ADMIN_NAME,
    email: EMAIL,
    password: PASSWORD,
    role: ADMIN_ROLE,
    status: 'Approved',
  });

  // --- Verify, against the database rather than by assumption ---------------
  const after = await fingerprintOthers(users);
  if (after.length !== before.length) {
    fail(`the account count changed outside the target account (${before.length} -> ${after.length}).`);
  }
  for (let i = 0; i < before.length; i += 1) {
    if (!same(before[i], after[i])) {
      fail(`another account changed: ${before[i].email} (${before[i]._id}) is not identical to before.`);
    }
  }
  console.log(`  verified: all ${after.length} other account(s) are byte-for-byte unchanged`);

  const raw = await users.findOne({ email: EMAIL });
  if (raw.password === PASSWORD) fail('the password was stored in plain text.');
  if (!(await bcrypt.compare(PASSWORD, raw.password))) {
    fail('the stored hash does not match the requested password.');
  }
  const viaModel = await User.findOne({ email: EMAIL }).select('+password');
  if (!(await viaModel.matchPassword(PASSWORD))) {
    fail("the account's own matchPassword() does not accept the requested password.");
  }
  if (raw.role !== ADMIN_ROLE) fail(`the role is ${raw.role}, expected ${ADMIN_ROLE}.`);

  const holders = await users.countDocuments({ email: EMAIL });
  if (holders !== 1) fail(`${holders} documents hold ${EMAIL}.`);

  console.log('\nDone:');
  console.log(`  ${raw.email}  _id=${raw._id}  role=${raw.role}  status=${raw.status}`);
  console.log(`  password stored as bcrypt (${raw.password.slice(0, 7)}...), never as plain text`);
  console.log(`  documents holding this address: ${holders}`);

  await mongoose.disconnect();
  await client.close();
};

run().catch(async (error) => {
  console.error('RECREATE FAILED:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
