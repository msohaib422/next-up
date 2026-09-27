/**
 * Clear the application's content while leaving every account intact.
 *
 * THE ONE RULE: `users` is never touched. Not emptied, not dropped, not
 * "cleaned". The collections are split into two explicit lists so that the
 * distinction is reviewable rather than inferred.
 *
 *   KEPT   - accounts. Users, and nothing else, holds credentials.
 *   CLEARED- everything the users create: tasks, quizzes, assignments,
 *            announcements, contributions, notifications, activity history,
 *            timetable entries, essentials, important dates, and the email
 *            delivery log.
 *   DROPPED- collections with no model, controller or route anywhere in the
 *            codebase. Dead schema from an earlier version: events, reminders,
 *            references, submissions.
 *
 * Clearing a content collection cannot orphan an account, because every
 * content document points AT a user rather than the other way round. Accounts
 * only ever reference themselves (reviewedBy), and that field is untouched.
 *
 *   node scripts/reset-content.mjs           # dry run
 *   node scripts/reset-content.mjs --apply   # perform the reset
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || 'nextup';
const APPLY = process.argv.includes('--apply');

/** Never modified. Credentials, roles, names, emails and approval state. */
const PRESERVED = ['users'];

/** Application content: emptied, collection and indexes kept. */
const CONTENT = [
  'tasks',
  'quizzes',
  'assignments',
  'announcements',
  'essentials',
  'lectures',
  'importantdates',
  'contributions',
  'notifications',
  'activities',
  'emaildeliveries',
];

/** Dead schema with no model or route in the codebase: removed entirely. */
const OBSOLETE = ['events', 'reminders', 'references', 'submissions'];

// Fail loudly if these lists ever overlap. It is the mistake this file exists
// to make impossible.
const assertNoOverlap = () => {
  const preserved = new Set(PRESERVED);
  for (const name of [...CONTENT, ...OBSOLETE]) {
    if (preserved.has(name)) {
      throw new Error(`Refusing to run: "${name}" is in both the preserved and the cleared list.`);
    }
  }
};

const connect = () =>
  mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 }).asPromise();

const run = async () => {
  assertNoOverlap();

  const client = await connect();
  const db = client.getClient().db(DB_NAME);

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const accountsBefore = await db.collection('users').countDocuments();

  console.log(`Database: ${DB_NAME}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Accounts before: ${accountsBefore}\n`);

  console.log('PRESERVED (never touched):');
  for (const name of PRESERVED) {
    if (existing.has(name)) console.log(`  ${name} - ${await db.collection(name).countDocuments()} document(s)`);
  }

  console.log('\nCLEARED (content):');
  for (const name of CONTENT) {
    if (!existing.has(name)) continue;
    console.log(`  ${name} - ${await db.collection(name).countDocuments()} document(s)`);
  }

  console.log('\nDROPPED (obsolete, no model or route):');
  for (const name of OBSOLETE) {
    if (!existing.has(name)) continue;
    console.log(`  ${name} - ${await db.collection(name).countDocuments()} document(s)`);
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply to perform the reset.');
    await client.close();
    return;
  }

  for (const name of CONTENT) {
    if (!existing.has(name)) continue;
    const result = await db.collection(name).deleteMany({});
    console.log(`  cleared ${name}: ${result.deletedCount} deleted`);
  }

  for (const name of OBSOLETE) {
    if (!existing.has(name)) continue;
    await db.collection(name).drop().catch(() => {});
    console.log(`  dropped ${name}`);
  }

  // The safety assertion, checked against the real database rather than assumed.
  const accountsAfter = await db.collection('users').countDocuments();
  if (accountsAfter !== accountsBefore) {
    console.error(
      `\nFAILED: account count changed from ${accountsBefore} to ${accountsAfter}. ` +
        'Restore from the backup in .backups/.'
    );
    await client.close();
    process.exit(1);
  }

  console.log(`\nAccounts after: ${accountsAfter} (unchanged)`);
  accountsAfter && console.log('Content reset complete.');

  await client.close();
};

run().catch((error) => {
  console.error('RESET FAILED:', error);
  process.exit(1);
});
