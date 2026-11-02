import mongoose from 'mongoose';
import { ContentItem } from '../models/ContentItem.model.js';
import { PostUpload } from '../models/PostUpload.model.js';
import { Task } from '../models/Task.model.js';
import { Sprint } from '../models/Sprint.model.js';
import { emitToAuthed } from '../services/realtime.service.js';
import { PLAN_FORMATS, PLAN_PLATFORMS, SERVICE_FOCUS, generateContentPlan, generateOneIdea } from '../services/contentPlanner.service.js';
import { User } from '../models/User.model.js';
import { notify } from '../services/notification.service.js';
import { publishItemNow } from '../services/contentScheduler.service.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const isId = (id) => mongoose.isValidObjectId(id);

const FORMATS = ['reel', 'post', 'carousel', 'story', 'video', 'other'];
const PLATFORMS = ['instagram', 'facebook', 'youtube', 'tiktok', 'other'];
// Statuses a person may set by hand. 'scheduled' goes through /schedule (it needs a time and media); 'published' only
// happens when a post actually goes out; 'publishing' and 'failed' belong to the scheduler.
const MANUAL = ['idea', 'drafting', 'review', 'ready'];
const LOCKED = ['published', 'publishing'];

// Who may plan content: admins and the content roles. Everyone signed in may look.
export function requireContentWriter(req, res, next) {
  if (req.user?.isAdmin || ['design', 'manager', 'social'].some((r) => req.roles?.includes(r))) return next();
  res.status(403).json({ error: 'Planning content is for the design, social media and service manager roles.', code: 'FORBIDDEN' });
}

const POPULATE = [
  { path: 'owners', select: 'name' },
  { path: 'upload', select: 'title kind posterUrl mediaUrl status caption instagramMediaId durationSec' },
  { path: 'task', select: 'title status assignees sprint', populate: { path: 'assignees', select: 'name' } },
];
const load = (q) => q.populate(POPULATE);

const person = (u) => (u && u._id ? { _id: String(u._id), name: u.name } : null);
function shape(d) {
  const o = d.toObject ? d.toObject() : d;
  return {
    _id: String(o._id),
    title: o.title,
    caption: o.caption,
    format: o.format,
    platform: o.platform,
    status: o.status,
    scheduledAt: o.scheduledAt,
    publishedAt: o.publishedAt,
    campaign: o.campaign,
    notes: o.notes,
    owners: (o.owners || []).map(person).filter(Boolean),
    task: o.task && o.task._id ? { _id: String(o.task._id), title: o.task.title, status: o.task.status, sprint: o.task.sprint ? String(o.task.sprint) : null, assignees: (o.task.assignees || []).map(person).filter(Boolean) } : null,
    upload: o.upload && o.upload._id ? { _id: String(o.upload._id), title: o.upload.title, kind: o.upload.kind, posterUrl: o.upload.posterUrl, mediaUrl: o.upload.mediaUrl, status: o.upload.status, caption: o.upload.caption, posted: Boolean(o.upload.instagramMediaId), durationSec: o.upload.durationSec } : null,
    instagramPermalink: o.instagramPermalink,
    error: o.error,
    createdBy: o.createdBy ? String(o.createdBy) : null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

const find = async (id) => {
  const doc = isId(id) ? await ContentItem.findById(id) : null;
  if (!doc) throw bad('That content item wasn’t found.', 404);
  return doc;
};
const fresh = async (id) => shape(await load(ContentItem.findById(id)));

const toDate = (v, label = 'date') => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`That ${label} isn’t valid.`);
  return d;
};

async function cleanOwners(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(isId);
  if (!list.length) return [];
  const found = await User.find({ _id: { $in: list }, active: true }).select('_id').lean();
  if (found.length !== list.length) throw bad('One of the people chosen isn’t on the team any more.');
  return found.map((u) => u._id);
}

