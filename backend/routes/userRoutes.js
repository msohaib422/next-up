import express from 'express';
import { getProfile, updateProfile, updateProfileImage, changePassword } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/profile-image', updateProfileImage);
router.put('/change-password', changePassword);

export default router;
