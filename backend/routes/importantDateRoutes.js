import express from 'express';
import {
  getImportantDates,
  getImportantDate,
  createImportantDate,
  updateImportantDate,
  deleteImportantDate,
} from '../controllers/importantDateController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getImportantDates).post(createImportantDate);
router.route('/:id').get(getImportantDate).put(updateImportantDate).delete(deleteImportantDate);

export default router;
