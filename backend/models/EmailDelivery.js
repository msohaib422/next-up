import mongoose from 'mongoose';

/**
 * One row per recipient address, used to answer two questions that the mail
 * service needs on every send:
 *
 *   1. What happened to the last transactional email we tried to deliver?
 *      (`status` = Pending / Sent / Failed)
 *   2. Should we even try again? (`suppressed` is set once the mail server has
 *      told us the address is permanently unusable, or after repeated
 *      failures, so a bad address is never hammered.)
 *
 * This is deliberately one small document per address rather than a log of
 * every message: the workflow emails are low volume and only the latest
 * outcome matters.
 */
const emailDeliverySchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Sent', 'Failed'],
      default: 'Pending',
    },
    // Consecutive failures. Reset to 0 by a successful send.
    failureCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // When true, the mail service short-circuits and skips this address.
    suppressed: {
      type: Boolean,
      default: false,
    },
    // Fixed, human-written reason string. Never contains credentials.
    lastError: {
      type: String,
      default: '',
    },
    lastSubject: {
      type: String,
      default: '',
    },
    lastContext: {
      type: String,
      default: '',
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const EmailDelivery = mongoose.model('EmailDelivery', emailDeliverySchema);

export default EmailDelivery;
