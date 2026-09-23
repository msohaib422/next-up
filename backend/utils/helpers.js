import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// Returns the list of user IDs whose records may be READ by the requester.
// Records are stored under the creator's account, so admin (collaborator)-created
// data must also be visible to normal users. Collaborators keep seeing only
// their own records, exactly as before.
export const getVisibleUserIds = async (user) => {
  if (user.role === 'collaborator') {
    return [user._id];
  }
  const collaborators = await User.find({ role: 'collaborator' }).select('_id');
  return [user._id, ...collaborators.map((c) => c._id)];
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const getCurrentDay = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
};

export const getCurrentTime = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};
