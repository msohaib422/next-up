import express from 'express';
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getTaskCompletions,
  toggleTaskCompletion,
  uploadTaskFile,
} from '../controllers/taskController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getTasks).post(createTask);
router.post('/upload', uploadTaskFile);
// Declared before '/:id' so this is not read as an id.
router.get('/completions', getTaskCompletions);
router.route('/:id').get(getTask).put(updateTask).delete(deleteTask);
router.put('/:id/complete', completeTask);
router.put('/:id/completion', toggleTaskCompletion);

export default router;
