import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/helpers.js';
import { deleteFromCloudinary } from '../services/cloudinary.js';
import { createNotification } from '../services/notificationService.js';
import {
  sendRegistrationApprovedEmail,
  sendRegistrationRejectedEmail,
  sendAccountDeletedEmail,
  listDeliveries,
  reportBounce,
  resendLastEmailTo,
} from '../services/mailService.js';
import {
  markUndeliverable,
  resumeAddress,
  getDeliveryStatus,
  isUsableAddress,
} from '../services/emailStatusService.js';

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name },
      { new: true, runValidators: true }
    );
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateProfileImage = async (req, res, next) => {
  try {
    const { profileImage, profileImageMeta } = req.body;

    const existingUser = await User.findById(req.user._id);

    const updateData = { profileImage };
    if (profileImageMeta) {
      updateData.profileImageMeta = {
        publicId: profileImageMeta.publicId || '',
        resourceType: profileImageMeta.resourceType || '',
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    );

    if (existingUser?.profileImageMeta?.publicId && profileImage !== existingUser.profileImage) {
      await deleteFromCloudinary({
        publicId: existingUser.profileImageMeta.publicId,
        resourceType: existingUser.profileImageMeta.resourceType || 'image',
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    const token = generateToken(user._id);
    res.json({ success: true, message: 'Password updated successfully', token });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    // Pending registrations appear in the same table as approved users, listed
    // first so they are the first thing an administrator sees.
    const users = await User.find({ role: 'user' }).select('-password').sort({ createdAt: -1 });

    const priority = { 'Pending Approval': 0, Approved: 1, Rejected: 2 };
    // Within a status, the most recently submitted application comes first. A
    // re-application restamps lastApplicationAt, so it is treated as newer than
    // a plain signup that has been queued longer.
    const appliedAt = (user) => new Date(user.lastApplicationAt || user.createdAt || 0);
    users.sort(
      (a, b) =>
        (priority[a.status || 'Approved'] ?? 3) - (priority[b.status || 'Approved'] ?? 3) ||
        appliedAt(b) - appliedAt(a)
    );

    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // An account created by an administrator is trusted, so it starts Approved
    // and skips the registration approval flow entirely.
    const user = await User.create({ name, email, password, status: 'Approved' });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Shared guard for the approve/reject actions: loads the target account and
 * rejects anything that is not a reviewable registration. This is what stops a
 * duplicate click, or a second admin, from reviewing the same registration
 * twice.
 */
const loadReviewableUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return null;
  }
  if (user.role === 'collaborator') {
    res.status(403).json({ success: false, message: 'Administrator accounts cannot be reviewed here' });
    return null;
  }
  if (user.status !== 'Pending Approval') {
    res.status(409).json({
      success: false,
      message: `This registration has already been ${(user.status || 'Approved').toLowerCase()}.`,
    });
    return null;
  }
  return user;
};

export const approveUser = async (req, res, next) => {
  try {
    const user = await loadReviewableUser(req, res);
    if (!user) return;

    user.status = 'Approved';
    user.rejectionReason = '';
    user.reviewedAt = new Date();
    user.reviewedBy = req.user._id;
    await user.save();

    const [, mail] = await Promise.all([
      createNotification({
        recipient: user._id,
        actor: req.user._id,
        type: 'REGISTRATION_APPROVED',
        title: 'Registration Approved',
        message: 'Your registration has been approved. You can now access the system.',
        entityType: 'User',
        entityId: user._id,
        link: '/',
        metadata: { status: user.status },
      }),
      sendRegistrationApprovedEmail(user),
    ]);
    if (mail?.status === 'failed') {
      console.error(`[approve] user ${user._id} approved, but the approval email failed: ${mail.reason}`);
    }

    res.json({
      success: true,
      message: `${user.name}'s registration has been approved.`,
      data: { _id: user._id, name: user.name, email: user.email, status: user.status },
      email: { applicant: mail?.status || 'skipped' },
    });
  } catch (error) {
    next(error);
  }
};

export const rejectUser = async (req, res, next) => {
  try {
    const user = await loadReviewableUser(req, res);
    if (!user) return;

    const reason = (req.body?.reason || '').trim();
    if (reason.length > 500) {
      return res.status(400).json({ success: false, message: 'Reason must be 500 characters or fewer' });
    }

    // The record is kept so the decision stays trackable; it is not deleted.
    user.status = 'Rejected';
    user.rejectionReason = reason;
    user.reviewedAt = new Date();
    user.reviewedBy = req.user._id;
    await user.save();

    const [, mail] = await Promise.all([
      createNotification({
        recipient: user._id,
        actor: req.user._id,
        type: 'REGISTRATION_REJECTED',
        title: 'Registration Rejected',
        message: reason
          ? `Your registration was rejected. Reason: ${reason}`
          : 'Your registration was rejected.',
        entityType: 'User',
        entityId: user._id,
        link: '/notifications',
        metadata: { status: user.status, reason },
      }),
      sendRegistrationRejectedEmail(user, reason),
    ]);
    if (mail?.status === 'failed') {
      console.error(`[reject] user ${user._id} rejected, but the rejection email failed: ${mail.reason}`);
    }

    res.json({
      success: true,
      message: `${user.name}'s registration has been rejected.`,
      data: { _id: user._id, name: user.name, email: user.email, status: user.status, rejectionReason: reason },
      email: { applicant: mail?.status || 'skipped' },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'collaborator') {
      return res.status(403).json({ success: false, message: 'Cannot modify collaborator accounts' });
    }

    if (email && email !== user.email) {
      const emailTaken = await User.findOne({ email, _id: { $ne: id } });
      if (emailTaken) {
        return res.status(400).json({ success: false, message: 'Email is already in use' });
      }
    }

    user.name = name;
    user.email = email;
    if (password) {
      user.password = password;
    }
    await user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'collaborator') {
      return res.status(403).json({ success: false, message: 'Cannot delete collaborator accounts' });
    }

    // Captured BEFORE the row disappears: the account-deletion notice is sent
    // after the delete, and once the record is gone there is no address left to
    // read. Only this one person's details are held - no other user is touched.
    const removedAccount = {
      _id: user._id,
      name: user.name,
      email: user.email,
      status: user.status || 'Approved',
      createdAt: user.createdAt,
    };

    await User.findByIdAndDelete(id);

    // The account is already gone at this point, so a delivery problem must not
    // undo or block the deletion. sendMail never throws: it reports 'skipped'
    // or 'failed' and the address is suppressed for later if it is undeliverable.
    const mail = await sendAccountDeletedEmail(removedAccount);
    if (mail?.status === 'failed') {
      console.error(
        `[delete] user ${removedAccount._id} was deleted, but the account-deletion email could not be delivered: ${mail.reason}`
      );
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
      email: { recipient: mail?.status || 'skipped' },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ *
 * Email delivery controls (admin only)
 *
 * These are the operator's hands on a failing address. They are never invoked
 * automatically: there is no startup sweep, no scheduled job and no retry
 * queue, so a broken address stays broken until a person looks at it.
 * ------------------------------------------------------------------ */

/** GET /api/users/admin/email-deliveries - what happened to each address. */
export const listEmailDeliveries = async (req, res, next) => {
  try {
    res.json({ success: true, data: await listDeliveries({ limit: req.query.limit }) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/admin/email-deliveries/stop
 * Take an address out of rotation for good. Use it as soon as a delivery
 * problem is known, instead of waiting for the server to refuse it.
 */
export const stopEmailingAddress = async (req, res, next) => {
  try {
    const { email, reason } = req.body || {};
    if (!isUsableAddress(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
    await markUndeliverable({ email, reason: 'an administrator stopped email to this address' });
    res.json({ success: true, message: `${email} will no longer be emailed.` });
  } catch (error) {
    next(error);
  }
};

/** POST /api/users/admin/email-deliveries/resume - put an address back. */
export const resumeEmailingAddress = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!isUsableAddress(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
    await resumeAddress(email);
    res.json({ success: true, message: `${email} will receive email again.`, data: await getDeliveryStatus(email) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/admin/email-deliveries/resend
 * Explicit, single-message resend of the last email to one address. This is the
 * only way a failed or suppressed address is ever retried.
 */
export const resendEmail = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!isUsableAddress(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
    const result = await resendLastEmailTo(email);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.reason, data: { status: result.status } });
    }
    res.json({ success: true, message: `Email re-sent to ${email}.`, data: { status: result.status } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/admin/email-deliveries/bounce
 *
 * The feedback channel SMTP does not give us for free: a message that was
 * accepted and then bounced is reported here, and the address stops being used.
 * Intended for a delivery provider's webhook or a bounce-forwarding rule, and
 * usable by hand from the admin panel.
 */
export const reportEmailBounce = async (req, res, next) => {
  try {
    const { email, reason, detail } = req.body || {};
    if (!isUsableAddress(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
    await reportBounce({ email, reason: reason || 'the address bounced', detail: detail || '' });
    res.json({ success: true, message: `${email} recorded as undeliverable.`, data: await getDeliveryStatus(email) });
  } catch (error) {
    next(error);
  }
};
