import Contribution from '../models/Contribution.js';
import Task from '../models/Task.js';
import Quiz from '../models/Quiz.js';
import Assignment from '../models/Assignment.js';
import Essential from '../models/Essential.js';
import Announcement from '../models/Announcement.js';

const MODELS = { Task, Quiz, Assignment, Essential, Announcement };
const TYPES = Object.keys(MODELS);
const titleOf = (content) => content?.title || content?.course || 'Untitled contribution';
const clean = (value) => value === undefined ? undefined : value;

export const createContribution = async (req, res, next) => {
  try {
    const { type, title, content } = req.body;
    if (!TYPES.includes(type) || !title?.trim() || !content || typeof content !== 'object') {
      return res.status(400).json({ success: false, message: 'Type, title and content are required.' });
    }
    const contribution = await Contribution.create({ user: req.user._id, type, title: title.trim(), content, status: 'Pending' });
    res.status(201).json({ success: true, data: contribution, message: 'Contribution submitted successfully and is now waiting for admin review.' });
  } catch (error) { next(error); }
};

export const getMyContributions = async (req, res, next) => {
  try {
    const query = { user: req.user._id };
    if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) query.status = req.query.status;
    const [data, counts] = await Promise.all([
      Contribution.find(query).sort({ createdAt: -1 }),
      Contribution.aggregate([{ $match: { user: req.user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);
    const stats = { total: 0, Pending: 0, Approved: 0, Rejected: 0 };
    counts.forEach(x => { stats[x._id] = x.count; stats.total += x.count; });
    res.json({ success: true, data, stats });
  } catch (error) { next(error); }
};

export const getContributionStats = async (req, res, next) => {
  try {
    const rows = await Contribution.aggregate([{ $match: { user: req.user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    const stats = { total: 0, Pending: 0, Approved: 0, Rejected: 0 };
    rows.forEach(x => { stats[x._id] = x.count; stats.total += x.count; });
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const getContribution = async (req, res, next) => {
  try {
    const query = req.user.role === 'collaborator' ? { _id: req.params.id } : { _id: req.params.id, user: req.user._id };
    const contribution = await Contribution.findOne(query).populate('user', 'name email');
    if (!contribution) return res.status(404).json({ success: false, message: 'Contribution not found.' });
    res.json({ success: true, data: contribution });
  } catch (error) { next(error); }
};

export const listContributions = async (req, res, next) => {
  try {
    const query = {};
    if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) query.status = req.query.status;
    if (TYPES.includes(req.query.type)) query.type = req.query.type;
    if (req.query.search) query.$or = [{ title: { $regex: req.query.search, $options: 'i' } }, { 'user.name': { $regex: req.query.search, $options: 'i' } }];
    const [data, rows] = await Promise.all([
      Contribution.find(query).populate('user', 'name email').sort({ createdAt: -1 }),
      Contribution.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);
    const stats = { total: 0, Pending: 0, Approved: 0, Rejected: 0 };
    rows.forEach(x => { stats[x._id] = x.count; stats.total += x.count; });
    res.json({ success: true, data, stats });
  } catch (error) { next(error); }
};

export const approveContribution = async (req, res, next) => {
  try {
    const contribution = await Contribution.findOne({ _id: req.params.id, status: 'Pending' });
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
    const entityData = { ...data, user: req.user._id };
    const entity = await MODELS[contribution.type].create(entityData);
    contribution.status = 'Approved';
    contribution.reviewedBy = req.user._id;
    contribution.reviewedAt = new Date();
    contribution.finalEntity = entity._id;
    await contribution.save();
    res.json({ success: true, data: contribution, message: 'Contribution approved and published.' });
  } catch (error) { next(error); }
};

export const rejectContribution = async (req, res, next) => {
  try {
    const reason = req.body?.rejectionReason?.trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
    const contribution = await Contribution.findOneAndUpdate({ _id: req.params.id, status: 'Pending' }, { status: 'Rejected', rejectionReason: reason, reviewedBy: req.user._id, reviewedAt: new Date() }, { new: true });
    if (!contribution) return res.status(409).json({ success: false, message: 'Contribution was already reviewed.' });
    res.json({ success: true, data: contribution, message: 'Contribution rejected.' });
  } catch (error) { next(error); }
};
