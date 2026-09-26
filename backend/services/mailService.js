import nodemailer from 'nodemailer';
import User from '../models/User.js';
import {
  beginAttempt,
  completeAttempt,
  isUsableAddress,
  markUndeliverable,
  listDeliveries,
  recordManualRetry,
} from './emailStatusService.js';

/**
 * Outbound email for the registration approval workflow.
 *
 * All SMTP configuration comes from environment variables, never from source:
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   e.g. 587 (use 465 together with SMTP_SECURE=true)
 *   SMTP_USER   the mailbox that sends the mail
 *   SMTP_PASS   app password / token for that mailbox  (SECRET - never logged)
 *   SMTP_FROM   the From address shown to recipients
 *   SMTP_SECURE optional, defaults to true only on port 465
 *   FRONTEND_URL  absolute base URL of the deployed web app, used to build the
 *                  "Login" button in the approval email and the "Review
 *                  Registration" button in the admin email.
 *                  ADMIN_REVIEW_URL is still honoured as a fallback so existing
 *                  deployments keep working. No URL is ever hardcoded, and a
 *                  localhost value is ignored in production.
 *   EMAIL_SUPPRESSED_ADDRESSES  comma-separated addresses that must never be
 *                  emailed again, for an address known to be bad.
 *
 * A missing or broken mail server must never stop a registration or an
 * approval decision, so sending is best-effort like createActivity and the
 * notification service. It is never silent though: every attempt is logged
 * with its outcome, and callers receive a structured result they can surface.
 *
 * The outcome of every attempt is also recorded per recipient
 * (Pending / Sent / Failed), and an address that is refused, that bounced, or
 * that the operator has taken out of rotation is skipped on every later event.
 *
 * Emails are only ever sent from a controller in response to a real event, and
 * only to the specific people that event is about. There is no code path that
 * walks the user list, no scheduler, no queue and no retry loop: an address
 * that cannot receive mail is skipped (see emailStatusService) rather than
 * retried, and the only way it is tried again is an explicit admin resend.
 */

let transporter = null;

// Anything that looks like a credential is replaced before it can reach a log.
const REDACTED = '[redacted]';
const SECRET_KEYS = ['pass', 'password', 'secret', 'token', 'apikey', 'api_key', 'auth', 'credential'];

export const redact = (input) => {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return String(input);
  const out = Array.isArray(input) ? [] : {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = SECRET_KEYS.some((s) => key.toLowerCase().includes(s)) ? REDACTED : redact(value);
  }
  return out;
};

/** Non-secret view of the active configuration, safe to log. */
const describeConfig = () => ({
  host: process.env.SMTP_HOST || null,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER || null,
  from: process.env.SMTP_FROM || process.env.MAIL_FROM || null,
  secure: isSecure(),
});

// SMTP_FROM is the documented name; MAIL_FROM is kept as a fallback so an
// existing deployment does not silently stop sending.
const fromAddress = () => process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.SMTP_USER || null;

function isSecure() {
  if (process.env.SMTP_SECURE !== undefined && process.env.SMTP_SECURE !== '') {
    return String(process.env.SMTP_SECURE).toLowerCase() === 'true';
  }
  return Number(process.env.SMTP_PORT) === 465;
}

const missingVars = () =>
  ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']
    .filter((key) => !process.env[key])
    .concat(process.env.SMTP_FROM || process.env.MAIL_FROM ? [] : ['SMTP_FROM']);

export const isMailConfigured = () => missingVars().length === 0;

export const getMailStatus = () => ({
  configured: isMailConfigured(),
  missing: missingVars(),
  ...describeConfig(),
});

const getTransporter = () => {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: isSecure(),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Fail fast instead of hanging a request on a dead mail server.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
};

/**
 * Turn a nodemailer/network failure into an actionable message. Gmail in
 * particular reports a bad app password as a generic auth error, so that case
 * is called out explicitly.
 */