// Tells people they were made responsible for an item (not the person who did it).
async function tellNewOwners(item, actor, before = []) {
  const had = new Set(before.map(String));
  const fresh = (item.owners || []).map(String).filter((id) => !had.has(id) && id !== String(actor._id));
  if (fresh.length) await notify(fresh, { type: 'content', title: 'You’re on a post', body: `${actor.name} made you responsible for “${item.title}”.`, href: `/calendar?item=${item._id}` });
}

// ---- reading -------------------------------------------------------------------------------------------------------

// ?from&to limit the dated items to a window (undated ideas always come along); plus optional status/platform/owner/campaign/q.
export async function listItems(req, res) {
  const { from, to, status, platform, owner, campaign, q } = req.query;
  const filter = {};
  if (from || to) {
    const range = {};
    if (from) range.$gte = toDate(from, 'start date');
    if (to) range.$lte = toDate(to, 'end date');
    filter.$or = [{ scheduledAt: range }, { scheduledAt: null }];
  }
  if (status) filter.status = { $in: String(status).split(',') };
  if (platform) filter.platform = { $in: String(platform).split(',') };
  if (owner && isId(owner)) filter.owners = owner;
  if (campaign) filter.campaign = String(campaign);
  if (q) filter.title = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const items = await load(ContentItem.find(filter).sort({ scheduledAt: 1, createdAt: -1 }).limit(1000));
  res.json(items.map(shape));
}

export async function getItem(req, res) {
  await find(req.params.id);
  res.json(await fresh(req.params.id));
}

export async function campaigns(req, res) {
  res.json((await ContentItem.distinct('campaign', { campaign: { $ne: '' } })).sort((a, b) => a.localeCompare(b)));
}

// Uploads that can still be attached: ready, not posted, and not already used by another calendar item.
export async function availableUploads(req, res) {
  const used = await ContentItem.find({ upload: { $ne: null }, ...(req.query.except && isId(req.query.except) ? { _id: { $ne: req.query.except } } : {}) }).distinct('upload');
  const ups = await PostUpload.find({ status: 'ready', instagramMediaId: { $in: [null, ''] }, _id: { $nin: used } })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('title kind posterUrl mediaUrl caption durationSec createdAt');
  res.json(ups.map((u) => ({ _id: String(u._id), title: u.title, kind: u.kind, posterUrl: u.posterUrl, mediaUrl: u.mediaUrl, caption: u.caption, durationSec: u.durationSec, createdAt: u.createdAt })));
}

export async function byUpload(req, res) {
  const item = isId(req.params.uploadId) ? await load(ContentItem.findOne({ upload: req.params.uploadId })) : null;
  res.json(item ? shape(item) : null);
}

// ---- writing -------------------------------------------------------------------------------------------------------

// Applies the plain fields from a request body to an item (used by create and update).
async function apply(item, b, { creating = false } = {}) {
  if (typeof b.title === 'string') {
    if (!b.title.trim()) throw bad('Give it a title.');
    item.title = b.title.trim().slice(0, 200);
  } else if (creating) throw bad('Give it a title.');
  if (typeof b.caption === 'string') item.caption = b.caption.slice(0, 2200);
  if (typeof b.notes === 'string') item.notes = b.notes.slice(0, 4000);
  if (typeof b.campaign === 'string') item.campaign = b.campaign.trim().slice(0, 80);
  if (b.format !== undefined) {
    if (!FORMATS.includes(b.format)) throw bad('That isn’t a format we know.');
    item.format = b.format;
  }
  if (b.platform !== undefined) {
    if (!PLATFORMS.includes(b.platform)) throw bad('That isn’t a platform we know.');
    item.platform = b.platform;
  }
  if (b.owners !== undefined) item.owners = await cleanOwners(b.owners);
  if (b.scheduledAt !== undefined) {
    if (b.scheduledAt === null || b.scheduledAt === '') {
      item.scheduledAt = null;
      if (item.status === 'scheduled') item.status = 'ready'; // no time, nothing to post
    } else {
      const d = toDate(b.scheduledAt, 'time');
      if (item.status === 'scheduled' && d.getTime() < Date.now() + 30_000) throw bad('A scheduled post has to be in the future.');
      item.scheduledAt = d;
    }
  }
  if (b.status !== undefined && b.status !== item.status) {
    if (LOCKED.includes(item.status)) throw bad(item.status === 'published' ? 'This is already posted.' : 'It’s being posted right now.', 409);
    if (b.status === 'scheduled') throw bad('Use “Schedule” to pick a time and put it in the queue.');
    if (!MANUAL.includes(b.status)) throw bad('You can’t set that status by hand.');
    if (item.status === 'scheduled') item.error = ''; // pulled out of the queue
    item.status = b.status;
  }
}

