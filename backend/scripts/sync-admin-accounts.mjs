/**
 * Reconcile the administrator accounts.
 *
 * There is exactly ONE administrator, holding role "collaborator" - the single
 * role every admin check in the app tests. Nothing in the codebase branches on
 * a particular address or a particular user id, so any account holding that role
 * behaves identically.
 *
 *   Admin  msohaib.ai.dev@gmail.com  ->  M Sohaib
 *
 * There used to be a second administrator (anki.inola@gmail.com). That account
 * has been removed, so it is no longer listed here. Keeping it in this list would
 * have undone that removal on the very next `npm run sync:admins`, because the
 * script would have found no account for the address and tried to create one.
 * If another administrator is ever added, add them to DESIRED_ADMINS here AND
 * add the matching ADMIN_EMAIL_<n> variable to the environment at the same time.
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
];

/**
 * Addresses that must NOT hold the administrator role any more. Listed so a
 * re-run says so explicitly instead of quietly doing nothing about them.
 */
const RETIRED_ADMIN_EMAILS = ['anki.inola@gmail.com', 'hasnain@gmail.com'];

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

  // --- 1. Retired administrator addresses ---------------------------------
  // Said out loud rather than passed over in silence, so the removal is
  // visible on every run instead of looking like the script forgot them.
  for (const email of RETIRED_ADMIN_EMAILS) {
    const stillThere = byEmail(email);
    if (!stillThere) {
      plan.push(`RETIRED: "${email}" holds no account. Correct - it is not being recreated.`);
      continue;
    }
    if (stillThere.role === ADMIN_ROLE) {
      plan.push(
        `CONFLICT: "${email}" still holds the administrator role but has been retired. ` +
          'Demote it deliberately, or put it back in DESIRED_ADMINS.'
      );
      continue;
    }
    plan.push(`"${email}" is present as a normal user and is NOT given the administrator role. Correct.`);
  }

  // --- 2. The desired administrator(s) ------------------------------------
  // Looped over the list rather than written out one block per admin, so
  // adding a second administrator later is a one-line change here.
  DESIRED_ADMINS.forEach((desired, index) => {
    const existing = byEmail(desired.email);
    if (!existing) {
      plan.push(`CREATE missing administrator ${desired.email}.`);
      return;
    }
    const changes = [];
    if (existing.name !== desired.name) changes.push(`name ${JSON.stringify(existing.name)} -> "${desired.name}"`);
    if (existing.role !== ADMIN_ROLE) changes.push(`role ${existing.role} -> ${ADMIN_ROLE}`);
    if (existing.status && existing.status !== 'Approved') changes.push(`status ${existing.status} -> Approved`);
    if (changes.length) plan.push(`Update ${desired.email}: ${changes.join('; ')}`);
    else plan.push(`No change needed for ${desired.email} (administrator ${index + 1}).`);
  });

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

  // 1. Ensure every desired administrator exists and is correct.
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
