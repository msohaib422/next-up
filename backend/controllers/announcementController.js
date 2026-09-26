import Announcement from '../models/Announcement.js';
import Contribution from '../models/Contribution.js';
import { createActivity } from './activityController.js';
import { getVisibleUserIds, manageableRecordQuery } from '../utils/helpers.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryMetadata } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';
import { fileTooLargeMessage } from '../config/uploadLimits.js';
import { notifyAnnouncementPinned, notifyContentChange, notifyContributionUpdated, notifyContributorsOfDeletedEntity } from '../services/notificationService.js';

export const uploadAnnouncementFile = [
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
        message = fileTooLargeMessage;
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
    const query = { user: { $in: await getVisibleUserIds(req.user) } };

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
      .populate('contributor', 'name')
      .sort(sort);

    res.json({ success: true, count: announcements.length, data: announcements });
  } catch (error) {
    next(error);
  }
};

export const getAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } })
      .populate('user', 'name email')
      .populate('contributor', 'name');
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

    await notifyContentChange({ entityType: 'Announcement', entity: announcement, actor: req.user, action: 'added' });

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const updateAnnouncement = async (req, res, next) => {
  try {
    // Shared admin scope: pin/expire/edit/remove applies to content owned by
    // ANY admin, not only the admin who created it.
    const manageableQuery = await manageableRecordQuery(req.user, req.params.id);
    const existingAnnouncement = await Announcement.findOne(manageableQuery);
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

    const announcement = await Announcement.findOneAndUpdate(manageableQuery,
      updateFields,
      { new: true, runValidators: true }
    );

    if (announcement) {
      await notifyContributionUpdated({ entityType: 'Announcement', entity: announcement, admin: req.user });
      await notifyContentChange({ entityType: 'Announcement', entity: announcement, actor: req.user, action: 'updated' });
    }

    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    // Shared admin scope: pin/expire/edit/remove applies to content owned by
    // ANY admin, not only the admin who created it.
    const manageableQuery = await manageableRecordQuery(req.user, req.params.id);
    const announcement = await Announcement.findOne(manageableQuery);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    if (announcement.attachment?.publicId) {
      await deleteFromCloudinary({
        publicId: announcement.attachment.publicId,
        resourceType: announcement.attachment.resourceType || 'image',
      });
    }

    await notifyContributorsOfDeletedEntity({ entityType: 'Announcement', entityId: req.params.id, actor: req.user });

    await Announcement.findOneAndDelete(manageableQuery);

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

export const togglePin = async (req, res, next) => {
  try {
    // Shared admin scope: pin/expire/edit/remove applies to content owned by
    // ANY admin, not only the admin who created it.
    const manageableQuery = await manageableRecordQuery(req.user, req.params.id);
    const announcement = await Announcement.findOne(manageableQuery);
    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    const wasPinned = announcement.pinned;
    announcement.pinned = !announcement.pinned;
    await announcement.save();

    // Only after the pin is persisted, and only for the unpinned -> pinned
    // direction, so unpinning and a no-op toggle stay silent.
    if (!wasPinned && announcement.pinned) {
      await notifyAnnouncementPinned(announcement, req.user);
    }

    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const toggleSave = async (req, res, next) => {
  try {
    // Saving is per-user: anyone who can SEE the announcement may toggle their
    // own entry in savedBy, not only the admin who created it.
    const announcement = await Announcement.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } });
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
    // Shared admin scope: pin/expire/edit/remove applies to content owned by
    // ANY admin, not only the admin who created it.
    const manageableQuery = await manageableRecordQuery(req.user, req.params.id);
    const announcement = await Announcement.findOne(manageableQuery);
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
