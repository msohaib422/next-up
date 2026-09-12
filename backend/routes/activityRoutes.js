import express from 'express';
import { getActivities } from '../controllers/activityController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getActivities);

export default router;
