import express from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { protectAny } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
// An unapproved account still needs to read its own status here.
router.get('/me', protectAny, getMe);

export default router;