// Attaching media: it must exist, be ready and unposted, and not belong to another item.
async function setUpload(item, uploadId) {
  if (uploadId === null || uploadId === '') {
    item.upload = null;
    if (item.status === 'scheduled') {
      item.status = 'ready';
      item.error = 'Media was removed - attach it again before scheduling.';
    }
    return;
  }
  const up = isId(uploadId) ? await PostUpload.findById(uploadId) : null;
  if (!up) throw bad('That upload wasn’t found.', 404);
  if (up.status !== 'ready') throw bad('That upload isn’t ready yet.');
  if (up.instagramMediaId) throw bad('That upload has already been posted.', 409);
  const other = await ContentItem.findOne({ upload: up._id, _id: { $ne: item._id } }).select('title');
  if (other) throw bad(`That media is already planned as “${other.title}”.`, 409);
  item.upload = up._id;
  item.error = '';
  if (!item.caption.trim() && up.caption) item.caption = up.caption;
}

// Points the item and the task at each other (or clears both sides), so neither is ever left dangling.
async function setTask(item, taskId) {
  if (item.task) await Task.updateOne({ _id: item.task, contentItem: item._id }, { contentItem: null });
  if (taskId === null || taskId === '') {
    item.task = null;
    return;
  }
  const task = isId(taskId) ? await Task.findById(taskId) : null;
  if (!task) throw bad('That task wasn’t found.', 404);
  if (task.contentItem && String(task.contentItem) !== String(item._id)) {
    const other = await ContentItem.findById(task.contentItem).select('title');
    if (other) throw bad(`That task is already linked to “${other.title}”.`, 409);
  }
  task.contentItem = item._id;
  await task.save();
  item.task = task._id;
}

export async function createItem(req, res) {
  const b = req.body ?? {};
  const item = new ContentItem({ createdBy: req.user._id });
  await apply(item, b, { creating: true });
  if (b.scheduledAt && item.status === 'idea') item.status = 'drafting'; // it has a date, so it's already being worked on
  if (b.upload) await setUpload(item, b.upload);
  await item.save(); // so the task link below has an id to point at
  if (b.task) {
    await setTask(item, b.task);
    await item.save();
  }
  await tellNewOwners(item, req.user);
  res.status(201).json(await fresh(item._id));
}

export async function updateItem(req, res) {
  const item = await find(req.params.id);
  const b = req.body ?? {};
  if (LOCKED.includes(item.status) && (b.scheduledAt !== undefined || b.upload !== undefined || b.status !== undefined)) throw bad(item.status === 'published' ? 'This is already posted, so its time and media can’t change.' : 'It’s being posted right now - try again in a minute.', 409);
  const owners = item.owners.map(String);
  await apply(item, b);
  if (b.upload !== undefined) await setUpload(item, b.upload);
  if (b.task !== undefined) await setTask(item, b.task);
  await item.save();
  await tellNewOwners(item, req.user, owners);
  res.json(await fresh(item._id));
}

