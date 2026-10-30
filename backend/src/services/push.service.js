import webpush from 'web-push';
import { env } from '../config/env.js';
import { PushSubscription } from '../models/PushSubscription.model.js';

export const pushConfigured = () => Boolean(env.vapid.publicKey && env.vapid.privateKey);
if (pushConfigured()) webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);

// Sends a push to every device each person has signed up. Never throws; devices that have gone away (the browser says
// 404/410) are forgotten. The service worker decides whether to show it - it stays quiet if the app is already on screen.
export async function sendPush(userIds, payload) {
  if (!pushConfigured()) return;
  try {
    const ids = [...new Set(userIds.map(String))];
    if (!ids.length) return;
    const subs = await PushSubscription.find({ user: { $in: ids } }).lean();
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 60 * 60 * 6, urgency: 'high' });
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id });
          else console.error('[push] failed', err.statusCode || err.message);
        }
      })
    );
  } catch (err) {
    console.error('[push] failed', err.message);
  }
}
