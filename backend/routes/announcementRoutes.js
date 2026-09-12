import express from 'express';
import { getAnnouncements, getAnnouncement, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../controllers/announcementController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getAnnouncements).post(createAnnouncement);
router.route('/:id').get(getAnnouncement).put(updateAnnouncement).delete(deleteAnnouncement);

export default router;
