import express from 'express';
import {
  getProfile, updateProfile, updateProfileImage, changePassword,
  getAllUsers, createUser, updateUser, deleteUser, approveUser, rejectUser,
  listEmailDeliveries, stopEmailingAddress, resumeEmailingAddress,
  resendEmail, reportEmailBounce,
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/profile-image', updateProfileImage);
router.put('/change-password', changePassword);

router.get('/admin/users', authorize('collaborator'), getAllUsers);
router.post('/admin/users', authorize('collaborator'), createUser);
router.put('/admin/users/:id', authorize('collaborator'), updateUser);
router.delete('/admin/users/:id', authorize('collaborator'), deleteUser);
router.put('/admin/users/:id/approve', authorize('collaborator'), approveUser);
router.put('/admin/users/:id/reject', authorize('collaborator'), rejectUser);

// Email delivery controls. Every one of these is an explicit operator action:
// there is no scheduled job or background sweep behind them.
router.get('/admin/email-deliveries', authorize('collaborator'), listEmailDeliveries);
router.post('/admin/email-deliveries/stop', authorize('collaborator'), stopEmailingAddress);
router.post('/admin/email-deliveries/resume', authorize('collaborator'), resumeEmailingAddress);
router.post('/admin/email-deliveries/resend', authorize('collaborator'), resendEmail);
router.post('/admin/email-deliveries/bounce', authorize('collaborator'), reportEmailBounce);

export default router;
