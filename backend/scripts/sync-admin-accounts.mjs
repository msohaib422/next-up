/**
 * Reconcile the administrator accounts.
 *
 * Produces exactly two administrator accounts, both with role "collaborator",
 * which is the single role every admin check in the app tests. Nothing in the
 * codebase branches on a particular address or a particular user id, so two
 * accounts holding that role behave identically - there is no second admin
 * with reduced rights to fix.
 *
 *   Admin 1  msohaib.ai.dev@gmail.com  ->  M Sohaib
 *   Admin 2  anki.inola@gmail.com      ->  M Hasnain Ali   (was hasnain@gmail.com)
 *
 * The `anki.inola@gmail.com` address was already held by a normal user account
 * ("novi"), and `users.email` is uniquely indexed, so the two cannot coexist.
 * Rather than delete an account, that user is moved to a free address and keeps
 * its id, its password hash, its role and its content. Renaming an address is
 * something the admin UI can already do; this only does it once, deliberately.
 *
 *   node scripts/sync-admin-accounts.mjs           # dry run
 *   node scripts/sync-admin-accounts.mjs --apply   # perform the changes
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || 'nextup';
const APPLY = process.argv.includes('--apply');

const ADMIN_ROLE = 'collaborator';

const DESIRED_ADMINS = [
  { email: 'msohaib.ai.dev@gmail.com', name: 'M Sohaib' },
  { email: 'anki.inola@gmail.com', name: 'M Hasnain Ali' },
];

/** The admin identity being replaced. */
const OLD_ADMIN_EMAIL = 'hasnain@gmail.com';

/**
 * Where the pre-existing user account that holds the Admin 2 address is moved
 * to. It keeps its id, password, role and history; only the address changes.
 */
const RELOCATED_USER = { from: 'anki.inola@gmail.com', to: 'novi+nextup@gmail.com' };

