import multer from 'multer';
import { MAX_UPLOAD_BYTES } from '../config/uploadLimits.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported. Only images and PDFs are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // From config/uploadLimits.js, which defaults to the size Vercel accepts.
    fileSize: MAX_UPLOAD_BYTES,
  },
});

export default upload;
