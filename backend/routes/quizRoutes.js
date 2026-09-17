import express from 'express';
import { getQuizzes, getQuiz, createQuiz, updateQuiz, deleteQuiz, uploadQuizFile } from '../controllers/quizController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getQuizzes).post(createQuiz);
router.post('/upload', uploadQuizFile);
router.route('/:id').get(getQuiz).put(updateQuiz).delete(deleteQuiz);

export default router;
