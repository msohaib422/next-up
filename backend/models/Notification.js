import mongoose from 'mongoose';

// Structured, extensible notification types. Keep in sync with
// frontend/src/components/notifications/notificationTypes.js
export const NOTIFICATION_TYPES = [
  'CONTRIBUTION_SUBMITTED',
  'CONTRIBUTION_APPROVED',
  'CONTRIBUTION_PUBLISHED',
  'CONTRIBUTION_REJECTED',
  'CONTRIBUTION_UPDATED',
  'CONTRIBUTION_DELETED',
  // An admin published new content, or changed content that already exists.
  'CONTENT_ADDED',
  'CONTENT_UPDATED',
  // An item was marked complete, or moved back to incomplete.
  'CONTENT_COMPLETED',
  'CONTENT_REOPENED',
  // An admin pinned an announcement to the top of the list.
  'CONTENT_PINNED',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Please provide a recipient'],
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    type: {
      type: String,
      required: [true, 'Please provide a notification type'],
      enum: NOTIFICATION_TYPES,
    },
    title: {
      type: String,
      required: [true, 'Please provide a title'],
      trim: true,
    },
    message: {
      type: String,
      default: '',
    },
    // Related entity (published Task/Quiz/Assignment/Essential/Announcement)
    entityType: {
      type: String,
      default: '',
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // In-app destination, e.g. /tasks?highlight=<id> or /approvals
    link: {
      type: String,
      default: '',
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Server-side guard against duplicate notifications for the same event.
    // Left undefined when unused: a sparse index skips a *missing* field, not
    // one stored as null, so a null default would let only a single un-keyed
    // notification exist before every later insert hit a duplicate key error.
    dedupeKey: {
      type: String,
      default: undefined,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
// Uniqueness applies to real dedupe keys only, so notifications without one
// are never treated as duplicates of each other.
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
