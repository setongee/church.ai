import mongoose from 'mongoose';
import { Sprint } from '../models/Sprint.model.js';
import { Task } from '../models/Task.model.js';
import { ContentItem } from '../models/ContentItem.model.js';
import { User } from '../models/User.model.js';
import { notify } from '../services/notification.service.js';
import { emitToAuthed } from '../services/realtime.service.js';

const STATUSES = ['todo', 'in_progress', 'review', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Done' };

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const isId = (v) => mongoose.isValidObjectId(v);
const same = (a, b) => String(a) === String(b);
const person = (u) => (u && u.name ? { id: String(u._id), name: u.name } : null);

const POPULATE = [
  { path: 'assignees', select: 'name' },
  { path: 'createdBy', select: 'name' },
  { path: 'contentItem', select: 'title status scheduledAt' },
  { path: 'comments.user', select: 'name' },
  { path: 'history.user', select: 'name' },
];
const loadTask = (id) => Task.findById(id).populate(POPULATE);

// ---- shaping -------------------------------------------------------------------------------------------------------

function shapeSprint(s, counts) {
  const c = counts ?? { todo: 0, in_progress: 0, review: 0, done: 0 };
  const total = c.todo + c.in_progress + c.review + c.done;
  return {
    id: String(s._id),
    name: s.name,
    goal: s.goal,
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    completedAt: s.completedAt,
    counts: { ...c, total },
    progress: total ? Math.round((c.done / total) * 100) : 0,
  };
}

function shapeTask(t, { detail = false } = {}) {
  const out = {
    id: String(t._id),
    sprintId: String(t.sprint),
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignees: (t.assignees ?? []).map(person).filter(Boolean),
    dueDate: t.dueDate,
    labels: t.labels ?? [],
    checklist: (t.checklist ?? []).map((i) => ({ id: String(i._id), text: i.text, done: i.done })),
    commentCount: (t.comments ?? []).length,
    order: t.order,
    contentItem: t.contentItem && t.contentItem._id ? { id: String(t.contentItem._id), title: t.contentItem.title, status: t.contentItem.status, scheduledAt: t.contentItem.scheduledAt } : t.contentItem ? { id: String(t.contentItem), title: '', status: '', scheduledAt: null } : null,
    completedAt: t.completedAt,
    createdBy: person(t.createdBy),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  if (detail) {
    out.comments = (t.comments ?? []).map((c) => ({ id: String(c._id), user: person(c.user), text: c.text, at: c.at }));
    out.history = (t.history ?? []).map((h) => ({ user: person(h.user), type: h.type, from: h.from, to: h.to, at: h.at })).reverse();
  }
  return out;
}

const changed = (sprintId, taskId) => emitToAuthed('board:changed', { sprintId: String(sprintId), taskId: taskId ? String(taskId) : null });
// Dates picked on the calendar are stored at noon UTC so they show as the same day in every timezone.
const dateOnly = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v));
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

// ---- sprints -------------------------------------------------------------------------------------------------------

export async function listSprints(req, res) {
  const [sprints, grouped] = await Promise.all([Sprint.find().lean(), Task.aggregate([{ $group: { _id: { sprint: '$sprint', status: '$status' }, n: { $sum: 1 } } }])]);
  const counts = new Map();
  for (const g of grouped) {
    const key = String(g._id.sprint);
    counts.set(key, { ...(counts.get(key) ?? { todo: 0, in_progress: 0, review: 0, done: 0 }), [g._id.status]: g.n });
  }
  const rank = { active: 0, planned: 1, completed: 2 };
  sprints.sort((a, b) => rank[a.status] - rank[b.status] || (a.status === 'completed' ? new Date(b.endDate) - new Date(a.endDate) : new Date(a.startDate) - new Date(b.startDate)));
  res.json(sprints.map((s) => shapeSprint(s, counts.get(String(s._id)))));
}

function readSprintBody(b, { partial = false } = {}) {
  const out = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name ?? '').trim();
    if (!name) throw bad('Give the sprint a name.');
    out.name = name.slice(0, 120);
  }
  if (b.goal !== undefined) out.goal = String(b.goal).trim().slice(0, 600);
  for (const k of ['startDate', 'endDate']) {
    if (!partial || b[k] !== undefined) {
      const d = dateOnly(b[k]);
      if (Number.isNaN(d.getTime())) throw bad(k === 'startDate' ? 'Pick a start date.' : 'Pick an end date.');
      out[k] = d;
    }
  }
  if (b.status !== undefined) {
    if (!['planned', 'active', 'completed'].includes(b.status)) throw bad('Unknown sprint status.');
    out.status = b.status;
  }
  return out;
}