const classifyError = (error) => {
  const code = error?.code || '';
  const text = String(error?.response || error?.message || '');
  if (/EAUTH|535|534|InvalidCredentials|authentication/i.test(`${code} ${text}`)) {
    return `SMTP authentication failed - check SMTP_USER and that SMTP_PASS is a valid app password for that mailbox (${code || 'no code'})`;
  }
  if (/ECONNREFUSED|ECONNRESET|EDNS|ENOTFOUND|EAI_AGAIN/i.test(code)) {
    return `Could not reach the SMTP server at ${process.env.SMTP_HOST}:${Number(process.env.SMTP_PORT) || 587} (${code})`;
  }
  if (/ETIMEDOUT|timeout/i.test(`${code} ${text}`)) {
    return `The SMTP server at ${process.env.SMTP_HOST} did not respond in time (${code || 'timeout'})`;
  }
  if (/ESOCKET|ECONNECTION/i.test(code)) {
    return `SMTP connection failed (${code})`;
  }
  return `SMTP send failed (${code || 'unknown'})`;
};

/**
 * Distinguish "this recipient will never work" from "the network hiccupped".
 *
 * A 5xx reply (or an explicit "no such user") is permanent: retrying the same
 * address later is pointless, so the address is suppressed. Connection and
 * timeout problems are transient and only count towards the failure streak.
 */
const isPermanentRecipientError = (error) => {
  const code = String(error?.code || '').trim();
  const text = String(error?.response || error?.message || '');
  const combined = `${code} ${text}`;
  if (/^5\d\d$/.test(code) || /(^|\s)5\d\d[\s-]/.test(text)) return true;
  return /EENOBACKUP|user unknown|does not exist|no such user|mailbox (is )?unavailable|invalid (recipient|address|mailbox)|unrouteable|recipient not found|blocked/i.test(combined);
};

/* ------------------------------------------------------------------ *
 * Public application URLs
 * ------------------------------------------------------------------ */

const isLocalHost = (value) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(value);

const isProduction = () => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

/**
 * Absolute base URL of the deployed frontend, taken from the environment only.
 *
 * FRONTEND_URL is the documented name; ADMIN_REVIEW_URL predates it and is
 * still accepted so an existing deployment does not lose its links. A
 * localhost value is deliberately ignored in production so a dev setting can
 * never leak a dead link to a real user.
 */
const publicBaseUrl = () => {
  const configured =
    process.env.FRONTEND_URL || process.env.APP_URL || process.env.CLIENT_URL || process.env.ADMIN_REVIEW_URL || '';
  const base = String(configured).trim().replace(/\/+$/, '');
  if (!base) return '';
  if (isProduction() && isLocalHost(base)) {
    console.warn('[mail] FRONTEND_URL points at localhost and is ignored in production - email links will be omitted.');
    return '';
  }
  return base;
};

/** Build an absolute link into the web app, or undefined when unconfigured. */
const appLink = (path) => {
  const base = publicBaseUrl();
  if (!base) return undefined;
  const suffix = String(path || '');
  return { url: suffix ? `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}` : base };
};

/** Primary "sign in" action used by the approval email. */
const loginAction = () => {
  const action = appLink('/login');
  return action ? { label: 'Login to NextUp', ...action } : undefined;
};

/**
 * Drop the cached transporter. The transporter is cached on purpose so
 * connections are reused across requests, which also means a change to the
 * SMTP_* variables only takes effect after this is called (or the process
 * restarts).
 */
export const resetMailTransport = () => {
  if (transporter) {
    try { transporter.close(); } catch { /* nothing to close */ }
  }
  transporter = null;
};

/**
 * Verify the SMTP connection and credentials. Safe to call at startup: it
 * resolves either way and only reports what it found.
 */
