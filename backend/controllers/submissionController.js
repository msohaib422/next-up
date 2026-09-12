import Submission from '../models/Submission.js';
import { createActivity } from './activityController.js';

export const createSubmission = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.body;

    const existing = await Submission.findOne({
      user: req.user._id,
      entityType,
      entityId,
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'You have already submitted this item' });
    }

    const submission = await Submission.create({
      user: req.user._id,
      entityType,
      entityId,
    });

    await createActivity(
      req.user._id,
      'submission_created',
      `Submitted ${entityType} for review`,
      '',
      entityType,
      entityId
    );

    res.status(201).json({ success: true, data: submission });
  } catch (error) {
    next(error);
  }
};

export const getPendingSubmissions = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ status: 'Pending' })
      .populate('user', 'name email')
      .sort('-createdAt');
    res.json({ success: true, count: submissions.length, data: submissions });
  } catch (error) {
    next(error);
  }
};

export const getSubmissionHistory = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ status: { $in: ['Approved', 'Rejected'] } })
      .populate('user', 'name email')
      .populate('reviewedBy', 'name email')
      .sort('-createdAt');
    res.json({ success: true, count: submissions.length, data: submissions });
  } catch (error) {
    next(error);
  }
};

export const approveSubmission = async (req, res, next) => {
  try {
    const submission = await Submission.findByIdAndUpdate(
      req.params.id,
      {
        status: 'Approved',
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { new: true }
    ).populate('user', 'name email');

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    await createActivity(
      req.user._id,
      'submission_approved',
      `Approved ${submission.entityType} submission`,
      '',
      submission.entityType,
      submission.entityId
    );

    res.json({ success: true, data: submission });
  } catch (error) {
    next(error);
  }
};

export const rejectSubmission = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;

    const submission = await Submission.findByIdAndUpdate(
      req.params.id,
      {
        status: 'Rejected',
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || '',
      },
      { new: true }
    ).populate('user', 'name email');

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    await createActivity(
      req.user._id,
      'submission_rejected',
      `Rejected ${submission.entityType} submission`,
      rejectionReason,
      submission.entityType,
      submission.entityId
    );

    res.json({ success: true, data: submission });
  } catch (error) {
    next(error);
  }
};

export const getMySubmissions = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ user: req.user._id })
      .populate('reviewedBy', 'name email')
      .sort('-createdAt');
    res.json({ success: true, count: submissions.length, data: submissions });
  } catch (error) {
    next(error);
  }
};
