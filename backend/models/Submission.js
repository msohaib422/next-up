import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    entityType: {
      type: String,
      required: [true, 'Please provide an entity type'],
      enum: ['Task', 'Quiz', 'Reminder', 'Event', 'Announcement', 'Reference', 'ImportantDate', 'Lecture'],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Please provide an entity ID'],
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

submissionSchema.index({ status: 1 });

const Submission = mongoose.model('Submission', submissionSchema);

export default Submission;
