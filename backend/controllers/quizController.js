import Quiz from '../models/Quiz.js';
import { createActivity } from './activityController.js';

export const getQuizzes = async (req, res, next) => {
  try {
    const { status, priority, subject, search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (subject) query.subject = subject;
    if (search) {
      query.$or = [
        { title: { $regex: '^' + search, $options: 'i' } },
        { subject: { $regex: '^' + search, $options: 'i' } },
      ];
    }

    const quizzes = await Quiz.find(query).sort(sort);
    res.json({ success: true, count: quizzes.length, data: quizzes });
  } catch (error) {
    next(error);
  }
};

export const getQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    res.json({ success: true, data: quiz });
  } catch (error) {
    next(error);
  }
};

export const createQuiz = async (req, res, next) => {
  try {
    const { subject, title, description, date, deadlineMode, priority, status } = req.body;

    const validModes = ['Date', 'Upcoming Lecture', 'Surprise'];
    if (!deadlineMode || !validModes.includes(deadlineMode)) {
      return res.status(400).json({ success: false, message: 'Please select a deadline.' });
    }
    if (deadlineMode === 'Date' && !date) {
      return res.status(400).json({ success: false, message: 'Please select a date.' });
    }

    const sanitizedDate = deadlineMode === 'Date' && date ? date : null;
    const isSurprise = deadlineMode === 'Surprise';

    const quiz = await Quiz.create({
      user: req.user._id,
      subject,
      title,
      description,
      date: sanitizedDate,
      deadlineMode,
      priority,
      status: status || 'Pending',
      isSurprise,
    });

    await createActivity(req.user._id, 'quiz_created', `Created quiz: ${title}`, '', 'Quiz', quiz._id);

    res.status(201).json({ success: true, data: quiz });
  } catch (error) {
    next(error);
  }
};

export const updateQuiz = async (req, res, next) => {
  try {
    const { date: newDate, deadlineMode: newDeadlineMode, ...updateFields } = req.body;

    if (newDeadlineMode) {
      const validModes = ['Date', 'Upcoming Lecture', 'Surprise'];
      if (!validModes.includes(newDeadlineMode)) {
        return res.status(400).json({ success: false, message: 'Invalid deadline mode.' });
      }
      updateFields.deadlineMode = newDeadlineMode;
      updateFields.date = newDeadlineMode === 'Date' && newDate ? newDate : null;
      updateFields.isSurprise = newDeadlineMode === 'Surprise';
    }

    const quiz = await Quiz.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    res.json({ success: true, data: quiz });
  } catch (error) {
    next(error);
  }
};

export const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
