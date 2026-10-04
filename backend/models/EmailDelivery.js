import mongoose from 'mongoose';

/**
 * One row per recipient address, used to answer two questions that the mail
 * service needs on every send:
 *
 *   1. What happened to the last transactional email we tried to deliver?
 *      (`status` = Pending / Sent / Failed)
 *   2. Should we even try again? (`suppressed` / `undeliverable`)
 *
 * This is deliberately one small document per address rather than a log of
 * every message: the workflow emails are low volume and only the latest
 * outcome matters.
 *
 * A note on `Sent`: that only means the SMTP server accepted the message. It is
 * NOT proof of delivery. A mailbox that accepts a message and then bounces it
 * (full mailbox, disabled account, filtered recipient) is invisible to the SMTP
 * conversation, and the receiving server reports it back to our own mailbox
 * instead. That is why `undeliverable` exists as a separate flag: a bounce has
 * to be reported back to us (see markUndeliverable) before the address can be
 * taken out of rotation, otherwise we would keep handing mail to an address
 * that never receives it.
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
    /**
     * The messages this address has already FAILED, as stable message keys
     * (see messageKey in mailService.js), one per failed message.
     *
     * This is what makes "attempted exactly once" true per message rather than
     * per address. `status`/`failureCount` alone describe the address, so a
     * message that failed was indistinguishable from a message that was never
     * tried: the next content event simply handed the same message over again,
     * which is where the repeated failures came from.
     *
     * Entries are added only when a send actually FAILS, so a healthy address
     * keeps this empty and its behaviour is completely unchanged. Nothing
     * removes an entry and nothing expires it: no timer, no cleanup job, no
     * date comparison. It lives in MongoDB, so a restart, a redeploy or a cold
     * serverless boot cannot lose it. The single exception is an explicit
     * administrator resend, which bypasses this deliberately (see
     * `bypassSuppression` in beginAttempt).
     */
    failedMessages: {
      type: [String],
      default: [],
    },
    // When true, the mail service short-circuits and skips this address.
    suppressed: {
      type: Boolean,
      default: false,
    },
    /**
     * The address bounced or is known to be undeliverable. Unlike `suppressed`
     * (which can be a transient-failure guard) this is a statement of fact
     * about the address, and it survives an explicit retry: a manual resend is
     * allowed to try again, but nothing does so on its own.
     */
    undeliverable: {
      type: Boolean,
      default: false,
    },
    // Why the address is out of rotation, for the admin email-delivery list.
    suppressionReason: {
      type: String,
      default: '',
    },
    // Who the email was about, so a manual resend can rebuild it.
    relatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Last subject and template context, used by the manual resend action.
    lastSubject: {
      type: String,
      default: '',
    },
    lastContext: {
      type: String,
      default: '',
    },
    // Last failure/bounce reason. Always a fixed, human-written string, never a
    // raw server response, so no credential or header detail is ever stored.
    lastError: {
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
    bouncedAt: {
      type: Date,
      default: null,
    },
    // How many times a person has explicitly asked for a resend.
    manualRetryCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const EmailDelivery = mongoose.model('EmailDelivery', emailDeliverySchema);

export default EmailDelivery;
