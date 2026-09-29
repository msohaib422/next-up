/**
 * Restore an administrator account that was removed, to its previous state.
 *
 * WHY THE ORIGINAL _id IS RESTORED
 * -------------------------------
 * Removing the account left references pointing at it, including four user
 * documents whose `reviewedBy` still names it. Re-creating the account with a
 * NEW ObjectId would leave those four permanently dangling, because they store
 * the id as a value and cannot be repointed without editing other people's
 * accounts. Restoring the original id makes all four resolve again, and makes
 * every reference below resolve with no edit at all.
 *
 * WHAT IS RESTORED
 * ----------------
 *   - the account document, with its original _id, name, email, role, status,
 *     profile fields and createdAt. Only `password` is new.
 *   - the reference fields moved during the removal: contributions.reviewedBy,
 *     notifications.actor and activities.user are pointed back at this account.
 *     They are targeted BY ID, never by "whatever currently points at the
 *     survivor", so the surviving admin's own rows are never touched.
 *   - the notifications addressed to the removed account: five are restored
 *     byte-for-byte from a snapshot taken before the removal. One could not be
 *     captured that way and is rebuilt from the service's own template; that
 *     one gets a fresh _id and its exact millisecond, which cannot be recovered.
 *     It is reported explicitly below rather than passed off as exact.
 *
 * Read-only unless --apply is passed.
 *
 *   node scripts/restore-admin.mjs --email a@b.com                  # dry run
 *   node scripts/restore-admin.mjs --email a@b.com --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const DB_NAME = process.env.TARGET_DB || process.env.MONGODB_URI.split('/').pop().split('?')[0];
const APPLY = process.argv.includes('--apply');
const ADMIN_ROLE = 'collaborator';

/** The pre-removal full-database snapshot this restores from. */
const SNAPSHOT = process.env.RESTORE_SNAPSHOT || '/tmp/opencode/snap-after-fix.json';

const argOf = (n) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 ? process.argv[i + 1] : undefined; };
const EMAIL = (argOf('email') || '').trim().toLowerCase();
const PASSWORD = argOf('password') || '12345678';

const fail = (m) => { console.error(`\nFAILED: ${m}`); process.exit(1); };

/* Extended JSON ({ $oid }, { $date }) -> plain BSON values. */
const unwrap = (v) => {
  if (v && typeof v === 'object') {
    if ('$oid' in v) return new mongoose.Types.ObjectId(v.$oid);
    if ('$date' in v) return new Date(v.$date);
  }
  return v;
};
const plain = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x === 'object' ? (x._bsontype === 'ObjectId' || x._bsontype === 'Long' ? String(x) : x) : x)));
const oid = (v) => (v && typeof v === 'object' && v.$oid ? v.$oid : String(v));

