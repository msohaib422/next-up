import mongoose from 'mongoose';

const quizSchema = new mongoose.Schema(
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
      default: null,
    },
    time: {
      type: String,
      default: '',
    },
    deadlineMode: {
      type: String,
      required: [true, 'Please select a deadline'],
      validate: {
        validator: function (v) {
          return ['Date', 'Upcoming Lecture', 'Surprise'].includes(v);
        },
        message: '{VALUE} is not a valid deadline mode',
      },
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Pending', 'Postponed', 'Completed'],
      default: 'Pending',
    },
    isSurprise: {
      type: Boolean,
      default: false,
    },
    attachment: {
      name: { type: String, default: '' },
      url: { type: String, default: '' },
      type: { type: String, default: '' },
      publicId: { type: String, default: '' },
      resourceType: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

quizSchema.index({ user: 1, status: 1, date: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);

export default Quiz;
