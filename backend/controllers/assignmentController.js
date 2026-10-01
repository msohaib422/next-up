import Assignment from '../models/Assignment.js';
import Contribution from '../models/Contribution.js';
import { createActivity } from './activityController.js';
import { getVisibleUserIds, getWritableUserIds } from '../utils/helpers.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryMetadata } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';
import { fileTooLargeMessage } from '../config/uploadLimits.js';
import { notifyContentChange, notifyContributionUpdated, notifyContributorsOfDeletedEntity, notifyStatusChange } from '../services/notificationService.js';

export const uploadAssignmentFile = [
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: fileTooLargeMessage });
        }
        return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided.' });
      }
      const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      const result = await uploadToCloudinary(req.file.buffer, 'assignments', safeName);

      const meta = extractCloudinaryMetadata(result);
      res.json({
        success: true,
        data: {
          name: req.file.originalname,
          url: meta.url,
          type: req.file.mimetype,
          publicId: meta.publicId,
          resourceType: meta.resourceType,
        },
      });
    } catch (error) {
      let message;
      if (error.message?.includes('Cloudinary configuration missing')) {
        message = 'Upload service is not configured. Please contact support.';
      } else if (error.http_code === 401 || error.message?.includes('authentication failed')) {
        message = 'Upload service authentication failed. Please contact support.';
      } else if (error.message?.includes('File too large') || error.code === 'LIMIT_FILE_SIZE') {
        message = fileTooLargeMessage;
      } else {
        message = error.message || 'File upload to storage failed.';
      }
      res.status(500).json({ success: false, message });
    }
  }
];

export const getAssignments = async (req, res, next) => {
  try {
    const { status, subject, search, sort = '-createdAt' } = req.query;
    const query = { user: { $in: await getVisibleUserIds(req.user) }, approvalStatus: 'Approved' };

    if (status) query.status = status;
    if (subject) query.subject = subject;
    if (search) {
      query.$or = [
        { title: { $regex: '^' + search, $options: 'i' } },
        { subject: { $regex: '^' + search, $options: 'i' } },
      ];
    }

    const assignments = await Assignment.find(query).populate('contributor', 'name').sort(sort);
    res.json({ success: true, count: assignments.length, data: assignments });
  } catch (error) {
    next(error);
  }
};

export const getAssignment = async (req, res, next) => {
  try {
    const assignment = await Assignment.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } })
      .populate('contributor', 'name');
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
};

export const createAssignment = async (req, res, next) => {
  try {
    const { subject, title, description, deadline, deadlineMode, priority, status, attachment } = req.body;

    const validModes = ['Date', 'Upcoming Lecture', 'As Possible'];
    if (!deadlineMode || !validModes.includes(deadlineMode)) {
      return res.status(400).json({ success: false, message: 'Please select a deadline.' });
    }
    if (deadlineMode === 'Date' && !deadline) {
      return res.status(400).json({ success: false, message: 'Please select a date.' });
    }

    const sanitizedDeadline = deadlineMode === 'Date' && deadline ? deadline : null;

    const isAdmin = req.user.role === 'collaborator';

    const assignmentData = {
      user: req.user._id,
      subject,
      title,
      description,
      deadline: sanitizedDeadline,
      deadlineMode,
      priority,
      status: status || 'Pending',
      approvalStatus: isAdmin ? 'Approved' : 'Pending',
    };

    if (attachment && attachment.name && attachment.url) {
      assignmentData.attachment = {
        name: attachment.name,
        url: attachment.url,
        type: attachment.type || '',
        publicId: attachment.publicId || '',
        resourceType: attachment.resourceType || '',
      };
    }

    const assignment = await Assignment.create(assignmentData);

    await createActivity(req.user._id, 'assignment_created', `Created assignment: ${title}`, '', 'Assignment', assignment._id);

    await notifyContentChange({ entityType: 'Assignment', entity: assignment, actor: req.user, action: 'added' });

    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
};

export const updateAssignment = async (req, res, next) => {
  try {
    const existingAssignment = await Assignment.findOne({ _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } });
    if (!existingAssignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const { attachment: newAttachment, ...updateFields } = req.body;

    // The per-user tick is written only by its own endpoint. It is dropped here
    // so that editing an assignment can never write another user's tick (or clear
    // one).
    delete updateFields.completions;

    if (newAttachment && newAttachment.url && newAttachment.url !== existingAssignment.attachment?.url) {
      if (existingAssignment.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingAssignment.attachment.publicId,
          resourceType: existingAssignment.attachment.resourceType || 'image',
        });
      }
      updateFields.attachment = {
        name: newAttachment.name || '',
        url: newAttachment.url || '',
        type: newAttachment.type || '',
        publicId: newAttachment.publicId || '',
        resourceType: newAttachment.resourceType || '',
      };
    } else if (newAttachment === null || newAttachment === '') {
      if (existingAssignment.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingAssignment.attachment.publicId,
          resourceType: existingAssignment.attachment.resourceType || 'image',
        });
      }
      updateFields.attachment = { name: '', url: '', type: '', publicId: '', resourceType: '' };
    }

    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } },
      updateFields,
      { new: true, runValidators: true }
    );

    if (assignment) {
      await notifyContributionUpdated({ entityType: 'Assignment', entity: assignment, admin: req.user });
      // Only a real complete <-> incomplete flip is worth a notification, and it
      // replaces the generic "updated" one so a single request never notifies twice.
      const wasCompleted = existingAssignment.status === 'Completed';
      if (wasCompleted !== (assignment.status === 'Completed')) {
        await notifyStatusChange({ entityType: 'Assignment', entity: assignment, owner: req.user, wasCompleted });
      } else {
        await notifyContentChange({ entityType: 'Assignment', entity: assignment, actor: req.user, action: 'updated' });
      }
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
};

