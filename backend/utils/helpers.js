import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const isAdmin = (user) => user?.role === 'collaborator';

const sameId = (a, b) => String(a) === String(b);

/** Every admin (collaborator) account. Admin content is shared by all of them. */
export const getCollaboratorIds = async () => {
  const collaborators = await User.find({ role: 'collaborator' }).select('_id');
  return collaborators.map((c) => c._id);
};

/**
 * Guarantees the requester is present in the list, even if the account was
 * promoted to admin a moment ago and a concurrent read did not see it yet.
 * Without this an admin could briefly lose sight of their own records.
 */
const withSelf = (ids, user) => (ids.some((id) => sameId(id, user._id)) ? ids : [user._id, ...ids]);

/**
 * The list of user IDs whose records may be READ by the requester.
 *
 * Records are stored under the account that created them, so visibility is
 * derived from the OWNER's role:
 *
 *  - a record owned by a normal user is readable only by that user;
 *  - a record owned by an admin (collaborator) is shared, so it is readable by
 *    every normal user AND by every other admin.
 *
 * The admin case is what makes this a multi-admin system rather than a set of
 * isolated per-admin workspaces: an admin never has to know which admin
 * created a record in order to see (or open) it.
 */
export const getVisibleUserIds = async (user) => {
  const collaboratorIds = await getCollaboratorIds();
  if (isAdmin(user)) return withSelf(collaboratorIds, user);
  return [user._id, ...collaboratorIds];
};

/**
 * The list of user IDs whose records the requester may MODIFY.
 *
 * Same shared-owner rule as the read scope, restricted to the shared admin
 * pool: an admin can edit/delete/complete any admin-owned record (that is the
 * point of shared content), while a record owned by a normal user stays under
 * that user's control and is never editable by an admin through these
 * endpoints. A normal user can only ever modify their own records.
 */
export const getManageableUserIds = async (user) => {
  if (isAdmin(user)) return withSelf(await getCollaboratorIds(), user);
  return [user._id];
};

/** Query fragment for "records this requester may read". */
export const visibleRecordScope = async (user) => ({ user: { $in: await getVisibleUserIds(user) } });

/** Query fragment for "records this requester may modify". */
export const manageableRecordScope = async (user) => ({ user: { $in: await getManageableUserIds(user) } });

/** Full filter for a single record this requester may modify. */
export const manageableRecordQuery = async (user, id) => ({ _id: id, ...(await manageableRecordScope(user)) });

/** True when the record's owner is an admin, i.e. the record is shared content. */
export const isSharedRecord = async (ownerId) => {
  if (!ownerId) return false;
  const owner = await User.findById(ownerId).select('role');
  return isAdmin(owner);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const getCurrentDay = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
};

export const getCurrentTime = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};