export const verifySmtpConnection = async () => {
  if (!isMailConfigured()) {
    const status = `SMTP not configured - missing ${missingVars().join(', ')}`;
    console.warn(`[mail] ${status}. Registration and approval emails will be logged and skipped.`);
    return { ok: false, configured: false, reason: status };
  }
  try {
    await getTransporter().verify();
    console.log(`[mail] SMTP ready: ${process.env.SMTP_HOST}:${Number(process.env.SMTP_PORT) || 587} as ${process.env.SMTP_USER}`);
    return { ok: true, configured: true, ...describeConfig() };
  } catch (error) {
    const reason = classifyError(error);
    console.error(`[mail] SMTP verification failed: ${reason}`);
    console.error('[mail] details:', JSON.stringify(redact({ code: error?.code, command: error?.command })));
    return { ok: false, configured: true, reason };
  }
};


/** Escape untrusted text before it is interpolated into the HTML template. */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Product name used in every email header, subject and greeting. */
const BRAND = 'NextUp';

/**
 * Shared, consistently styled email shell. Every workflow email uses this so
 * the whole set looks like one system.
 *
 * `rows` are label/value pairs; `action` is an optional call-to-action button.
 */
const layout = ({ heading, intro, rows = [], body = '', action, footer }) => {
  const safeRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 16px 8px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:16px;font-weight:700;color:#111827;">${BRAND}</span>
          <span style="display:block;margin-top:2px;font-size:13px;color:#6b7280;">University Productivity System</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(intro)}</p>
          ${safeRows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse;">${safeRows}</table>` : ''}
          ${body ? `<div style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">${body}</div>` : ''}
          ${
            action
              ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:11px 22px;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a></p>
                 <p style="margin:0;font-size:13px;color:#6b7280;">If the button does not work, copy and paste this link into your browser:<br />
                 <span style="color:#4f46e5;word-break:break-all;">${escapeHtml(action.url)}</span></p>`
              : ''
          }
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;background:#f9fafb;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">${footer || `This is an automated message from ${BRAND}. Please do not reply to this email.`}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const toPlainText = ({ heading, intro, rows = [], action }) =>
  [
    heading,
    '',
    intro,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
  ].join('\n');

/**
 * Send one email. Never throws, so the registration/approval workflow always
 * completes, but the outcome is never silent: it is logged, recorded against
 * the recipient as Pending / Sent / Failed, and returned as a structured result
 * the caller can surface or react to.
 *
 * Resolves to { sent: boolean, status: 'sent' | 'skipped' | 'failed', reason? }
 */
export const sendMail = async ({ to, subject, heading, intro, rows, bodyHtml, bodyText, action, footer, context, relatedUser = null, allowSuppressed = false }) => {
  const html = layout({ heading, intro, rows, body: bodyHtml, action, footer });
  const text = bodyText || toPlainText({ heading, intro, rows, action });
  const where = context ? ` (${context})` : '';
  const recipient = String(to || '').trim().toLowerCase();

  if (!isUsableAddress(recipient)) {
    const reason = 'the recipient address is not a valid email address';
    console.warn(`[mail] SKIPPED "${subject}" to=${to || 'unknown'}${where}: ${reason}`);
    return { sent: false, status: 'skipped', reason };
  }

  if (!isMailConfigured()) {
    const reason = `SMTP not configured - missing ${missingVars().join(', ')}`;
    console.warn(`[mail] SKIPPED "${subject}" to=${recipient}${where}: ${reason}`);
    return { sent: false, status: 'skipped', reason };
  }

  // Out of rotation: an address the server refused, one that bounced, or one on
  // the configured do-not-send list is never tried again by an automatic send.
  // `allowSuppressed` is set only by the operator resend below, so the one way
  // to try such an address is a person deliberately asking.
  const attempt = await beginAttempt({
    email: recipient,
    subject,
    context,
    relatedUserId: relatedUser?._id || null,
    bypassSuppression: allowSuppressed === true,
  });
  if (attempt.skip) {
    console.warn(`[mail] SKIPPED "${subject}" to=${recipient}${where}: ${attempt.reason}`);
    return { sent: false, status: 'skipped', reason: attempt.reason };
  }

  try {
    const info = await getTransporter().sendMail({
      from: fromAddress(),
      to: recipient,
      subject,
      html,
      text,
    });
    await completeAttempt({ email: recipient, ok: true });
    console.log(`[mail] SENT "${subject}" to=${recipient}${where} (messageId=${info?.messageId || 'n/a'})`);
    return { sent: true, status: 'sent', messageId: info?.messageId || null };
  } catch (error) {
    const reason = classifyError(error);
    const permanent = isPermanentRecipientError(error);
    await completeAttempt({ email: recipient, ok: false, reason, permanent });
    // The reason is a fixed, human-written string, so no secret can reach it.
    console.error(`[mail] FAILED "${subject}" to=${recipient}${where}: ${reason}`);
    console.error('[mail] details:', JSON.stringify(redact({ code: error?.code, command: error?.command, responseCode: error?.responseCode })));
    return { sent: false, status: 'failed', reason };
  }
};

const formatWhen = (value) =>
  new Date(value).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

/* ------------------------------------------------------------------ *
 * Registration workflow emails
 * ------------------------------------------------------------------ */

/** Sent to the person who just registered. */
export const sendRegistrationReceivedEmail = async (user, { allowSuppressed = false } = {}) => {
  return sendMail({
    to: user.email,
    context: 'registration-received',
    relatedUser: user,
    allowSuppressed,
    subject: 'Your NextUp registration has been received',
    heading: `Welcome, ${user.name}`,
    intro:
      'Thank you for registering with NextUp. Your registration has been successfully received and is currently waiting for administrator confirmation.',
    rows: [
      ['Name', user.name],
      ['Email', user.email],
      ['Registered on', formatWhen(user.createdAt)],
      ['Current status', 'Pending Approval'],
    ],
    bodyHtml:
      '<p style="margin:0 0 12px;">What happens next:</p>' +
      '<ul style="margin:0;padding-left:20px;color:#374151;">' +
      '<li style="margin-bottom:6px;">An administrator will review your registration.</li>' +
      '<li style="margin-bottom:6px;">You will receive another email once your registration has been approved or declined.</li>' +
      '<li>You cannot access the main system features until your registration has been approved.</li>' +
      '</ul>',
  });
};

/** Sent to every administrator when a new registration arrives. */
export const sendAdminNewRegistrationEmail = async (user, admins, { allowSuppressed = false } = {}) => {
  if (!admins?.length) {
    console.warn('[mail] no administrator accounts found - nobody was notified of the new registration');
    return { sent: 0, failed: 0, skipped: 0, results: [] };
  }
  const results = await Promise.all(
    admins.map((admin) =>
      sendMail({
        to: admin.email,
        context: 'admin-new-registration',
        relatedUser: user,
        allowSuppressed,
        subject: 'New registration awaiting your approval',
        heading: 'New user registration',
        intro: 'A new user has registered and is waiting for your approval before they can access the system.',
        rows: [
          ['Name', user.name],
          ['Email', user.email],
          ['Registered on', formatWhen(user.createdAt)],
          ['Current status', 'Pending Approval'],
        ],
        bodyHtml:
          '<p style="margin:0 0 12px;">A new registration is waiting for you on the Admin &rarr; Users page. You will be asked to sign in first if you are not already signed in, and you will land straight on that registration.</p>' +
          '<p style="margin:0;">Approve it to let the applicant in, or reject it to let them submit a new application later.</p>',
        // Deep link into the existing Users page. If the admin is not signed in,
        // the app sends them through the sign-in screen and then back here, so
        // the link is a login entry point rather than a dead end.
        action: (() => {
          const link = appLink(`/users?highlight=${user?._id || ''}`);
          return link ? { label: 'View Registration', ...link } : undefined;
        })(),
      })
    )
  );

  const summary = {
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  };
  if (summary.failed > 0) {
    console.error(`[mail] admin new-registration alert: ${summary.failed} of ${results.length} administrator emails failed`);
  }
  return summary;
};

/** Sent to the user once an administrator approves their registration. */
export const sendRegistrationApprovedEmail = async (user, { allowSuppressed = false } = {}) => {
  return sendMail({
    to: user.email,
    context: 'registration-approved',
    relatedUser: user,
    allowSuppressed,
    subject: 'Your NextUp registration has been approved',
    heading: 'Your registration has been approved',
    intro: `Good news, ${user.name}. An administrator has approved your registration and you can now access the NextUp system.`,
    rows: [
      ['Name', user.name],
      ['Email', user.email],
      ['Status', 'Approved'],
    ],
    bodyHtml:
      '<p style="margin:0;">Your account is active. Use the button below to sign in with the email address and password you registered with, and you will have full access to the system straight away.</p>',
    // Absolute link to the real sign-in page, taken from the deployment
    // configuration. Omitted entirely when no public URL is configured, rather
    // than falling back to a hardcoded localhost address.
    action: loginAction(),
  });
};

/** Sent to the user when their registration is declined. */
export const sendRegistrationRejectedEmail = async (user, reason, { allowSuppressed = false } = {}) => {
  return sendMail({
    to: user.email,
    context: 'registration-rejected',
    relatedUser: user,
    allowSuppressed,
    subject: 'Your NextUp registration was not approved',
    heading: 'Your registration was not approved',
    intro: `Hello ${user.name}, an administrator has reviewed your registration and it was not approved at this time.`,
    rows: [
      ['Name', user.name],
      ['Email', user.email],
      ['Status', 'Rejected'],
      ...(reason ? [['Reason', reason]] : []),
    ],
    bodyHtml:
      '<p style="margin:0 0 12px;">You can review your information and submit a new application for approval at any time using the same email address. Your new application will be reviewed from scratch.</p>' +
      '<p style="margin:0;">If you believe this was a mistake, please contact your administrator.</p>',
    action: (() => {
      // Only the intent is carried in the link; the address is not put in a URL
      // that could end up in logs or referrer headers.
      const link = appLink('/register?reapply=1');
      return link ? { label: 'Apply Again', ...link } : undefined;
    })(),
  });
};

/**
 * Sent to a removed account after an administrator deletes it.
 *
 * `user` here is a plain snapshot captured before the database row was removed,
 * because there is no account left to read the address from afterwards. No
 * internal detail (ids, roles, status values) is exposed.
 */
export const sendAccountDeletedEmail = async (user, { allowSuppressed = false } = {}) => {
  return sendMail({
    to: user.email,
    context: 'account-deleted',
    allowSuppressed,
    // A plain snapshot: the record is already gone by the time this is sent.
    relatedUser: { _id: user._id, name: user.name, email: user.email, createdAt: user.createdAt },
    subject: 'Your NextUp account has been removed',
    heading: 'Your account has been removed',
    intro: `Hello ${user.name}, an administrator has removed your NextUp account from the system.`,
    rows: [
      ['Name', user.name],
      ['Email', user.email],
      ...(user.createdAt ? [['Registered on', formatWhen(user.createdAt)]] : []),
    ],
    bodyHtml:
      '<p style="margin:0 0 12px;">Your account is no longer part of NextUp, and you can no longer sign in or access the system with it.</p>' +
      '<p style="margin:0;">If you need access again, please contact your administrator to request a new registration.</p>',
    action: (() => {
      const link = appLink('/register');
      return link ? { label: 'Register Again', ...link } : undefined;
    })(),
  });
};

/* ------------------------------------------------------------------ *
 * Operator controls
 *
 * Both of the following are deliberately manual. Nothing in the running system
 * calls them on a timer, on startup, or as a side effect of another request.
 * ------------------------------------------------------------------ */

/** Rebuilds the recorded message for a context, so a resend is the real email. */
const RESENDERS = {
  'registration-received': (subject) => sendRegistrationReceivedEmail(subject, { allowSuppressed: true }),
  'registration-approved': (subject) => sendRegistrationApprovedEmail(subject, { allowSuppressed: true }),
  'registration-rejected': (subject) =>
    sendRegistrationRejectedEmail(subject, subject.rejectionReason || '', { allowSuppressed: true }),
  'account-deleted': (subject) => sendAccountDeletedEmail(subject, { allowSuppressed: true }),
  'admin-new-registration': (subject, recipientEmail) =>
    sendAdminNewRegistrationEmail(subject, [{ email: recipientEmail }], { allowSuppressed: true }),
};

/**
 * Contexts where the recipient is also the person the email is about, so the
 * account can be found from the address when no id was recorded. An admin alert
 * is the exception: it is delivered to the administrator but written about the
 * applicant, so only a recorded id can identify the right subject.
 */
const RECIPIENT_IS_SUBJECT = new Set([
  'registration-received',
  'registration-approved',
  'registration-rejected',
  'account-deleted',
]);

/**
 * Re-send the last transactional email to one address, because an
 * administrator explicitly asked for it.
 *
 * This is the only path allowed to attempt an address which is already
 * suppressed or undeliverable, which is the point: the automatic sends all
 * skip such an address, so recovery is a deliberate human decision. Nothing
 * calls this except the admin resend endpoint, and it sends exactly one message
 * to exactly one address.
 */
export const resendLastEmailTo = async (email) => {
  const recipient = String(email || '').trim().toLowerCase();
  if (!isUsableAddress(recipient)) {
    return { ok: false, reason: 'That is not a valid email address.' };
  }

  const record = (await listDeliveries({ limit: 500 })).find((row) => row.email === recipient);
  if (!record) {
    return { ok: false, reason: 'There is no delivery record for that address, so there is nothing to resend.' };
  }

  const resend = RESENDERS[record.lastContext];
  if (!resend) {
    return { ok: false, reason: 'The last email to that address is not a resendable registration email.' };
  }

  // The message is about the user it was written for, which is not always the
  // recipient (an admin alert is delivered to the administrator but written
  // about the applicant). Prefer the recorded id, and fall back to the address
  // itself for the contexts where they are the same person.
  const subject = record.relatedUserId
    ? await User.findById(record.relatedUserId).lean()
    : RECIPIENT_IS_SUBJECT.has(record.lastContext)
      ? await User.findOne({ email: recipient }).lean()
      : null;

  if (!subject && record.lastContext !== 'account-deleted') {
    return { ok: false, reason: 'The account this email was about no longer exists, so it cannot be rebuilt.' };
  }

  await recordManualRetry(recipient);
  // The one attempt that is allowed past suppression. It does not clear the
  // recorded state, so if this bounces the address is still marked undeliverable
  // and nothing will try it again on its own.
  console.log(
    `[mail] MANUAL RESEND requested for ${recipient} (context=${record.lastContext}` +
      `${record.blocked ? ', address is currently stopped' : ''})`
  );

  const result =
    record.lastContext === 'account-deleted'
      ? await resend({ _id: record.relatedUserId, name: 'there', email: recipient, createdAt: new Date() })
      : await resend(subject, recipient);

  return {
    ok: Boolean(result?.sent),
    status: result?.status || 'failed',
    reason: result?.reason || '',
    stillStopped: record.blocked,
  };
};

/**
 * Report a non-delivery (bounce) for an address.
 *
 * Plain SMTP cannot tell us that a message we handed over was later refused:
 * by then the conversation is over and the report is delivered to our own
 * mailbox instead. This is where that report is fed back in, and the address is
 * taken out of rotation.
 */
export const reportBounce = async ({ email, reason, detail }) => markUndeliverable({ email, reason, detail });

export { listDeliveries };
