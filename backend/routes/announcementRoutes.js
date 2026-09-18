import express from 'express';
import {
  getAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  uploadAnnouncementFile,
  togglePin,
  toggleSave,
  toggleExpire,
} from '../controllers/announcementController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getAnnouncements).post(createAnnouncement);
router.post('/upload', uploadAnnouncementFile);
router.route('/:id').get(getAnnouncement).put(updateAnnouncement).delete(deleteAnnouncement);
router.put('/:id/pin', togglePin);
router.put('/:id/save', toggleSave);
router.put('/:id/expire', toggleExpire);

export default router;