export async function createSprint(req, res) {
  const data = readSprintBody(req.body || {});
  if (data.endDate < data.startDate) throw bad('The sprint can’t end before it starts.');
  const sprint = await Sprint.create({ ...data, status: data.status ?? 'planned', createdBy: req.user._id });
  changed(sprint._id);
  res.status(201).json(shapeSprint(sprint));
}

export async function updateSprint(req, res) {
  const sprint = await Sprint.findById(req.params.id);
  if (!sprint) throw bad('Sprint not found.', 404);
  const data = readSprintBody(req.body || {}, { partial: true });
  Object.assign(sprint, data);
  if (sprint.endDate < sprint.startDate) throw bad('The sprint can’t end before it starts.');
  if (data.status === 'completed' && !sprint.completedAt) sprint.completedAt = new Date();
  if (data.status && data.status !== 'completed') sprint.completedAt = null;
  await sprint.save();
  changed(sprint._id);
  res.json(shapeSprint(sprint));
}

export async function completeSprint(req, res) {
  const sprint = await Sprint.findById(req.params.id);
  if (!sprint) throw bad('Sprint not found.', 404);
  const carryTo = req.body?.carryTo;
  let target = null;
  if (carryTo) {
    if (!isId(carryTo) || same(carryTo, sprint._id)) throw bad('Pick a different sprint to carry the unfinished tasks into.');
    target = await Sprint.findById(carryTo);
    if (!target) throw bad('That sprint doesn’t exist.', 404);
    if (target.status === 'completed') throw bad('That sprint is already completed.');
  }
  let carried = 0;
  if (target) {
    const open = await Task.find({ sprint: sprint._id, status: { $ne: 'done' } });
    const base = await Task.countDocuments({ sprint: target._id });
    for (const [i, t] of open.entries()) {
      t.sprint = target._id;
      t.order = base + i;
      t.history.push({ user: req.user._id, type: 'edited', from: sprint.name, to: target.name });
      await t.save();
      if (t.assignees.length) await notify(t.assignees.filter((a) => !same(a, req.user._id)), { type: 'task', title: `“${t.title}” moved to ${target.name}`, body: `Carried over from ${sprint.name}.`, href: `/board?task=${t._id}`, email: 'tasks' });
    }
    carried = open.length;
  }
  sprint.status = 'completed';
  sprint.completedAt = new Date();
  await sprint.save();
  changed(sprint._id);
  if (target) changed(target._id);
  res.json({ sprint: shapeSprint(sprint), carried });
}

export async function deleteSprint(req, res) {
  const sprint = await Sprint.findById(req.params.id);
  if (!sprint) throw bad('Sprint not found.', 404);
  const tasks = await Task.find({ sprint: sprint._id }).select('contentItem');
  const items = tasks.map((t) => t.contentItem).filter(Boolean);
  if (items.length) await ContentItem.updateMany({ _id: { $in: items } }, { task: null });
  await Task.deleteMany({ sprint: sprint._id });
  await sprint.deleteOne();
  changed(sprint._id);
  res.json({ ok: true });
}

// ---- tasks ---------------------------------------------------------------------------------------------------------

export async function listTasks(req, res) {
  if (!isId(req.params.id)) throw bad('Sprint not found.', 404);
  const tasks = await Task.find({ sprint: req.params.id }).sort({ status: 1, order: 1, createdAt: 1 }).populate(POPULATE.filter((p) => !p.path.includes('.')));
  res.json(tasks.map((t) => shapeTask(t)));
}

export async function getTask(req, res) {
  if (!isId(req.params.id)) throw bad('Task not found.', 404);
  const task = await loadTask(req.params.id);
  if (!task) throw bad('Task not found.', 404);
  res.json(shapeTask(task, { detail: true }));
}

