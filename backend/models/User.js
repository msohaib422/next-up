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
    // When a rejected applicant submits a fresh application, the account record
    // is reused (never duplicated) and this is stamped. It lets an administrator
    // see that a re-application is newer than a plain signup waiting in the
    // queue, without changing when the account was first created.
    lastApplicationAt: {
      type: Date,
      default: null,
    },
    // True ONLY when the account that is currently queued was previously
    // rejected and has now submitted a new application. lastApplicationAt
    // cannot be used for this: it is also stamped on a brand-new signup, so
    // treating "has lastApplicationAt" as "re-applied" flagged every new
    // registration. This flag is the single source of truth and is cleared as
    // soon as the application is decided, so the badge only ever describes a
    // live re-application.
    isReapplication: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Single hashing implementation, shared by the save hook below and by the
// re-application flow, which updates the record without going through save().
userSchema.statics.hashPassword = async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await this.constructor.hashPassword(this.password);
  next();
});

userSchema.methods.matchPassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
