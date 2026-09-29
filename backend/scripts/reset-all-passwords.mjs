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

  // The model's own hashing, so each stored hash is identical in shape to one
  // the app wrote. Imported lazily because it opens a connection of its own.
  const User = (await import('../models/User.js')).default;

  /*
   * ONE HASH PER ACCOUNT, NOT ONE HASH SHARED BY ALL.
   *
   * This used to hash once and `updateMany` the same value into every account.
   * That works, but it is a real weakness and it left visible evidence in the
   * database: every account ended up holding a byte-identical hash, so anybody
   * reading the collection could tell at a glance which accounts shared a
   * password, and one cracked hash would be instantly known to apply to all of
   * them. bcrypt salts per hash precisely to prevent that, and skipping the salt
   * threw the protection away.
   */
  console.log(`\n  Hashing once per account (a unique salt each):`);
  const updates = [];
  for (const account of accounts) {
    const hash = await User.hashPassword(PASSWORD);
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
      fail('the value produced by the model is not a bcrypt hash; refusing to write it.');
    }
    updates.push({ _id: account._id, hash });
    console.log(`    ${account.email}  ${hash.slice(0, 7)}...`);
  }

  const uniqueHashes = new Set(updates.map((u) => u.hash));
  if (uniqueHashes.size !== updates.length) {
    fail('two accounts received the same hash - the salt is not being applied per account.');
  }

  let modified = 0;
  for (const { _id, hash } of updates) {
    // Only the `password` field. _id, name, email, role, status, profile and
    // everything else on the document are left exactly as they are.
    const result = await users.updateOne({ _id }, { $set: { password: hash } });
    if (result.matchedCount !== 1) fail(`expected to match account ${_id} but matched ${result.matchedCount}.`);
    modified += result.modifiedCount;
  }
  console.log(`\n  Updated the password field on ${modified} of ${updates.length} account(s).`);

  // Read every account back and check it the way the login handler checks it.
  // `name` MUST be in this projection. It is compared below against the value
  // read before the write, and a projection that omits it makes every account
  // look as though its name changed - which is how the guard below used to fail
  // on a run that had in fact touched nothing but the password.
  const after = await users.find({}, { projection: { _id: 1, name: 1, email: 1, role: 1, status: 1, password: 1 } }).toArray();
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
    // The comparison a real attacker's guess would face.
    const rejects = await bcrypt.compare('wrong-password', account.password);
    if (rejects) {
      console.error(`  ${account.email}: an INCORRECT password was accepted.`);
      failures += 1;
    }
    if (account.password === PASSWORD) {
      console.error(`  ${account.email}: the password is stored in plain text.`);
      failures += 1;
    }
  }
  if (failures) {
    fail(`${failures} account(s) did not verify correctly after the write.`);
  }

  // Nothing except the password may have moved.
  for (const before of accounts) {
    const now = after.find((a) => String(a._id) === String(before._id));
    if (!now) fail(`account ${before.email} disappeared during the reset.`);
    if (now.email !== before.email || now.name !== before.name || now.role !== before.role || (now.status ?? null) !== (before.status ?? null)) {
      fail(`account ${before.email} changed something other than its password.`);
    }
  }

  const distinctAfter = new Set(after.map((a) => a.password));
  if (distinctAfter.size !== after.length) {
    fail(`${after.length - distinctAfter.size} account(s) share an identical hash; the salt is not per-account.`);
  }

  console.log('\nDone:');
  console.log(`  ${after.length} account(s) now hold their own bcrypt hash, each with a unique salt,`);
  console.log('  and every one of them verifies against the requested password and rejects a wrong');
  console.log('  one. No plain-text password was written at any point, and no field other than');
  console.log('  `password` was touched.');
  console.log('  Every account can sign in with it and should change it from Profile.');

  await client.close();
};

run().catch((error) => {
  console.error('PASSWORD RESET FAILED:', error.message);
  process.exit(1);
});
