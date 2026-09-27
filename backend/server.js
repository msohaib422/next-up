import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';

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

const app = express();

// On Vercel every request arrives through the platform's proxy, so req.ip would
// otherwise be the proxy's address. That makes the rate limiter below treat all
// visitors as one shared client, and Vercel rejects a permissive trust proxy
// value, so 1 (hop) is used instead.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

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
app.use('/api/admin/contributions', adminContributionRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

app.use((req, res, next) => {
  console.log(`[404] Unmatched route: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use(errorHandler);

connectDB().catch((err) => {
  console.error('MongoDB connection failed:', err.message);
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
