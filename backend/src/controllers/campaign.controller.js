import mongoose from 'mongoose';
import { Campaign } from '../models/Campaign.model.js';
import { ContentItem } from '../models/ContentItem.model.js';
import { Task } from '../models/Task.model.js';
import { aiIssue, callOpenRouterJSON } from '../services/openrouter.service.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const isId = (id) => mongoose.isValidObjectId(id);
const keyOf = (name) => name.trim().toLowerCase();
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');

function fields(b, { partial = false } = {}) {
  const out = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name ?? '').trim().slice(0, 80);
    if (!name) throw bad('Give the campaign a name.');
    out.name = name;
    out.key = keyOf(name);
  }
  if (b.goal !== undefined) out.goal = String(b.goal).slice(0, 1500);
  if (b.startDate !== undefined) out.startDate = day(b.startDate);
  if (b.endDate !== undefined) out.endDate = day(b.endDate);
  if (b.archived !== undefined) out.archived = Boolean(b.archived);
  if (out.startDate && out.endDate && out.endDate < out.startDate) throw bad('The end date is before the start date.');
  return out;
}

// Campaigns that existed only as a name typed on a post become real campaigns the first time the list is read, so they can
// be edited and deleted like any other.
async function adoptLegacy() {
  const names = await ContentItem.distinct('campaign', { campaign: { $ne: '' } });
  if (!names.length) return;
  const have = new Set((await Campaign.find().select('key').lean()).map((c) => c.key));
  const fresh = [];
  for (const n of names) {
    const name = n.trim();
    if (name && !have.has(keyOf(name))) {
      have.add(keyOf(name));
      fresh.push({ name, key: keyOf(name) });
    }
  }
  if (fresh.length) await Campaign.insertMany(fresh, { ordered: false }).catch(() => {});
}

// The names, for the pickers and filters (kept as a plain list).
export async function names(req, res) {
  await adoptLegacy();
  res.json((await Campaign.find({ archived: false }).select('name').lean()).map((c) => c.name).sort((a, b) => a.localeCompare(b)));
}

export async function list(req, res) {
  await adoptLegacy();
  const [camps, items] = await Promise.all([Campaign.find().sort({ createdAt: -1 }).lean(), ContentItem.find({ campaign: { $ne: '' } }).select('campaign status scheduledAt').lean()]);
  const tally = new Map();
  for (const i of items) {
    const t = tally.get(keyOf(i.campaign)) ?? { posts: 0, published: 0, scheduled: 0, next: null };
    t.posts += 1;
    if (i.status === 'published') t.published += 1;
    else if (i.scheduledAt && new Date(i.scheduledAt) > new Date() && (!t.next || new Date(i.scheduledAt) < t.next)) t.next = new Date(i.scheduledAt);
    if (i.status === 'scheduled') t.scheduled += 1;
    tally.set(keyOf(i.campaign), t);
  }
  res.json(camps.map((c) => ({ _id: String(c._id), name: c.name, goal: c.goal, startDate: c.startDate, endDate: c.endDate, archived: c.archived, createdAt: c.createdAt, ...(tally.get(c.key) ?? { posts: 0, published: 0, scheduled: 0, next: null }) })));
}

const taken = async (key, except) => Campaign.exists({ key, ...(except ? { _id: { $ne: except } } : {}) });

export async function create(req, res) {
  const data = fields(req.body ?? {});
  if (await taken(data.key)) throw bad('There is already a campaign with that name.', 409);
  const doc = await Campaign.create({ ...data, createdBy: req.user?._id });
  res.status(201).json({ _id: String(doc._id), name: doc.name, goal: doc.goal, startDate: doc.startDate, endDate: doc.endDate, archived: doc.archived, posts: 0, published: 0, scheduled: 0, next: null });
}

export async function update(req, res) {
  const doc = isId(req.params.id) ? await Campaign.findById(req.params.id) : null;
  if (!doc) throw bad('That campaign wasn’t found.', 404);
  const data = fields(req.body ?? {}, { partial: true });
  if (data.key && data.key !== doc.key && (await taken(data.key, doc._id))) throw bad('There is already a campaign with that name.', 409);
  const oldName = doc.name;
  Object.assign(doc, data);
  await doc.save();
  // The posts follow the new name (matched without regard to case, as the campaign itself is).
  if (data.name && data.name !== oldName) await ContentItem.updateMany({ campaign: { $regex: `^${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }, { campaign: doc.name });
  res.json({ ok: true, name: doc.name });
}

// Deletes the campaign. Its posts stay (without a campaign) unless `?posts=delete`, which also deletes the ones not yet posted.
export async function remove(req, res) {
  const doc = isId(req.params.id) ? await Campaign.findById(req.params.id) : null;
  if (!doc) return res.json({ ok: true });
  const match = { campaign: { $regex: `^${doc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
  let deleted = 0;
  if (req.query.posts === 'delete') {
    const doomed = await ContentItem.find({ ...match, status: { $nin: ['published', 'publishing'] } }).select('_id task');
    const ids = doomed.map((d) => d._id);
    if (ids.length) {
      await Task.updateMany({ contentItem: { $in: ids } }, { contentItem: null });
      deleted = (await ContentItem.deleteMany({ _id: { $in: ids } })).deletedCount ?? 0;
    }
  }
  const kept = (await ContentItem.updateMany(match, { campaign: '' })).modifiedCount ?? 0;
  await doc.deleteOne();
  res.json({ ok: true, deleted, kept });
}

const SYSTEM = `You help a church media team set up a content campaign for social media. From a rough idea, write a short campaign name and a goal.
Rules: the name is 2-4 words, plain and memorable, no hashtags. The goal is 2-3 plain sentences: who it is for, what it should help them do, and the feeling or action wanted. Only use what the idea says; never invent dates, events, names or numbers. Suggest 3 different angles for posts (each under 12 words).
Return ONLY JSON: {"name": string, "goal": string, "angles": [string, string, string]}`;

// Drafts a name and goal from a rough idea. Nothing is saved: the person edits it, then creates the campaign.
export async function draftWithAi(req, res) {
  const idea = String(req.body?.idea ?? '').trim().slice(0, 1500);
  if (idea.length < 8) throw bad('Say a little more about the campaign (a sentence is enough).');
  const out = await callOpenRouterJSON({ system: SYSTEM, user: JSON.stringify({ idea, current: String(req.body?.name ?? '').slice(0, 80) }), maxTokens: 600, temperature: 0.7 }).catch(() => null);
  if (!out?.name || !out?.goal) {
    const why = aiIssue();
    throw bad(why === 'credits' ? 'The AI writer is paused (out of credit). You can still write the campaign yourself.' : 'The AI couldn’t be reached just now. Try again in a moment, or write it yourself.', 502);
  }
  res.json({ name: String(out.name).slice(0, 80), goal: String(out.goal).slice(0, 1500), angles: (Array.isArray(out.angles) ? out.angles : []).map((a) => String(a).slice(0, 120)).slice(0, 4) });
}
