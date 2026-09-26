import Essential from '../models/Essential.js';
import Contribution from '../models/Contribution.js';
import { createActivity } from './activityController.js';
import { getVisibleUserIds } from '../utils/helpers.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryMetadata } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';
import { notifyContentChange, notifyContributionUpdated, notifyContributorsOfDeletedEntity } from '../services/notificationService.js';

export const uploadEssentialFile = [
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
      const result = await uploadToCloudinary(req.file.buffer, 'essentials', safeName);

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

export const getEssentials = async (req, res, next) => {
  try {
    const { search, date, course, saved, sort = '-createdAt' } = req.query;
    const query = { user: { $in: await getVisibleUserIds(req.user) } };

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    }

    if (course && course !== 'all') {
      query.course = course;
    }

    if (saved === 'true') {
      query.savedBy = req.user._id;
    }

    const essentials = await Essential.find(query)
      .populate('user', 'name email')
      .populate('contributor', 'name')
      .sort(sort);

    res.json({ success: true, count: essentials.length, data: essentials });
  } catch (error) {
    next(error);
  }
};

export const getEssential = async (req, res, next) => {
  try {
    const essential = await Essential.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } })
      .populate('user', 'name email')
      .populate('contributor', 'name');
    if (!essential) {
      return res.status(404).json({ success: false, message: 'Essential not found' });
    }
    res.json({ success: true, data: essential });
  } catch (error) {
    next(error);
  }
};

export const createEssential = async (req, res, next) => {
  try {
    const { course, title, description, tag, attachment } = req.body;

    const trimmedCourse = typeof course === 'string' ? course.trim() : course;
    const trimmedTitle = typeof title === 'string' ? title.trim() : title;

    if (!trimmedCourse) {
      return res.status(400).json({ success: false, message: 'Please provide a course' });
    }
    if (!trimmedTitle) {
      return res.status(400).json({ success: false, message: 'Please provide a title' });
    }

    const essentialData = {
      user: req.user._id,
      course: trimmedCourse,
      title: trimmedTitle,
      description: typeof description === 'string' ? description.trim() : (description || ''),
      date: new Date(),
      tag: tag || 'Topic',
      createdBy: req.user.name,
      savedBy: [],
    };

    if (attachment && attachment.name && attachment.url) {
      essentialData.attachment = {
        name: attachment.name,
        url: attachment.url,
        type: attachment.type || '',
        publicId: attachment.publicId || '',
        resourceType: attachment.resourceType || '',
      };
    }

    const essential = await Essential.create(essentialData);

    await createActivity(req.user._id, 'essential', `New essential: ${title}`, '', 'Essential', essential._id);

    await notifyContentChange({ entityType: 'Essential', entity: essential, actor: req.user, action: 'added' });

    res.status(201).json({ success: true, data: essential });
  } catch (error) {
    next(error);
  }
};

export const updateEssential = async (req, res, next) => {
  try {
    const existingEssential = await Essential.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingEssential) {
      return res.status(404).json({ success: false, message: 'Essential not found' });
    }

    const { attachment: newAttachment, ...updateFields } = req.body;

    delete updateFields.date;
    delete updateFields.createdBy;

    if (updateFields.course !== undefined) {
      updateFields.course = typeof updateFields.course === 'string' ? updateFields.course.trim() : updateFields.course;
      if (!updateFields.course) {
        return res.status(400).json({ success: false, message: 'Please provide a course' });
      }
    }
    if (updateFields.title !== undefined) {
      updateFields.title = typeof updateFields.title === 'string' ? updateFields.title.trim() : updateFields.title;
      if (!updateFields.title) {
        return res.status(400).json({ success: false, message: 'Please provide a title' });
      }
    }
    if (updateFields.description !== undefined && typeof updateFields.description === 'string') {
      updateFields.description = updateFields.description.trim();
    }

    if (newAttachment && newAttachment.url && newAttachment.url !== existingEssential.attachment?.url) {
      if (existingEssential.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingEssential.attachment.publicId,
          resourceType: existingEssential.attachment.resourceType || 'image',
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
      if (existingEssential.attachment?.publicId) {
        await deleteFromCloudinary({
          publicId: existingEssential.attachment.publicId,
          resourceType: existingEssential.attachment.resourceType || 'image',
        });
      }
      updateFields.attachment = { name: '', url: '', type: '', publicId: '', resourceType: '' };
    }

    const essential = await Essential.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (essential) {
      await notifyContributionUpdated({ entityType: 'Essential', entity: essential, admin: req.user });
      await notifyContentChange({ entityType: 'Essential', entity: essential, actor: req.user, action: 'updated' });
    }

    res.json({ success: true, data: essential });
  } catch (error) {
    next(error);
  }
};

export const deleteEssential = async (req, res, next) => {
  try {
    const essential = await Essential.findOne({ _id: req.params.id, user: req.user._id });
    if (!essential) {
      return res.status(404).json({ success: false, message: 'Essential not found' });
    }

    if (essential.attachment?.publicId) {
      await deleteFromCloudinary({
        publicId: essential.attachment.publicId,
        resourceType: essential.attachment.resourceType || 'image',
      });
    }

    await notifyContributorsOfDeletedEntity({ entityType: 'Essential', entityId: req.params.id, actor: req.user });

    await Essential.findOneAndDelete({ _id: req.params.id, user: req.user._id });

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

export const toggleSave = async (req, res, next) => {
  try {
    // Saving is per-user: any user who can SEE the essential may toggle their
    // own entry in savedBy (same visibility scope as getEssential), not only
    // the creator — otherwise regular users could never save admin-created items.
    const essential = await Essential.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } });
    if (!essential) {
      return res.status(404).json({ success: false, message: 'Essential not found' });
    }

    const userId = req.user._id;
    const savedIndex = essential.savedBy.indexOf(userId);

    if (savedIndex > -1) {
      essential.savedBy.splice(savedIndex, 1);
    } else {
      essential.savedBy.push(userId);
    }
    await essential.save();

    res.json({ success: true, data: essential });
  } catch (error) {
    next(error);
  }
};
