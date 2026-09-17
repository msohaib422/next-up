import Announcement from '../models/Announcement.js';
import { createActivity } from './activityController.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryMetadata } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';

export const uploadAnnouncementFile = [
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'File is too large. Maximum size is 10 MB.' });
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
      const result = await uploadToCloudinary(req.file.buffer, 'announcements', safeName);

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
        message = 'File is too large. Maximum size is 10 MB.';
      } else {
        message = error.message || 'File upload to storage failed.';
      }
      res.status(500).json({ success: false, message });
    }
  }
];

export const getAnnouncements = async (req, res, next) => {
  try {
    const { search, type, date, saved, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    if (saved === 'true') {
      query.savedBy = req.user._id;
    }

    const announcements = await Announcement.find(query)
      .populate('user', 'name email')
      .sort(sort);

    res.json({ success: true, count: announcements.length, data: announcements });
  } catch (error) {
    next(error);
  }
};

export const getAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOne({ _id: req.params.id, user: req.user._id })
      .populate('user', 'name email');
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
    const { title, description, type, date, attachment, link } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Please provide a title' });
    }
    if (!type) {
      return res.status(400).json({ success: false, message: 'Please provide a type' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'Please provide a date' });
    }

    const announcementData = {
      user: req.user._id,
      title,
      description: description || '',
      type,
      date,
      createdBy: req.user.name,
      savedBy: [],
    };

    if (attachment && attachment.name && attachment.url) {
      announcementData.attachment = {
        name: attachment.name,
        url: attachment.url,
        type: attachment.type || '',
        publicId: attachment.publicId || '',
        resourceType: attachment.resourceType || '',
      };
    }

    if (link) {
      announcementData.link = link;
    }

    const announcement = await Announcement.create(announcementData);

    await createActivity(req.user._id, 'announcement', `New announcement: ${title}`, '', 'Announcement', announcement._id);

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const updateAnnouncement = async (req, res, next) => {
  try {
    const existingAnnouncement = await Announcement.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingAnnouncement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    const { attachment: newAttachment, ...updateFields } = req.body;

    if (newAttachment && newAttachment.url && newAttachment.url !== existingAnnouncement.attachment?.url) {
      if (existingAnnouncement.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingAnnouncement.attachment.publicId,
          resourceType: existingAnnouncement.attachment.resourceType || 'image',
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
      if (existingAnnouncement.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingAnnouncement.attachment.publicId,
          resourceType: existingAnnouncement.attachment.resourceType || 'image',
        });
      }
      updateFields.attachment = { name: '', url: '', type: '', publicId: '', resourceType: '' };
    }

    const announcement = await Announcement.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOne({ _id: req.params.id, user: req.user._id });
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    if (announcement.attachment?.publicId) {
      await deleteFromCloudinary({
        publicId: announcement.attachment.publicId,
        resourceType: announcement.attachment.resourceType || 'image',
      });
    }

    await Announcement.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

export const togglePin = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOne({ _id: req.params.id, user: req.user._id });
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    announcement.pinned = !announcement.pinned;
    await announcement.save();

    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const toggleSave = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOne({ _id: req.params.id, user: req.user._id });
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    const userId = req.user._id;
    const savedIndex = announcement.savedBy.indexOf(userId);

    if (savedIndex > -1) {
      announcement.savedBy.splice(savedIndex, 1);
    } else {
      announcement.savedBy.push(userId);
    }
    await announcement.save();

    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const toggleExpire = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOne({ _id: req.params.id, user: req.user._id });
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    announcement.expired = !announcement.expired;
    await announcement.save();

    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};