async function activeUserIds(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
  if (list.some((i) => !isId(i))) throw bad('One of the people picked isn’t valid.');
  const found = await User.find({ _id: { $in: list }, active: true }).select('_id');
  if (found.length !== list.length) throw bad('Tasks can only be given to people who are active on the team.');
  return list;
}
const cleanLabels = (l) => [...new Set((Array.isArray(l) ? l : []).map((x) => String(x).trim().slice(0, 30)).filter(Boolean))].slice(0, 8);
const cleanDue = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const d = dateOnly(v);
  if (Number.isNaN(d.getTime())) throw bad('That due date isn’t valid.');
  return d;
};

// Keeps the content item and the task pointing at each other.
async function linkContent(task, nextId) {
  const prev = task.contentItem ? String(task.contentItem._id ?? task.contentItem) : null;
  const next = nextId ? String(nextId) : null;
  if (prev === next) return;
  if (next) {
    if (!isId(next)) throw bad('That content item isn’t valid.');
    const item = await ContentItem.findById(next);
    if (!item) throw bad('That content item doesn’t exist.', 404);
    if (item.task && !same(item.task, task._id)) await Task.updateOne({ _id: item.task }, { contentItem: null });
    item.task = task._id;
    await item.save();
  }
  if (prev) await ContentItem.updateOne({ _id: prev, task: task._id }, { task: null });
  task.contentItem = next;
}

async function tellAssigned(task, sprint, userIds, actor) {
  const to = userIds.filter((id) => !same(id, actor._id));
  if (!to.length) return;
  const bits = [sprint?.name, task.dueDate ? `due ${day(task.dueDate)}` : ''].filter(Boolean).join(' · ');
  await notify(to, { type: 'task', title: `${actor.name} gave you a task`, body: `“${task.title}”${bits ? ` · ${bits}` : ''}`, href: `/board?task=${task._id}`, email: 'tasks' });
}

export async function createTask(req, res) {
  const b = req.body || {};
  if (!isId(b.sprint)) throw bad('Pick a sprint for this task.');
  const sprint = await Sprint.findById(b.sprint);
  if (!sprint) throw bad('Sprint not found.', 404);
  const title = String(b.title ?? '').trim();
  if (!title) throw bad('Give the task a title.');
  const status = b.status ?? 'todo';
  if (!STATUSES.includes(status)) throw bad('Unknown column.');
  if (b.priority !== undefined && !PRIORITIES.includes(b.priority)) throw bad('Unknown priority.');
  const assignees = await activeUserIds(b.assignees);
  const order = await Task.countDocuments({ sprint: sprint._id, status });
  const task = new Task({
    sprint: sprint._id,
    title: title.slice(0, 200),
    description: String(b.description ?? '').slice(0, 4000),
    status,
    priority: b.priority ?? 'medium',
    assignees,
    dueDate: cleanDue(b.dueDate),
    labels: cleanLabels(b.labels),
    checklist: (Array.isArray(b.checklist) ? b.checklist : []).map((i) => ({ text: String(i.text ?? '').trim().slice(0, 200), done: Boolean(i.done) })).filter((i) => i.text),
    order,
    createdBy: req.user._id,
    completedAt: status === 'done' ? new Date() : null,
    history: [{ user: req.user._id, type: 'created', to: STATUS_LABEL[status] }, ...assignees.map((a) => ({ user: req.user._id, type: 'assigned', to: String(a) }))],
  });
  await task.save();
  if (b.contentItem) {
    await linkContent(task, b.contentItem);
    await task.save();
  }
  await tellAssigned(task, sprint, assignees, req.user);
  changed(sprint._id, task._id);
  res.status(201).json(shapeTask(await loadTask(task._id), { detail: true }));
}