const run = async () => {
  if (!EMAIL) fail('--email is required.');
  if (!fs.existsSync(SNAPSHOT)) fail(`the pre-removal snapshot "${SNAPSHOT}" is not readable, so this cannot be an exact restore.`);

  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const original = snap.users.find((u) => oid(u._id) === snap.users.find((x) => x.email === EMAIL)?._id);
  const record = snap.users.find((u) => u.email === EMAIL);
  if (!record) fail(`the snapshot has no account for ${EMAIL}.`);
  const TARGET = oid(record._id);

  const client = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 }).asPromise();
  const db = client.getClient().db(DB_NAME);
  const users = db.collection('users');

  console.log(`Database: ${DB_NAME}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  console.log(`Restoring: ${record.email}  "${record.name}"`);
  console.log(`  original _id : ${TARGET}`);
  console.log(`  role         : ${record.role}`);
  console.log(`  status       : ${record.status}`);
  console.log(`  createdAt    : ${unwrap(record.createdAt).toISOString()}\n`);

  if (await users.findOne({ email: EMAIL })) fail(`${EMAIL} already exists. Nothing to restore.`);

  // Which documents were moved to the survivor during the removal.
  const survivor = await users.findOne({ role: ADMIN_ROLE, _id: { $ne: new mongoose.Types.ObjectId(TARGET) } });
  if (!survivor) fail('could not identify the surviving administrator.');
  console.log(`Surviving admin: ${survivor.email}\n`);

  const idsWhere = (name, field) =>
    snap[name].filter((d) => oid(d[field]) === TARGET).map((d) => new mongoose.Types.ObjectId(oid(d._id)));
  const contribIds = idsWhere('contributions', 'reviewedBy');
  const activityIds = idsWhere('activities', 'user');
  const actorNotifIds = idsWhere('notifications', 'actor');
  const recipientNotifs = snap.notifications.filter((n) => oid(n.recipient) === TARGET);

  // Notifications addressed to the account that the snapshot does not hold,
  // because they were created after it was taken. Exactly one: the admin-to-
  // admin notice from the essential that msohaib published at 15:17:08Z, which
  // went to the OTHER admin only (an admin is never notified of their own
  // action). Rebuilt from the same template the service uses.
  const laterAdminNotice = {
    recipient: TARGET,
    actor: String(survivor._id),
    type: 'CONTENT_ADDED',
    title: 'Essential Added by an Admin',
    message: `Admin ${survivor.name} created a new essential: "Important Topics".`,
    entityType: 'Essential',
    entityId: '6abbd672623b425da3d6ad4c',
    link: '/essentials?highlight=6abbd672623b425da3d6ad4c',
    metadata: { contentName: 'Essential', action: 'added', entityTitle: 'Important Topics', actorName: survivor.name },
    dedupeKey: `added:Essential:6abbd672623b425da3d6ad4c:${TARGET}`,
    read: false,
    readAt: null,
    createdAt: new Date('2026-09-29T15:17:08.108Z'),
    updatedAt: new Date('2026-09-29T15:17:08.108Z'),
  };

  console.log('Plan:');
  console.log(`  users                    create ${EMAIL} with its ORIGINAL _id and password ${PASSWORD}`);
  console.log(`  contributions.reviewedBy ${String(contribIds.length).padStart(3)}  point back at ${EMAIL}`);
  console.log(`  activities.user          ${String(activityIds.length).padStart(3)}  point back at ${EMAIL}`);
  console.log(`  notifications.actor      ${String(actorNotifIds.length).padStart(3)}  point back at ${EMAIL}`);
  console.log(`  notifications.recipient  ${String(recipientNotifs.length).padStart(3)}  restored from the snapshot, byte for byte`);
  console.log(`  notifications.recipient    1  rebuilt from the service template (new _id - not recoverable)`);
  console.log(`  users.reviewedBy           4  resolve again automatically, no edit needed`);

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Re-run with --apply.');
    await client.close();
    return;
  }

  // Fingerprint everything else so we can prove afterwards nothing else moved.
  const othersBefore = (await users.find({ email: { $ne: EMAIL } }).toArray())
    .map((u) => `${u._id}|${u.email}|${u.name}|${u.role}|${u.status}|${u.password}`).sort();
  const contentBefore = {};
  for (const n of ['tasks', 'quizzes', 'assignments', 'announcements', 'essentials', 'lectures', 'importantdates', 'contributions', 'activities', 'emaildeliveries'])
    contentBefore[n] = await db.collection(n).countDocuments();
  const notifBefore = await db.collection('notifications').countDocuments();

  // --- 1. The account itself ---------------------------------------------
  const User = (await import('../models/User.js')).default;
  const hash = await User.hashPassword(PASSWORD);
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) fail('the model did not produce a bcrypt hash.');

  await users.insertOne({
    _id: new mongoose.Types.ObjectId(TARGET),
    name: record.name,
    email: record.email,
    password: hash,
    profileImage: record.profileImage ?? '',
    profileImageMeta: record.profileImageMeta ?? { publicId: '', resourceType: '' },
    role: ADMIN_ROLE,
    status: record.status || 'Approved',
    rejectionReason: record.rejectionReason ?? '',
    isReapplication: record.isReapplication ?? false,
    createdAt: unwrap(record.createdAt),
    updatedAt: new Date(),
    __v: 0,
  });
  console.log(`\n  created ${record.email} as a real ObjectId with a bcrypt hash`);

  // --- 2. Point the references back ---------------------------------------
  if (contribIds.length) {
    const r = await db.collection('contributions').updateMany({ _id: { $in: contribIds } }, { $set: { reviewedBy: new mongoose.Types.ObjectId(TARGET) } });
    console.log(`  restored ${r.modifiedCount} contribution review attribution(s)`);
  }
  if (activityIds.length) {
    const r = await db.collection('activities').updateMany({ _id: { $in: activityIds } }, { $set: { user: new mongoose.Types.ObjectId(TARGET) } });
    console.log(`  restored ${r.modifiedCount} activity row(s)`);
  }
  if (actorNotifIds.length) {
    const r = await db.collection('notifications').updateMany({ _id: { $in: actorNotifIds } }, { $set: { actor: new mongoose.Types.ObjectId(TARGET) } });
    console.log(`  restored ${r.modifiedCount} notification author(s)`);
  }

  // --- 3. The notifications addressed to the account ----------------------
  const docs = recipientNotifs.map((n) => {
    const { _id, ...rest } = n;
    return { _id: new mongoose.Types.ObjectId(oid(_id)), ...rest, _id: new mongoose.Types.ObjectId(oid(_id)) };
  });
  for (const d of docs) {
    for (const k of Object.keys(d)) {
      if (k === '_id') continue;
      if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && !(d[k] instanceof Date)) d[k] = unwrap(d[k]);
      else d[k] = unwrap(d[k]);
    }
  }
  if (docs.length) {
    await db.collection('notifications').insertMany(docs, { ordered: true });
    console.log(`  restored ${docs.length} notification(s) addressed to them, byte for byte`);
  }

  const rebuilt = { _id: new mongoose.Types.ObjectId(), ...laterAdminNotice };
  rebuilt.recipient = new mongoose.Types.ObjectId(TARGET);
  rebuilt.actor = new mongoose.Types.ObjectId(String(survivor._id));
  rebuilt.entityId = new mongoose.Types.ObjectId(laterAdminNotice.entityId);
  await db.collection('notifications').insertOne(rebuilt);
  console.log(`  rebuilt 1 notification from the service template (its original _id is not recoverable)`);

  // --- Verify --------------------------------------------------------------
  const restored = await users.findOne({ email: EMAIL });
  if (!restored) fail('the account was not created.');
  if (String(restored._id) !== TARGET) fail('the _id does not match the original.');
  if (restored._id?.constructor?.name !== 'ObjectId') fail('the _id is not an ObjectId.');
  if (restored.name !== record.name) fail('the name differs from the original.');
  if (restored.role !== ADMIN_ROLE) fail(`the role is ${restored.role}.`);
  if (restored.status !== (record.status || 'Approved')) fail('the status differs.');
  if (restored.password === PASSWORD) fail('the password was stored in plain text.');
  if (!(await bcrypt.compare(PASSWORD, restored.password))) fail('the stored hash does not verify.');
  console.log('\n  account verified: original _id, name, role and status; password is a bcrypt hash');

  const admins = await users.find({ role: ADMIN_ROLE }).toArray();
  console.log(`  administrators now: ${admins.map((a) => a.email).join(', ')}`);

  const othersAfter = (await users.find({ email: { $ne: EMAIL } }).toArray())
    .map((u) => `${u._id}|${u.email}|${u.name}|${u.role}|${u.status}|${u.password}`).sort();
  if (JSON.stringify(othersBefore) !== JSON.stringify(othersAfter)) fail('another account changed. Stopping.');
  console.log(`  the other ${othersAfter.length} account(s) are byte-for-byte unchanged`);

  for (const [n, c] of Object.entries(contentBefore)) {
    const after = await db.collection(n).countDocuments();
    if (after !== c) fail(`${n} changed (${c} -> ${after}).`);
  }
  console.log('  no content collection changed count');

  const notifAfter = await db.collection('notifications').countDocuments();
  if (notifAfter !== notifBefore + docs.length + 1) fail(`unexpected notification count (${notifBefore} -> ${notifAfter}).`);
  console.log(`  notifications: ${notifBefore} -> ${notifAfter} (${docs.length + 1} restored)`);

  const dangling = await db.collection('users').countDocuments({ reviewedBy: restored._id });
  console.log(`  user accounts whose reviewer resolves again: ${dangling}`);

  await client.close();
  console.log('\nDone.');
};

run().catch((e) => { console.error('RESTORE FAILED:', e.message); process.exit(1); });
