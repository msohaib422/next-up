import Task from '../models/Task.js';
import Quiz from '../models/Quiz.js';
import Announcement from '../models/Announcement.js';
import ImportantDate from '../models/ImportantDate.js';

export const globalSearch = async (req, res, next) => {
  try {
    const { q, startDate, endDate } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, message: 'Please provide a search query' });
    }

    const searchRegex = { $regex: q, $options: 'i' };
    const dateFilter = {};

    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const textQuery = {
      $or: [
        { title: searchRegex },
        { subject: searchRegex },
        { description: searchRegex },
      ],
    };

    if (Object.keys(dateFilter).length > 0) {
      textQuery.createdAt = dateFilter;
    }

    const [tasks, quizzes, announcements, importantDates] =
      await Promise.all([
        Task.find({ user: req.user._id, ...textQuery }).limit(10),
        Quiz.find({ user: req.user._id, ...textQuery }).limit(10),
        Announcement.find({ user: req.user._id, ...textQuery }).limit(10),
        ImportantDate.find({ user: req.user._id, ...textQuery }).limit(10),
      ]);

    res.json({
      success: true,
      data: {
        tasks,
        quizzes,
        announcements,
        importantDates,
      },
    });
  } catch (error) {
    next(error);
  }
};
