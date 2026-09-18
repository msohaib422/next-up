import express from 'express';
import {
  getProfile, updateProfile, updateProfileImage, changePassword,
  getAllUsers, createUser, updateUser, deleteUser,
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

export default router;
