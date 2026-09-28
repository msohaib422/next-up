import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sessionIdleSeconds, refreshTokenSeconds } from '../config/session.js';

/**
 * Issue a session credential.
 *
 * The token is valid for one idle window (10 minutes by default, see
 * config/session.js) and NOT for a fixed long life. The window is sliding: the
 * auth middleware hands a freshly signed token back with every authenticated
 * request it accepts, so a user who keeps working is never logged out, while a
 * session the user walked away from simply stops being renewed and expires.
 *
 * The same function issues both the token at login and the renewals, so there
 * is one definition of how long a session lasts.
 */
export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: sessionIdleSeconds(),
  });
};

/**
 * The refresh credential: a longer-lived token that can ONLY be exchanged for a
 * new access token. See config/session.js for why a second credential exists.
 *
 * It is marked `purpose: 'refresh'` and every verification of it insists on that
 * claim, so it can never be mistaken for an access token - the reverse mistake
 * is equally guarded against, because the middleware rejects an access token
 * that carries this claim. A stolen refresh token is therefore useless against
 * the protected routes: it buys a new access token, nothing more, and only
 * through the single refresh endpoint.
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId, purpose: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: refreshTokenSeconds(),
  });
};

/**
 * Verify a refresh token and return the account id it names, or null.
 *
 * The claim check is what keeps the two token types apart. Returning null for
 * anything unusable (rather than throwing) lets the caller treat every failure -
 * expired, tampered, wrong type, garbage - as the same thing: no session.
 */
export const verifyRefreshToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.purpose !== 'refresh' || !decoded.id) return null;
    return decoded.id;
  } catch {
    return null;
  }
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