// Admin can change anything. An assignee can only tick their checklist (and nothing else of the task's plan).
export async function updateTask(req, res) {
  if (!isId(req.params.id)) throw bad('Task not found.', 404);
  const task = await loadTask(req.params.id);
  if (!task) throw bad('Task not found.', 404);
  const admin = Boolean(req.user.isAdmin);
  const mine = task.assignees.some((a) => same(a._id ?? a, req.user._id));
  if (!admin && !mine) throw bad('You can only update tasks that are given to you.', 403);
  const b = req.body || {};
  const sprint = await Sprint.findById(task.sprint);

  if (!admin) {
    const allowed = new Set(['checklist']);
    const stray = Object.keys(b).filter((k) => !allowed.has(k));
    if (stray.length) throw bad('You can move your task, tick its checklist and comment on it. The rest is for an admin.', 403);
    if (Array.isArray(b.checklist)) {
      const flags = new Map(b.checklist.map((i) => [String(i.id ?? i._id), Boolean(i.done)]));
      for (const item of task.checklist) {
        if (flags.has(String(item._id)) && flags.get(String(item._id)) !== item.done) {
          item.done = flags.get(String(item._id));
          task.history.push({ user: req.user._id, type: 'checklist', from: '', to: `${item.done ? 'Ticked' : 'Unticked'}: ${item.text}` });
        }
      }
    }
    await task.save();
    changed(task.sprint, task._id);
    return res.json(shapeTask(await loadTask(task._id), { detail: true }));
  }

  const before = { title: task.title, due: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '', priority: task.priority };
  if (b.title !== undefined) {
    const title = String(b.title).trim();
    if (!title) throw bad('Give the task a title.');
    task.title = title.slice(0, 200);
  }
  if (b.description !== undefined) task.description = String(b.description).slice(0, 4000);
  if (b.priority !== undefined) {
    if (!PRIORITIES.includes(b.priority)) throw bad('Unknown priority.');
    task.priority = b.priority;
  }
  if (b.dueDate !== undefined) task.dueDate = cleanDue(b.dueDate);
  if (b.labels !== undefined) task.labels = cleanLabels(b.labels);
  if (Array.isArray(b.checklist)) {
    const old = new Map(task.checklist.map((i) => [String(i._id), i]));
    task.checklist = b.checklist
      .map((i) => ({ ...(i.id && old.has(String(i.id)) ? { _id: old.get(String(i.id))._id } : {}), text: String(i.text ?? '').trim().slice(0, 200), done: Boolean(i.done) }))
      .filter((i) => i.text);
  }
  if (b.sprint !== undefined && !same(b.sprint, task.sprint)) {
    if (!isId(b.sprint) || !(await Sprint.exists({ _id: b.sprint }))) throw bad('That sprint doesn’t exist.', 404);
    task.history.push({ user: req.user._id, type: 'edited', from: sprint?.name ?? '', to: (await Sprint.findById(b.sprint)).name });
    task.sprint = b.sprint;
  }
  let added = [];
  if (b.assignees !== undefined) {
    const next = await activeUserIds(b.assignees);
    const prev = task.assignees.map((a) => String(a._id ?? a));
    added = next.filter((i) => !prev.includes(i));
    const removed = prev.filter((i) => !next.includes(i));
    for (const a of added) task.history.push({ user: req.user._id, type: 'assigned', to: a });
    for (const r of removed) task.history.push({ user: req.user._id, type: 'unassigned', to: r });
    task.assignees = next;
    if (removed.length) await notify(removed.filter((r) => !same(r, req.user._id)), { type: 'task', title: 'You were taken off a task', body: `“${task.title}”`, href: '/board', email: 'tasks' });
  }
  if (b.contentItem !== undefined) await linkContent(task, b.contentItem || null);
  task.history.push({ user: req.user._id, type: 'edited' });
  await task.save();
  if (added.length) await tellAssigned(task, sprint, added, req.user);
  // The people it's on (who weren't just given it) hear about changes to the title, due date or priority.
  const changes = [];
  const dueNow = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '';
  if (before.due !== dueNow) changes.push(`Due date: ${before.due ? day(before.due) : 'none'} → ${dueNow ? day(dueNow) : 'none'}`);
  if (before.priority !== task.priority) changes.push(`Priority: ${before.priority} → ${task.priority}`);
  if (before.title !== task.title) changes.push(`Renamed from “${before.title}”`);
  const stayers = task.assignees.map((a) => String(a._id ?? a)).filter((id) => !added.includes(id) && !same(id, req.user._id));
  if (changes.length && stayers.length) await notify(stayers, { type: 'task', title: `${req.user.name} updated “${task.title}”`, body: changes.join(' · '), href: `/board?task=${task._id}`, email: 'tasks' });
  changed(task.sprint, task._id);
  res.json(shapeTask(await loadTask(task._id), { detail: true }));
}

