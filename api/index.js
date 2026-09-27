// import app from '../backend/server.js';

// export default function handler(req, res) {
//   return app(req, res);
// }

// export const config = {
//   api: {
//     bodyParser: false,
//   },
// };


import app from '../backend/server.js';
import connectDB from '../backend/config/db.js';

export default async function handler(req, res) {
  try {
    await connectDB();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    res.status(500).json({ success: false, message: 'Database connection failed' });
    return;
  }
  return app(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};