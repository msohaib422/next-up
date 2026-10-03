import EmailDelivery from '../models/EmailDelivery.js';

/**
 * Delivery bookkeeping for the transactional registration emails.
 *
 * Four jobs, all deliberately small:
 *   - record the outcome of each attempt (Pending / Sent / Failed) so a failed
 *     email is never reported as a successful one;
 *   - keep an address out of rotation the moment one delivery to it fails;
 *   - accept a bounce report for an address that *accepted* at SMTP level but
 *     never arrived, which is the only way to learn about that failure mode;
 *   - allow a person - never a loop - to retry or resume an address.
 *
 * Nothing in here may ever break the caller's workflow: a database problem
 * while recording an outcome must not stop a registration, an approval, or a
 * deletion. Every function therefore swallows and logs its own errors and
 * returns a safe default.
 *
 * There is no scheduler, no queue and no retry loop in this file or anywhere
 * else: an address only leaves this module as "Sent", "skipped" or "failed"
 * for the one event that triggered the send.
 *
 * ONE FAILURE IS FINAL FOR A RECIPIENT
 * ------------------------------------
 * This used to be a retry count - three consecutive failures, configurable with
 * `EMAIL_MAX_FAILURES` - and that is exactly what caused the same message to be
 * handed to the same address again and again.
 *
 * A "temporary-looking" failure is the common case, not the exception. If the
 * mail server refuses the connection, times out, or is briefly down, every
 * recipient fails - and under a retry count each of them stayed eligible, so the
 * next event (the next admin action, i.e. tomorrow) mailed all of them again and
 * produced another round of failures. The recipient, not the mood of the mail
 * server, is the thing that decides whether there is a next attempt.
 *
 * So a failure - permanent rejection, refused connection, timeout, anything -
 * is written straight to `suppressed: true` in the single atomic update in
 * completeAttempt, in MongoDB. That is what stops the retry on the next run, the
 * next day, a server restart or a cold serverless boot: there is no in-memory
 * flag that a restart could lose, and nothing re-arms it. The only way an
 * address is tried again is a person asking (resumeAddress / resendLastEmailTo).
 *
 * The state is keyed on the recipient address alone, so one dead address never
 * blocks the rest of a notification: the other recipients in the same message
 * are still delivered and are recorded separately.
 */

const normalize = (email) => String(email || '').trim().toLowerCase();

/** A syntactically unusable address is never worth an SMTP round trip. */
export const isUsableAddress = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalize(email));

/**
 * Addresses the operator has taken out of rotation by configuration, e.g.
 * `EMAIL_SUPPRESSED_ADDRESSES=bad@example.com,worse@example.com`.
 *
 * This is the lever to use when an address is known to be bad but no bounce has
 * been reported back yet: it takes effect on the very next send attempt.
 */
const envSuppressed = () =>
  String(process.env.EMAIL_SUPPRESSED_ADDRESSES || '')
    .split(',')
    .map((value) => normalize(value))
    .filter(Boolean);

export const isSuppressedByEnv = (email) => envSuppressed().includes(normalize(email));

/**
 * Decide whether to try this recipient again, and open a 'Pending' attempt.
 *
 * Resolves to { skip: boolean, reason?: string }. `skip: true` means the caller
 * must not call the mail server for this address.
 *
 * This is the check that answers "has this recipient already failed?". It reads
 * the persisted per-address record, so a delivery that failed on any earlier run
 * - yesterday, last week, before the last restart - is skipped here, before any
 * SMTP conversation is opened and before a Pending record is written. That makes
 * a repeated run, a cron tick, a cold serverless boot and a manual re-trigger of
 * the same notification all behave identically: the failed recipient is never
 * attempted a second time.
 *
 * `bypassSuppression` is deliberately not reachable from any request body: the
 * only caller that sets it is the operator resend in mailService, so a client
 * cannot talk the mail service into mailing a known-dead address.
 */
