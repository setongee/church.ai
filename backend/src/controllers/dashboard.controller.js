import { ContentItem } from '../models/ContentItem.model.js';
import { Service } from '../models/Service.model.js';
import { Sprint } from '../models/Sprint.model.js';
import { Task } from '../models/Task.model.js';

const DAY = 86400000;
const startOfToday = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
};

// Everything the Dashboard shows:
// your tasks, the active sprint, what is coming up and what needs attention on the content calendar, and - for admins and
// service managers - the services. Each person only gets what they may see.
export async function dashboard(req, res) {
  const me = req.user;
  const staff = Boolean(me.isAdmin || req.roles?.includes('manager'));
  const now = new Date();
  const today = startOfToday();

  // ---- my tasks (in sprints that aren't finished) ----------------------------------------------------------------
  const liveSprints = await Sprint.find({ status: { $ne: 'completed' } }).select('name status startDate endDate').lean();
  const sprintById = new Map(liveSprints.map((s) => [String(s._id), s]));
  const mine = await Task.find({ assignees: me._id, status: { $ne: 'done' }, sprint: { $in: [...sprintById.keys()] } }).select('title status priority dueDate sprint').lean();
  const dueKey = (t) => (t.dueDate ? new Date(t.dueDate).getTime() : Infinity);
  mine.sort((a, b) => dueKey(a) - dueKey(b));
  const overdue = mine.filter((t) => t.dueDate && new Date(t.dueDate) < today).length;
  const dueSoon = mine.filter((t) => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) < new Date(today.getTime() + 8 * DAY)).length;
  const doneRecently = await Task.countDocuments({ assignees: me._id, status: 'done', completedAt: { $gte: new Date(now.getTime() - 14 * DAY) } });

  // ---- the active sprint ---------------------------------------------------------------------------------------------
  const active = liveSprints.filter((s) => s.status === 'active').sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] ?? null;
  let sprint = null;
  if (active) {
    const rows = await Task.aggregate([{ $match: { sprint: active._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const counts = { todo: 0, in_progress: 0, review: 0, done: 0 };
    for (const r of rows) if (r._id in counts) counts[r._id] = r.n;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const end = new Date(active.endDate);
    sprint = { id: String(active._id), name: active.name, startDate: active.startDate, endDate: active.endDate, daysLeft: Math.max(0, Math.ceil((end.getTime() - today.getTime()) / DAY)), counts, total, mine: mine.filter((t) => String(t.sprint) === String(active._id)).length };
  }

  // ---- the content calendar --------------------------------------------------------------------------------------------
  const items = await ContentItem.find().select('title format platform status scheduledAt upload owners error').populate('owners', 'name').sort({ scheduledAt: 1 }).limit(1000).lean();
  const light = (i) => ({ id: String(i._id), title: i.title, format: i.format, platform: i.platform, status: i.status, scheduledAt: i.scheduledAt, error: i.error || '', owners: (i.owners || []).map((o) => o.name) });
  const planned = ['idea', 'drafting', 'review', 'ready', 'scheduled'];
  const upcoming = items.filter((i) => i.scheduledAt && new Date(i.scheduledAt) >= now && planned.includes(i.status)).slice(0, 6).map(light);
  // Things that need someone: a post that failed, one scheduled with no media, one whose day has passed without going out.
  const attention = items
    .filter((i) => i.status === 'failed' || (i.status === 'scheduled' && !i.upload) || (i.scheduledAt && new Date(i.scheduledAt) < now && ['idea', 'drafting', 'review', 'ready'].includes(i.status)))
    .slice(0, 6)
    .map((i) => ({ ...light(i), why: i.status === 'failed' ? 'Failed to post' : i.status === 'scheduled' && !i.upload ? 'No media attached' : 'Its day has passed' }));
  const weekEnd = new Date(now.getTime() + 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const content = {
    upcoming,
    attention,
    attentionCount: items.filter((i) => i.status === 'failed' || (i.status === 'scheduled' && !i.upload) || (i.scheduledAt && new Date(i.scheduledAt) < now && ['idea', 'drafting', 'review', 'ready'].includes(i.status))).length,
    scheduledThisWeek: items.filter((i) => i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt) >= now && new Date(i.scheduledAt) < weekEnd).length,
    inProgress: items.filter((i) => ['idea', 'drafting', 'review'].includes(i.status)).length,
    ready: items.filter((i) => i.status === 'ready').length,
    publishedLast30: items.filter((i) => i.status === 'published' && i.publishedAt && new Date(i.publishedAt) >= monthAgo).length || items.filter((i) => i.status === 'published' && i.scheduledAt && new Date(i.scheduledAt) >= monthAgo).length,
  };

  // ---- services (admins and service managers see them all; everyone else gets their own from their roster) ---------------
  let services = null;
  if (staff) {
    const all = await Service.find().select('name date').sort({ date: 1, createdAt: -1 }).lean();
    const shape = (s) => ({ id: String(s._id), name: s.name, date: s.date || null });
    const dated = all.filter((s) => s.date);
    const coming = dated.filter((s) => new Date(s.date) >= today);
    const gone = dated.filter((s) => new Date(s.date) < today).reverse();
    services = {
      total: all.length,
      upcoming: coming.length,
      next: coming[0] ? shape(coming[0]) : null,
      // The short list: what's next first, topped up with the latest ones that already happened.
      top: [...coming, ...gone, ...all.filter((s) => !s.date)].slice(0, 5).map(shape),
      calendar: dated.map(shape),
    };
  }

  // What lands on the calendar besides services: your task deadlines and the posts going out.
  const calendar = {
    tasks: mine.filter((t) => t.dueDate).map((t) => ({ id: String(t._id), title: t.title, date: t.dueDate })),
    posts: items.filter((i) => i.scheduledAt && planned.includes(i.status)).map((i) => ({ id: String(i._id), title: i.title, date: i.scheduledAt })),
  };

  res.json({
    me: { open: mine.length, overdue, dueSoon, doneRecently, tasks: mine.slice(0, 8).map((t) => ({ id: String(t._id), title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate, sprint: sprintById.get(String(t.sprint))?.name ?? '' })) },
    sprint,
    content,
    services,
    calendar,
  });
}
