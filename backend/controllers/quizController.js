import Quiz from '../models/Quiz.js';
import { createActivity } from './activityController.js';

export const getQuizzes = async (req, res, next) => {
  try {
    const { status, priority, search, sort = '-createdAt' } = req.query;
    const query = { user: req.user._id };

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
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
    const { subject, title, description, date, time, priority, status, isSurprise } = req.body;
    const quiz = await Quiz.create({
      user: req.user._id,
      subject,
      title,
      description,
      date,
      time,
      priority,
      status,
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
    const quiz = await Quiz.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
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
