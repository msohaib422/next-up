/**
 * Backup the account collection to a local JSON file.
 *
 * Run this BEFORE any destructive step. It is the safety net for the one thing
 * that must never be lost: the user and administrator accounts. The dump is
 * written outside the database so it survives a bad migration, and it holds the
 * password hashes, so the file is as sensitive as the database itself - it is
 * written to a git-ignored path.
 *
 *   node scripts/backup-accounts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { BSON } from 'mongodb';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

/*
 * The database the running application actually uses: the name in the URI,
 * unless SOURCE_DB overrides it for a deliberate run elsewhere.
 *
 * It used to default to "test", which no longer exists - the application was
 * moved out of it. Reading a non-existent database yields an EMPTY collection
 * rather than an error, so this script wrote a valid-looking backup file
 * containing zero accounts and reported success. A safety net that silently
 * captures nothing is worse than no safety net, because it is trusted.
 */
const SOURCE_DB = process.env.SOURCE_DB || process.env.MONGODB_URI.split('/').pop().split('?')[0];
const BACKUP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.backups');

const fail = (message) => {
  console.error(`\nBACKUP FAILED: ${message}`);
  process.exit(1);
};

const run = async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  }).asPromise();
  const db = client.getClient().db(SOURCE_DB);

  if (!(await db.listCollections({ name: 'users' }).hasNext())) {
    fail(`the database "${SOURCE_DB}" has no "users" collection. Refusing to write an empty backup.`);
  }

  const users = await db.collection('users').find({}).toArray();

  // A zero-account backup is always a mistake worth stopping for, not a result
  // to write quietly to disk.
  if (users.length === 0) {
    fail(`the "${SOURCE_DB}" database holds no accounts. Refusing to write an empty backup.`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `users-${stamp}.json`);

  /*
   * Extended JSON, not JSON.stringify.
   *
   * A raw ObjectId serialises to its bare hex STRING, so a plain stringify
   * writes `"_id": "6abb..."`. Re-inserting that record verbatim stores `_id`
   * as a string, and Mongoose's findById() casts its argument to an ObjectId
   * and then never matches the account - so login returns 200 and every
   * following request is 401 ACCOUNT_NOT_FOUND.
   *
   * Extended JSON writes `"_id": { "$oid": "6abb..." }`, which restores as a
   * real ObjectId. That is the whole difference between a backup you can
   * restore and one that silently breaks three accounts.
   */
  fs.writeFileSync(file, BSON.EJSON.stringify(users, null, 2), { mode: 0o600 });

  console.log(`Backed up ${users.length} account(s) to:`);
  console.log(`  ${file}`);
  users.forEach((u) => console.log(`  - ${u.email} (role=${u.role}, status=${u.status || 'Approved'})`));

  await client.close();
};

run().catch((error) => {
  console.error('BACKUP FAILED:', error.message);
  process.exit(1);
});
