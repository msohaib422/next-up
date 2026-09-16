import mongoose from 'mongoose';

const lectureSchema = new mongoose.Schema(
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
    timeline: {
      type: String,
      enum: ['Weekly', 'Monthly', 'Continued till next change'],
      default: 'Weekly',
    },
    notes: {
      type: String,
      default: '',
    },
    fileUrl: {
      type: String,
      default: '',
    },
    fileName: {
      type: String,
      default: '',
    },
    fileType: {
      type: String,
      enum: ['image', 'pdf', 'document', 'other'],
      default: 'other',
    },
    publicId: {
      type: String,
      default: '',
    },
    resourceType: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

const Lecture = mongoose.model('Lecture', lectureSchema);

export default Lecture;
