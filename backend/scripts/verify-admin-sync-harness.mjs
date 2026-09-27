/**
 * Shared harness for the two admin-sync verification suites.
 *
 * Both suites write into the real database (the configured database user is
 * scoped to it, so a separate test database is not available) and both then
 * remove everything they created. That makes this file the one place where the
 * destructive part of the verification lives, so it can be read in one go.
 *
 * Two rules make it safe:
 *
 *  1. Every record a run creates belongs to an account whose email matches
 *     TEST_EMAIL below, and nothing is ever deleted except (a) those accounts,
 *     (b) content owned by them, and (c) notifications/activities that name
 *     those accounts or point at that content - always by explicit id list.
 *     There is deliberately no `$nin`/`$not` filter anywhere in here: a negated
 *     id filter written against the wrong id type silently matches every
 *     document in the collection, which is how a real account's data would be
 *     destroyed by a "cleanup".
 *
 *  2. A run holds a database lock for its whole lifetime, so two suites (or a
 *     suite and a manual run) can never interleave. Overlapping runs are what
 *     makes one run delete another run's accounts, leaving content whose author
 *     no longer exists.
 */
import mongoose from 'mongoose';

const User = (await import('../models/User.js')).default;
const Activity = (await import('../models/Activity.js')).default;
const Notification = (await import('../models/Notification.js')).default;
const Contribution = (await import('../models/Contribution.js')).default;
const Task = (await import('../models/Task.js')).default;
const Quiz = (await import('../models/Quiz.js')).default;
const Assignment = (await import('../models/Assignment.js')).default;
const Announcement = (await import('../models/Announcement.js')).default;
const Essential = (await import('../models/Essential.js')).default;
const Lecture = (await import('../models/Lecture.js')).default;
const ImportantDate = (await import('../models/ImportantDate.js')).default;

export const CONTENT_MODELS = [Task, Quiz, Assignment, Announcement, Essential, Lecture, ImportantDate];

/**
 * Every account a verification run creates lives in this reserved domain, and
 * nothing else does - so matching the domain is both sufficient and safe.
 * Overlapping runs are prevented by the lock below, not by a narrower pattern.
 */
export const TEST_EMAIL = /@sync\.test$/;

const LOCK_ID = 'verify-admin-sync';
const LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Take the run lock. Returns a release function.
 *
 * A lock that has expired (a killed process) is taken over, so a crashed run
 * cannot block the next one forever. If the lock cannot be written at all - a
 * database user without insert rights on a new collection - the run continues
 * with a warning rather than refusing to verify anything.
 */
export const acquireRunLock = async (suiteName) => {
  const locks = mongoose.connection.db.collection('verification_locks');
  const now = new Date();
  try {
    await locks.deleteMany({ _id: LOCK_ID, expiresAt: { $lt: now } });
    await locks.insertOne({ _id: LOCK_ID, suite: suiteName, startedAt: now, expiresAt: new Date(now.getTime() + LOCK_TTL_MS) });
  } catch (error) {
    if (error?.code === 11000) {
      const holder = await locks.findOne({ _id: LOCK_ID });
      throw new Error(
        `Another admin-sync verification run is in progress (${holder?.suite || 'unknown'}, started ${holder?.startedAt || 'unknown'}). ` +
          'Wait for it to finish, or delete the verification_locks document if it was killed mid-run.'
      );
    }
    console.warn(`[harness] could not take the run lock (${error.message}); continuing without it`);
    return () => {};
  }
  return async () => {
    await locks.deleteOne({ _id: LOCK_ID }).catch(() => {});
  };
};

/**
 * Remove every account ever created by these suites, plus exactly the records
 * that hang off them. Safe to call at the start of a run (to clear a previous
 * run's leftovers) and at the end (to leave the database as it was found).
 *
 * Returns a short report so the caller can print what it removed.
 */
export const removeAllTestData = async () => {
  const accounts = await User.find({ email: TEST_EMAIL }).select('_id');
  const accountIds = accounts.map((a) => a._id);
  if (accountIds.length === 0) return { accounts: 0, content: 0, contributions: 0, notifications: 0, activities: 0 };

  const contentIds = [];
  for (const Model of CONTENT_MODELS) {
    const owned = await Model.find({ $or: [{ user: { $in: accountIds } }, { contributor: { $in: accountIds } }] }).select('_id');
    contentIds.push(...owned.map((doc) => doc._id));
  }
  const testContributions = await Contribution.find({
    $or: [{ user: { $in: accountIds } }, { reviewedBy: { $in: accountIds } }],
  }).select('_id');
  const contributionIds = testContributions.map((doc) => doc._id);

  // Notifications and activities first: they point at the records about to go.
  // Both filters are positive `in` lists of real ObjectIds.
  const notifications = await Notification.deleteMany({
    $or: [
      { recipient: { $in: accountIds } },
      { actor: { $in: accountIds } },
      { entityId: { $in: [...contentIds, ...contributionIds] } },
    ],
  });
  const activities = await Activity.deleteMany({ user: { $in: accountIds } });
  await Contribution.deleteMany({ _id: { $in: contributionIds } });
  for (const Model of CONTENT_MODELS) await Model.deleteMany({ _id: { $in: contentIds } });
  await User.deleteMany({ _id: { $in: accountIds } });

  return {
    accounts: accountIds.length,
    content: contentIds.length,
    contributions: contributionIds.length,
    notifications: notifications.deletedCount,
    activities: activities.deletedCount,
  };
};

/** A unique email for one test account, inside the domain TEST_EMAIL covers. */
export const testEmail = (name, runId) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${runId}@sync.test`;