export const deleteAssignment = async (req, res, next) => {
  try {
    const assignment = await Assignment.findOne({ _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.attachment?.publicId) {
      await deleteFromCloudinary({
        publicId: assignment.attachment.publicId,
        resourceType: assignment.attachment.resourceType || 'image',
      });
    }

    await notifyContributorsOfDeletedEntity({ entityType: 'Assignment', entityId: req.params.id, actor: req.user });

    await Assignment.findOneAndDelete({ _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } });

    // Keep the contributor's record: an approved contribution that is later deleted
    // must show as Deleted, not disappear or fall back to Not Published.
    await Contribution.updateMany(
      { finalEntity: req.params.id, status: 'Approved' },
      { $set: { status: 'Deleted' } }
    );

    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

export const completeAssignment = async (req, res, next) => {
  try {
    const existingAssignment = await Assignment.findOne({ _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } });
    if (!existingAssignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } },
      { status: 'Completed' },
      { new: true }
    );
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    await createActivity(req.user._id, 'assignment_completed', `Completed assignment: ${assignment.title}`, '', 'Assignment', assignment._id);

    if (existingAssignment.status !== 'Completed') {
      await notifyStatusChange({ entityType: 'Assignment', entity: assignment, owner: req.user, wasCompleted: false });
    }

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
};

export const getPendingApprovals = async (req, res, next) => {
  try {
    const assignments = await Assignment.find({ approvalStatus: 'Pending' })
      .populate('user', 'name email')
      .sort('-createdAt');
    res.json({ success: true, count: assignments.length, data: assignments });
  } catch (error) {
    next(error);
  }
};

export const approveAssignment = async (req, res, next) => {
  try {
    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      {
        approvalStatus: 'Approved',
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { new: true }
    ).populate('user', 'name email');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    await createActivity(
      req.user._id,
      'assignment_approved',
      `Approved assignment: ${assignment.title}`,
      '',
      'Assignment',
      assignment._id
    );

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
};

export const rejectAssignment = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      {
        approvalStatus: 'Rejected',
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || '',
      },
      { new: true }
    ).populate('user', 'name email');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    await createActivity(
      req.user._id,
      'assignment_rejected',
      `Rejected assignment: ${assignment.title}`,
      rejectionReason,
      'Assignment',
      assignment._id
    );

    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
};

export const getMyAssignments = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { user: req.user._id };
    if (status) query.approvalStatus = status;

    const assignments = await Assignment.find(query)
      .populate('reviewedBy', 'name email')
      .sort('-createdAt');
    res.json({ success: true, count: assignments.length, data: assignments });
  } catch (error) {
    next(error);
  }
};

/**
 * The ids of the assignments THIS user has ticked off for themselves.
 *
 * The tick lives on the assignment, so this is one query over the assignments the
 * requester may already see, filtered by their own id. It is answered separately
 * from the list so every existing endpoint - and every existing response - stays
 * exactly as it was.
 */
export const getAssignmentCompletions = async (req, res, next) => {
  try {
    const assignments = await Assignment.find({
      user: { $in: await getVisibleUserIds(req.user) },
      completions: req.user._id,
    }).select('_id');
    res.json({ success: true, data: assignments.map((assignment) => assignment._id) });
  } catch (error) {
    next(error);
  }
};

/**
 * Tick an assignment off for the requester, or clear the tick if it is already
 * set.
 *
 * Only the requester's own id is added or removed, and `status` is not part of
 * the update, so a tick can never change the assignment for anyone else, for the
 * workspace, or for an administrator. Nothing is logged, notified or mailed:
 * it is a private note by one user about their own work.
 */
export const toggleAssignmentCompletion = async (req, res, next) => {
  try {
    // Read permission, not write permission: a user ticks the administrator's
    // assignments as well as their own, exactly as they can open them.
    const scope = { _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } };
    const existingAssignment = await Assignment.findOne(scope);
    if (!existingAssignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const ticked = existingAssignment.completions.some((id) => String(id) === String(req.user._id));
    const assignment = await Assignment.findOneAndUpdate(
      scope,
      ticked ? { $pull: { completions: req.user._id } } : { $addToSet: { completions: req.user._id } },
      // A tick is not an edit of the assignment, so the assignment's own updatedAt
      // is left exactly as it was: nothing about the shared record moves.
      { new: true, timestamps: false }
    );
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    res.json({ success: true, data: { completed: !ticked } });
  } catch (error) {
    next(error);
  }
};
