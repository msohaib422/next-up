import express from 'express';
import { getReferences, getReference, createReference, updateReference, deleteReference } from '../controllers/referenceController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getReferences).post(createReference);
router.route('/:id').get(getReference).put(updateReference).delete(deleteReference);

export default router;
