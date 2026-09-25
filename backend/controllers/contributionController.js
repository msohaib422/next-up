import Contribution from '../models/Contribution.js';
import Task from '../models/Task.js';
import Quiz from '../models/Quiz.js';
import Assignment from '../models/Assignment.js';
import Essential from '../models/Essential.js';
import Announcement from '../models/Announcement.js';

const MODELS = { Task, Quiz, Assignment, Essential, Announcement };
const TYPES = Object.keys(MODELS);
const DEADLINE_MODES = {
  Task: ['Date', 'Upcoming Lecture', 'As Possible'],
  Assignment: ['Date', 'Upcoming Lecture', 'As Possible'],
  Quiz: ['Date', 'Upcoming Lecture', 'Surprise'],
};
const ANNOUNCEMENT_TYPES = ['General', 'Academic', 'Assignment', 'Quiz', 'Task', 'Exam', 'Event'];

const text = (value, max = 5000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());

const normalizeContent = (type, input, title) => {
  const content = {
    title: text(input.title || title, 200),
    description: text(input.description),
    attachment: input.attachment && typeof input.attachment === 'object' ? input.attachment : null,
  };
  if (['Task', 'Quiz', 'Assignment'].includes(type)) {
    content.subject = text(input.subject, 200);
    content.deadlineMode = input.deadlineMode;
    content.priority = ['High', 'Medium', 'Low'].includes(input.priority) ? input.priority : 'Medium';
    if (content.deadlineMode === 'Date') content.date = validDate(input.date) ? new Date(input.date) : null;
    else content.date = null;
  }
  if (type === 'Essential') {
    content.course = text(input.course, 200);
    content.tag = text(input.tag, 80) || 'Topic';
  }
  if (type === 'Announcement') {
    content.type = ANNOUNCEMENT_TYPES.includes(input.type) ? input.type : 'General';
    content.date = validDate(input.date) ? new Date(input.date) : null;
    content.link = text(input.link, 2000);
  }
  return content;
};

const validateContent = (type, content) => {
  if (!content.title) return 'Title is required.';
  if (['Task', 'Quiz', 'Assignment'].includes(type) && !content.subject) return 'Course is required.';
  if (['Task', 'Quiz', 'Assignment'].includes(type) && !DEADLINE_MODES[type].includes(content.deadlineMode)) return 'Please select a valid deadline.';
  if (['Task', 'Quiz', 'Assignment'].includes(type) && content.deadlineMode === 'Date' && !content.date) return 'A due date is required.';
  if (type === 'Essential' && !content.course) return 'Course is required.';
  if (type === 'Announcement' && !content.date) return 'A date is required.';
  return null;
};

export const createContribution = async (req, res, next) => {
  try {
    const { type, title, content: rawContent } = req.body;
    if (!TYPES.includes(type) || !title?.trim() || !rawContent || typeof rawContent !== 'object' || Array.isArray(rawContent)) {
      return res.status(400).json({ success: false, message: 'Type, title and content are required.' });
    }
    const content = normalizeContent(type, rawContent, title);
    const validationError = validateContent(type, content);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    const contribution = await Contribution.create({ user: req.user._id, type, title: content.title, content, status: 'Pending' });
    res.status(201).json({ success: true, data: contribution, message: 'Contribution submitted successfully and is now waiting for admin review.' });
  } catch (error) { next(error); }
};

const buildStats = (rows) => {
  const stats = { total: 0, Pending: 0, Approved: 0, Rejected: 0 };
  rows.forEach((row) => { stats[row._id] = row.count; stats.total += row.count; });
  return stats;
};

export const getMyContributions = async (req, res, next) => {
  try {
    const query = { user: req.user._id };
    if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) query.status = req.query.status;
    const [data, counts] = await Promise.all([
      Contribution.find(query).sort({ createdAt: -1 }),
      Contribution.aggregate([{ $match: { user: req.user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    res.json({ success: true, data, stats: buildStats(counts) });
  } catch (error) { next(error); }
};

export const getContributionStats = async (req, res, next) => {
  try {
    const rows = await Contribution.aggregate([{ $match: { user: req.user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    res.json({ success: true, data: buildStats(rows) });
  } catch (error) { next(error); }
};

export const getContribution = async (req, res, next) => {
  try {
    const query = req.user.role === 'collaborator' ? { _id: req.params.id } : { _id: req.params.id, user: req.user._id };
    const contribution = await Contribution.findOne(query)
      .populate('user', 'name email')
      .populate('reviewedBy', 'name email');
    if (!contribution) return res.status(404).json({ success: false, message: 'Contribution not found.' });
    res.json({ success: true, data: contribution });
  } catch (error) { next(error); }
};

export const listContributions = async (req, res, next) => {
  try {
    const query = {};
    if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) query.status = req.query.status;
    if (TYPES.includes(req.query.type)) query.type = req.query.type;
    if (req.query.search) {
      const search = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ title: search }, { 'user.name': search }];
    }
    const [data, rows] = await Promise.all([
      Contribution.find(query)
        .populate('user', 'name email')
        .populate('reviewedBy', 'name email')
        .sort({ createdAt: -1 }),
      Contribution.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    res.json({ success: true, data, stats: buildStats(rows) });
  } catch (error) { next(error); }
};

export const approveContribution = async (req, res, next) => {
  let contribution;
  try {
    // Claim the record atomically so two simultaneous approval requests cannot publish twice.
    contribution = await Contribution.findOneAndUpdate(
      { _id: req.params.id, status: 'Pending' },
      { $set: { status: 'Approved', reviewedBy: req.user._id, reviewedAt: new Date() } },
      { new: true }
    );
    if (!contribution) return res.status(409).json({ success: false, message: 'Contribution was already reviewed.' });
    const data = { ...contribution.content };
    if (['Task', 'Assignment'].includes(contribution.type) && data.deadlineMode === 'Date') {
      data.deadline = data.date;
      delete data.date;
    }
    delete data.status;
    delete data.approvalStatus;
    delete data.reviewedBy;
    delete data.reviewedAt;
    delete data.rejectionReason;
    if (contribution.type === 'Quiz') {
      data.isSurprise = data.deadlineMode === 'Surprise';
    }
    if (contribution.type === 'Assignment') {
      data.approvalStatus = 'Approved';
    }
    const entity = await MODELS[contribution.type].create({
      ...data,
      user: req.user._id,
      contributor: contribution.user,
    });
    contribution.finalEntity = entity._id;
    await contribution.save();
    await contribution.populate('user', 'name email');
    res.json({ success: true, data: contribution, message: 'Contribution approved and published.' });
  } catch (error) {
    if (contribution) {
      await Contribution.findOneAndUpdate(
        { _id: contribution._id, status: 'Approved', finalEntity: null },
        { $set: { status: 'Pending', reviewedBy: null, reviewedAt: null } }
      ).catch(() => {});
    }
    next(error);
  }
};

export const rejectContribution = async (req, res, next) => {
  try {
    const reason = text(req.body?.rejectionReason, 2000);
    const contribution = await Contribution.findOneAndUpdate(
      { _id: req.params.id, status: 'Pending' },
      { $set: { status: 'Rejected', rejectionReason: reason, reviewedBy: req.user._id, reviewedAt: new Date() } },
      { new: true }
    );
    if (!contribution) return res.status(409).json({ success: false, message: 'Contribution was already reviewed.' });
    res.json({ success: true, data: contribution, message: 'Contribution rejected.' });
  } catch (error) { next(error); }
};
