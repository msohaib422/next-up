import User from '../models/User.js';
import { generateToken } from '../utils/helpers.js';
import { sessionIdleMs } from '../config/session.js';
import { resolveAdminRecipients } from '../config/adminRecipients.js';
import { createNotification, notifyAdminsOfRegistrationSubmitted } from '../services/notificationService.js';
import {
  sendRegistrationReceivedEmail,
  sendAdminNewRegistrationEmail,
} from '../services/mailService.js';

/** Shown when someone tries to register with an address that was declined before. */
const PREVIOUSLY_REJECTED_MESSAGE =
  'Your previous registration application was not approved. You can review your information and submit a new application for approval.';

/** Shown when the address already has an application waiting for review. */
const ALREADY_PENDING_MESSAGE =
  'You already have a registration application waiting for administrator approval. No need to submit another one - you will be notified as soon as a decision is made.';

/**
 * Everything a successfully stored application triggers, in one place so a brand
 * new registration and a re-application behave identically:
 *
 *   - one in-app notification for the applicant
 *   - one in-app notification for every administrator (so the admin sees it in
 *     the existing bell / notifications area)
 *   - one registration-received email to this applicant only
 *   - ONE admin alert email, addressed to every configured administrator
 *
 * The admin alert is a single message to a list of recipients, not one message
 * per administrator: one event produces one email operation, so the number of
 * administrators never multiplies the work or the mail.
 *
 * There is no loop over unrelated users and no retry: the addresses involved
 * are exactly the people this event is about.
 */
const deliverRegistrationSubmitted = async (user, { isReapplication }) => {
  const submittedAt = user.lastApplicationAt ? new Date(user.lastApplicationAt).getTime() : 0;

  // In-app notification for the applicant, delivered through the existing
  // notification system (bell, notification page, unread count).
  const applicantNotification = createNotification({
    recipient: user._id,
    type: 'REGISTRATION_SUBMITTED',
    title: isReapplication ? 'New Application Submitted' : 'Registration Submitted',
    message: isReapplication
      ? 'Your new registration application has been submitted and is awaiting administrator approval.'
      : 'Your registration has been submitted and is awaiting administrator approval.',
    entityType: 'User',
    entityId: user._id,
    link: '/notifications',
    metadata: { status: user.status, isReapplication },
    dedupeKey: `registration-applicant:${user._id}:${submittedAt}`,
  });

  // In-app notification for the administrators, through the same system.
  const adminNotifications = notifyAdminsOfRegistrationSubmitted(user, { isReapplication });

  // Emails are best-effort and never block the registration itself, but the
  // outcome is reported so a delivery failure is never mistaken for success.
  //
  // The administrator list is resolved once, from configuration, and handed to
  // the mail service as a single recipient list.
  const [userMail, adminMail] = await Promise.all([
    sendRegistrationReceivedEmail(user),
    resolveAdminRecipients()
      .catch((error) => {
        console.error('[register] could not resolve the administrator recipient list:', error.message);
        return [];
      })
      .then((recipients) => sendAdminNewRegistrationEmail(user, recipients)),
  ]);

  const [notifiedAdmins] = await Promise.all([adminNotifications, applicantNotification]);

  if (userMail?.status === 'failed' || adminMail?.failed > 0) {
    console.error(
      `[register] application ${user._id} stored, but an email failed ` +
        `(user=${userMail?.status}, adminFailed=${adminMail?.failed}/${adminMail?.results?.length ?? 0})`
    );
  }

  return {
    applicant: userMail?.status || 'skipped',
    administratorsNotified: adminMail?.sent || 0,
    administratorsFailed: adminMail?.failed || 0,
    administratorNotifications: (notifiedAdmins || []).length,
  };
};

/** Shared shape of a successful application response. */
const registrationResponse = (user, email, isReapplication) => ({
  success: true,
  message: isReapplication
    ? 'Your new application has been received and is awaiting administrator approval.'
    : 'Registration received and awaiting administrator approval.',
  isReapplication,
  data: {
    _id: user._id,
    name: user.name,
    email: user.email,
    status: user.status,
  },
  email,
});

export const register = async (req, res, next) => {
  try {
    const { name, email, password, reapply = false } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (!existingUser) {
      // Self-registration never grants immediate access: the account is stored as
      // Pending Approval and no token is issued, so the new account cannot reach
      // any protected route until an administrator approves it.
      const user = await User.create({
        name,
        email: normalizedEmail,
        password,
        role: 'user',
        status: 'Pending Approval',
        lastApplicationAt: new Date(),
        isReapplication: false,
      });

      const mail = await deliverRegistrationSubmitted(user, { isReapplication: false });
      return res.status(201).json(registrationResponse(user, mail, false));
    }

    // An address that already has an account never gets a second record and
    // never triggers a second round of emails.
    const status = existingUser.status || 'Approved';

    if (existingUser.role === 'collaborator' || status === 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists. Try signing in instead.',
      });
    }

    if (status === 'Pending Approval') {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_PENDING',
        message: ALREADY_PENDING_MESSAGE,
        data: { status, canApplyAgain: false },
      });
    }

    // status === 'Rejected'
    if (!reapply) {
      // Detect the previous rejection and offer a way forward instead of a dead
      // end. No internal status value or record detail is exposed here.
      return res.status(409).json({
        success: false,
        code: 'PREVIOUSLY_REJECTED',
        message: PREVIOUSLY_REJECTED_MESSAGE,
        data: { canApplyAgain: true, name: existingUser.name, email: existingUser.email },
      });
    }

    // Apply again: the SAME account record moves back to Pending Approval, so
    // there is never a duplicate user or duplicate registration. The transition
    // is atomic and only matches while the account is still Rejected, so a
    // double submit (or a second browser) is rejected instead of re-sending
    // the application emails.
    const passwordHash = await User.hashPassword(password);
    const reapplication = await User.findOneAndUpdate(
      { _id: existingUser._id, status: 'Rejected' },
      {
        $set: {
          name,
          password: passwordHash,
          status: 'Pending Approval',
          rejectionReason: '',
          reviewedAt: null,
          reviewedBy: null,
          lastApplicationAt: new Date(),
          // The only place this flag is ever set: the account is reused after a
          // rejection, so the queued application is a re-application.
          isReapplication: true,
        },
      },
      { new: true, runValidators: true }
    );

    if (!reapplication) {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_PENDING',
        message: ALREADY_PENDING_MESSAGE,
        data: { status: 'Pending Approval', canApplyAgain: false },
      });
    }

    const mail = await deliverRegistrationSubmitted(reapplication, { isReapplication: true });
    return res.status(201).json(registrationResponse(reapplication, mail, true));
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    // status is returned so the client can route an unapproved account to the
    // right screen. Access itself is still enforced by the protect middleware.
    //
    // `sessionIdleMs` is the server's own idle window, published so the browser
    // never has to keep a second copy of it. The credential is a sliding one
    // (see config/session.js): the server re-signs it on every authenticated
    // request, so working keeps you signed in and walking away lets it lapse.
    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role,
        status: user.status || 'Approved',
      },
      token,
      sessionIdleMs: sessionIdleMs(),
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      success: true,
      data: { ...user.toObject(), status: user.status || 'Approved' },
    });
  } catch (error) {
    next(error);
  }
};
