import ImportantDate from '../models/ImportantDate.js';
import { createActivity } from './activityController.js';
import { getVisibleUserIds } from '../utils/helpers.js';

export const getImportantDates = async (req, res, next) => {
  try {
    const { type, priority, search, sort = '-createdAt' } = req.query;
    const query = { user: { $in: await getVisibleUserIds(req.user) } };

    if (type) query.type = type;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const dates = await ImportantDate.find(query).sort(sort);
    res.json({ success: true, count: dates.length, data: dates });
  } catch (error) {
    next(error);
  }
};

export const getImportantDate = async (req, res, next) => {
  try {
    const date = await ImportantDate.findOne({ _id: req.params.id, user: { $in: await getVisibleUserIds(req.user) } });
    if (!date) {
      return res.status(404).json({ success: false, message: 'Important date not found' });
    }
    res.json({ success: true, data: date });
  } catch (error) {
    next(error);
  }
};

export const createImportantDate = async (req, res, next) => {
  try {
    const { title, date, type, description, priority } = req.body;
    const importantDate = await ImportantDate.create({
      user: req.user._id,
      title,
      date,
      type,
      description,
      priority,
    });

    await createActivity(req.user._id, 'important_date_added', `Added important date: ${title}`, '', 'ImportantDate', importantDate._id);

    res.status(201).json({ success: true, data: importantDate });
  } catch (error) {
    next(error);
  }
};

export const updateImportantDate = async (req, res, next) => {
  try {
    const date = await ImportantDate.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!date) {
      return res.status(404).json({ success: false, message: 'Important date not found' });
    }
    res.json({ success: true, data: date });
  } catch (error) {
    next(error);
  }
};

export const deleteImportantDate = async (req, res, next) => {
  try {
    const date = await ImportantDate.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!date) {
      return res.status(404).json({ success: false, message: 'Important date not found' });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
