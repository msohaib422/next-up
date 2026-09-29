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

// Single hashing implementation, shared by the save hook below and by by the
// re-application flow, which updates the record without going through save().
userSchema.statics.hashPassword = async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

/**
 * The one form of an email address, applied to the VALUE and not only to the
 * field.
 *
 * `lowercase: true` / `trim: true` on the schema run when a document is SAVED.
 * They do not run when the address is used as a QUERY, so `findOne({ email })`
 * was matching the raw string the browser sent. Two consequences, both of them
 * permanent lockouts that look exactly like "my password stopped working":
 *
 *   - `Msohaib.AI.Dev@Gmail.com` or an address with a trailing space finds
 *     nothing, so a correct password is answered with "Invalid credentials".
 *   - an address written by any tool that bypassed the schema is stored in
 *     whatever case it arrived in, and can then never be found by a lookup.
 *
 * Normalising on both sides - here when writing, and through this helper in
 * every lookup - makes the stored value and the compared value identical.
 */
userSchema.statics.normalizeEmail = function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
};

/** True when a stored value is a bcrypt hash this build can actually verify. */
const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const incoming = this.password;

  // Re-hashing a hash is unrecoverable: bcrypt.compare can never match the
  // result, so the account is locked out permanently and NOTHING can undo it -
  // not the app, not a reset script. This is the exact failure that made a
  // successful password change impossible to sign in with, so it is refused at
  // the only place a password is ever written.
  if (isBcryptHash(incoming)) {
    return next(
      new Error(
        'Refusing to hash an already-hashed password. Assign the plain text password instead.'
      )
    );
  }

  this.password = await this.constructor.hashPassword(incoming);
  next();
});

userSchema.methods.matchPassword = async function (candidatePassword) {
  // A document with no usable hash is "does not match", not an exception.
  // bcrypt.compare throws `Illegal arguments: string, undefined` when the
  // stored value is missing, which turned a plain bad-password login into an
  // HTTP 500 and made an account created without a password impossible to sign
  // into or recover from.
  if (!isBcryptHash(this.password)) return false;
  if (typeof candidatePassword !== 'string' || candidatePassword.length === 0) return false;

  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