// Puts the item in the queue: it goes out by itself at that time.
export async function scheduleItem(req, res) {
  const item = await find(req.params.id);
  if (LOCKED.includes(item.status)) throw bad(item.status === 'published' ? 'This is already posted.' : 'It’s being posted right now.', 409);
  const at = req.body?.scheduledAt ? toDate(req.body.scheduledAt, 'time') : item.scheduledAt;
  if (!at) throw bad('Pick a date and time first.');
  if (at.getTime() < Date.now() + 60_000) throw bad('Pick a time at least a minute from now.');
  if (item.platform !== 'instagram') throw bad('Automatic posting works for Instagram. For other platforms, keep it as Ready and post by hand.');
  if (!item.upload) throw bad('Attach the video or picture first - that’s what gets posted.');
  const up = await PostUpload.findById(item.upload);
  if (!up || up.status !== 'ready') throw bad('The attached media isn’t ready.');
  if (up.instagramMediaId) throw bad('That media has already been posted.', 409);
  const caption = (typeof req.body?.caption === 'string' ? req.body.caption : item.caption || up.caption || '').trim();
  if (!caption) throw bad('Write a caption first.');
  item.caption = caption.slice(0, 2200);
  item.scheduledAt = at;
  item.status = 'scheduled';
  item.error = '';
  item.reminderSent = false;
  await item.save();
  res.json(await fresh(item._id));
}

export async function unscheduleItem(req, res) {
  const item = await find(req.params.id);
  if (item.status !== 'scheduled' && item.status !== 'failed') throw bad('This isn’t in the queue.');
  item.status = 'ready';
  item.error = '';
  await item.save();
  res.json(await fresh(item._id));
}

// Goes live on the real Instagram account right now.
export async function publishNow(req, res) {
  const item = await find(req.params.id);
  if (item.status === 'published') throw bad('This is already posted.', 409);
  if (item.platform !== 'instagram') throw bad('Automatic posting works for Instagram only.');
  if (!item.upload) throw bad('Attach the video or picture first.');
  if (typeof req.body?.caption === 'string' && req.body.caption.trim()) {
    item.caption = req.body.caption.trim().slice(0, 2200);
    await item.save();
  }
  await publishItemNow(item._id); // throws a readable error (and marks the item failed) if Instagram says no
  res.json(await fresh(item._id));
}

export async function linkTask(req, res) {
  const item = await find(req.params.id);
  await setTask(item, req.body?.taskId ?? null);
  await item.save();
  res.json(await fresh(item._id));
}

export async function unlinkTask(req, res) {
  const item = await find(req.params.id);
  await setTask(item, null);
  await item.save();
  res.json(await fresh(item._id));
}

export async function removeItem(req, res) {
  const item = await find(req.params.id);
  if (item.status === 'publishing') throw bad('It’s being posted right now - try again in a minute.', 409);
  if (item.task) await Task.updateOne({ _id: item.task, contentItem: item._id }, { contentItem: null });
  await item.deleteOne();
  res.json({ ok: true });
}

// ---- AI planning ---------------------------------------------------------------------------------------------------

const dayOnly = (s) => new Date(`${s}T12:00:00Z`); // calendar days are stored at noon UTC so they read the same everywhere

// What was preached or said at a service, pasted in by the team, and the kinds of post to make from it.
function readExcerpt(b) {
  const serviceExcerpt = String(b.serviceExcerpt ?? '').replace(/\r\n/g, '\n').trim().slice(0, 12000);
  if (serviceExcerpt && serviceExcerpt.length < 80) throw bad('Paste a little more of the service (a few sentences at least) so the AI has something to work from.');
  const serviceFocus = (Array.isArray(b.serviceFocus) ? b.serviceFocus : []).filter((f) => SERVICE_FOCUS.includes(f));
  return { serviceExcerpt, serviceFocus: serviceFocus.length ? serviceFocus : SERVICE_FOCUS };
}

