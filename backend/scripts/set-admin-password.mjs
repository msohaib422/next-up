/**
 * Set the password of an existing administrator account.
 *
 * An administrator whose password is unknown cannot be recovered: passwords are
 * stored as one-way hashes, so there is nothing to read back. The fix is to
 * write a new hash, which is what this script does.
 *
 * It never creates an account. If the address holds no account the script stops
 * and says so, because making a new administrator is a separate decision
 * (sync-admin-accounts.mjs is the tool that reconciles which addresses are
 * administrators at all). This one only changes the password of the account
 * that is already there, so it cannot produce a duplicate.
 *
 * The hash is produced by the model's own hashPassword(), the same function the
 * registration and password-change paths use, so the stored value is
 * indistinguishable from one the app wrote itself. The account is read back
 * afterwards and compared with bcrypt exactly as the login handler does, so
 * "the new password works" is observed rather than assumed.
 *
 *   node scripts/set-admin-password.mjs                          # dry run
 *   node scripts/set-admin-password.mjs --email a@b.com --password secret
 *   node scripts/set-admin-password.mjs --email a@b.com --password secret --apply
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || 'nextup';
const APPLY = process.argv.includes('--apply');

/** Reads --name value, so a password with spaces or symbols needs no escaping. */
const argOf = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

const EMAIL = (argOf('email') || process.env.ADMIN_EMAIL_1 || '').trim().toLowerCase();
const PASSWORD = argOf('password') || process.env.ADMIN_PASSWORD || '';

// The single role every administrator check in the app tests.
const ADMIN_ROLE = 'collaborator';

const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};

const run = async () => {
  if (!EMAIL || !PASSWORD) {
    fail('an --email and an --password are required (or ADMIN_EMAIL_1 and ADMIN_PASSWORD).');
  }

  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  }).asPromise();
  const users = client.getClient().db(DB_NAME).collection('users');

  console.log(`Database: ${DB_NAME}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Account:  ${EMAIL}\n`);

  // The address is matched case-insensitively: users.email is stored lowercased,
  // so a differently cased record still has to be found rather than missed.
  const matches = await users.find({ email: new RegExp(`^${EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).toArray();

  if (matches.length === 0) {
    fail(`no account holds ${EMAIL}. This script never creates one. Run "npm run sync:admins" first if this address should be an administrator.`);
  }
  if (matches.length > 1) {
    fail(`${matches.length} accounts hold ${EMAIL}, so which one to change is ambiguous. Resolve that by hand.`);
  }

  const account = matches[0];
  const roleIsAdmin = account.role === ADMIN_ROLE;
  const statusIsUsable = !account.status || account.status === 'Approved';

  console.log('Current account:');
  console.log(`  _id    ${account._id}`);
  console.log(`  name   ${JSON.stringify(account.name)}`);
  console.log(`  role   ${JSON.stringify(account.role)}${roleIsAdmin ? ' (administrator)' : ' (NOT an administrator)'}`);
  console.log(`  status ${JSON.stringify(account.status)}`);

  console.log('\nPlan:');
  console.log(`  Set the password of the existing account ${account.email} (${account._id}).`);
  console.log('  The account is updated in place: same id, same email, same name, same role,');
  console.log('  and no second account is created.');
  if (!roleIsAdmin) {
    console.log(`  NOTE: the role is ${JSON.stringify(account.role)}, not ${ADMIN_ROLE}. This script does not`);
    console.log('        change roles - only sync:admins does that - so the account will still');
    console.log('        not be an administrator after this run.');
  }
  if (!statusIsUsable) {
    console.log(`  NOTE: the status is ${JSON.stringify(account.status)}; login will still be refused by the`);
    console.log('        approval gate until an administrator approves the account.');
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply.');
    await client.close();
    return;
  }

  // The model's own hashing, so the stored hash is identical in shape to one the
  // app wrote. Imported lazily because it opens a connection of its own.
  const User = (await import('../models/User.js')).default;
  const hash = await User.hashPassword(PASSWORD);

  const result = await users.updateOne(
    { _id: account._id },
    { $set: { password: hash } },
  );

  if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
    fail(`the update did not apply cleanly (matched=${result.matchedCount}, modified=${result.modifiedCount}).`);
  }

  // Read it back and check it the way the login handler checks it.
  const after = await users.findOne({ _id: account._id });
  const passwordWorks = await bcrypt.compare(PASSWORD, after.password);

  if (!passwordWorks) {
    fail('the stored hash does not match the requested password after the write.');
  }

  const accountsForThisEmail = await users.countDocuments({ email: account.email });
  if (accountsForThisEmail !== 1) {
    fail(`the address now holds ${accountsForThisEmail} accounts.`);
  }

  console.log('\nDone:');
  console.log(`  password updated and verified for ${after.email} (${after._id})`);
  console.log(`  role=${after.role}  status=${after.status}  accounts with this address: ${accountsForThisEmail}`);
  if (!roleIsAdmin || !statusIsUsable) {
    console.log('\n  This account still cannot be signed in as an administrator - see the note above.');
  }

  await client.close();
};

run().catch(async (error) => {
  console.error('PASSWORD RESET FAILED:', error.message);
  process.exit(1);
});
