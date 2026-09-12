import Activity from '../models/Activity.js';

export const getActivities = async (req, res, next) => {
  try {
    const activities = await Activity.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, count: activities.length, data: activities });
  } catch (error) {
    next(error);
  }
};

export const createActivity = async (userId, type, title, description = '', entityType = '', entityId = null) => {
  try {
    await Activity.create({
      user: userId,
      type,
      title,
      description,
      entityType,
      entityId,
    });
  } catch (error) {
    console.error('Error creating activity:', error.message);
  }
};
