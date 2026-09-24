import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { createContribution, getMyContributions, getContributionStats, getContribution, listContributions, approveContribution, rejectContribution } from '../controllers/contributionController.js';
const router = express.Router();
router.use(protect);
router.route('/').post(createContribution).get(getMyContributions);
router.get('/stats', getContributionStats);
router.get('/:id', getContribution);
export default router;

export const adminContributionRoutes = express.Router();
adminContributionRoutes.use(protect, authorize('collaborator'));
adminContributionRoutes.route('/').get(listContributions);
adminContributionRoutes.get('/:id', getContribution);
adminContributionRoutes.post('/:id/approve', approveContribution);
adminContributionRoutes.post('/:id/reject', rejectContribution);
