/**
 * Upload size limit, in one place.
 *
 * The default is 4 MB rather than the old 10 MB because Vercel Functions reject
 * a request body larger than 4.5 MB *before* the function runs. A 10 MB limit
 * therefore only ever worked in local development and failed in production with
 * an opaque platform error, so the limit and the message the user sees now come
 * from the same source of truth.
 *
 * MAX_UPLOAD_MB can raise or lower it, but anything above 4 MB will not work on
 * Vercel: the platform rejects the request before this code is reached.
 */
const DEFAULT_MAX_UPLOAD_MB = 4;

const configuredMb = Number(process.env.MAX_UPLOAD_MB);
const maxUploadMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : DEFAULT_MAX_UPLOAD_MB;

export const MAX_UPLOAD_BYTES = Math.round(maxUploadMb * 1024 * 1024);
export const MAX_UPLOAD_MB = maxUploadMb;

/** The user-facing sentence, so every upload route says the same thing. */
export const fileTooLargeMessage = `File is too large. Maximum size is ${maxUploadMb} MB.`;
