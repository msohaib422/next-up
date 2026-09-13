import express from 'express';
import { getTasks, getTask, createTask, updateTask, deleteTask, completeTask, uploadTaskFile } from '../controllers/taskController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getTasks).post(createTask);
router.post('/upload', uploadTaskFile);
router.route('/:id').get(getTask).put(updateTask).delete(deleteTask);
router.put('/:id/complete', completeTask);

export default router;