export const beginAttempt = async ({ email, subject = '', context = '', relatedUserId = null, bypassSuppression = false }) => {
  const recipient = normalize(email);
  if (!recipient) return { skip: true, reason: 'no recipient address' };

  if (!bypassSuppression && isSuppressedByEnv(recipient)) {
    return { skip: true, reason: 'the address is on the configured do-not-send list' };
  }

  try {
    const existing = await EmailDelivery.findOne({ email: recipient })
      .select('suppressed undeliverable suppressionReason lastError')
      .lean();

    if (!bypassSuppression && existing?.undeliverable) {
      return {
        skip: true,
        reason: `the address is recorded as undeliverable${existing.lastError ? ` (${existing.lastError})` : ''} and is only retried when an administrator asks for it`,
      };
    }
    if (!bypassSuppression && existing?.suppressed) {
      return {
        skip: true,
        reason: `the address is suppressed after previous delivery failures${existing.lastError ? ` (last reason: ${existing.lastError})` : ''}`,
      };
    }

    await EmailDelivery.findOneAndUpdate(
      { email: recipient },
      {
        $set: {
          status: 'Pending',
          lastSubject: subject,
          lastContext: context,
          lastAttemptAt: new Date(),
          ...(relatedUserId ? { relatedUserId } : {}),
        },
        $setOnInsert: { email: recipient, failureCount: 0, suppressed: false, undeliverable: false, lastError: '' },
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
 * again normally.
 *
 * A failure does the opposite, and it does it in ONE write. The outcome, the
 * streak and the permanent stop (`suppressed: true`) are all part of the same
 * atomic update, so the state that says "do not attempt this address again"
 * can never be lost to a crash, a restart or a cold boot between two separate
 * writes. Every later call to beginAttempt reads `suppressed` and skips the
 * address without ever opening an SMTP conversation for it, which is what makes
 * "attempted exactly once" true across runs, days and process restarts.
 *
 * `permanent` is diagnostics only - it picks the wording shown to an
 * administrator - and never decides whether the address is retried. A refused
 * connection is treated exactly like a 550 rejection, per the one-strike rule.
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

    const updated = await EmailDelivery.findOneAndUpdate(
      { email: recipient },
      {
        $inc: { failureCount: 1 },
        $set: {
          status: 'Failed',
          // The one-strike rule, written with the failure rather than after it.
          suppressed: true,
          lastError: reason,
          lastAttemptAt: new Date(),
        },
        $setOnInsert: { email: recipient, undeliverable: false, lastSubject: '', lastContext: '' },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (!updated) return null;

    // Cosmetic, and deliberately a second statement: the reason is only
    // meaningful if it does not overwrite a stronger one already recorded (an
    // address reported as bounced keeps saying so even if a later manual resend
    // fails). Nothing about the retry decision lives here.
    if (!updated.undeliverable && updated.suppressionReason !== 'bounced') {
      await EmailDelivery.updateOne(
        { email: recipient },
        { $set: { suppressionReason: permanent ? 'rejected-by-server' : 'send-failed' } }
      );
    }

    console.warn(
      `[email-status] ${recipient} stopped after ${updated.failureCount} failed attempt(s)` +
        `${permanent ? ' (permanent rejection from the mail server)' : ''}: ${reason}. ` +
        'No further email will be attempted to this address unless an administrator asks for it.'
    );
    return updated;
  } catch (error) {
    console.error('[email-status] could not record the delivery outcome:', error.message);
    return null;
  }
};

/**
 * Report a bounce (or an operator decision) for an address.
 *
 * This is the feedback channel that SMTP alone cannot provide: the mail server
 * accepted the message, so the only evidence that it never arrived is the
 * non-delivery report that comes back to our own mailbox. Once that is
 * reported here, the address is out of rotation and stays out until somebody
 * explicitly resumes or retries it.
 */
export const markUndeliverable = async ({ email, reason = 'the address bounced', detail = '', relatedUserId = null }) => {
  const recipient = normalize(email);
  if (!isUsableAddress(recipient)) return null;
  try {
    const record = await EmailDelivery.findOneAndUpdate(
      { email: recipient },
      {
        $set: {
          status: 'Failed',
          undeliverable: true,
          suppressed: true,
          suppressionReason: reason,
          lastError: detail ? `${reason}: ${detail}` : reason,
          bouncedAt: new Date(),
          ...(relatedUserId ? { relatedUserId } : {}),
        },
        $setOnInsert: { email: recipient, failureCount: 1, lastSubject: '', lastContext: '' },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    console.warn(`[email-status] ${recipient} marked undeliverable (${reason}). Email to this address is now stopped.`);
    return record;
  } catch (error) {
    console.error('[email-status] could not mark the address undeliverable:', error.message);
    return null;
  }
};

/**
 * Put an address back in rotation. Explicit operator action only - nothing in
 * the system calls this by itself.
 */
export const resumeAddress = async (email) => {
  const recipient = normalize(email);
  if (!isUsableAddress(recipient)) return null;
  try {
    return await EmailDelivery.findOneAndUpdate(
      { email: recipient },
      {
        $set: {
          undeliverable: false,
          suppressed: false,
          suppressionReason: '',
          failureCount: 0,
          lastError: '',
          bouncedAt: null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error('[email-status] could not resume the address:', error.message);
    return null;
  }
};

/**
 * The recipient list behind the admin email-delivery view, most recently
 * active first. Read-only, and never used to trigger a send.
 */
export const listDeliveries = async ({ limit = 100 } = {}) => {
  try {
    const rows = await EmailDelivery.find({})
      .sort({ lastAttemptAt: -1, updatedAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))
      .lean();

    const configured = envSuppressed();

    // An address on the configured do-not-send list is out of rotation even if
    // it has never been mailed, so it is listed too. Otherwise the operator
    // would have no way to see that their configuration is in force.
    const seen = new Set(rows.map((row) => row.email));
    for (const email of configured) {
      if (seen.has(email)) continue;
      rows.push({
        email,
        status: 'Pending',
        failureCount: 0,
        suppressed: false,
        undeliverable: false,
        suppressionReason: 'on the configured do-not-send list',
        lastError: '',
        lastSubject: '',
        lastContext: '',
        relatedUserId: null,
        manualRetryCount: 0,
        bouncedAt: null,
        lastAttemptAt: null,
        lastSentAt: null,
      });
    }

    return rows.map((row) => ({
      email: row.email,
      status: row.status,
      failureCount: row.failureCount,
      suppressed: Boolean(row.suppressed),
      undeliverable: Boolean(row.undeliverable),
      suppressionReason: row.suppressionReason || '',
      // An address on the env list is out of rotation even before it has a row.
      blocked: Boolean(row.suppressed || row.undeliverable || configured.includes(row.email)),
      blockedByConfig: configured.includes(row.email),
      lastError: row.lastError || '',
      lastSubject: row.lastSubject || '',
      lastContext: row.lastContext || '',
      relatedUserId: row.relatedUserId || null,
      manualRetryCount: row.manualRetryCount || 0,
      bouncedAt: row.bouncedAt || null,
      lastAttemptAt: row.lastAttemptAt || null,
      lastSentAt: row.lastSentAt || null,
    }));
  } catch (error) {
    console.error('[email-status] could not list deliveries:', error.message);
    return [];
  }
};

/** Read-only view of one address; never exposes credentials. */
export const getDeliveryStatus = async (email) => {
  try {
    const doc = await EmailDelivery.findOne({ email: normalize(email) }).lean();
    if (!doc) return null;
    return {
      email: doc.email,
      status: doc.status,
      failureCount: doc.failureCount,
      suppressed: doc.suppressed,
      undeliverable: doc.undeliverable,
      suppressionReason: doc.suppressionReason || '',
      lastError: doc.lastError || '',
      bouncedAt: doc.bouncedAt || null,
      manualRetryCount: doc.manualRetryCount || 0,
      lastSentAt: doc.lastSentAt,
      lastAttemptAt: doc.lastAttemptAt,
    };
  } catch (error) {
    console.error('[email-status] could not read the delivery status:', error.message);
    return null;
  }
};

/** Claim a single explicit retry for an address, for an operator-initiated resend. */
export const recordManualRetry = async (email) => {
  const recipient = normalize(email);
  if (!isUsableAddress(recipient)) return null;
  try {
    return await EmailDelivery.findOneAndUpdate(
      { email: recipient },
      { $inc: { manualRetryCount: 1 }, $set: { lastAttemptAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error('[email-status] could not record the manual retry:', error.message);
    return null;
  }
};
