import mongoose from 'mongoose';

/**
 * MongoDB connection lifecycle.
 *
 * Two properties matter here, and both were the cause of the "backend stopped
 * responding until I restart it" behaviour:
 *
 *  1. ONE connection is reused for the whole process. Serverless runtimes keep a
 *     warm container between invocations, so the connection (and its promise)
 *     is cached on `global` and reused. Without that, every request would open
 *     a new pool until Atlas refuses more.
 *
 *  2. A transient database problem must never become a failed request. The
 *     driver already reconnects on its own, so operations are buffered for a
 *     short window and replayed once the socket is back. Setting
 *     `bufferCommands: false` - as this file used to - did the opposite: it made
 *     every reconnect blip throw "Client must be connected before running
 *     operations" straight to the route, which surfaced as a 500 on every page.
 *
 * `connectDB()` also never throws at the call site. A connection failure is
 * logged and retried on the next call, because an unhandled rejection here
 * would terminate the Node process and take the whole API down - which is
 * exactly what a manual restart used to be fixing.
 */

const CACHE_KEY = '__nextupMongoose';

const cache = (global[CACHE_KEY] = global[CACHE_KEY] || { conn: null, promise: null });

/** Read a positive number from the environment, or fall back to the default. */
const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const connectionOptions = () => ({
  // Buffer briefly during a reconnect instead of failing the request outright.
  bufferCommands: true,
  bufferTimeoutMS: positiveNumber(process.env.MONGO_BUFFER_TIMEOUT_MS, 10000),
  // Fail in a bounded time rather than hanging a request on a dead route.
  serverSelectionTimeoutMS: positiveNumber(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10000),
  connectTimeoutMS: positiveNumber(process.env.MONGO_CONNECT_TIMEOUT_MS, 10000),
  socketTimeoutMS: positiveNumber(process.env.MONGO_SOCKET_TIMEOUT_MS, 45000),
  // Bounded pool: reused across requests, never grown without limit.
  maxPoolSize: positiveNumber(process.env.MONGO_MAX_POOL_SIZE, 10),
  minPoolSize: 0,
  maxIdleTimeMS: positiveNumber(process.env.MONGO_MAX_IDLE_TIME_MS, 30000),
  waitQueueTimeoutMS: positiveNumber(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS, 10000),
  retryWrites: true,
});

let listenersAttached = false;

/**
 * Log connection lifecycle events exactly once per process.
 *
 * A brief `disconnected` is normal: the driver reconnects on its own and the
 * buffer covers requests raised in the meantime. It is logged so a genuine,
 * sustained outage is visible in the platform logs instead of being silent.
 */
const attachConnectionListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  const { connection } = mongoose;

  connection.on('connected', () => {
    console.log(`[db] connected to ${connection.name} (db="${connection.db?.databaseName || 'unknown'}")`);
  });

  connection.on('reconnected', () => {
    console.log('[db] reconnected - connection pool restored');
  });

  connection.on('disconnected', () => {
    console.warn('[db] disconnected - the driver is reconnecting; buffered operations will be replayed');
  });

  connection.on('error', (error) => {
    // Never rethrown: a connection-level error must not become an unhandled
    // 'error' event, which would kill the process.
    console.error('[db] connection error:', error.message);
  });
};

/**
 * Resolve once a usable connection exists, starting one if needed.
 *
 * Resolves (possibly to `null`) rather than rejecting: a caller that merely
 * wants "is the database ready" must not have to handle a failure here, and a
 * cold start must never crash the process. Requests that need the database will
 * surface a real, correctly-classified error from their own query.
 */
const connectDB = async () => {
  const state = mongoose.connection.readyState;
  // 1 === connected. Reuse the live connection instead of reconnecting.
  if (state === 1) return cache.conn || mongoose.connection;

  if (!process.env.MONGODB_URI) {
    console.error('[db] MONGODB_URI is not set - the API cannot reach the database');
    return null;
  }

  attachConnectionListeners();

  /*
   * A cached connection that is no longer connected is STALE.
   *
   * Returning the cached promise here would hand back a dead pool on every
   * subsequent call, so the process would keep answering 503 forever and only a
   * restart would recover it - the exact behaviour this file exists to prevent.
   * readyState 0 means the connection is fully closed, so the cache is dropped
   * and the next call opens a fresh one. (readyState 2, "connecting", is left
   * alone: the attempt is genuinely in flight and must be awaited, not
   * duplicated.)
   */
  if (cache.conn && state === 0) {
    cache.conn = null;
    cache.promise = null;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGODB_URI, connectionOptions())
      .then((instance) => {
        cache.conn = instance.connection;
        return instance.connection;
      })
      .catch((error) => {
        // Clear the cached promise so the next request retries rather than
        // inheriting a permanently rejected one.
        cache.promise = null;
        cache.conn = null;
        console.error(`[db] connection failed: ${error.message}`);
        return null;
      });
  }

  return cache.promise;
};

/**
 * Gate for request handling: make sure the database is connected before a
 * route runs, so a cold serverless start or a reconnect window produces one
 * shared connection attempt instead of a burst of failed queries.
 */
export const ensureDb = async () => {
  if (mongoose.connection.readyState === 1) return true;
  const connection = await connectDB();
  return mongoose.connection.readyState === 1 || Boolean(connection);
};

/** Test/diagnostic helper: is the database currently usable? */
export const isDbConnected = () => mongoose.connection.readyState === 1;

/** Test/diagnostic helper: drop the cached connection so the next call reconnects. */
export const resetDbCache = () => {
  cache.conn = null;
  cache.promise = null;
};

export default connectDB;
