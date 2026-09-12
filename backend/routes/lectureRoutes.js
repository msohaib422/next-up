import express from 'express';
import {
  getLectures,
  getLecture,
  createLecture,
  updateLecture,
  deleteLecture,
  getTimetable,
  getTodayLectures,
  getCurrentLecture,
} from '../controllers/lectureController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/timetable', getTimetable);
router.get('/today', getTodayLectures);
router.get('/current', getCurrentLecture);
router.route('/').get(getLectures).post(createLecture);
router.route('/:id').get(getLecture).put(updateLecture).delete(deleteLecture);

export default router;
