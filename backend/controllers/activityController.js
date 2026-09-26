import Activity from '../models/Activity.js';
import { getVisibleUserIds } from '../utils/helpers.js';

export const getActivities = async (req, res, next) => {
  try {
    // The feed follows the same shared-owner rule as the content itself: an
    // admin sees the activity of every admin (it is all one workspace), a
    // normal user sees only their own.
    const activities = await Activity.find({ user: { $in: await getVisibleUserIds(req.user) } })
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
