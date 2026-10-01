import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
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
      publicId: { type: String, default: '' },
      resourceType: { type: String, default: '' },
    },
    // Optional link, exactly as on an Announcement: a free-text URL entered
    // beside the file. It defaults to empty, so every task that already exists
    // is unchanged and simply has no link.
    link: {
      type: String,
      default: '',
    },
    // Personal completion tick: one account id per user who has ticked this task
    // off for themselves, and nothing else.
    //
    // It is deliberately NOT `status`. `status` is the shared status the whole
    // workspace sees and only an administrator may change it; this records what
    // ONE user has finished, so the same task can be ticked by one account and
    // unticked by every other. It lives on the task rather than in a collection
    // of its own because it belongs to the task, and it defaults to empty, so
    // every task that already exists is unchanged and simply starts unticked.
    completions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  { timestamps: true }
);

taskSchema.index({ user: 1, status: 1, deadline: 1 });

const Task = mongoose.model('Task', taskSchema);

export default Task;