export async function moveTask(req, res) {
  if (!isId(req.params.id)) throw bad('Task not found.', 404);
  const task = await loadTask(req.params.id);
  if (!task) throw bad('Task not found.', 404);
  const admin = Boolean(req.user.isAdmin);
  const mine = task.assignees.some((a) => same(a._id ?? a, req.user._id));
  if (!admin && !mine) throw bad('You can only move tasks that are given to you.', 403);
  const status = req.body?.status ?? task.status;
  if (!STATUSES.includes(status)) throw bad('Unknown column.');
  const from = task.status;

  // Slot it into the column at the position asked for, then number the column again.
  const column = await Task.find({ sprint: task.sprint, status, _id: { $ne: task._id } }).sort({ order: 1, createdAt: 1 }).select('_id');
  const at = Math.max(0, Math.min(column.length, Number.isFinite(Number(req.body?.order)) ? Number(req.body.order) : column.length));
  const ids = column.map((t) => t._id);
  ids.splice(at, 0, task._id);
  await Task.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i } } } })));

  if (status !== from) {
    task.status = status;
    task.completedAt = status === 'done' ? new Date() : null;
    task.history.push({ user: req.user._id, type: 'moved', from: STATUS_LABEL[from], to: STATUS_LABEL[status] });
    await Task.updateOne({ _id: task._id }, { status, completedAt: task.completedAt, $push: { history: task.history[task.history.length - 1] } });

    // Tell the people it belongs to (not the one who just did it); when a member moves it, tell the admins and its creator too.
    const people = new Set(task.assignees.map((a) => String(a._id ?? a)));
    if (!admin) {
      for (const a of await User.find({ isAdmin: true, active: true }).select('_id')) people.add(String(a._id));
      if (task.createdBy) people.add(String(task.createdBy._id ?? task.createdBy));
    }
    people.delete(String(req.user._id));
    const mineIds = new Set(task.assignees.map((a) => String(a._id ?? a)));
    const note = { type: 'task-moved', title: `${req.user.name} moved “${task.title}”`, body: `${STATUS_LABEL[from]} → ${STATUS_LABEL[status]}`, href: `/board?task=${task._id}` };
    await notify([...people].filter((id) => mineIds.has(id)), { ...note, email: 'tasks' }); // the people it belongs to also get an email
    await notify([...people].filter((id) => !mineIds.has(id)), note); // admins and the creator: in-app only
  }
  changed(task.sprint, task._id);
  res.json(shapeTask(await loadTask(task._id), { detail: true }));
}

export async function addComment(req, res) {
  if (!isId(req.params.id)) throw bad('Task not found.', 404);
  const task = await loadTask(req.params.id);
  if (!task) throw bad('Task not found.', 404);
  const admin = Boolean(req.user.isAdmin);
  const mine = task.assignees.some((a) => same(a._id ?? a, req.user._id));
  if (!admin && !mine) throw bad('You can only comment on tasks that are given to you.', 403);
  const text = String(req.body?.text ?? '').trim().slice(0, 2000);
  if (!text) throw bad('Write a comment first.');
  task.comments.push({ user: req.user._id, text });
  task.history.push({ user: req.user._id, type: 'comment' });
  await task.save();
  const people = new Set(task.assignees.map((a) => String(a._id ?? a)));
  if (task.createdBy) people.add(String(task.createdBy._id ?? task.createdBy));
  people.delete(String(req.user._id));
  const mineIds = new Set(task.assignees.map((a) => String(a._id ?? a)));
  const note = { type: 'task', title: `${req.user.name} commented on “${task.title}”`, body: text.length > 120 ? `${text.slice(0, 117)}…` : text, href: `/board?task=${task._id}` };
  await notify([...people].filter((id) => mineIds.has(id)), { ...note, email: 'tasks' });
  await notify([...people].filter((id) => !mineIds.has(id)), note);
  changed(task.sprint, task._id);
  res.status(201).json(shapeTask(await loadTask(task._id), { detail: true }));
}

export async function deleteTask(req, res) {
  if (!isId(req.params.id)) throw bad('Task not found.', 404);
  const task = await Task.findById(req.params.id);
  if (!task) throw bad('Task not found.', 404);
  if (task.contentItem) await ContentItem.updateOne({ _id: task.contentItem, task: task._id }, { task: null });
  await task.deleteOne();
  changed(task.sprint, task._id);
  res.json({ ok: true });
}
