import Reminder from '../models/Reminder.js';
import { createActivity } from './activityController.js';

export const getReminders = async (req, res, next) => {
  try {
    const { status, priority, type, search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const reminders = await Reminder.find(query).sort(sort);
    res.json({ success: true, count: reminders.length, data: reminders });
  } catch (error) {
    next(error);
  }
};

export const getReminder = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOne({ _id: req.params.id, user: req.user._id });
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }
    res.json({ success: true, data: reminder });
  } catch (error) {
    next(error);
  }
};

export const createReminder = async (req, res, next) => {
  try {
    const { subject, title, description, date, time, type, priority, status } = req.body;
    const reminder = await Reminder.create({
      user: req.user._id,
      subject,
      title,
      description,
      date,
      time,
      type,
      priority,
      status,
    });

    await createActivity(req.user._id, 'reminder_created', `Created reminder: ${title}`, '', 'Reminder', reminder._id);

    res.status(201).json({ success: true, data: reminder });
  } catch (error) {
    next(error);
  }
};

export const updateReminder = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }
    res.json({ success: true, data: reminder });
  } catch (error) {
    next(error);
  }
};

export const deleteReminder = async (req, res, next) => {
  try {
    const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
