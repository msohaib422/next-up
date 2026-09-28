/**
 * Reset the password of every existing account to a known temporary value.
 *
 * WHY THIS EXISTS
 * ---------------
 * When an account's stored password cannot be recovered - nobody knows the
 * current one, and it is a one-way hash so there is nothing to read back - the
 * only way forward is to write a new hash. This does that for every account at
 * once, users and administrators alike.
 *
 * THE ONE RULE: only the `password` field is written.
 *
 * Nothing else on a document is touched. Not the name, email, role, status,
 * profile image, approval state, or createdAt. The update is a `$set` of that
 * one field, so every other value is left exactly as it was and no account is
 * ever deleted or recreated. Each document keeps its own `_id`, so every piece
 * of content that points at a user still points at the right person.
 *
 * THE HASH IS NEVER SKIPPED
 * -------------------------
 * The temporary password is hashed with the model's own `hashPassword()`, the
 * same function the app uses for registration and for self-service password
 * changes, so the stored value is a normal bcrypt hash indistinguishable from
 * one the application wrote itself. The plain text is never written to MongoDB
 * and never leaves this process. Afterwards every account is read back and
 * compared with bcrypt exactly the way the login handler compares, so "the
 * temporary password works" is observed rather than assumed.
 *
 * This is a TEMPORARY reset: every account shares the same known password
 * until each person changes their own from their Profile page.
 *
 *   node scripts/reset-all-passwords.mjs                          # dry run
 *   node scripts/reset-all-passwords.mjs --password 12345678       # dry run
 *   node scripts/reset-all-passwords.mjs --password 12345678 --apply
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// The database the running application actually uses: the URI's own database
// name, unless TARGET_DB overrides it for a deliberate run elsewhere.
const DB_NAME = process.env.TARGET_DB || process.env.MONGODB_URI.split('/').pop().split('?')[0];
const APPLY = process.argv.includes('--apply');

/** Reads --name value, so a password with spaces or symbols needs no escaping. */
const argOf = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

const PASSWORD = argOf('password') || '12345678';

/** The single role every administrator check in the app tests. */
const ADMIN_ROLE = 'collaborator';

const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};

const run = async () => {
  if (!PASSWORD) {
    fail('a --password value is required.');
  }

  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  }).asPromise();
  const users = client.getClient().db(DB_NAME).collection('users');

  const accounts = await users
    .find({}, { projection: { name: 1, email: 1, role: 1, status: 1, password: 1 } })
    .sort({ role: 1, email: 1 })
    .toArray();

  console.log(`Database:  ${DB_NAME}   (from the application's MONGODB_URI)`);
  console.log(`Mode:      ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Accounts:  ${accounts.length}\n`);

  if (accounts.length === 0) {
    console.log('There are no accounts. Nothing to do.');
    await client.close();
    return;
  }

  for (const account of accounts) {
    const isAdmin = account.role === ADMIN_ROLE;
    const alreadyHashed = typeof account.password === 'string' && /^\$2[aby]\$/.test(account.password);
    console.log(
      `  ${isAdmin ? 'admin ' : 'user  '} ${String(account.email).padEnd(38)} ` +
        `status=${String(account.status || 'Approved').padEnd(16)} ` +
        `password=${alreadyHashed ? 'already hashed' : 'NOT HASHED'}`
    );
  }

  const notHashed = accounts.filter(
    (a) => !(typeof a.password === 'string' && /^\$2[aby]\$/.test(a.password))
  );
  if (notHashed.length) {
    console.log(
      `\nNOTE: ${notHashed.length} account(s) hold a password that is not a bcrypt hash.\n` +
        '      Those are stored in plain text and will be replaced by a hash on apply.'
    );
  }

  console.log('\nPlan:');
  console.log(`  Set the password of all ${accounts.length} account(s) to the value given.`);
  console.log('  Only the `password` field is written. No account is created, deleted or');
  console.log('  modified in any other way, and every _id is preserved.');

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply.');
    await client.close();
    return;
  }

  // The model's own hashing, so the stored hash is identical in shape to one the
  // app wrote. Imported lazily because it opens a connection of its own.
  const User = (await import('../models/User.js')).default;
  const hash = await User.hashPassword(PASSWORD);

  if (!/^\$2[aby]\$/.test(hash)) {
    fail('the value produced by the model is not a bcrypt hash; refusing to write it.');
  }

  const result = await users.updateMany({}, { $set: { password: hash } });
  console.log(
    `\n  updateMany matched ${result.matchedCount} and modified ${result.modifiedCount}.`
  );
  if (result.matchedCount !== accounts.length) {
    fail(`expected to match ${accounts.length} accounts but matched ${result.matchedCount}.`);
  }

  // Read every account back and check it the way the login handler checks it.
  const after = await users.find({}, { projection: { email: 1, role: 1, password: 1 } }).toArray();
  if (after.length !== accounts.length) {
    fail(`the account count changed (${accounts.length} -> ${after.length}).`);
  }

  let failures = 0;
  for (const account of after) {
    const works = await bcrypt.compare(PASSWORD, account.password);
    if (!works) {
      console.error(`  ${account.email}: the stored hash does not match the requested password.`);
      failures += 1;
    }
  }
  if (failures) {
    fail(`${failures} account(s) did not verify after the write.`);
  }

  const plainTextLeft = after.filter((a) => a.password === PASSWORD);
  if (plainTextLeft.length) {
    fail(`${plainTextLeft.length} account(s) still hold the password in plain text.`);
  }

  console.log('\nDone:');
  console.log(`  ${after.length} account(s) now hold a bcrypt hash that verifies against the`);
  console.log('  requested password. No plain-text password was written at any point.');
  console.log('  Every account can now sign in with it and should change it from Profile.');

  await client.close();
};

run().catch((error) => {
  console.error('PASSWORD RESET FAILED:', error.message);
  process.exit(1);
});
