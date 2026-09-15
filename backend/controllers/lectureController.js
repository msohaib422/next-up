import Lecture from '../models/Lecture.js';
import { createActivity } from './activityController.js';

export const getLectures = async (req, res, next) => {
  try {
    const { search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
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
    const { subject, timeline, notes, fileUrl, fileName, fileType } = req.body;
    const lecture = await Lecture.create({
      user: req.user._id,
      subject,
      timeline,
      notes,
      fileUrl,
      fileName,
      fileType,
    });

    await createActivity(req.user._id, 'lecture_added', `Added timetable: ${subject}`, '', 'Lecture', lecture._id);

    res.status(201).json({ success: true, data: lecture });
  } catch (error) {
    next(error);
  }
};

export const updateLecture = async (req, res, next) => {
  try {
    const lecture = await Lecture.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!lecture) {
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }
    res.json({ success: true, data: lecture });
  } catch (error) {
    next(error);
  }
};

export const deleteLecture = async (req, res, next) => {
  try {
    const lecture = await Lecture.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!lecture) {
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
