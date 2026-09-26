import User from '../models/User.js';
import { generateToken } from '../utils/helpers.js';
import { createNotification } from '../services/notificationService.js';
import {
  sendRegistrationReceivedEmail,
  sendAdminNewRegistrationEmail,
} from '../services/mailService.js';

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Self-registration never grants immediate access: the account is stored as
    // Pending Approval and no token is issued, so the new account cannot reach
    // any protected route until an administrator approves it.
    const user = await User.create({
      name,
      email,
      password,
      role: 'user',
      status: 'Pending Approval',
    });

    // In-app notification for the applicant, delivered through the existing
    // notification system (bell, notification page, unread count).
    await createNotification({
      recipient: user._id,
      type: 'REGISTRATION_SUBMITTED',
      title: 'Registration Submitted',
      message: 'Your registration has been submitted and is awaiting administrator approval.',
      entityType: 'User',
      entityId: user._id,
      link: '/notifications',
      metadata: { status: user.status },
    });

    // Emails are best-effort and never block the registration itself, but the
    // outcome is reported so a delivery failure is never mistaken for success.
    const [userMail, adminMail] = await Promise.all([
      sendRegistrationReceivedEmail(user),
      User.find({ role: 'collaborator' })
        .select('email')
        .then((admins) => sendAdminNewRegistrationEmail(user, admins)),
    ]);
    if (userMail?.status === 'failed' || adminMail?.failed > 0) {
      console.error(
        `[register] registration ${user._id} stored, but an email failed ` +
          `(user=${userMail?.status}, adminFailed=${adminMail?.failed}/${adminMail?.results?.length ?? 0})`
      );
    }

    res.status(201).json({
      success: true,
      message: 'Registration received and awaiting administrator approval.',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
      email: {
        applicant: userMail?.status || 'skipped',
        administratorsNotified: adminMail?.sent || 0,
        administratorsFailed: adminMail?.failed || 0,
      },
    });
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
