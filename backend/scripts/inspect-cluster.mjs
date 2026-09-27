// Read-only inspection of the Atlas cluster: which databases exist, which
// collections each one holds, and how many account vs content records live in
// the one this app actually connects to. Makes no writes.
//
//   node scripts/inspect-cluster.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

/** The database the app connects to, resolved the same way Mongoose does it. */
const configuredDbName = () => {
  // Not new URL(): a multi-host mongodb:// URI with commas is not a valid URL.
  const match = (process.env.MONGODB_URI || '')
    .split('?')[0]
    .match(/^mongodb(?:\+srv)?:\/\/[^/]*\/([^/?]+)/);
  return match && match[1] ? decodeURIComponent(match[1]) : '(none - the driver defaults to "test")';
};

const run = async () => {
  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  }).asPromise();

  const native = client.getClient();
  const { databases } = await native.db().admin().listDatabases();

  console.log('MONGODB_URI database segment:', configuredDbName());
  console.log('\n=== DATABASES ===');
  for (const dbInfo of databases) {
    const db = native.db(dbInfo.name);
    const colls = await db.listCollections().toArray();
    const isSystem = ['admin', 'local', 'config'].includes(dbInfo.name);
    console.log(
      `\n--- ${dbInfo.name} (${dbInfo.sizeOnDisk} bytes) : ${colls.length} collection(s)` +
        `${isSystem ? '  [MongoDB system database - not application data]' : ''}`
    );
    for (const c of colls) {
      const count = await db.collection(c.name).countDocuments();
      console.log(`      ${c.name.padEnd(24)} ${count}`);
    }
  }

  await client.close();
};

run().catch((e) => {
  console.error('INSPECTION FAILED:', e.message);
  process.exit(1);
});
