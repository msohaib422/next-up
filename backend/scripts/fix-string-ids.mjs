/**
 * Repair accounts whose `_id` was stored as a STRING instead of an ObjectId.
 *
 * WHY THIS EXISTS
 * ---------------
 * A MongoDB `_id` is an ObjectId. If a document is written with `_id` as a
 * string, Mongoose cannot find it any more:
 *
 *   - `User.findById(id)` casts the argument to an ObjectId, so a document
 *     whose `_id` is the string "6abb..." never matches
 *   - the login route looks the account up BY EMAIL, so sign-in still returns
 *     200 and issues a token
 *   - the very next request, `/auth/me`, does `findById` and finds nothing, so
 *     the middleware answers 401 ACCOUNT_NOT_FOUND
 *
 * The visible symptom is therefore: "the password is right, login appears to
 * succeed, and then everything is immediately 401" - which reads exactly like a
 * broken password and sends people off to reset it.
 *
 * HOW THE DAMAGE HAPPENED
 * -----------------------
 * `backup-accounts.mjs` writes the collection with `JSON.stringify`. A raw
 * ObjectId serialises to its hex STRING, so every backup file stores `_id` as
 * `"6abb..."`. Re-inserting a backup record verbatim therefore writes a string
 * `_id`. This script repairs that, and `backup-accounts.mjs` now serialises
 * ids in Extended JSON so a restore keeps them as ObjectIds.
 *
 * SAFE BY CONSTRUCTION
 * --------------------
 *   - Read-only unless --apply is passed.
 *   - Only documents whose _id is genuinely a string are touched. A document
 *     with a correct ObjectId _id is never matched, let alone rewritten.
 *   - The `_id` VALUE is unchanged - only its BSON type is corrected - so every
 *     reference elsewhere (contributions, notifications, activities) that
 *     already points at the ObjectId form resolves again afterwards.
 *   - Every other field is carried across untouched, and the result is verified
 *     field by field against what was there before.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || 'nextup';
const APPLY = process.argv.includes('--apply');

const run = async () => {
  const client = await mongoose.createConnection(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000,
  }).asPromise();
  const users = client.getClient().db(DB_NAME).collection('users');

  console.log(`Database: ${DB_NAME}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const all = await users.find({}).sort({ email: 1 }).toArray();

  const broken = [];
  for (const doc of all) {
    const idType = doc._id?.constructor?.name;
    if (idType === 'String') broken.push(doc);
    console.log(
      `  ${String(doc.email).padEnd(30)} _id=${String(doc._id)}  type=${idType}` +
      (idType === 'String' ? '   <-- BROKEN' : '')
    );
  }

  console.log(`\nAccounts: ${all.length}   with a string _id: ${broken.length}`);

  if (!broken.length) {
    console.log('\nNothing to repair. Every _id is a proper ObjectId.');
    await client.close();
    return;
  }

  console.log('\nPlan:');
  for (const doc of broken) {
    const oid = new mongoose.Types.ObjectId(doc._id);
    if (String(oid) !== String(doc._id)) {
      console.error(`  ${doc._id} is not a valid ObjectId - refusing to touch ${doc.email}`);
      await client.close();
      process.exit(1);
    }
    console.log(`  ${doc.email}: rewrite _id ${doc._id} from string to ObjectId (same value)`);
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply.');
    await client.close();
    return;
  }

  for (const doc of broken) {
    const { _id, ...rest } = doc;
    const newId = new mongoose.Types.ObjectId(String(_id));

    // _id is immutable, so the document is removed and re-inserted with the
    // corrected type. Every other field is carried across verbatim.
    await users.deleteOne({ _id: String(_id) });
    await users.insertOne({ ...rest, _id: newId });

    const after = await users.findOne({ email: doc.email });
    const sameEverythingElse =
      String(after._id) === String(newId) &&
      after._id?.constructor?.name === 'ObjectId' &&
      after.name === doc.name &&
      after.email === doc.email &&
      after.password === doc.password &&
      after.role === doc.role &&
      (after.status ?? null) === (doc.status ?? null) &&
      (after.profileImage ?? '') === (doc.profileImage ?? '') &&
      String(after.createdAt) === String(doc.createdAt);

    if (!sameEverythingElse) {
      console.error(`  FAILED to restore ${doc.email} exactly; stopping.`);
      await client.close();
      process.exit(1);
    }
    console.log(`  repaired ${doc.email} -> _id is now an ObjectId (${after._id})`);
  }

  const stillBroken = await users.find({ _id: { $type: 'string' } }).toArray();
  if (stillBroken.length) {
    console.error(`\nFAILED: ${stillBroken.length} string _id(s) remain.`);
    await client.close();
    process.exit(1);
  }

  console.log('\nDone. No account has a string _id.');
  await client.close();
};

run().catch((error) => {
  console.error('REPAIR FAILED:', error.message);
  process.exit(1);
});
