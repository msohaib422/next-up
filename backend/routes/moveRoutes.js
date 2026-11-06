import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { moveItem } from '../controllers/moveController.js';

const router = express.Router();
router.use(protect);
router.post('/', authorize('collaborator'), moveItem);
router.put('/:from/:id', authorize('collaborator'), moveItem);

export default router;
