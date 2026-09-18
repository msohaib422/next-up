import express from 'express';
import {
  getEssentials,
  getEssential,
  createEssential,
  updateEssential,
  deleteEssential,
  uploadEssentialFile,
  toggleSave,
} from '../controllers/essentialController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getEssentials).post(createEssential);
router.post('/upload', uploadEssentialFile);
router.route('/:id').get(getEssential).put(updateEssential).delete(deleteEssential);
router.put('/:id/save', toggleSave);

export default router;
