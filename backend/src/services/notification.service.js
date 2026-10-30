import { Notification } from '../models/Notification.model.js';
import { emitToUsers } from './realtime.service.js';
import { sendPush } from './push.service.js';
import { emailPeople } from './notifyEmail.service.js';

export const shapeNotification = (n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, href: n.href, data: n.data ?? null, read: Boolean(n.readAt), createdAt: n.createdAt });

// Saves a notification for each person and pushes it to whichever of their devices are open. Never throws: a
// notification problem must not fail the request that caused it.
// `email` ('tasks' | 'reminders' | 'chat' | 'calls') also emails them (respecting each person's email settings).
export async function notify(userIds, { type = 'info', title, body = '', href = '', data = null, email = '' }) {
  try {
    const ids = [...new Set(userIds.map(String))];
    if (!ids.length) return;
    const docs = await Notification.insertMany(ids.map((user) => ({ user, type, title, body, href, data })));
    for (const d of docs) emitToUsers([d.user], 'notification', shapeNotification(d));
    if (email) void emailPeople(ids, { kind: email, subject: title, heading: title, lines: body ? [{ text: body }] : [], cta: 'Open in the app', href });
    void sendPush(ids, { title, body, url: href || '/dashboard', tag: `n:${type}`, kind: 'notification', type });
  } catch (err) {
    console.error('[notify] failed', err.message);
  }
}
