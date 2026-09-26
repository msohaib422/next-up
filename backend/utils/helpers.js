import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

/**
 * The shared, multi-admin scope.
 *
 * Every collaborator (admin) account is part of ONE shared workspace, so
 * content authored by any admin is shared content:
 *
 *   - READ   `getVisibleUserIds`  - admins see every admin's content, and so do
 *                                  normal users (admin content is published to
 *                                  them). A normal user's own content stays
 *                                  private to that user.
 *   - WRITE  `getWritableUserIds` - admins may edit/delete any admin's shared
 *                                  content (it is ONE record, not a per-admin
 *                                  copy), while a normal user may only ever
 *                                  change their own.
 *
 * The `user` field on a document stays the account that created it: that is
 * attribution and audit information, never a visibility boundary between
 * admins. Nothing here duplicates a record.
 */
const collaboratorIds = async () => (await User.find({ role: 'collaborator' }).select('_id')).map((c) => c._id);

// Returns the list of user IDs whose records may be READ by the requester.
export const getVisibleUserIds = async (user) => {
  // For an admin this is the whole shared workspace (their own id is already
  // among the collaborators); for a normal user it is themselves plus the admins,
  // because admin content is published to users. Other users' own content is
  // never in the list, so it stays private.
  const collaborators = await collaboratorIds();
  return Array.from(new Set([String(user._id), ...collaborators.map(String)]));
};

// Returns the list of user IDs whose records the requester may MODIFY. For an
// admin that is the whole shared workspace; for anyone else it is only their
// own account, so user permissions are unchanged.
export const getWritableUserIds = async (user) => {
  if (user.role === 'collaborator') {
    return Array.from(new Set([String(user._id), ...(await collaboratorIds()).map(String)]));
  }
  return [String(user._id)];
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
