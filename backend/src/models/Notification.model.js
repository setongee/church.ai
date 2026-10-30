import mongoose from 'mongoose';

// One in-app notification for one person (roster changes, account news...). Chat has its own live alerts and unread counts.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['roster', 'roster-removed', 'account', 'info', 'task', 'task-moved', 'content', 'call', 'call-request'], default: 'info' },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, default: '', maxlength: 600 },
    href: { type: String, default: '' }, // where tapping it goes (a deep link, e.g. /board?task=ID)
    data: { type: mongoose.Schema.Types.Mixed, default: null }, // anything the UI needs, e.g. { requestId } for a call request
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, createdAt: -1 });
// Old ones tidy themselves away after 60 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 86400 });

export const Notification = mongoose.model('Notification', notificationSchema);
