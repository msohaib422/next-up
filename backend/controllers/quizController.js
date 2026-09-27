import Quiz from '../models/Quiz.js';
import Contribution from '../models/Contribution.js';
import { createActivity } from './activityController.js';
import { getVisibleUserIds, getWritableUserIds } from '../utils/helpers.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryMetadata } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';
import { fileTooLargeMessage } from '../config/uploadLimits.js';
import { notifyContentChange, notifyContributionUpdated, notifyContributorsOfDeletedEntity, notifyStatusChange } from '../services/notificationService.js';

export const uploadQuizFile = [
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
      const result = await uploadToCloudinary(req.file.buffer, 'quizzes', safeName);

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

export const getQuizzes = async (req, res, next) => {
  try {
    const { status, priority, subject, search, sort = '-createdAt' } = req.query;
    const query = { user: { $in: await getVisibleUserIds(req.user) } };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (subject) query.subject = subject;
    if (search) {
      query.$or = [
        { title: { $regex: '^' + search, $options: 'i' } },
        { subject: { $regex: '^' + search, $options: 'i' } },
      ];
    }

    const quizzes = await Quiz.find(query).populate('contributor', 'name').sort(sort);
    res.json({ success: true, count: quizzes.length, data: quizzes });
  } catch (error) {
    next(error);
  }
};

export const getQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } })
      .populate('contributor', 'name');
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    res.json({ success: true, data: quiz });
  } catch (error) {
    next(error);
  }
};

export const createQuiz = async (req, res, next) => {
  try {
    const { subject, title, description, date, deadlineMode, priority, status, attachment } = req.body;

    const validModes = ['Date', 'Upcoming Lecture', 'Surprise'];
    if (!deadlineMode || !validModes.includes(deadlineMode)) {
      return res.status(400).json({ success: false, message: 'Please select a deadline.' });
    }
    if (deadlineMode === 'Date' && !date) {
      return res.status(400).json({ success: false, message: 'Please select a date.' });
    }

    const sanitizedDate = deadlineMode === 'Date' && date ? date : null;
    const isSurprise = deadlineMode === 'Surprise';

    const quizData = {
      user: req.user._id,
      subject,
      title,
      description,
      date: sanitizedDate,
      deadlineMode,
      priority,
      status: status || 'Pending',
      isSurprise,
    };

    if (attachment && attachment.name && attachment.url) {
      quizData.attachment = {
        name: attachment.name,
        url: attachment.url,
        type: attachment.type || '',
        publicId: attachment.publicId || '',
        resourceType: attachment.resourceType || '',
      };
    }

    const quiz = await Quiz.create(quizData);

    await createActivity(req.user._id, 'quiz_created', `Created quiz: ${title}`, '', 'Quiz', quiz._id);

    await notifyContentChange({ entityType: 'Quiz', entity: quiz, actor: req.user, action: 'added' });

    res.status(201).json({ success: true, data: quiz });
  } catch (error) {
    next(error);
  }
};

export const updateQuiz = async (req, res, next) => {
  try {
    const existingQuiz = await Quiz.findOne({ _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } });
    if (!existingQuiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    const { attachment: newAttachment, date: newDate, deadlineMode: newDeadlineMode, ...updateFields } = req.body;

    if (newDeadlineMode) {
      const validModes = ['Date', 'Upcoming Lecture', 'Surprise'];
      if (!validModes.includes(newDeadlineMode)) {
        return res.status(400).json({ success: false, message: 'Invalid deadline mode.' });
      }
      updateFields.deadlineMode = newDeadlineMode;
      updateFields.date = newDeadlineMode === 'Date' && newDate ? newDate : null;
      updateFields.isSurprise = newDeadlineMode === 'Surprise';
    }

    if (newAttachment && newAttachment.url && newAttachment.url !== existingQuiz.attachment?.url) {
      if (existingQuiz.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingQuiz.attachment.publicId,
          resourceType: existingQuiz.attachment.resourceType || 'image',
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
      if (existingQuiz.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingQuiz.attachment.publicId,
          resourceType: existingQuiz.attachment.resourceType || 'image',
        });
      }
      updateFields.attachment = { name: '', url: '', type: '', publicId: '', resourceType: '' };
    }

    const quiz = await Quiz.findOneAndUpdate(
      { _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } },
      updateFields,
      { new: true, runValidators: true }
    );

    if (quiz) {
      await notifyContributionUpdated({ entityType: 'Quiz', entity: quiz, admin: req.user });
      // Only a real complete <-> incomplete flip is worth a notification, and it
      // replaces the generic "updated" one so a single request never notifies twice.
      const wasCompleted = existingQuiz.status === 'Completed';
      if (wasCompleted !== (quiz.status === 'Completed')) {
        await notifyStatusChange({ entityType: 'Quiz', entity: quiz, owner: req.user, wasCompleted });
      } else {
        await notifyContentChange({ entityType: 'Quiz', entity: quiz, actor: req.user, action: 'updated' });
      }
    }

    res.json({ success: true, data: quiz });
  } catch (error) {
    next(error);
  }
};

export const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } });
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    if (quiz.attachment?.publicId) {
      await deleteFromCloudinary({
        publicId: quiz.attachment.publicId,
        resourceType: quiz.attachment.resourceType || 'image',
      });
    }

    await notifyContributorsOfDeletedEntity({ entityType: 'Quiz', entityId: req.params.id, actor: req.user });

    await Quiz.findOneAndDelete({ _id: req.params.id, user: { $in: await getWritableUserIds(req.user) } });

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
