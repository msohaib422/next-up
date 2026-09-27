/**
 * Move the application's data out of the `test` database and into `nextup`.
 *
 * WHY THIS EXISTS
 * ---------------
 * MONGODB_URI had no database name in its path, so the driver fell back to its
 * default of `test`. That single omission is why a production application was
 * writing to a database called "test".
 *
 * SAFE BY CONSTRUCTION
 * --------------------
 *   - Read-only unless `--apply` is passed. The default run only reports.
 *   - Refuses to run if the target database already holds documents, so it can
 *     never merge two databases or half-overwrite one.
 *   - Copies every collection with its indexes, then verifies the copy, and only
 *     drops the source after the verification passes.
 *   - Accounts are just documents in `users` and are copied like any other
 *     collection; nothing in this script deletes from the target.
 *
 *   node scripts/migrate-db.mjs           # dry run
 *   node scripts/migrate-db.mjs --apply   # perform the move
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const SOURCE_DB = process.env.SOURCE_DB || 'test';
const TARGET_DB = process.env.TARGET_DB || 'nextup';
const APPLY = process.argv.includes('--apply');

/** Collections MongoDB manages itself; never copied or dropped by hand. */
const SYSTEM_COLLECTIONS = new Set(['system.views']);

const connect = () =>
  mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 }).asPromise();

const run = async () => {
  const client = await connect();
  const native = client.getClient();

  const { databases } = await native.db().admin().listDatabases();
  const known = databases.map((d) => d.name);

  console.log(`Databases on the cluster: ${known.join(', ')}`);
  console.log(`Source: ${SOURCE_DB}   Target: ${TARGET_DB}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  if (!known.includes(SOURCE_DB)) {
    console.log(`Nothing to do: "${SOURCE_DB}" does not exist.`);
    await client.close();
    return;
  }

  const source = native.db(SOURCE_DB);
  const target = native.db(TARGET_DB);

  const collections = (await source.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !SYSTEM_COLLECTIONS.has(name) && !name.startsWith('system.'));

  if (!collections.length) {
    console.log(`"${SOURCE_DB}" has no collections to migrate.`);
    await client.close();
    return;
  }

  // Refuse to merge into a database that already has content.
  if (known.includes(TARGET_DB)) {
    const existing = (await target.listCollections().toArray())
      .map((c) => c.name)
      .filter((name) => !SYSTEM_COLLECTIONS.has(name));
    let total = 0;
    for (const name of existing) total += await target.collection(name).countDocuments();
    if (total > 0) {
      console.error(
        `ABORTED: "${TARGET_DB}" already holds ${total} document(s). ` +
          'Refusing to merge. Drop or rename it first if the move is genuinely intended.'
      );
      await client.close();
      process.exit(1);
    }
  }

  console.log('Plan:');
  for (const name of collections) {
    const count = await source.collection(name).countDocuments();
    console.log(`  copy ${name} (${count} document${count === 1 ? '' : 's'})`);
  }
  console.log(`  then drop database "${SOURCE_DB}"\n`);

  if (!APPLY) {
    console.log('Dry run. Nothing was written. Re-run with --apply to perform the move.');
    await client.close();
    return;
  }

  for (const name of collections) {
    const docs = await source.collection(name).find({}).toArray();
    if (docs.length) {
      await target.collection(name).insertMany(docs, { ordered: true });
    } else {
      // Create the empty collection anyway so the schema stays visible.
      await target.createCollection(name).catch(() => {});
    }

    // Carry the indexes over, so the unique constraints the app relies on
    // (notably users.email) exist in the new database.
    const indexes = await source.collection(name).indexes();
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      await target.collection(name).createIndex(index.key, index.options || {}).catch((error) => {
        console.warn(`  ! could not create index ${index.name} on ${name}: ${error.message}`);
      });
    }
    console.log(`  copied ${name}: ${docs.length} document(s)`);
  }

  // Verify before removing the source.
  console.log('\nVerifying the copy...');
  let mismatch = 0;
  for (const name of collections) {
    const from = await source.collection(name).countDocuments();
    const to = await target.collection(name).countDocuments();
    if (from !== to) {
      console.error(`  MISMATCH ${name}: source=${from} target=${to}`);
      mismatch += 1;
    }
  }
  if (mismatch) {
    console.error('\nABORTED: the copy did not verify, so the source database was NOT dropped.');
    await client.close();
    process.exit(1);
  }
  console.log('  all collections verified');

  const accounts = await target.collection('users').countDocuments();
  console.log(`  accounts present in ${TARGET_DB}: ${accounts}`);

  await source.dropDatabase();
  console.log(`\nDropped "${SOURCE_DB}". The application database is now "${TARGET_DB}".`);

  await client.close();
};

run().catch((error) => {
  console.error('MIGRATION FAILED:', error);
  process.exit(1);
});
