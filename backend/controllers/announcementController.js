import Announcement from '../models/Announcement.js';
import { createActivity } from './activityController.js';

export const getAnnouncements = async (req, res, next) => {
  try {
    const { search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const announcements = await Announcement.find(query).sort(sort);
    res.json({ success: true, count: announcements.length, data: announcements });
  } catch (error) {
    next(error);
  }
};

export const getAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOne({ _id: req.params.id, user: req.user._id });
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    const { subject, title, description, date, createdBy } = req.body;
    const announcement = await Announcement.create({
      user: req.user._id,
      subject,
      title,
      description,
      date,
      createdBy,
    });

    await createActivity(req.user._id, 'announcement', `New announcement: ${title}`, '', 'Announcement', announcement._id);

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const updateAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
