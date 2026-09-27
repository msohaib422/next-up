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

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const SOURCE_DB = process.env.SOURCE_DB || 'test';
const BACKUP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.backups');

const run = async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  }).asPromise();
  const db = client.getClient().db(SOURCE_DB);

  const users = await db.collection('users').find({}).toArray();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `users-${stamp}.json`);

  fs.writeFileSync(file, JSON.stringify(users, null, 2), { mode: 0o600 });

  console.log(`Backed up ${users.length} account(s) to:`);
  console.log(`  ${file}`);
  users.forEach((u) => console.log(`  - ${u.email} (role=${u.role}, status=${u.status || 'Approved'})`));

  await client.close();
};

run().catch((error) => {
  console.error('BACKUP FAILED:', error.message);
  process.exit(1);
});
