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
    teacher: {
      type: String,
      default: '',
    },
    classroom: {
      type: String,
      default: '',
    },
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: [true, 'Please provide a day'],
    },
    startTime: {
      type: String,
      required: [true, 'Please provide a start time'],
    },
    endTime: {
      type: String,
      required: [true, 'Please provide an end time'],
    },
  },
  { timestamps: true }
);

const Lecture = mongoose.model('Lecture', lectureSchema);

export default Lecture;
