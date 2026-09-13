import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
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
    deadline: {
      type: Date,
      default: null,
    },
    deadlineMode: {
      type: String,
      required: [true, 'Please select a deadline'],
      validate: {
        validator: function (v) {
          return ['Date', 'Upcoming Lecture', 'As Possible'].includes(v);
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
      enum: ['Pending', 'In Progress', 'Completed', 'Overdue'],
      default: 'Pending',
    },
    attachment: {
      name: { type: String, default: '' },
      url: { type: String, default: '' },
      type: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

taskSchema.index({ user: 1, status: 1, deadline: 1 });

const Task = mongoose.model('Task', taskSchema);

export default Task;
