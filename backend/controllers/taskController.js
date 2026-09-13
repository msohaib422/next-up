import Task from '../models/Task.js';
import { createActivity } from './activityController.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';

export const uploadTaskFile = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file provided.' });
      }
      const result = await uploadToCloudinary(req.file.buffer, 'tasks', `${Date.now()}-${req.file.originalname}`);
      res.json({
        success: true,
        data: {
          name: req.file.originalname,
          url: result.secure_url,
          type: req.file.mimetype,
        },
      });
    } catch (error) {
      next(error);
    }
  }
];

export const getTasks = async (req, res, next) => {
  try {
    const { status, priority, search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const tasks = await Task.find(query).sort(sort);
    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (error) {
    next(error);
  }
};

export const getTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
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
      };
    }

    const task = await Task.create(taskData);

    await createActivity(req.user._id, 'task_created', `Created task: ${title}`, '', 'Task', task._id);

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

export const completeTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status: 'Completed' },
      { new: true }
    );
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await createActivity(req.user._id, 'task_completed', `Completed task: ${task.title}`, '', 'Task', task._id);

    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};
