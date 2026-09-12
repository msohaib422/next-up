import Lecture from '../models/Lecture.js';
import { createActivity } from './activityController.js';
import { getCurrentDay, getCurrentTime } from '../utils/helpers.js';

export const getLectures = async (req, res, next) => {
  try {
    const { day, search, sort = 'day' } = req.query;
    const query = { user: req.user._id };

    if (day) query.day = day;
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { teacher: { $regex: search, $options: 'i' } },
        { classroom: { $regex: search, $options: 'i' } },
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
    const { subject, teacher, classroom, day, startTime, endTime } = req.body;
    const lecture = await Lecture.create({
      user: req.user._id,
      subject,
      teacher,
      classroom,
      day,
      startTime,
      endTime,
    });

    await createActivity(req.user._id, 'lecture_added', `Added lecture: ${subject} on ${day}`, '', 'Lecture', lecture._id);

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

export const getTimetable = async (req, res, next) => {
  try {
    const lectures = await Lecture.find({ user: req.user._id }).sort('day startTime');
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const grouped = {};

    dayOrder.forEach((day) => {
      grouped[day] = lectures.filter((l) => l.day === day);
    });

    res.json({ success: true, data: grouped });
  } catch (error) {
    next(error);
  }
};

export const getTodayLectures = async (req, res, next) => {
  try {
    const currentDay = getCurrentDay();
    const lectures = await Lecture.find({ user: req.user._id, day: currentDay }).sort('startTime');
    res.json({ success: true, count: lectures.length, data: lectures });
  } catch (error) {
    next(error);
  }
};

export const getCurrentLecture = async (req, res, next) => {
  try {
    const currentDay = getCurrentDay();
    const currentTime = getCurrentTime();

    const lectures = await Lecture.find({ user: req.user._id, day: currentDay }).sort('startTime');

    let current = null;
    let nextLecture = null;
    let status = 'No lecture';

    for (const lecture of lectures) {
      if (currentTime >= lecture.startTime && currentTime <= lecture.endTime) {
        current = lecture;
        status = 'In Progress';
        break;
      } else if (currentTime < lecture.startTime && !nextLecture) {
        nextLecture = lecture;
        status = 'Upcoming';
      }
    }

    res.json({
      success: true,
      data: {
        current,
        next: nextLecture,
        status,
      },
    });
  } catch (error) {
    next(error);
  }
};
