import express from 'express';
import {
  createSubmission,
  getPendingSubmissions,
  getSubmissionHistory,
  approveSubmission,
  rejectSubmission,
  getMySubmissions,
} from '../controllers/submissionController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', createSubmission);
router.get('/my', getMySubmissions);
router.get('/pending', authorize('collaborator'), getPendingSubmissions);
router.get('/history', authorize('collaborator'), getSubmissionHistory);
router.put('/:id/approve', authorize('collaborator'), approveSubmission);
router.put('/:id/reject', authorize('collaborator'), rejectSubmission);

export default router;
