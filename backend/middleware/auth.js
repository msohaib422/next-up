import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { isRenewalDue, sessionIdleMs } from '../config/session.js';
import { generateToken } from '../utils/helpers.js';

/**
 * Response headers that carry a sliding session renewal to the browser.
 *
 * Exported because the browser has to be allowed to read them (see the CORS
 * setup in server.js) whenever the API is hosted on another origin.
 */
export const SESSION_TOKEN_HEADER = 'X-Session-Token';
export const SESSION_IDLE_HEADER = 'X-Session-Idle-Ms';

/**
 * Hand the caller a fresh credential for the same account.
 *
 * This is the whole of the 10-minute behaviour on the server: the token that
 * just proved itself is replaced by one whose life starts now, so an in-use
 * session keeps rolling forward indefinitely and an unused one runs out. No
 * session table, no schema change, no new library - the enforcement point
 * stays the same `jwt.verify` that already rejected invalid tokens.
 */
const renewSession = (res, user) => {
  if (res.headersSent) return;
  res.setHeader(SESSION_TOKEN_HEADER, generateToken(user._id));
  // Told to the client as well, so the browser's own idle bookkeeping uses the
  // server's window rather than a second, possibly different, number.
  res.setHeader(SESSION_IDLE_HEADER, String(sessionIdleMs()));
};

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
        ? 'Your previous registration application was not approved. You can review your information and submit a new application for approval.'
        : 'Your registration is awaiting administrator approval.',
    // Lets the client offer the right way forward: a rejected account can
    // re-apply, a pending one only has to wait.
    data: {
      status: user.status || 'Pending Approval',
      canApplyAgain: user.status === 'Rejected',
    },
  });

const authenticate = async (req, res, next, { requireApproved }) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.slice(7).trim();
  }

  // Every 401 below carries an explicit `reason`. That is what lets the client
  // tell "your credential is genuinely not valid" apart from a 500, a 503 or a
  // dropped connection - only the former may end a session.
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token',
      reason: 'NO_TOKEN',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    const expired = error?.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      message: expired ? 'Not authorized, token expired' : 'Not authorized, token failed',
      reason: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
    });
  }

  // The account lookup is the one database call on every protected request, so
  // it is also the one most likely to be interrupted by a reconnect.
  //
  // `authenticate` is async, and Express 4 does not catch a rejected promise
  // from a middleware. An unguarded `await` here therefore left the request
  // hanging with no response at all: the browser timed out, the client read it
  // as a network failure, and the session was thrown away - a database blip
  // looked exactly like a broken backend. Forwarding the error lets the central
  // handler answer 503 and the client keep the session.
  let user;
  try {
    user = await User.findById(decoded.id);
  } catch (error) {
    return next(error);
  }

  if (!user) {
    // The token verified but the account behind it is gone (deleted, or the
    // database was restored without it). The credential is no longer usable.
    return res.status(401).json({
      success: false,
      message: 'Not authorized, user not found',
      reason: 'ACCOUNT_NOT_FOUND',
    });
  }

  if (requireApproved && approvalRequired(user)) {
    return approvalError(res, user);
  }

  // The request proved the credential is good, so this is activity. Slide the
  // window forward (see config/session.js) and let the browser keep using the
  // new token. Renewing only once the token is a quarter of the way through
  // its life keeps the extra signature off the overwhelming majority of
  // requests.
  if (isRenewalDue(decoded)) {
    renewSession(res, user);
  } else {
    // Still tell the client how long the window is, so its own idle bookkeeping
    // matches the server exactly even on a response that carried no new token.
    res.setHeader(SESSION_IDLE_HEADER, String(sessionIdleMs()));
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
