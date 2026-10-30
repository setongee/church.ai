import { Notification } from '../models/Notification.model.js';
import { User } from '../models/User.model.js';
import { DEFAULT_EMAIL_PREFS } from '../services/notifyEmail.service.js';
import { shapeNotification } from '../services/notification.service.js';

export async function listNotifications(req, res) {
  const [items, unread] = await Promise.all([Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50), Notification.countDocuments({ user: req.user._id, readAt: null })]);
  res.json({ items: items.map(shapeNotification), unread });
}

export async function readNotification(req, res) {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}

export async function readAll(req, res) {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}

export async function clearAll(req, res) {
  await Notification.deleteMany({ user: req.user._id });
  res.json({ ok: true });
}

// Which activity emails this person wants.
export async function getPrefs(req, res) {
  const u = await User.findById(req.user._id).select('emailPrefs').lean();
  res.json({ ...DEFAULT_EMAIL_PREFS, ...(u?.emailPrefs ?? {}) });
}

export async function setPrefs(req, res) {
  const set = {};
  for (const k of Object.keys(DEFAULT_EMAIL_PREFS)) if (typeof req.body?.[k] === 'boolean') set[`emailPrefs.${k}`] = req.body[k];
  if (Object.keys(set).length) await User.updateOne({ _id: req.user._id }, { $set: set });
  const u = await User.findById(req.user._id).select('emailPrefs').lean();
  res.json({ ...DEFAULT_EMAIL_PREFS, ...(u?.emailPrefs ?? {}) });
}
