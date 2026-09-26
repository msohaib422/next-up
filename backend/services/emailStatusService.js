import EmailDelivery from '../models/EmailDelivery.js';

/**
 * Delivery bookkeeping for the transactional registration emails.
 *
 * Two jobs, both deliberately small:
 *   - record the outcome of each attempt (Pending / Sent / Failed) so a failed
 *     email is never reported as a successful one;
 *   - suppress an address once the mail server has told us it is permanently
 *     unusable, so a typo'd or dead address is not retried on every later event.
 *
 * Nothing in here may ever break the caller's workflow: a database problem
 * while recording an outcome must not stop a registration, an approval, or a
 * deletion. Every function therefore swallows and logs its own errors and
 * returns a safe default.
 */

/** After this many consecutive failures a possibly-transient problem is
 *  treated as a dead address rather than retried forever. */
const MAX_CONSECUTIVE_FAILURES = 3;

const normalize = (email) => String(email || '').trim().toLowerCase();

/** A syntactically unusable address is never worth an SMTP round trip. */
export const isUsableAddress = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalize(email));

const suppressionThreshold = () => {
  const configured = Number(process.env.EMAIL_MAX_FAILURES);
  return Number.isFinite(configured) && configured > 0 ? configured : MAX_CONSECUTIVE_FAILURES;
};

/**
 * Decide whether to try this recipient again, and open a 'Pending' attempt.
 *
 * Resolves to { skip: boolean, reason?: string }. `skip: true` means the caller
 * must not call the mail server for this address.
 */
export const beginAttempt = async ({ email, subject = '', context = '' }) => {
  const recipient = normalize(email);
  if (!recipient) return { skip: true, reason: 'no recipient address' };

  try {
    const existing = await EmailDelivery.findOne({ email: recipient }).select('suppressed lastError').lean();
    if (existing?.suppressed) {
      return {
        skip: true,
        reason: `address is suppressed after previous delivery failures${existing.lastError ? ` (last reason: ${existing.lastError})` : ''}`,
      };
    }

    await EmailDelivery.findOneAndUpdate(
      { email: recipient },
      {
        $set: { status: 'Pending', lastSubject: subject, lastContext: context, lastAttemptAt: new Date() },
        $setOnInsert: { email: recipient, failureCount: 0, suppressed: false, lastError: '' },
      },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    );

    return { skip: false };
  } catch (error) {
    // Tracking is best-effort; losing it must not stop a real send.
    console.error('[email-status] could not open a delivery record:', error.message);
    return { skip: false };
  }
};

/**
 * Close out an attempt.
 *
 * A success clears the failure streak, so a later event can mail the address
 * again normally. A failure increments it and suppresses the address when the
 * mail server reported a permanent problem or the streak got too long.
 */
export const completeAttempt = async ({ email, ok, reason = '', permanent = false }) => {
  const recipient = normalize(email);
  if (!recipient) return null;

  try {
    if (ok) {
      return await EmailDelivery.findOneAndUpdate(
        { email: recipient },
        {
          $set: {
            status: 'Sent',
            failureCount: 0,
            suppressed: false,
            lastError: '',
            lastSentAt: new Date(),
            lastAttemptAt: new Date(),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }

    const threshold = suppressionThreshold();
    return await EmailDelivery.findOneAndUpdate(
      { email: recipient },
      {
        $inc: { failureCount: 1 },
        $set: { status: 'Failed', lastError: reason, lastAttemptAt: new Date() },
        $setOnInsert: { email: recipient, suppressed: false, lastSubject: '', lastContext: '' },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).then(async (updated) => {
      if (!updated) return null;
      const shouldSuppress = permanent || updated.failureCount >= threshold;
      if (!shouldSuppress || updated.suppressed) return updated;

      const suppressed = await EmailDelivery.findOneAndUpdate(
        { email: recipient },
        { $set: { suppressed: true } },
        { new: true }
      );
      console.warn(
        `[email-status] suppressing ${recipient} after ${updated.failureCount} failed attempt(s)` +
          `${permanent ? ' (permanent rejection from the mail server)' : ''}. No further email will be attempted to this address.`
      );
      return suppressed || updated;
    });
  } catch (error) {
    console.error('[email-status] could not record the delivery outcome:', error.message);
    return null;
  }
};

/** Read-only view used by diagnostics; never exposes credentials. */
export const getDeliveryStatus = async (email) => {
  try {
    const doc = await EmailDelivery.findOne({ email: normalize(email) }).lean();
    if (!doc) return null;
    return {
      email: doc.email,
      status: doc.status,
      failureCount: doc.failureCount,
      suppressed: doc.suppressed,
      lastError: doc.lastError,
      lastSentAt: doc.lastSentAt,
      lastAttemptAt: doc.lastAttemptAt,
    };
  } catch (error) {
    console.error('[email-status] could not read the delivery status:', error.message);
    return null;
  }
};