function readBrief(b) {
  const { serviceExcerpt, serviceFocus } = readExcerpt(b);
  // With an excerpt, the goal can be left out: the message itself is the brief.
  const brief = String(b.brief ?? '').trim() || (serviceExcerpt ? 'Turn this service message into the week’s posts: a recap, practical word-growth actions, and the context behind it.' : '');
  if (brief.length < 10) throw bad('Tell the AI a little more about what you want (a sentence or two), or paste in a service message.');
  const startDate = String(b.startDate ?? '').slice(0, 10);
  const endDate = String(b.endDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw bad('Pick the start and end dates for the calendar.');
  if (endDate < startDate) throw bad('The calendar can’t end before it starts.');
  const span = Math.round((dayOnly(endDate) - dayOnly(startDate)) / 86400000) + 1;
  if (span > 92) throw bad('Plan up to about three months at a time.');
  const formats = (Array.isArray(b.formats) ? b.formats : []).filter((f) => PLAN_FORMATS.includes(f));
  const platforms = (Array.isArray(b.platforms) ? b.platforms : []).filter((p) => PLAN_PLATFORMS.includes(p));
  return {
    brief: brief.slice(0, 3000),
    startDate,
    endDate,
    postsPerWeek: Math.min(14, Math.max(1, Math.round(Number(b.postsPerWeek) || 4))),
    formats: formats.length ? formats : ['post', 'reel', 'carousel'],
    platforms: platforms.length ? platforms : ['instagram'],
    tone: String(b.tone ?? '').trim().slice(0, 60),
    campaign: String(b.campaign ?? '').trim().slice(0, 80),
    serviceExcerpt,
    serviceFocus,
  };
}

// Writes a draft calendar for a brief (nothing is saved yet).
export async function aiPlan(req, res) {
  res.json(await generateContentPlan(readBrief(req.body ?? {})));
}

// A fresh idea for one slot.
export async function aiPlanItem(req, res) {
  const b = req.body ?? {};
  const date = String(b.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('That date isn’t valid.');
  const format = PLAN_FORMATS.includes(b.format) ? b.format : 'post';
  const platform = PLAN_PLATFORMS.includes(b.platform) ? b.platform : 'instagram';
  const { serviceExcerpt, serviceFocus } = readExcerpt(b);
  const brief = String(b.brief ?? '').trim().slice(0, 3000) || (serviceExcerpt ? 'Turn this service message into the week’s posts.' : '');
  if (brief.length < 10) throw bad('The brief is missing.');
  res.json({ item: await generateOneIdea({ brief, serviceExcerpt, serviceFocus, campaign: String(b.campaign ?? '').slice(0, 80), date, format, platform, tone: String(b.tone ?? '').slice(0, 60), avoid: Array.isArray(b.avoid) ? b.avoid.map((t) => String(t).slice(0, 90)) : [] }) });
}

// Saves a reviewed plan: every post becomes a calendar item (as an idea, with its planned time - nothing is queued to
// post by itself), and optionally a sprint with one task per post for the people responsible. People hear about it
// once ("you have 8 posts"), not once per item.
export async function bulkCreate(req, res) {
  const b = req.body ?? {};
  const list = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  if (!list.length) throw bad('There’s nothing to add.');
  const campaign = String(b.campaign ?? '').trim().slice(0, 80);
  const wantTasks = Boolean(b.tasks);
  if (wantTasks && !req.user.isAdmin) throw bad('Only admins can create tasks.', 403);

  const prepared = [];
  for (const it of list) {
    const title = String(it?.title ?? '').trim().slice(0, 200);
    if (!title) throw bad('Every post needs a title.');
    const scheduledAt = it?.scheduledAt ? toDate(it.scheduledAt, 'time') : null;
    const format = FORMATS.includes(it?.format) ? it.format : 'post';
    const platform = PLATFORMS.includes(it?.platform) ? it.platform : 'instagram';
    prepared.push({ title, scheduledAt, format, platform, caption: String(it?.caption ?? '').slice(0, 2200), notes: String(it?.notes ?? '').slice(0, 4000), theme: String(it?.theme ?? '').trim().slice(0, 40), owners: await cleanOwners(it?.owners) });
  }

  const items = await ContentItem.insertMany(prepared.map((p) => ({ title: p.title, caption: p.caption, notes: p.notes, format: p.format, platform: p.platform, status: 'idea', scheduledAt: p.scheduledAt, campaign, owners: p.owners, createdBy: req.user._id })));

  let sprint = null;
  let tasks = [];
  if (wantTasks) {
    const t = b.tasks;
    if (isId(t.sprintId)) sprint = await Sprint.findById(t.sprintId);
    if (!sprint) {
      const name = String(t.name ?? '').trim().slice(0, 120) || campaign || 'Content plan';
      const starts = String(t.startDate ?? '').slice(0, 10);
      const ends = String(t.endDate ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends) || ends < starts) throw bad('The sprint needs valid start and end dates.');
      const today = new Date().toISOString().slice(0, 10);
      const otherActive = await Sprint.exists({ status: 'active' });
      sprint = await Sprint.create({ name, goal: String(t.goal ?? '').slice(0, 600), startDate: dayOnly(starts), endDate: dayOnly(ends), status: starts <= today && today <= ends && !otherActive ? 'active' : 'planned', createdBy: req.user._id });
    }
    const daysBefore = Math.min(14, Math.max(0, Math.round(Number(t.dueDaysBefore ?? 2))));
    const base = await Task.countDocuments({ sprint: sprint._id, status: 'todo' });
    const docs = items.map((item, i) => {
      const p = prepared[i];
      let due = null;
      if (p.scheduledAt) {
        due = new Date(Date.UTC(p.scheduledAt.getFullYear(), p.scheduledAt.getMonth(), p.scheduledAt.getDate() - daysBefore, 12));
        if (due < sprint.startDate) due = new Date(sprint.startDate);
      }
      const brief = [p.notes, p.caption ? `Draft caption:\n${p.caption}` : ''].filter(Boolean).join('\n\n').slice(0, 4000);
      return {
        sprint: sprint._id,
        title: `${FORMAT_NAME[p.format]}: ${p.title}`.slice(0, 200),
        description: brief,
        status: 'todo',
        priority: 'medium',
        assignees: p.owners,
        dueDate: due,
        labels: [p.format, p.theme].filter(Boolean),
        order: base + i,
        contentItem: item._id,
        createdBy: req.user._id,
        history: [{ user: req.user._id, type: 'created', to: 'To do' }, ...p.owners.map((a) => ({ user: req.user._id, type: 'assigned', to: String(a) }))],
      };
    });
    tasks = await Task.insertMany(docs);
    await Promise.all(tasks.map((task, i) => ContentItem.updateOne({ _id: items[i]._id }, { task: task._id })));
  }

  // One heads-up per person, not one per item.
  const mine = new Map();
  items.forEach((item, i) => (prepared[i].owners || []).forEach((o) => String(o) !== String(req.user._id) && mine.set(String(o), [...(mine.get(String(o)) || []), i])));
  for (const [uid, idx] of mine) {
    const n = idx.length;
    if (sprint) await notify([uid], { type: 'task', title: `${req.user.name} gave you ${n} task${n === 1 ? '' : 's'}`, body: `${sprint.name}${campaign ? ` · ${campaign}` : ''}: “${prepared[idx[0]].title}”${n > 1 ? ` and ${n - 1} more` : ''}`, href: `/board?task=${tasks[idx[0]]._id}` });
    else await notify([uid], { type: 'content', title: `${req.user.name} gave you ${n} post${n === 1 ? '' : 's'} to work on`, body: `${campaign ? `${campaign}: ` : ''}“${prepared[idx[0]].title}”${n > 1 ? ` and ${n - 1} more` : ''}`, href: `/calendar?item=${items[idx[0]]._id}` });
  }
  if (sprint) emitToAuthed('board:changed', { sprintId: String(sprint._id), taskId: null });
  res.status(201).json({ created: items.length, firstItemId: String(items[0]._id), sprint: sprint ? { id: String(sprint._id), name: sprint.name } : null, tasks: tasks.length });
}

const FORMAT_NAME = { reel: 'Reel', post: 'Post', carousel: 'Carousel', story: 'Story', video: 'Video', other: 'Content' };
