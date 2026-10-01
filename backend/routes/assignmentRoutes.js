import express from 'express';
import {
  getAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  completeAssignment,
  uploadAssignmentFile,
  getPendingApprovals,
  approveAssignment,
  rejectAssignment,
  getMyAssignments,
  getAssignmentCompletions,
  toggleAssignmentCompletion,
} from '../controllers/assignmentController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getAssignments).post(createAssignment);
router.post('/upload', uploadAssignmentFile);
router.get('/my', getMyAssignments);
router.get('/pending', authorize('collaborator'), getPendingApprovals);
// Declared before '/:id' so this is not read as an id.
router.get('/completions', getAssignmentCompletions);
router.put('/:id/approve', authorize('collaborator'), approveAssignment);
router.put('/:id/reject', authorize('collaborator'), rejectAssignment);
router.route('/:id').get(getAssignment).put(updateAssignment).delete(deleteAssignment);
router.put('/:id/complete', completeAssignment);
router.put('/:id/completion', toggleAssignmentCompletion);

export default router;
