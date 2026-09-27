import Notification from '../models/Notification.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const POPOVER_LIMIT = 5;

const toClient = (notification) => ({
  id: notification._id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  link: notification.link || '',
  entityType: notification.entityType || '',
  entityId: notification.entityId || null,
  read: notification.read,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
  actor: notification.actor ? { _id: notification.actor._id, name: notification.actor.name } : null,
  metadata: notification.metadata || {},
});

/**
 * GET /api/notifications
 * Lists only the authenticated user's notifications (admin or regular user).
 * Sorted newest first, paginated, filterable by read state.
 */
export const getNotifications = async (req, res, next) => {
  try {
    const { filter = 'all' } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    // The recipient is always taken from the token, never from the request.
    const query = { recipient: req.user._id };
    if (filter === 'unread') query.read = false;
    if (filter === 'read') query.read = true;

    const [data, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Notification.countDocuments(query),
      Notification.countDocuments({ recipient: req.user._id, read: false }),
    ]);

    res.json({
      success: true,
      data: data.map(toClient),
      unreadCount,
      pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1), hasMore: page * limit < total },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/notifications/recent — small payload for the header popover. */
export const getRecentNotifications = async (req, res, next) => {
  try {
    const [data, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(POPOVER_LIMIT),
      Notification.countDocuments({ recipient: req.user._id, read: false }),
    ]);
    res.json({ success: true, data: data.map(toClient), unreadCount });
  } catch (error) {
    next(error);
  }
};

/** GET /api/notifications/unread-count */
export const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, read: false });
    res.json({ success: true, data: { unreadCount }, unreadCount });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/notifications/:id/read  (body: { read: true | false }) */
export const setNotificationRead = async (req, res, next) => {
  try {
    const read = req.body?.read !== false;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { read, readAt: read ? new Date() : null } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, read: false });
    res.json({ success: true, data: toClient(notification), unreadCount });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/notifications/read-all */
export const markAllAsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ success: true, data: { updated: result.modifiedCount || 0 }, unreadCount: 0 });
  } catch (error) {
    next(error);
  }
};
