import mongoose from 'mongoose';

const contributionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, enum: ['Task', 'Quiz', 'Assignment', 'Essential', 'Announcement'] },
  title: { type: String, required: true, trim: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Deleted'], default: 'Pending', index: true },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
  finalEntity: { type: mongoose.Schema.Types.ObjectId, refPath: 'type', default: null }
}, { timestamps: true });
contributionSchema.index({ user: 1, createdAt: -1 });
export default mongoose.model('Contribution', contributionSchema);
