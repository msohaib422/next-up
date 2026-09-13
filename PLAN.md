# Fix "Image upload to storage failed" — Upload Flow Debug Plan

## Root Cause Analysis

The root cause is an **ES module import ordering issue** that causes `cloudinary.config()` to be called with `undefined` environment variables.

### The Problem

In `backend/server.js`, `dotenv.config()` is called as a regular statement:

```js
import dotenv from 'dotenv';
dotenv.config();          // ← This runs AFTER all imports are resolved
import express from 'express';
// ... more imports ...
import taskRoutes from './routes/taskRoutes.js';  // ← This triggers cloudinary.js load
```

In ES modules, `import` declarations are **hoisted** to the top of the module. The actual execution order is:

1. All `import` statements are resolved (depth-first, before module body)
2. `taskRoutes` → `taskController` → `cloudinary.js` is loaded
3. `cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, ... })` runs — but `process.env.CLOUDINARY_CLOUD_NAME` is **`undefined`** because `dotenv.config()` hasn't run yet
4. The Cloudinary SDK stores `undefined` config values
5. Only then does `dotenv.config()` run and populate `process.env`
6. But the Cloudinary config has already been set to `undefined`
7. When `uploadToCloudinary()` is called, the Cloudinary API fails with an authentication error
8. The catch block returns: `"File upload to storage failed."`

**The upload middleware (Multer) works fine. The file is received. The failure is at the Cloudinary API call due to missing credentials.**

### Secondary Issue

The `public_id` in the Cloudinary upload includes a folder prefix that duplicates with the `folder` parameter:

```js
const safeName = `tasks/${Date.now()}-...`;  // public_id = "tasks/12345-..."
// uploadToCloudinary(buffer, 'tasks', safeName)
// → folder: 'tasks', public_id: 'tasks/12345-...'
// → Cloudinary path: tasks/tasks/12345-...
```

This doesn't cause the failure but creates a messy path structure.

---

## Files to Change

### 1. `backend/services/cloudinary.js` — Fix lazy initialization + add validation

**What to change:**
- Remove the top-level `cloudinary.config()` call (it runs before env vars are loaded)
- Add a `ensureCloudinaryConfig()` function that validates env vars and configures Cloudinary on first use (lazy initialization)
- Call `ensureCloudinaryConfig()` inside `uploadToCloudinary()` before uploading
- Improve error messages for different failure types (missing env vars, auth error, upload error)

**Current code (problematic):**
```js
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadToCloudinary = (buffer, folder, filename) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: filename, resource_type: 'auto' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
};
```

**New code:**
```js
import { v2 as cloudinary } from 'cloudinary';

let configured = false;

function ensureCloudinaryConfig() {
  if (configured) return;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Cloudinary configuration missing. Required environment variables: ' +
      [!CLOUDINARY_CLOUD_NAME && 'CLOUDINARY_CLOUD_NAME', !CLOUDINARY_API_KEY && 'CLOUDINARY_API_KEY', !CLOUDINARY_API_SECRET && 'CLOUDINARY_API_SECRET']
        .filter(Boolean)
        .join(', ')
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });

  configured = true;
}

export const uploadToCloudinary = async (buffer, folder, filename) => {
  ensureCloudinaryConfig();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: filename, resource_type: 'auto' },
      (error, result) => {
        if (error) {
          // Enrich error with more context
          if (error.http_code === 401) {
            error.message = `Cloudinary authentication failed. Check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. Original: ${error.message}`;
          } else if (error.http_code === 404) {
            error.message = `Cloudinary resource not found: ${error.message}`;
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

export const deleteFromCloudinary = async (publicId) => {
  ensureCloudinaryConfig();
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    throw error;
  }
};
```

**Why:** The `ensureCloudinaryConfig()` function is called at upload time (when `process.env` is fully loaded), not at module import time. This fixes the race condition. The env var validation provides a clear error message if credentials are missing.

---

### 2. `backend/controllers/taskController.js` — Fix public_id path + improve error handling

