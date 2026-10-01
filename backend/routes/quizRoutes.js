import express from 'express';
import {
  getQuizzes,
  getQuiz,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizCompletions,
  toggleQuizCompletion,
  uploadQuizFile,
} from '../controllers/quizController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getQuizzes).post(createQuiz);
router.post('/upload', uploadQuizFile);
// Declared before '/:id' so this is not read as an id.
router.get('/completions', getQuizCompletions);
router.route('/:id').get(getQuiz).put(updateQuiz).delete(deleteQuiz);
router.put('/:id/completion', toggleQuizCompletion);

export default router;
