import fs from 'fs';
import path from 'path';
import { Submission } from '../models/Submission.model.js';
import { User } from '../models/User.model.js';
import { notify } from '../services/notification.service.js';
import * as c from './present.controller.js';
import * as pc from './presentContent.controller.js';
import * as sc from './schedule.controller.js';
import * as dc from './design.controller.js';
import * as tc from './template.controller.js';
import * as ec from './editor.controller.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? '').slice(0, max);

// What a submission may change, and the controller that does each kind of change. These are the same handlers the
// live API uses, so an approved change is cleaned and saved exactly as if an admin had made it.
// A design made in Image Studio travels as one change: how it was created, then everything saved onto it, then the picture
// that was exported from it (if any).
async function designCreate(req, res) {
  const { create = {}, patch = {}, export: exported } = req.body ?? {};
  const made = await run(dc.createDesign, { params: {}, body: create });
  const id = made?.design?._id;
  if (id) await designUpdate({ params: { id }, body: { patch, export: exported } }, { json: () => {} });
  res.json(made);
}
async function designUpdate(req, res) {
  const { patch, export: exported } = req.body ?? {};
  if (patch && Object.keys(patch).length) await run(dc.updateDesign, { params: req.params, body: patch });
  if (exported?.dataUrl) await run(dc.exportDesign, { params: req.params, body: exported });
  res.json({ ok: true });
}

const COLLECTIONS = {
  designs: { create: designCreate, update: designUpdate, remove: dc.deleteDesign },
  templates: { create: tc.createTemplate, update: tc.updateTemplate, remove: tc.deleteTemplate },
  uploads: { create: ec.uploadEditorImage },
  songs: { create: c.createSong, update: c.updateSong, remove: c.deleteSong },
  announcements: { create: c.createAnnouncement, update: c.updateAnnouncement, remove: c.deleteAnnouncement },
  'scene-templates': { create: pc.saveSceneTemplate, update: pc.saveSceneTemplate, remove: pc.deleteSceneTemplate },
  wrappers: { create: pc.saveWrapper, update: pc.saveWrapper, remove: pc.deleteWrapper },
  prayers: { create: pc.savePrayer, update: pc.savePrayer, remove: pc.deletePrayer },
  quotes: { create: pc.saveQuote, update: pc.saveQuote, remove: pc.deleteQuote },
  slideshows: { create: pc.saveSlideshow, update: pc.saveSlideshow, remove: pc.deleteSlideshow },
  'scripture-box': { create: pc.addScriptureBox, remove: pc.deleteScriptureBox },
  schedules: { create: sc.createSchedule, update: sc.updateSchedule, remove: sc.deleteSchedule },
  media: { create: pc.uploadMedia, remove: pc.deleteMedia },
};

// Changes that carry a picture, video or file along with them.
const FILE_AREAS = new Set(['media', 'uploads']);
const needsFile = (o) => o.method === 'POST' && FILE_AREAS.has(o.area);

const isTemp = (v) => typeof v === 'string' && v.startsWith('local_');

// Runs a controller with a stand-in request and response and hands back what it answered.
async function run(handler, req) {
  let data;
  await handler({ query: {}, headers: {}, ...req }, { status: () => ({ json: (d) => (data = d) }), json: (d) => (data = d) });
  return data;
}

// Swaps device-made ids (and device-made file addresses) for the live ones made earlier in the same approval.
function remap(v, idMap, urlMap) {
  if (typeof v === 'string') {
    if (isTemp(v) && idMap[v]) return idMap[v];
    let out = v;
    for (const [from, to] of Object.entries(urlMap)) if (out.includes(from)) out = out.split(from).join(to);
    return out;
  }
  if (Array.isArray(v)) return v.map((x) => remap(x, idMap, urlMap));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x, idMap, urlMap)]));
  return v;
}

