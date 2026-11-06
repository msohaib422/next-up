import Task from '../models/Task.js';
import Quiz from '../models/Quiz.js';
import Assignment from '../models/Assignment.js';
import Contribution from '../models/Contribution.js';

const MODEL_MAP = {
  task: Task,
  quiz: Quiz,
  assignment: Assignment,
};

const TYPE_LABEL = {
  task: 'Task',
  quiz: 'Quiz',
  assignment: 'Assignment',
};

const TASK_MODES = ['Date', 'Upcoming Lecture', 'As Possible'];
const QUIZ_MODES = ['Date', 'Upcoming Lecture', 'Surprise'];

const normalizeKey = (value) => {
  if (!value) return '';
  const v = String(value).trim().toLowerCase();
  if (v === 'tasks' || v === 'task') return 'task';
  if (v === 'quizzes' || v === 'quiz') return 'quiz';
  if (v === 'assignments' || v === 'assignment') return 'assignment';
  return v;
};

const ensureMode = (mode, hasDate, target) => {
  const modes = target === 'quiz' ? QUIZ_MODES : TASK_MODES;
  if (modes.includes(mode) && (mode !== 'Date' || hasDate)) return mode;
  if (hasDate) return 'Date';
  if (modes.includes('Upcoming Lecture')) return 'Upcoming Lecture';
  return modes[0];
};

const cloneAttachment = (attachment) => {
  if (!attachment) return { name: '', url: '', type: '', publicId: '', resourceType: '' };
  return {
    name: attachment.name || '',
    url: attachment.url || '',
    type: attachment.type || '',
    publicId: attachment.publicId || '',
    resourceType: attachment.resourceType || '',
  };
};

const performMove = async ({ from, to, id }) => {
  const fromKey = normalizeKey(from);
  const toKey = normalizeKey(to);

  if (!MODEL_MAP[fromKey] || !MODEL_MAP[toKey]) {
    const err = new Error('Invalid source or destination category');
    err.status = 400;
    throw err;
  }
  if (fromKey === toKey) {
    const err = new Error('Source and destination categories must be different');
    err.status = 400;
    throw err;
  }

  const SourceModel = MODEL_MAP[fromKey];
  const DestModel = MODEL_MAP[toKey];

  const item = await SourceModel.findById(id);
  if (!item) {
    const err = new Error(`${TYPE_LABEL[fromKey]} not found`);
    err.status = 404;
    throw err;
  }

  const destStatuses =
    toKey === 'quiz'
      ? ['Pending', 'Postponed', 'Completed']
      : ['Pending', 'In Progress', 'Completed', 'Overdue'];

  let status = item.status;
  if (!destStatuses.includes(status)) {
    if (toKey === 'quiz') {
      status = status === 'Completed' ? 'Completed' : 'Pending';
    } else {
      status = status === 'Completed' ? 'Completed' : status === 'Postponed' ? 'Pending' : status;
      if (!destStatuses.includes(status)) status = 'Pending';
    }
  }

  const base = {
    _id: item._id,
    user: item.user,
    contributor: item.contributor,
    subject: item.subject,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status,
    attachment: cloneAttachment(item.attachment),
    link: item.link || '',
    completions: Array.isArray(item.completions) ? item.completions : [],
  };

  if (toKey === 'quiz') {
    let date = null;
    if (fromKey === 'quiz') date = item.date || null;
    else date = item.deadline || null;

    let time = item.time || '';
    if (!time && date && fromKey !== 'quiz') {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        if (hh !== '00' || mm !== '00') time = `${hh}:${mm}`;
      }
    }
    const deadlineMode = ensureMode(item.deadlineMode, !!date, 'quiz');
    base.date = date;
    base.time = time;
    base.deadlineMode = deadlineMode;
    base.isSurprise = fromKey === 'quiz' ? !!item.isSurprise : false;
  } else {
    let deadline = null;
    if (fromKey === 'quiz') deadline = item.date || null;
    else deadline = item.deadline || null;
    const deadlineMode = ensureMode(item.deadlineMode, !!deadline, 'task');
    base.deadline = deadline;
    base.deadlineMode = deadlineMode;

    if (toKey === 'assignment') {
      // Admin-performed moves must be published (Approved) so the item is
      // visible in the Assignments list, which only shows Approved items.
      // Preserve an explicit approval state when present (e.g. moving an
      // existing assignment), and default to Approved for any other source.
      base.approvalStatus = item.approvalStatus || 'Approved';
      base.reviewedBy = item.reviewedBy || null;
      base.reviewedAt = item.reviewedAt || null;
      base.rejectionReason = item.rejectionReason || '';
    }
  }

  let created;
  try {
    created = await DestModel.create(base);
  } catch (error) {
    throw error;
  }

  // Preserve original timestamps as well, via the raw collection so Mongoose's
  // timestamp plugin does not overwrite them.
  try {
    if (item.createdAt || item.updatedAt) {
      const set = {};
      if (item.createdAt) set.createdAt = item.createdAt;
      if (item.updatedAt) set.updatedAt = item.updatedAt;
      await DestModel.collection.updateOne({ _id: created._id }, { $set: set });
      if (item.createdAt) created.createdAt = item.createdAt;
      if (item.updatedAt) created.updatedAt = item.updatedAt;
    }
  } catch (error) {
    // non-fatal
  }

  try {
    await SourceModel.deleteOne({ _id: item._id });
  } catch (error) {
    try { await DestModel.deleteOne({ _id: created._id }); } catch (e) {}
    throw error;
  }

  try {
    await Contribution.updateMany(
      { finalEntity: item._id },
      { $set: { type: TYPE_LABEL[toKey] } }
    );
  } catch (error) {
    // non-fatal
  }

  return created;
};

const handle = (fromOverride = null) => async (req, res, next) => {
  try {
    const id = req.params?.id || req.body?.id || req.body?.itemId || req.body?._id;
    const from = fromOverride || req.params?.from || req.body?.from || req.body?.sourceType || req.body?.source || req.body?.sourceCategory;
    const to = req.params?.to || req.body?.to || req.body?.destination || req.body?.target || req.body?.targetCategory || req.body?.destinationCategory;

    if (req.user?.role !== 'collaborator') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const created = await performMove({ from, to, id });
    res.json({ success: true, data: created, movedTo: normalizeKey(to) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const moveItem = handle();
export const moveTask = handle('task');
export const moveQuiz = handle('quiz');
export const moveAssignment = handle('assignment');
