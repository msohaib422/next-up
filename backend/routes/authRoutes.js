import express from 'express';
import { register, login, refreshSession, logout, getMe } from '../controllers/authController.js';
import { protectAny } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
// Session renewal. Driven by an httpOnly cookie, so it works from a backgrounded
// or frozen tab where no timer is running. Unauthenticated by design: the cookie
// is the credential, and the handler re-checks the account before issuing a token.
router.post('/refresh', refreshSession);
router.post('/logout', logout);
// An unapproved account still needs to read its own status here.
router.get('/me', protectAny, getMe);

export default router;