async function applyOp(sub, op) {
  const h = COLLECTIONS[op.area];
  const idMap = sub.idMap ?? {};
  const urlMap = sub.urlMap ?? {};
  const body = remap(op.body ?? {}, idMap, urlMap);
  if (op.method === 'POST') {
    let file;
    if (FILE_AREAS.has(op.area)) {
      const f = sub.files.find((x) => x.tempId === op.tempId);
      if (!f || !fs.existsSync(f.path)) throw bad(`The file for “${op.label || 'a change'}” is missing.`, 422);
      file = { path: f.path, filename: path.basename(f.path), originalname: f.name, mimetype: f.mime, size: f.size };
      // The editor's upload handler reads the picture from memory.
      if (op.area === 'uploads') file.buffer = await fs.promises.readFile(f.path);
    }
    const made = await run(h.create, { params: {}, body, file });
    const real = made?.item?._id ?? made?.design?._id ?? made?.asset?._id ?? made?._id;
    if (op.tempId) {
      if (real) idMap[op.tempId] = String(real);
      if ((op.area === 'media' || op.area === 'uploads') && made?.url) urlMap[`local://${op.tempId}`] = made.url;
    }
    return;
  }
  const target = idMap[op.id] ?? op.id;
  if (isTemp(target)) return; // it was made and removed on the device; nothing to do
  await run(op.method === 'PUT' ? h.update : h.remove, { params: { id: target }, body });
}

function cleanOps(raw) {
  if (!Array.isArray(raw) || !raw.length) throw bad('There is nothing to send yet.');
  if (raw.length > 500) throw bad('That is too many changes in one go. Send them in smaller batches.');
  return raw.map((o) => {
    const h = COLLECTIONS[o?.collection];
    if (!h) throw bad(`“${str(o?.collection, 40)}” can’t be sent for review.`);
    const method = ['POST', 'PUT', 'DELETE'].includes(o.method) ? o.method : null;
    if (!method) throw bad('Unknown change.');
    if (method === 'POST' && !h.create) throw bad('That can’t be created.');
    if (method === 'PUT' && !h.update) throw bad('That can’t be edited.');
    if (method !== 'POST' && !o.id) throw bad('A change is missing what it applies to.');
    return { method, area: o.collection, id: str(o.id, 80), tempId: str(o.tempId, 80), label: str(o.label, 160), body: method === 'DELETE' ? null : (o.body ?? {}) };
  });
}

const authorOf = (s) => (s.author?.name ? { _id: s.author._id, name: s.author.name } : null);
const brief = (s) => ({
  _id: s._id,
  title: s.title,
  note: s.note,
  status: s.status,
  applied: s.applied,
  author: authorOf(s),
  createdAt: s.createdAt,
  reviewedAt: s.reviewedAt,
  reviewNote: s.reviewNote,
  counts: { total: s.ops.length, added: s.ops.filter((o) => o.method === 'POST').length, changed: s.ops.filter((o) => o.method === 'PUT').length, removed: s.ops.filter((o) => o.method === 'DELETE').length },
});
const full = (s) => ({ ...brief(s), applied: s.applied, ops: s.ops.map((o) => {
    const { area, ...rest } = o.toObject();
    return { ...rest, collection: area };
  }), files: s.files.map((f) => ({ tempId: f.tempId, name: f.name, type: f.type, url: `/uploads/present-media/${path.basename(f.path)}` })) });

const canSee = (s, user) => user.isAdmin || String(s.author?._id ?? s.author) === String(user._id);

export async function listSubmissions(req, res) {
  const filter = req.user.isAdmin ? {} : { author: req.user._id };
  if (['pending', 'approved', 'rejected', 'withdrawn'].includes(req.query.status)) filter.status = req.query.status;
  const list = await Submission.find(filter).sort({ createdAt: -1 }).limit(200).populate('author', 'name');
  res.json(list.map(brief));
}

export async function getSubmission(req, res) {
  const s = await Submission.findById(req.params.id).populate('author', 'name');
  if (!s || !canSee(s, req.user)) return res.status(404).json({ error: 'Submission not found.' });
  res.json(full(s));
}

