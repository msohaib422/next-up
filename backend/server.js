import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load backend/.env explicitly rather than relying on the process working
// directory, so SMTP variables are found whether the app is started from the
// repo root, from backend/, or from a serverless runtime. A missing file is
// ignored, which is the normal case on Vercel where the variables come from
// the dashboard.
const backendEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env');
dotenv.config({ path: backendEnv });
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import connectDB, { ensureDb, isDbConnected } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { SESSION_TOKEN_HEADER, SESSION_IDLE_HEADER } from './middleware/auth.js';
import { verifySmtpConnection, isMailConfigured } from './services/mailService.js';
import { describeAppUrl } from './config/appUrl.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import lectureRoutes from './routes/lectureRoutes.js';
import importantDateRoutes from './routes/importantDateRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import essentialRoutes from './routes/essentialRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import contributionRoutes, { adminContributionRoutes } from './routes/contributionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

const app = express();

/*
 * On Vercel every request arrives through the platform proxy, so the socket's
 * remote address is the proxy's. Without this, req.ip is wrong, rate limiting
 * counts the proxy as a single client, and express-rate-limit refuses to start.
 * `1` means "trust exactly one hop", which is the platform proxy.
 */
app.set('trust proxy', 1);

/**
 * CORS. The default stays permissive so nothing breaks for an existing
 * deployment, but a deployment can pin the allowed origins with
 * CORS_ORIGINS=https://app.example.com,https://admin.example.com
 */
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: same-origin navigation, curl, or a server-to-server
      // call. Nothing to enforce.
      if (!origin) return callback(null, true);
      if (!allowedOrigins.length) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    // The sliding session renewal travels in response headers, so a browser
    // hosted on a different origin has to be allowed to read them. Irrelevant
    // for the normal same-origin deployment, where nothing is hidden.
    exposedHeaders: [SESSION_TOKEN_HEADER, SESSION_IDLE_HEADER],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Rate limiting.
 *
 * The previous limit was 100 requests per 15 minutes across every /api route.
 * The notification bell alone polls /notifications/unread-count every 30
 * seconds and refetches on every tab focus, so an ordinary session exhausted
 * that budget and every later call came back 429 - which the client read as
 * "the backend is broken". The limit is now generous by default and
 * configurable, and the standard headers are returned so a client can see the
 * remaining budget instead of guessing.
 */
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxRequests = Number(process.env.RATE_LIMIT_MAX) || 1000;

const limiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api', limiter);

/**
 * Make sure there is a database connection before a route runs.
 *
 * On a cold serverless start this turns a burst of simultaneous requests into
 * one shared connection attempt instead of a burst of failures, and during a
 * reconnect window it lets the request wait for the connection rather than
 * failing immediately. It deliberately does not reject the request: if the
 * database is genuinely unreachable, the route's own query reports a real,
 * correctly-classified 503.
 */
app.use('/api', async (req, res, next) => {
  if (isDbConnected()) return next();
  try {
    await ensureDb();
  } catch (error) {
    console.error('[db] pre-request connection attempt failed:', error.message);
  }
  return next();
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    database: isDbConnected() ? 'connected' : 'connecting',
    uptime: Math.round(process.uptime()),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/important-dates', importantDateRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/essentials', essentialRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/contributions', adminContributionRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

/*
 * Process-level guards.
 *
 * Without these, a single unhandled rejection terminates a Node process by
 * default. That is why the API could be "gone" until it was restarted manually:
 * one transient database error during startup was enough to kill it. The
 * database is retried, transient requests fail individually, and a truly
 * unexpected error is logged loudly instead of silently ending the process.
 */
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  // An uncaught exception leaves the process in an undefined state, so this is
  // logged in full and the process is restarted by the platform rather than
  // limping on.
  console.error('[process] uncaught exception:', error);
  process.exit(1);
});

// Fire-and-forget, and connectDB() never rejects, so a database problem at
// startup can no longer take the API down with it.
connectDB().catch((error) => {
  console.error('[db] initial connection attempt failed:', error.message);
});

// Report SMTP readiness once at startup. Non-fatal by design: a broken mail
// server must not stop the API from serving, but it should never be silent.
if (isMailConfigured()) {
  verifySmtpConnection().catch(() => {});
}

// Say out loud which origin email links will be built from. This is the check
// that makes a "localhost in production" deployment visible in the logs instead
// of only in somebody's inbox.
const appUrl = describeAppUrl();
if (appUrl.baseUrl) {
  console.log(`[app-url] email links will use ${appUrl.baseUrl} (from ${appUrl.source})`);
}

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Stop accepting new work, finish what is in flight, then close the database
  // pool. Prevents "connection already in use" style noise on a restart.
  const shutdown = (signal) => {
    console.log(`[process] ${signal} received - shutting down gracefully`);
    server.close(() => {
      console.log('[process] HTTP server closed');
      process.exit(0);
    });
    // Never hang forever on a stuck connection.
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
