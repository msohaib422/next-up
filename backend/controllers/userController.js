import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import { generateToken } from '../utils/helpers.js';
import { deleteFromCloudinary } from '../services/cloudinary.js';

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name },
      { new: true, runValidators: true }
    );
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateProfileImage = async (req, res, next) => {
  try {
    const { profileImage, profileImageMeta } = req.body;

    const existingUser = await User.findById(req.user._id);

    const updateData = { profileImage };
    if (profileImageMeta) {
      updateData.profileImageMeta = {
        publicId: profileImageMeta.publicId || '',
        resourceType: profileImageMeta.resourceType || '',
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    );

    if (existingUser?.profileImageMeta?.publicId && profileImage !== existingUser.profileImage) {
      await deleteFromCloudinary({
        publicId: existingUser.profileImageMeta.publicId,
        resourceType: existingUser.profileImageMeta.resourceType || 'image',
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    const token = generateToken(user._id);
    res.json({ success: true, message: 'Password updated successfully', token });
  } catch (error) {
    next(error);
  }
};
