import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      select: false,
    },
    profileImage: {
      type: String,
      default: '',
    },
    profileImageMeta: {
      publicId: { type: String, default: '' },
      resourceType: { type: String, default: '' },
    },
    role: {
      type: String,
      enum: ['user', 'collaborator'],
      default: 'user',
    },
    // Registration approval workflow. A new self-registered account starts as
    // 'Pending Approval' and cannot use the system until an administrator
    // approves it. The default is 'Approved' so every account that already
    // exists keeps working with no data migration.
    status: {
      type: String,
      enum: ['Pending Approval', 'Approved', 'Rejected'],
      default: 'Approved',
    },
    // Optional administrator note captured when a registration is declined.
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
