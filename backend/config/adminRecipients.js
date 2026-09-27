import User from '../models/User.js';

/**
 * The administrators who receive admin-only email.
 *
 * Recipients come from the environment, never from source, so an address is
 * changed in the deployment settings instead of in a code edit. The names follow
 * the project's existing `SCREAMING_SNAKE_CASE` convention:
 *
 *   ADMIN_EMAIL_1   first admin recipient
 *   ADMIN_EMAIL_2   second admin recipient
 *   ADMIN_EMAILS    optional extra comma-separated recipients
 *
 * `ADMIN_EMAILS` is what makes a third administrator a configuration change
 * rather than a code change, and it is also the single-variable form if that is
 * easier to maintain than numbered slots. Adding `ADMIN_EMAIL_3` also works -
 * every `ADMIN_EMAIL_<n>` in the environment is collected, so the numbered
 * variables do not have to stop at two.
 *
 * If nothing is configured the recipients fall back to the accounts in the
 * database that hold the administrator role, so a deployment that has not set
 * these yet still reaches its admins rather than silently mailing nobody.
 */

const isValidAddress = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());

const normalize = (value) => String(value || '').trim().toLowerCase();

/**
 * Every `ADMIN_EMAIL_<n>` currently present in the environment, in numeric
 * order, so the list is stable rather than dependent on env ordering.
 */
const numberedAdminEmails = () => {
  const pattern = /^ADMIN_EMAIL_(\d+)$/;
  return Object.keys(process.env)
    .map((key) => ({ key, match: key.match(pattern) }))
    .filter((entry) => entry.match && normalize(process.env[entry.key]))
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map((entry) => normalize(process.env[entry.key]));
};

const listAdminEmails = () =>
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(normalize)
    .filter(Boolean);

/**
 * The configured recipients, de-duplicated and in a stable order, with any
 * syntactically invalid entry dropped and reported once.
 */
export const configuredAdminEmails = () => {
  const candidates = [...numberedAdminEmails(), ...listAdminEmails()];

  const seen = new Set();
  const valid = [];
  const invalid = [];

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (isValidAddress(candidate)) valid.push(candidate);
    else invalid.push(candidate);
  }

  if (invalid.length) {
    console.warn(
      `[admin-recipients] ignoring invalid ADMIN_EMAIL value(s): ${invalid.join(', ')}`
    );
  }

  return valid;
};

/**
 * Recipients for an admin-only email: the configured list, or the administrator
 * accounts in the database when nothing is configured.
 *
 * This is the single place that decides who admin email goes to, so every
 * admin-only email reaches exactly the same set of people.
 */
export const resolveAdminRecipients = async () => {
  const configured = configuredAdminEmails();
  if (configured.length) return configured;

  const admins = await User.find({ role: 'collaborator' }).select('email').lean();
  const fromDatabase = admins.map((admin) => normalize(admin.email)).filter(isValidAddress);

  console.warn(
    '[admin-recipients] no ADMIN_EMAIL_* configured - falling back to the ' +
      `${fromDatabase.length} administrator account(s) in the database`
  );
  return [...new Set(fromDatabase)];
};

/** Non-secret summary for diagnostics. Safe to log. */
export const describeAdminRecipients = async () => ({
  source: configuredAdminEmails().length ? 'environment' : 'database',
  recipients: await resolveAdminRecipients(),
});
