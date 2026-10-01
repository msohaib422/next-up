import mongoose from 'mongoose';

const essentialSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    course: {
      type: String,
      required: [true, 'Please provide a course'],
      trim: true,
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
    date: {
      type: Date,
      default: Date.now,
    },
    tag: {
      type: String,
      default: 'Topic',
      trim: true,
    },
    attachment: {
      name: { type: String, default: '' },
      url: { type: String, default: '' },
      type: { type: String, default: '' },
      publicId: { type: String, default: '' },
      resourceType: { type: String, default: '' },
    },
    // Optional link, exactly as on an Announcement: a free-text URL entered
    // beside the file. It defaults to empty, so every essential that already
    // exists is unchanged and simply has no link.
    link: {
      type: String,
      default: '',
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

essentialSchema.index({ user: 1, date: 1 });

const Essential = mongoose.model('Essential', essentialSchema);

export default Essential;
