import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getNotifications,
  getRecentNotifications,
  getUnreadCount,
  setNotificationRead,
  markAllAsRead,
} from '../controllers/notificationController.js';

const router = express.Router();

// Every route is scoped to the authenticated user by the controllers.
// There is deliberately no public "create notification" endpoint.
router.use(protect);

router.get('/', getNotifications);
router.get('/recent', getRecentNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', setNotificationRead);

export default router;