**What to change:**
- Fix the `public_id` to NOT include the folder prefix (let Cloudinary's `folder` param handle it)
- Add more descriptive error handling in the Cloudinary upload catch block
- Log the full error object for debugging (not just `error.message`)

**Current code (problematic lines 28-30):**
```js
const safeName = `tasks/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
console.log('[Upload] Uploading to Cloudinary as:', safeName);
const result = await uploadToCloudinary(req.file.buffer, 'tasks', safeName);
```

**New code:**
```js
const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
console.log('[Upload] Uploading to Cloudinary, folder: tasks, public_id:', safeName);
const result = await uploadToCloudinary(req.file.buffer, 'tasks', safeName);
```

**Current error handling (lines 40-44):**
```js
} catch (error) {
  console.error('[Upload] Cloudinary upload error:', error.message);
  const message = error.message || 'File upload to storage failed.';
  res.status(500).json({ success: false, message });
}
```

**New error handling:**
```js
} catch (error) {
  console.error('[Upload] Cloudinary upload error:', {
    message: error.message,
    name: error.name,
    http_code: error.http_code,
    stack: error.stack,
  });

  let message;
  if (error.message?.includes('Cloudinary configuration missing')) {
    message = 'Upload service is not configured. Please contact support.';
    res.status(500).json({ success: false, message });
  } else if (error.http_code === 401 || error.message?.includes('authentication failed')) {
    message = 'Upload service authentication failed. Please contact support.';
    res.status(500).json({ success: false, message });
  } else if (error.message?.includes('File too large') || error.code === 'LIMIT_FILE_SIZE') {
    message = 'File is too large. Maximum size is 10 MB.';
    res.status(400).json({ success: false, message });
  } else {
    message = error.message || 'File upload to storage failed.';
    res.status(500).json({ success: false, message });
  }
}
```

**Why:** The `public_id` fix removes the double `tasks/tasks/` path. The improved error handling distinguishes between configuration errors, authentication errors, and other upload errors, providing actionable messages without exposing secrets.

---

### 3. No changes needed to these files (verified correct):

| File | Status | Reason |
|------|--------|--------|
| `frontend/src/components/TaskModal.jsx` | ✅ Correct | FormData construction, file field name ('file'), axios request, error handling — all correct |
| `frontend/src/api/axios.js` | ✅ Correct | No manual Content-Type header (browser auto-sets it for FormData), auth interceptor works correctly |
| `backend/middleware/upload.js` | ✅ Correct | Multer memoryStorage, fileFilter (images + PDF), 10MB limit — all correct |
| `backend/routes/taskRoutes.js` | ✅ Correct | Route `POST /upload` with `uploadTaskFile` middleware — correct |
| `backend/models/Task.js` | ✅ Correct | Attachment schema with `name`, `url`, `type` — correct |
| `frontend/src/pages/TasksPage.jsx` | ✅ Correct | `handleSave` passes attachment to task creation — correct |
| `backend/server.js` | ✅ Correct (for this fix) | The root cause is in `cloudinary.js`, not here |
| `backend/.env` | ✅ Has values | Cloudinary credentials are present (not placeholders) |

---

## Complete Upload Flow (After Fix)

```
1. User selects file in TaskModal.jsx
   → handleFileChange validates type (PDF, JPG, JPEG, PNG, WEBP) and size (≤10MB)
   → File stored in React state: setFile(selected)

2. User clicks "Create" / "Update"
   → handleSubmit() calls uploadFile()

3. uploadFile() builds FormData
   → formData.append('file', file)   // field name = 'file'
   → POST /api/tasks/upload           // via axios instance (baseURL: '/api')
   → Browser auto-sets Content-Type: multipart/form-data; boundary=...

4. Backend receives request
   → protect middleware validates JWT (no body interference)
   → Multer upload.single('file') processes multipart into memory buffer
   → File filter validates MIME type
   → Size limit (10MB) enforced

5. Cloudinary upload (AFTER fix: lazy config init)
   → ensureCloudinaryConfig() validates env vars and configures SDK
   → upload_stream() streams buffer to Cloudinary
   → resource_type: 'auto' (images → 'image', PDFs → 'raw')
   → Returns { secure_url, ... }

6. Response sent to frontend
   → { success: true, data: { name, url: secure_url, type: mimetype } }

7. Frontend receives attachment data
   → uploadFile() returns { name, url, type }
   → handleSubmit() passes attachment to onSave()

8. Task created/updated
   → handleSave() posts task data with attachment to POST /api/tasks
   → createTask() saves to MongoDB with attachment: { name, url, type }

9. Task displayed
   → TasksPage renders attachment link below task description
   → Clicking opens preview (image inline, PDF in iframe)
```

---

## How to Test

1. **Restart the backend server** after the fix (env vars need to be re-read)
2. Open the app, go to Tasks page
3. Click "Add Task"
4. Fill in subject, title, select a deadline mode
5. Click the attachment picker, select an image (JPG/PNG) or PDF
6. Click "Create"
7. Verify: toast shows "Task created" (not "Image upload to storage failed")
8. Verify: task card shows the attachment file name
9. Click the attachment name — image should preview inline, PDF should open in iframe
10. Refresh the page — attachment should still be there (persisted in MongoDB)
11. Test with each supported file type: JPG, JPEG, PNG, WEBP, PDF
12. Test with a file > 10MB — should show "File is too large" error
13. Test with a .txt file — should show "File type not supported" error

---

## Why the Previous Implementation Failed

The Cloudinary SDK was configured at **module import time** (`cloudinary.config()` at the top level of `services/cloudinary.js`). Due to ES module import hoisting, this ran **before** `dotenv.config()` in `server.js`, so all three Cloudinary credentials (`cloud_name`, `api_key`, `api_secret`) were `undefined`. The Cloudinary API then rejected the upload request with an authentication error, which was caught and returned as `"File upload to storage failed."`.
