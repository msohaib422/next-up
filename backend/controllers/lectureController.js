import Lecture from '../models/Lecture.js';
import { createActivity } from './activityController.js';
import { uploadToCloudinary, deleteFromCloudinary, extractCloudinaryMetadata } from '../services/cloudinary.js';
import upload from '../middleware/upload.js';

export const uploadLectureFile = [
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
      const result = await uploadToCloudinary(req.file.buffer, 'timetable', safeName);

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

export const getLectures = async (req, res, next) => {
  try {
    const { search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (search) {
      query.$or = [
        { subject: { $regex: '^' + search, $options: 'i' } },
      ];
    }

    const lectures = await Lecture.find(query).sort(sort);
    res.json({ success: true, count: lectures.length, data: lectures });
  } catch (error) {
    next(error);
  }
};

export const getLecture = async (req, res, next) => {
  try {
    const lecture = await Lecture.findOne({ _id: req.params.id, user: req.user._id });
    if (!lecture) {
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }
    res.json({ success: true, data: lecture });
  } catch (error) {
    next(error);
  }
};

export const createLecture = async (req, res, next) => {
  try {
    const { subject, timeline, notes, fileUrl, fileName, fileType, publicId, resourceType } = req.body;
    const lecture = await Lecture.create({
      user: req.user._id,
      subject,
      timeline,
      notes,
      fileUrl,
      fileName,
      fileType,
      publicId,
      resourceType,
    });

    await createActivity(req.user._id, 'lecture_added', `Added timetable: ${subject}`, '', 'Lecture', lecture._id);

    res.status(201).json({ success: true, data: lecture });
  } catch (error) {
    next(error);
  }
};

export const updateLecture = async (req, res, next) => {
  try {
    const existingLecture = await Lecture.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingLecture) {
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }

    const { publicId: newPublicId, ...updateFields } = req.body;

    if (newPublicId && newPublicId !== existingLecture.publicId) {
      if (existingLecture.publicId) {
        await deleteFromCloudinary({
          publicId: existingLecture.publicId,
          resourceType: existingLecture.resourceType || 'image',
        });
      }
      updateFields.publicId = newPublicId;
      updateFields.resourceType = req.body.resourceType || 'image';
    } else if (req.body.fileUrl === '' || req.body.fileUrl === null) {
      if (existingLecture.publicId) {
        await deleteFromCloudinary({
          publicId: existingLecture.publicId,
          resourceType: existingLecture.resourceType || 'image',
        });
      }
      updateFields.publicId = '';
      updateFields.resourceType = '';
    }

    const lecture = await Lecture.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: lecture });
  } catch (error) {
    next(error);
  }
};

export const deleteLecture = async (req, res, next) => {
  try {
    const lecture = await Lecture.findOne({ _id: req.params.id, user: req.user._id });
    if (!lecture) {
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }

    if (lecture.publicId) {
      await deleteFromCloudinary({
        publicId: lecture.publicId,
        resourceType: lecture.resourceType || 'image',
      });
    }

    await Lecture.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
