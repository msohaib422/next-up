import Task from '../models/Task.js';
import Contribution from '../models/Contribution.js';
import { createActivity } from './activityController.js';
import { getVisibleUserIds } from '../utils/helpers.js';
import { notifyContentChange, notifyContributionUpdated, notifyContributorsOfDeletedEntity, notifyStatusChange } from '../services/notificationService.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryMetadata } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';

export const uploadTaskFile = [
  (req, res, next) => {
    console.log('[Upload] Multer middleware hit, Content-Type:', req.headers['content-type']);
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('[Upload] Multer error:', err.message, err.code);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'File is too large. Maximum size is 10 MB.' });
        }
        return res.status(400).json({ success: false, message: err.message || 'File upload failed.' });
      }
      console.log('[Upload] Multer success, file:', req.file?.originalname, req.file?.size);
      next();
    });
  },
  async (req, res, next) => {
    try {
      console.log('[Upload] Cloudinary upload handler hit');
      if (!req.file) {
        console.error('[Upload] No file on req after multer');
        return res.status(400).json({ success: false, message: 'No file provided.' });
      }
      const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      console.log('[Upload] Uploading to Cloudinary, folder: tasks, public_id:', safeName);
      const result = await uploadToCloudinary(req.file.buffer, 'tasks', safeName);
      console.log('[Upload] Cloudinary success:', result.secure_url);

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
      console.error('[Upload] Cloudinary upload error:', {
        message: error.message,
        name: error.name,
        http_code: error.http_code,
      });

      let message;
      if (error.message?.includes('Cloudinary configuration missing')) {
        message = 'Upload service is not configured. Please contact support.';
      } else if (error.http_code === 401 || error.message?.includes('authentication failed')) {
        message = 'Upload service authentication failed. Please contact support.';
      } else if (error.message?.includes('File too large') || error.code === 'LIMIT_FILE_SIZE') {
        message = 'File is too large. Maximum size is 10 MB.';
      } else {
        message = error.message || 'File upload to storage failed.';
      }

      res.status(500).json({ success: false, message });
    }
  }
];

export const getTasks = async (req, res, next) => {
  try {
    const { status, priority, search, sort = '-createdAt' } = req.query;
    const query = { user: { $in: await getVisibleUserIds(req.user) } };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: '^' + search, $options: 'i' } },
        { subject: { $regex: '^' + search, $options: 'i' } },
      ];
    }

    const tasks = await Task.find(query).populate('contributor', 'name').sort(sort);
    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
};

export const getTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } })
      .populate('contributor', 'name');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

export const createTask = async (req, res, next) => {
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

    const taskData = {
      user: req.user._id,
      subject,
      title,
      description,
      deadline: sanitizedDeadline,
      deadlineMode,
      priority,
      status,
    };

    if (attachment && attachment.name && attachment.url) {
      taskData.attachment = {
        name: attachment.name,
        url: attachment.url,
        type: attachment.type || '',
        publicId: attachment.publicId || '',
        resourceType: attachment.resourceType || '',
      };
    }

    const task = await Task.create(taskData);

    await createActivity(req.user._id, 'task_created', `Created task: ${title}`, '', 'Task', task._id);

    await notifyContentChange({ entityType: 'Task', entity: task, actor: req.user, action: 'added' });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const existingTask = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingTask) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const { attachment: newAttachment, ...updateFields } = req.body;

    if (newAttachment && newAttachment.url && newAttachment.url !== existingTask.attachment?.url) {
      if (existingTask.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingTask.attachment.publicId,
          resourceType: existingTask.attachment.resourceType || 'image',
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
      if (existingTask.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingTask.attachment.publicId,
          resourceType: existingTask.attachment.resourceType || 'image',
        });
      }
      updateFields.attachment = { name: '', url: '', type: '', publicId: '', resourceType: '' };
    }

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (task) {
      await notifyContributionUpdated({ entityType: 'Task', entity: task, admin: req.user });
      // Only a real complete <-> incomplete flip is worth a notification, and it
      // replaces the generic "updated" one so a single request never notifies twice.
      const wasCompleted = existingTask.status === 'Completed';
      if (wasCompleted !== (task.status === 'Completed')) {
        await notifyStatusChange({ entityType: 'Task', entity: task, owner: req.user, wasCompleted });
      } else {
        await notifyContentChange({ entityType: 'Task', entity: task, actor: req.user, action: 'updated' });
      }
    }

    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (task.attachment?.publicId) {
      await deleteFromCloudinary({
        publicId: task.attachment.publicId,
        resourceType: task.attachment.resourceType || 'image',
      });
    }

    await notifyContributorsOfDeletedEntity({ entityType: 'Task', entityId: req.params.id, actor: req.user });

    await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });

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

export const completeTask = async (req, res, next) => {
  try {
    const existingTask = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingTask) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status: 'Completed' },
      { new: true }
    );
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await createActivity(req.user._id, 'task_completed', `Completed task: ${task.title}`, '', 'Task', task._id);

    if (existingTask.status !== 'Completed') {
      await notifyStatusChange({ entityType: 'Task', entity: task, owner: req.user, wasCompleted: false });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};
