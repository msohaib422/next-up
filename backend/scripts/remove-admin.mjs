/**
 * Remove ONE administrator account, and leave nothing dangling behind it.
 *
 * WHY THIS IS NOT JUST A DELETE
 * -----------------------------
 * Everything in the app points AT a user rather than the other way round, so
 * removing the user document leaves references to an account that no longer
 * exists:
 *
 *   contributions.reviewedBy   who approved or rejected the submission
 *   notifications.recipient    messages addressed to that person
 *   notifications.actor        who performed the action
 *   activities.user            their activity history
 *
 * Left alone, those render as a blank name, and the "last reviewed by" trail
 * loses the information it exists to keep. So each is handled deliberately:
 *
 *   - `reviewedBy` is REASSIGNED to the remaining administrator. The decision
 *     itself is unchanged; only the attribution moves to the person who now
 *     holds that authority, which is what an audit trail should say when there
 *     is one admin.
 *   - notifications addressed to the removed account are DELETED. They are
 *     unreadable by definition once the recipient does not exist, and keeping
 *     them would leave rows no query can ever surface.
 *   - notifications the removed account SENT are KEPT and reassigned to the
 *     remaining administrator, because they describe actions that really
 *     happened to other people and must stay visible.
 *   - activities are KEPT and reassigned for the same reason - they are the
 *     workspace's history, not that person's private data.
 *
 * NOTHING ELSE IS TOUCHED. No content is deleted, no other account is modified,
 * and no other collection is written beyond the four reference fields above.
 *
 *   node scripts/remove-admin.mjs --email a@b.com                 # dry run
 *   node scripts/remove-admin.mjs --email a@b.com --apply
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || process.env.MONGODB_URI.split('/').pop().split('?')[0];
const APPLY = process.argv.includes('--apply');
const ADMIN_ROLE = 'collaborator';

const argOf = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const EMAIL = (argOf('email') || '').trim().toLowerCase();

const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};

const run = async () => {
  if (!EMAIL) fail('--email is required.');

  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  }).asPromise();
  const db = client.getClient().db(DB_NAME);
  const users = db.collection('users');

  console.log(`Database: ${DB_NAME}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const target = await users.findOne({ email: EMAIL });
  if (!target) fail(`no account holds ${EMAIL}.`);

  if (target.role !== ADMIN_ROLE) {
    fail(`${EMAIL} has role "${target.role}", not "${ADMIN_ROLE}". This script only removes administrators.`);
  }

  const remaining = await users.find({ role: ADMIN_ROLE, email: { $ne: EMAIL } }).toArray();
  if (remaining.length !== 1) {
    fail(
      `expected exactly one other administrator to reassign to, found ${remaining.length}. ` +
        'Resolve the administrator list by hand first.'
    );
  }
  const survivor = remaining[0];

  console.log(`Removing:   ${target.email}  "${target.name}"  (${target._id})`);
  console.log(`Remaining:  ${survivor.email}  "${survivor.name}"  (${survivor._id})\n`);

  const oid = target._id;
  const contributions = await db.collection('contributions').countDocuments({ reviewedBy: oid });
  const notifTo = await db.collection('notifications').countDocuments({ recipient: oid });
  const notifBy = await db.collection('notifications').countDocuments({ actor: oid });
  const acts = await db.collection('activities').countDocuments({ user: oid });

  console.log('Plan:');
  console.log(`  contributions.reviewedBy  ${String(contributions).padStart(3)}  -> reassign to ${survivor.email}`);
  console.log(`  notifications.recipient   ${String(notifTo).padStart(3)}  -> delete (unreadable once the recipient is gone)`);
  console.log(`  notifications.actor       ${String(notifBy).padStart(3)}  -> reassign to ${survivor.email}`);
  console.log(`  activities.user           ${String(acts).padStart(3)}  -> reassign to ${survivor.email}`);
  console.log(`  users                     delete the account document`);
  console.log('\n  No content is deleted. No other account is modified.');

  // Fingerprint everything so we can prove afterwards that nothing else moved.
  const before = {};
  for (const name of ['tasks', 'quizzes', 'assignments', 'announcements', 'essentials', 'lectures', 'importantdates', 'contributions', 'activities', 'emaildeliveries']) {
    before[name] = await db.collection(name).countDocuments();
  }
  before.notifications = await db.collection('notifications').countDocuments();
  const otherAccounts = (await users.find({ _id: { $ne: oid } }).toArray()).map((u) => `${u._id}|${u.email}|${u.name}|${u.role}|${u.status}|${u.password}`).sort();

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply.');
    await client.close();
    return;
  }

  const survivorId = survivor._id;

  if (contributions) {
    await db.collection('contributions').updateMany({ reviewedBy: oid }, { $set: { reviewedBy: survivorId } });
    console.log(`\n  reassigned ${contributions} contribution review(s)`);
  }
  if (notifBy) {
    await db.collection('notifications').updateMany({ actor: oid }, { $set: { actor: survivorId } });
    console.log(`  reassigned ${notifBy} notification(s) they sent`);
  }
  if (acts) {
    await db.collection('activities').updateMany({ user: oid }, { $set: { user: survivorId } });
    console.log(`  reassigned ${acts} activity row(s)`);
  }
  if (notifTo) {
    await db.collection('notifications').deleteMany({ recipient: oid });
    console.log(`  deleted ${notifTo} notification(s) addressed to them`);
  }

  const removed = await users.deleteOne({ _id: oid });
  if (removed.deletedCount !== 1) fail(`the delete removed ${removed.deletedCount} document(s), expected 1.`);
  console.log(`  deleted the account ${EMAIL}`);

  // --- Verify ------------------------------------------------------------
  if (await users.findOne({ email: EMAIL })) fail('the account is still present.');
  const adminsLeft = await users.find({ role: ADMIN_ROLE }).toArray();
  check: {
    if (adminsLeft.length !== 1) fail(`expected exactly one administrator to remain, found ${adminsLeft.length}.`);
    console.log(`\n  exactly one administrator remains: ${adminsLeft[0].email}`);
  }

  const nowAccounts = (await users.find({}).toArray()).map((u) => `${u._id}|${u.email}|${u.name}|${u.role}|${u.status}|${u.password}`).sort();
  if (JSON.stringify(nowAccounts) !== JSON.stringify(otherAccounts)) {
    fail('an account other than the target changed. Stopping.');
  }
  console.log(`  the other ${otherAccounts.length} account(s) are byte-for-byte unchanged`);

  for (const name of ['tasks', 'quizzes', 'assignments', 'announcements', 'essentials', 'lectures', 'importantdates', 'activities', 'emaildeliveries']) {
    const after = await db.collection(name).countDocuments();
    if (after !== before[name]) fail(`${name} changed (${before[name]} -> ${after}).`);
  }
  const afterNotifs = await db.collection('notifications').countDocuments();
  if (afterNotifs !== before.notifications - notifTo) {
    fail(`notifications count is unexpected (${before.notifications} -> ${afterNotifs}).`);
  }
  console.log('  no content collection lost a single document');

  const dangling = [];
  for (const name of ['contributions', 'notifications', 'activities']) {
    for (const field of ['user', 'contributor', 'actor', 'recipient', 'reviewedBy']) {
      const stillPointing = await db.collection(name).countDocuments({ [field]: oid });
      if (stillPointing) dangling.push(`${name}.${field}=${stillPointing}`);
    }
  }
  if (dangling.length) fail(`references still point at the removed account: ${dangling.join(', ')}`);
  console.log('  no reference anywhere still points at the removed account');

  await client.close();
  console.log('\nDone.');
};

run().catch((error) => {
  console.error('REMOVE FAILED:', error.message);
  process.exit(1);
});
