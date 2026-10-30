import { PushSubscription } from '../models/PushSubscription.model.js';
import { env } from '../config/env.js';
import { pushConfigured } from '../services/push.service.js';

export async function publicKey(req, res) {
  res.json({ enabled: pushConfigured(), key: env.vapid.publicKey });
}

export async function subscribe(req, res) {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'That isn’t a valid push subscription.' });
  // A device belongs to whoever signed in on it last.
  await PushSubscription.findOneAndUpdate({ endpoint }, { user: req.user._id, keys: { p256dh: keys.p256dh, auth: keys.auth }, device: String(req.headers['user-agent'] || '').slice(0, 200) }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.status(201).json({ ok: true });
}

export async function unsubscribe(req, res) {
  if (req.body?.endpoint) await PushSubscription.deleteOne({ endpoint: req.body.endpoint, user: req.user._id });
  res.json({ ok: true });
}
