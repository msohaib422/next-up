import { v2 as cloudinary } from 'cloudinary';

let configured = false;

function ensureCloudinaryConfig() {
  if (configured) return;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  const missing = [
    !CLOUDINARY_CLOUD_NAME && 'CLOUDINARY_CLOUD_NAME',
    !CLOUDINARY_API_KEY && 'CLOUDINARY_API_KEY',
    !CLOUDINARY_API_SECRET && 'CLOUDINARY_API_SECRET',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Cloudinary configuration missing. Required environment variables: ${missing.join(', ')}`
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });

  configured = true;
}

export const uploadToCloudinary = (buffer, folder, filename) => {
  ensureCloudinaryConfig();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: filename,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          if (error.http_code === 401) {
            error.message = `Cloudinary authentication failed. Check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. Original: ${error.message}`;
          }
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    stream.end(buffer);
  });
};

export const deleteFromCloudinary = async ({ publicId, resourceType = 'image' } = {}) => {
  if (!publicId) {
    console.warn('[Cloudinary Delete] No publicId provided, skipping.');
    return { success: false, reason: 'no_publicId' };
  }

  ensureCloudinaryConfig();

  try {
    console.log(`[Cloudinary Delete] publicId: ${publicId}, resourceType: ${resourceType}`);
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });

    if (result.result === 'not found') {
      console.log(`[Cloudinary Delete] publicId: ${publicId}, status: not_found (already deleted or never existed)`);
      return { success: true, status: 'not_found' };
    }

    console.log(`[Cloudinary Delete] publicId: ${publicId}, status: ${result.result}`);
    return { success: true, status: result.result };
  } catch (error) {
    console.error(`[Cloudinary Delete] publicId: ${publicId}, status: failed, reason: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

export const extractCloudinaryMetadata = (result) => ({
  publicId: result.public_id || '',
  resourceType: result.resource_type || 'image',
  type: result.type || 'upload',
  format: result.format || '',
  url: result.secure_url || result.url || '',
});
