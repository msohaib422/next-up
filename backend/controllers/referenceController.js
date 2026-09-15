import Reference from '../models/Reference.js';
import { createActivity } from './activityController.js';
import { deleteFromCloudinary } from '../services/cloudinary.js';

export const getReferences = async (req, res, next) => {
  try {
    const { subject, fileType, search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (subject) query.subject = subject;
    if (fileType) query.fileType = fileType;
    if (search) {
      query.$or = [
        { topic: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const references = await Reference.find(query).sort(sort);
    res.json({ success: true, count: references.length, data: references });
  } catch (error) {
    next(error);
  }
};

export const getReference = async (req, res, next) => {
  try {
    const reference = await Reference.findOne({ _id: req.params.id, user: req.user._id });
    if (!reference) {
      return res.status(404).json({ success: false, message: 'Reference not found' });
    }
    res.json({ success: true, data: reference });
  } catch (error) {
    next(error);
  }
};

export const createReference = async (req, res, next) => {
  try {
    const { subject, topic, description, date, fileType, fileUrl, fileName, fileKey, storageType, publicId, resourceType } = req.body;
    const reference = await Reference.create({
      user: req.user._id,
      subject,
      topic,
      description,
      date,
      fileType,
      fileUrl,
      fileName,
      fileKey,
      storageType,
      publicId: publicId || '',
      resourceType: resourceType || '',
    });

    await createActivity(req.user._id, 'reference_added', `Added reference: ${topic}`, '', 'Reference', reference._id);

    res.status(201).json({ success: true, data: reference });
  } catch (error) {
    next(error);
  }
};

export const updateReference = async (req, res, next) => {
  try {
    const existing = await Reference.findOne({ _id: req.params.id, user: req.user._id });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Reference not found' });
    }

    const { fileUrl: newFileUrl, publicId: newPublicId, resourceType: newResourceType, ...updateFields } = req.body;

    if (newFileUrl && newFileUrl !== existing.fileUrl) {
      if (existing.publicId) {
        await deleteFromCloudinary({
          publicId: existing.publicId,
          resourceType: existing.resourceType || 'image',
        });
      }
      updateFields.fileUrl = newFileUrl;
      updateFields.publicId = newPublicId || '';
      updateFields.resourceType = newResourceType || '';
    }

    const reference = await Reference.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: reference });
  } catch (error) {
    next(error);
  }
};

export const deleteReference = async (req, res, next) => {
  try {
    const reference = await Reference.findOne({ _id: req.params.id, user: req.user._id });
    if (!reference) {
      return res.status(404).json({ success: false, message: 'Reference not found' });
    }

    if (reference.publicId) {
      await deleteFromCloudinary({
        publicId: reference.publicId,
        resourceType: reference.resourceType || 'image',
      });
    }

    await Reference.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
