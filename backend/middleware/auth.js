import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Accounts that have not been approved by an administrator may authenticate
// (so the UI can show them why they cannot proceed) but must not reach any
// protected feature. Enforced here, on the server, so hiding pages in the UI is
// never the only line of defence. Collaborators are staff accounts and are not
// part of the registration approval flow.
const approvalRequired = (user) => user.role !== 'collaborator' && user.status !== 'Approved';

const approvalError = (res, user) =>
  res.status(403).json({
    success: false,
    message:
      user.status === 'Rejected'
        ? 'Your registration was not approved. Please contact your administrator.'
        : 'Your registration is awaiting administrator approval.',
    data: { status: user.status || 'Pending Approval' },
  });

const authenticate = async (req, res, next, { requireApproved }) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ').slice(1).join(' ');
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
  }

  if (requireApproved && approvalRequired(user)) {
    return approvalError(res, user);
  }

  req.user = user;
  next();
};

/** Requires a valid token AND an approved account. */
export const protect = (req, res, next) => authenticate(req, res, next, { requireApproved: true });

/**
 * Requires a valid token but allows an unapproved account through. Used only
 * by GET /api/auth/me, so a pending or rejected user can read their own status
 * and be shown the right screen instead of being bounced to the login page.
 */
export const protectAny = (req, res, next) => authenticate(req, res, next, { requireApproved: false });

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};
