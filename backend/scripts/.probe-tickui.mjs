import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve('/home/msohaib/Drive 1/Development/VS Code/next-up/backend/.env') });

const run = async () => {
  const client = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();
  const native = client.getClient();

  for (const name of ['nextup', 'nextup_tickui']) {
    const db = native.db(name);
    console.log(`\n======== ${name} ========`);
    for (const c of await db.listCollections().toArray()) {
      const stats = await db.command({ collStats: c.name });
      console.log(`  ${c.name.padEnd(22)} lastWrite=${stats.lastWriteTime ? new Date(stats.lastWriteTime).toISOString() : 'n/a'}  n=${stats.count}`);
    }
  }

  const t = native.db('nextup_tickui');
  console.log('\n--- nextup_tickui users ---');
  for (const u of await t.collection('users').find({}, { projection: { email: 1, role: 1, status: 1, fullName: 1, createdAt: 1, updatedAt: 1 } }).toArray()) {
    console.log('  ', JSON.stringify(u));
  }
  console.log('\n--- nextup_tickui sample tasks ---');
  for (const d of await t.collection('tasks').find({}, { projection: { title: 1, subject: 1, completions: 1, createdAt: 1 } }).limit(5).toArray()) {
    console.log('  ', JSON.stringify(d));
  }
  console.log('\n--- nextup_tickui contributions sample ---');
  for (const d of await t.collection('contributions').find({}, { projection: { type: 1, status: 1, createdAt: 1 } }).limit(5).toArray()) {
    console.log('  ', JSON.stringify(d));
  }

  await client.close();
};
run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