// multipart: `payload` is JSON ({ title, note, ops }); each picture/video made on the device is a file named by its tempId.
export async function createSubmission(req, res) {
  const files = req.files ?? [];
  const drop = () => Promise.all(files.map((f) => fs.promises.rm(f.path, { force: true })));
  try {
    let payload;
    try {
      payload = JSON.parse(req.body?.payload || '{}');
    } catch {
      throw bad('That didn’t arrive properly. Try sending it again.');
    }
    const title = str(payload.title, 160).trim();
    if (!title) throw bad('Give it a name so the reviewer knows what it is.');
    const ops = cleanOps(payload.ops);
    const needed = new Set(ops.filter(needsFile).map((o) => o.tempId));
    for (const id of needed) if (!files.some((f) => f.fieldname === id)) throw bad('A picture or video is missing from what you sent.');
    const sub = await Submission.create({
      author: req.user._id,
      title,
      note: str(payload.note, 2000),
      ops,
      files: files.filter((f) => needed.has(f.fieldname)).map((f) => ({ tempId: f.fieldname, path: f.path, name: str(f.originalname, 200), mime: f.mimetype, size: f.size, type: f.mimetype.startsWith('video/') ? 'video' : f.mimetype.startsWith('image/') ? 'image' : 'file' })),
    });
    for (const f of files) if (!needed.has(f.fieldname)) await fs.promises.rm(f.path, { force: true });
    const admins = await User.find({ isAdmin: true, active: true }).select('_id');
    await notify(admins.map((a) => a._id), { type: 'review', title: `${req.user.name} sent “${title}” for review`, body: `${ops.length} change${ops.length === 1 ? '' : 's'} waiting for you.`, href: '/review' });
    res.status(201).json(brief(await sub.populate('author', 'name')));
  } catch (err) {
    await drop();
    throw err;
  }
}

const dropFiles = (s) => Promise.all(s.files.map((f) => fs.promises.rm(f.path, { force: true })));

// Applies the changes to the live data, in the order they were made. If one fails the rest wait, and approving again
// carries on from that point.
export async function approveSubmission(req, res) {
  const s = await Submission.findById(req.params.id).populate('author', 'name');
  if (!s) return res.status(404).json({ error: 'Submission not found.' });
  if (s.status !== 'pending') return res.status(409).json({ error: `This was already ${s.status}.` });
  for (let i = s.applied; i < s.ops.length; i++) {
    try {
      await applyOp(s, s.ops[i]);
    } catch (err) {
      s.markModified('idMap');
      s.markModified('urlMap');
      await s.save();
      return res.status(422).json({ error: `Change ${i + 1} of ${s.ops.length} (${s.ops[i].label || s.ops[i].area}) couldn’t be applied: ${err.message}. The earlier ${i} went live; fix or reject the rest.`, applied: i });
    }
    s.applied = i + 1;
  }
  s.status = 'approved';
  s.reviewer = req.user._id;
  s.reviewedAt = new Date();
  s.reviewNote = str(req.body?.note, 2000);
  s.markModified('idMap');
  s.markModified('urlMap');
  await s.save();
  await notify([s.author._id], { type: 'review', title: `“${s.title}” was approved`, body: s.reviewNote || 'It is live now.', href: '/review' });
  res.json(brief(s));
}

export async function rejectSubmission(req, res) {
  const s = await Submission.findById(req.params.id).populate('author', 'name');
  if (!s) return res.status(404).json({ error: 'Submission not found.' });
  if (s.status !== 'pending') return res.status(409).json({ error: `This was already ${s.status}.` });
  s.status = 'rejected';
  s.reviewer = req.user._id;
  s.reviewedAt = new Date();
  s.reviewNote = str(req.body?.note, 2000);
  await s.save();
  await dropFiles(s);
  await notify([s.author._id], { type: 'review', title: `“${s.title}” was sent back`, body: s.reviewNote || 'It wasn’t approved. Your copy is still on your device.', href: '/review' });
  res.json(brief(s));
}

export async function withdrawSubmission(req, res) {
  const s = await Submission.findById(req.params.id).populate('author', 'name');
  if (!s || String(s.author._id) !== String(req.user._id)) return res.status(404).json({ error: 'Submission not found.' });
  if (s.status !== 'pending') return res.status(409).json({ error: `This was already ${s.status}.` });
  if (s.applied > 0) return res.status(409).json({ error: 'The reviewer has already started applying it.' });
  s.status = 'withdrawn';
  await s.save();
  await dropFiles(s);
  res.json(brief(s));
}
