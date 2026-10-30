import { ActivityEvent } from '../models/ActivityEvent.model.js';
import { emitToStaff } from './realtime.service.js';

const COLLAPSE_MS = 3 * 60 * 1000;

const shape = (e) => ({ id: String(e._id), actor: e.actor ? String(e.actor) : null, actorName: e.actorName, kind: e.kind, text: e.text, href: e.href, entityType: e.entityType, count: e.count ?? 1, at: e.createdAt });

// Records what someone just did. With a collapseKey, repeats of the same thing by the same person within a few
// minutes update the one event instead of piling up (editing a design for ten minutes is one line, "edited ×14").
export async function recordActivity({ user, kind = 'content', text, entityType = '', entityId = '', href = '', collapseKey = '' }) {
  try {
    if (!user || !text) return;
    const now = new Date();
    let event = null;
    if (collapseKey) {
      event = await ActivityEvent.findOneAndUpdate(
        { actor: user._id ?? user.id, collapseKey, createdAt: { $gte: new Date(now.getTime() - COLLAPSE_MS) } },
        { $inc: { count: 1 }, $set: { text, createdAt: now } },
        { new: true, sort: { createdAt: -1 } }
      );
    }
    if (!event) event = await ActivityEvent.create({ actor: user._id ?? user.id, actorName: user.name ?? '', kind, text, entityType, entityId: String(entityId || ''), href, collapseKey });
    emitToStaff('activity:new', shape(event));
  } catch (err) {
    console.error('[activity] failed to record', err.message);
  }
}

export { shape as shapeActivity };
