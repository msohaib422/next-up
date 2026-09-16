import express from 'express';
import {
  getLectures,
  getLecture,
  createLecture,
  updateLecture,
  deleteLecture,
  uploadLectureFile,
} from '../controllers/lectureController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getLectures).post(createLecture);
router.post('/upload', uploadLectureFile);
router.route('/:id').get(getLecture).put(updateLecture).delete(deleteLecture);

export default router;
