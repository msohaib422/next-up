import nodemailer from 'nodemailer';

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
 *   ADMIN_REVIEW_URL  absolute base URL so the admin "Review Registration"
 *                     button can link straight to the Users page
 *
 * A missing or broken mail server must never stop a registration or an
 * approval decision, so sending is best-effort like createActivity and the
 * notification service. It is never silent though: every attempt is logged
 * with its outcome, and callers receive a structured result they can surface.
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

const BRAND = 'UniProductive';

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
 * completes, but the outcome is never silent: it is logged and returned as a
 * structured result the caller can surface or react to.
 *
 * Resolves to { sent: boolean, status: 'sent' | 'skipped' | 'failed', reason? }
 */
export const sendMail = async ({ to, subject, heading, intro, rows, bodyHtml, bodyText, action, footer, context }) => {
  const html = layout({ heading, intro, rows, body: bodyHtml, action, footer });
  const text = bodyText || toPlainText({ heading, intro, rows, action });
  const where = context ? ` (${context})` : '';

  if (!isMailConfigured()) {
    const reason = `SMTP not configured - missing ${missingVars().join(', ')}`;
    console.warn(`[mail] SKIPPED "${subject}" to=${to}${where}: ${reason}`);
    return { sent: false, status: 'skipped', reason };
  }

  try {
    const info = await getTransporter().sendMail({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
    });
    console.log(`[mail] SENT "${subject}" to=${to}${where} (messageId=${info?.messageId || 'n/a'})`);
    return { sent: true, status: 'sent', messageId: info?.messageId || null };
  } catch (error) {
    const reason = classifyError(error);
    // The reason is a fixed, human-written string, so no secret can reach it.
    console.error(`[mail] FAILED "${subject}" to=${to}${where}: ${reason}`);
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
export const sendRegistrationReceivedEmail = async (user) => {
  return sendMail({
    to: user.email,
    context: 'registration-received',
    subject: 'Your UniProductive registration has been received',
    heading: `Welcome, ${user.name}`,
    intro:
      'Thank you for registering with UniProductive. Your registration has been successfully received and is currently waiting for administrator confirmation.',
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
export const sendAdminNewRegistrationEmail = async (user, admins) => {
  if (!admins?.length) {
    console.warn('[mail] no administrator accounts found - nobody was notified of the new registration');
    return { sent: 0, failed: 0, skipped: 0, results: [] };
  }
  const results = await Promise.all(
    admins.map((admin) =>
      sendMail({
        to: admin.email,
        context: 'admin-new-registration',
        subject: 'New registration awaiting your approval',
        heading: 'New user registration',
        intro: 'A new user has registered and is waiting for your approval before they can access the system.',
        rows: [
          ['Name', user.name],
          ['Email', user.email],
          ['Registered on', formatWhen(user.createdAt)],
          ['Current status', 'Pending Approval'],
        ],
        bodyHtml: '<p style="margin:0;">Review this registration on the Admin &rarr; Users page to approve or decline it.</p>',
        action: (() => {
          const base = (process.env.ADMIN_REVIEW_URL || '').replace(/\/$/, '');
          return base ? { label: 'Review Registration', url: `${base}/users` } : undefined;
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
export const sendRegistrationApprovedEmail = async (user) => {
  return sendMail({
    to: user.email,
    context: 'registration-approved',
    subject: 'Your UniProductive registration has been approved',
    heading: 'Your registration has been approved',
    intro: `Good news, ${user.name}. An administrator has approved your registration and you can now access the UniProductive system.`,
    rows: [
      ['Name', user.name],
      ['Email', user.email],
      ['Status', 'Approved'],
    ],
    bodyHtml:
      '<p style="margin:0;">Sign in with the email address and password you registered with to get started.</p>',
  });
};

/** Sent to the user when their registration is declined. */
export const sendRegistrationRejectedEmail = async (user, reason) => {
  return sendMail({
    to: user.email,
    context: 'registration-rejected',
    subject: 'Your UniProductive registration was not approved',
    heading: 'Your registration was not approved',
    intro: `Hello ${user.name}, an administrator has reviewed your registration and it was not approved at this time.`,
    rows: [
      ['Name', user.name],
      ['Email', user.email],
      ['Status', 'Rejected'],
      ...(reason ? [['Reason', reason]] : []),
    ],
    bodyHtml: `<p style="margin:0;">If you believe this was a mistake, or you have updated the details above, please contact your administrator.</p>`,
  });
};
