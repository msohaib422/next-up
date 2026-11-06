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
import { moveQuiz } from '../controllers/moveController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getQuizzes).post(createQuiz);
router.post('/upload', uploadQuizFile);
// Declared before '/:id' so this is not read as an id.
router.get('/completions', getQuizCompletions);
router.route('/:id').get(getQuiz).put(updateQuiz).delete(deleteQuiz);
router.put('/:id/completion', toggleQuizCompletion);
router.put('/:id/move', authorize('collaborator'), moveQuiz);

export default router;
