import mongoose from 'mongoose';

/** Unmatched route. Kept separate from the error handler for clarity. */
export const notFoundHandler = (req, res) => {
  console.log(`[404] Unmatched route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Recognise "the database is not usable right now" as distinct from "this
 * request was wrong".
 *
 * While MongoDB reconnects, Mongoose either buffers the operation (and then
 * times out) or refuses it because the client is not connected. Both are
 * temporary and both used to be reported as a 500, which a client cannot
 * distinguish from a real application fault. They are reported as 503 with an
 * `retryable` flag so the client knows to try again rather than treat the
 * session as broken.
 *
 * Detection is by name and by message rather than by class, because the
 * base `MongooseError` is not exported from `mongoose.Error` in Mongoose 8, so
 * an `instanceof` check against it silently never matches.
 */
const TEMPORARY_ERROR_NAMES = new Set([
  'MongooseError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongoTopologyError',
  'PoolClearedError',
]);

const TEMPORARY_ERROR_PATTERNS = [
  /buffering timed out/i,
  /Client must be connected before running operations/i,
  /topology (?:is )?closed/i,
  /connection pool was cleared/i,
];

const isTemporaryDatabaseError = (error) => {
  if (!error) return false;
  if (error instanceof mongoose.Error.MongooseServerSelectionError) return true;
  if (TEMPORARY_ERROR_NAMES.has(error.name)) return true;

  const text = `${error.message || ''} ${error.reason?.message || ''}`;
  return TEMPORARY_ERROR_PATTERNS.some((pattern) => pattern.test(text));
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const logId = `${req.method} ${req.originalUrl}`;
  console.error(`[error] ${logId} -> ${err.name || 'Error'}: ${err.message}`);
  if (process.env.NODE_ENV !== 'production' && err.stack) console.error(err.stack);

  if (err.name === 'CastError') {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }

  if (err.code === 11000) {
    return res.status(400).json({ success: false, message: 'Duplicate field value entered' });
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  if (err.name === 'JsonWebTokenError') {
    // A genuine credential problem, not a transient failure: this is the only
    // class of failure the client is allowed to end a session on.
    return res.status(401).json({ success: false, message: 'Invalid token', reason: 'INVALID_TOKEN' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired', reason: 'TOKEN_EXPIRED' });
  }

  if (isTemporaryDatabaseError(err)) {
    return res.status(503).json({
      success: false,
      message: 'The database is temporarily unavailable. Please try again in a moment.',
      reason: 'DATABASE_UNAVAILABLE',
      retryable: true,
    });
  }

  // Multer's own errors, so an oversized or rejected upload is a clean 400
  // rather than an opaque 500.
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: err.message });
  }

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // The stack is a development aid only; it must never reach production.
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack }),
  });
};
