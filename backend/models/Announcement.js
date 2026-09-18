import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Please provide a title'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      required: [true, 'Please provide a type'],
      enum: ['General', 'Academic', 'Assignment', 'Quiz', 'Task', 'Exam', 'Event'],
      default: 'General',
    },
    date: {
      type: Date,
      required: [true, 'Please provide a date'],
    },
    attachment: {
      name: { type: String, default: '' },
      url: { type: String, default: '' },
      type: { type: String, default: '' },
      publicId: { type: String, default: '' },
      resourceType: { type: String, default: '' },
    },
    link: {
      type: String,
      default: '',
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    expired: {
      type: Boolean,
      default: false,
    },
    savedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

announcementSchema.index({ user: 1, date: 1 });
announcementSchema.index({ pinned: -1 });

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
