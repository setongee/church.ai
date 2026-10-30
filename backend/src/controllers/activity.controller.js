import { ActivityEvent } from '../models/ActivityEvent.model.js';
import { PresentSession } from '../models/PresentSession.model.js';
import { User } from '../models/User.model.js';
import { shapeActivity } from '../services/activity.service.js';
import { sessionIsActive } from '../middlewares/auth.js';

const HOUR = 3600 * 1000;

// What the team is doing: the live feed, plus each person's latest action.
export async function liveActivity(req, res) {
  const live = await PresentSession.findOne({ endedAt: null }).sort({ startedAt: -1 }).lean();
  const range = String(req.query.range || (live ? 'live' : '1h'));
  const now = Date.now();
  const since =
    range === 'live' && live ? new Date(live.startedAt) : range === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)) : range === '7d' ? new Date(now - 7 * 24 * HOUR) : range === '24h' ? new Date(now - 24 * HOUR) : new Date(now - HOUR);

  const filter = { createdAt: { $gte: since } };
  if (req.query.actor) filter.actor = String(req.query.actor);
  if (req.query.kind) filter.kind = String(req.query.kind);
  const events = await ActivityEvent.find(filter).sort({ createdAt: -1 }).limit(Math.min(300, Number(req.query.limit) || 150)).lean();

  // Each person's most recent action (within the window), and whether they are signed in right now.
  const users = await User.find({ active: true }).sort({ name: 1 }).lean();
  const last = await ActivityEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$actor', text: { $first: '$text' }, at: { $first: '$createdAt' }, n: { $sum: 1 } } }]);
  const lastBy = new Map(last.map((l) => [String(l._id), l]));
  const team = users.map((u) => ({ id: String(u._id), name: u.name, online: sessionIsActive(u), last: lastBy.get(String(u._id)) ? { text: lastBy.get(String(u._id)).text, at: lastBy.get(String(u._id)).at, count: lastBy.get(String(u._id)).n } : null }));

  res.json({
    live: live ? { scheduleName: live.scheduleName, startedAt: live.startedAt } : null,
    range: live || range !== 'live' ? range : '1h',
    since,
    events: events.map(shapeActivity),
    team,
  });
}