const run = async () => {
  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  }).asPromise();
  const db = client.getClient().db(DB_NAME);
  const users = db.collection('users');

  console.log(`Database: ${DB_NAME}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const all = await users.find({}).toArray();
  console.log('Current accounts:');
  all.forEach((u) =>
    console.log(`  ${String(u.email).padEnd(28)} role=${String(u.role).padEnd(12)} name=${JSON.stringify(u.name)}`)
  );

  const byEmail = (email) => all.find((u) => u.email === email);
  const plan = [];

  // --- 1. Free up the Admin 2 address -------------------------------------
  const holder = byEmail(RELOCATED_USER.from);
  const oldAdmin = byEmail(OLD_ADMIN_EMAIL);

  if (holder && String(holder._id) === String(oldAdmin?._id)) {
    // The admin already owns the address: nothing to free up.
    plan.push(`"${RELOCATED_USER.from}" is already held by the admin account; no relocation needed.`);
  } else if (holder && oldAdmin) {
    // The expected case: a normal user currently sits on the address the admin
    // is moving to. Relocate that user, keep the account, then update the admin.
    const taken = byEmail(RELOCATED_USER.to);
    if (taken) {
      plan.push(
        `CONFLICT: the relocation address "${RELOCATED_USER.to}" is already taken by ` +
          `${JSON.stringify(taken.name)}. Choose a different address.`
      );
    } else {
      plan.push(
        `Relocate the existing user account "${RELOCATED_USER.from}" (${JSON.stringify(holder.name)}) ` +
          `to "${RELOCATED_USER.to}" so the admin can take the address. The account is kept, not deleted.`
      );
    }
  } else if (holder) {
    plan.push(
      `"${OLD_ADMIN_EMAIL}" is absent and "${RELOCATED_USER.from}" is a normal user, so there is no ` +
        'old admin identity to promote. Resolve by hand - this script will not guess.'
    );
  }

  // --- 2. Admin 1 ----------------------------------------------------------
  const admin1 = byEmail(DESIRED_ADMINS[0].email);
  if (!admin1) plan.push(`CREATE missing administrator ${DESIRED_ADMINS[0].email}.`);
  else {
    const changes = [];
    if (admin1.name !== DESIRED_ADMINS[0].name) changes.push(`name ${JSON.stringify(admin1.name)} -> "${DESIRED_ADMINS[0].name}"`);
    if (admin1.role !== ADMIN_ROLE) changes.push(`role ${admin1.role} -> ${ADMIN_ROLE}`);
    if (admin1.status && admin1.status !== 'Approved') changes.push(`status ${admin1.status} -> Approved`);
    if (changes.length) plan.push(`Update ${DESIRED_ADMINS[0].email}: ${changes.join('; ')}`);
  }

  // --- 3. Admin 2 ----------------------------------------------------------
  const admin2 = byEmail(DESIRED_ADMINS[1].email);
  if (!admin2) plan.push(`CREATE missing administrator ${DESIRED_ADMINS[1].email}.`);
  else {
    const changes = [];
    if (admin2.name !== DESIRED_ADMINS[1].name) changes.push(`name ${JSON.stringify(admin2.name)} -> "${DESIRED_ADMINS[1].name}"`);
    if (admin2.role !== ADMIN_ROLE) changes.push(`role ${admin2.role} -> ${ADMIN_ROLE}`);
    if (admin2.status && admin2.status !== 'Approved') changes.push(`status ${admin2.status} -> Approved`);
    if (changes.length) plan.push(`Update ${DESIRED_ADMINS[1].email}: ${changes.join('; ')}`);
  }

  console.log('\nPlan:');
  plan.forEach((line) => console.log(`  - ${line}`));

  if (plan.some((line) => line.startsWith('CONFLICT'))) {
    console.error('\nABORTED: an unresolved conflict. Nothing was written.');
    await client.close();
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply.');
    await client.close();
    return;
  }

  const before = await users.countDocuments();

  // 1. Relocate the account that currently holds the Admin 2 address.
  if (holder && oldAdmin && String(holder._id) !== String(oldAdmin._id) && !byEmail(RELOCATED_USER.to)) {
    await users.updateOne({ _id: holder._id }, { $set: { email: RELOCATED_USER.to } });
    console.log(`\n  relocated account ${holder._id}: ${RELOCATED_USER.from} -> ${RELOCATED_USER.to}`);
  }

  // 2. Turn the old admin identity into Admin 2, updating in place so the
  //    existing password hash and id are kept.
  if (oldAdmin) {
    await users.updateOne(
      { _id: oldAdmin._id },
      { $set: { email: DESIRED_ADMINS[1].email, name: DESIRED_ADMINS[1].name, role: ADMIN_ROLE, status: 'Approved' } }
    );
    console.log(`  updated admin account ${oldAdmin._id}: ${OLD_ADMIN_EMAIL} -> ${DESIRED_ADMINS[1].email}`);
  }

  // 3. Ensure both desired administrators exist and are correct.
  //
  //    Password is NEVER written here: an account that exists keeps its own
  //    hash. The one thing this must not do is UPSERT.
  //
  //    The upsert was the root cause of the recurring admin lockout. These
  //    updates go through the raw driver, which does not run the model's
  //    validators, so an account that was missing was created with a `name`, a
  //    `role` and a `status` but NO password field at all. That account can
  //    never be signed into (bcrypt.compare throws on an undefined hash) and
  //    can never be recovered from the UI, because the change-password route
  //    throws on the very same comparison. Deleting and re-running this script
  //    reproduced the "password stopped working" fault every single time.
  //
  //    So a missing administrator is now reported and left missing: creating an
  //    account is a separate, explicit decision made with a password.
  const created = [];
  for (const admin of DESIRED_ADMINS) {
    const existing = await users.findOne({ email: admin.email });
    if (!existing) {
      created.push(admin.email);
      console.error(
        `  REFUSING to create ${admin.email} without a password. ` +
          'Create it explicitly, then re-run: npm run set:admin-password -- --email <address> --password <secret> --apply'
      );
      continue;
    }
    await users.updateOne(
      { email: admin.email },
      { $set: { name: admin.name, role: ADMIN_ROLE, status: 'Approved' } }
    );
  }

  const after = await users.countDocuments();
  if (after !== before) {
    console.error(`\nFAILED: account count changed from ${before} to ${after}.`);
    await client.close();
    process.exit(1);
  }

  // Every administrator must end up able to sign in, which means holding a
  // real bcrypt hash. Asserted against the database rather than assumed, so a
  // lockout account can never be reported as healthy.
  const finalAdmins = await users.find({ role: ADMIN_ROLE }).toArray();
  console.log(`\nAdministrators (${finalAdmins.length}):`);

  const unusable = [];
  for (const u of finalAdmins) {
    const usable = typeof u.password === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(u.password);
    if (!usable) unusable.push(u.email);
    console.log(`  ${u.email}  "${u.name}"  status=${u.status}  password=${usable ? 'ok' : 'MISSING/UNUSABLE'}`);
  }
  console.log(`\nAccounts total: ${after} (unchanged)`);

  if (unusable.length) {
    console.error(
      `\nFAILED: ${unusable.length} administrator(s) cannot sign in because they hold no usable ` +
        `password hash: ${unusable.join(', ')}. Set one explicitly with set:admin-password.`
    );
    await client.close();
    process.exit(1);
  }
  if (created.length) {
    console.error(
      `\nFAILED: ${created.length} administrator(s) do not exist: ${created.join(', ')}. ` +
        'Nothing was created - an administrator without a password cannot sign in.'
    );
    await client.close();
    process.exit(1);
  }

  await client.close();
};

run().catch((error) => {
  console.error('SYNC FAILED:', error);
  process.exit(1);
});
