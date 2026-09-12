import express from 'express';
import { getReminders, getReminder, createReminder, updateReminder, deleteReminder } from '../controllers/reminderController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getReminders).post(createReminder);
router.route('/:id').get(getReminder).put(updateReminder).delete(deleteReminder);

export default router;
