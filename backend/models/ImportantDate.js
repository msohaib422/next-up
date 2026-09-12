import mongoose from 'mongoose';

const importantDateSchema = new mongoose.Schema(
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
    date: {
      type: Date,
      required: [true, 'Please provide a date'],
    },
    type: {
      type: String,
      enum: ['Assignment', 'Quiz', 'Exam', 'Presentation', 'Project', 'Event', 'Other'],
      default: 'Other',
    },
    description: {
      type: String,
      default: '',
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
    },
  },
  { timestamps: true }
);

const ImportantDate = mongoose.model('ImportantDate', importantDateSchema);

export default ImportantDate;
