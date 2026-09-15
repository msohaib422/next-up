import mongoose from 'mongoose';

const referenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Please provide a subject'],
      trim: true,
    },
    topic: {
      type: String,
      required: [true, 'Please provide a topic'],
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
    fileType: {
      type: String,
      enum: ['image', 'pdf', 'document', 'other'],
      default: 'other',
    },
    fileUrl: {
      type: String,
      default: '',
    },
    fileName: {
      type: String,
      default: '',
    },
    fileKey: {
      type: String,
      default: '',
    },
    publicId: {
      type: String,
      default: '',
    },
    resourceType: {
      type: String,
      default: '',
    },
    storageType: {
      type: String,
      enum: ['cloudinary', 'r2'],
      default: 'cloudinary',
    },
  },
  { timestamps: true }
);

const Reference = mongoose.model('Reference', referenceSchema);

export default Reference;
