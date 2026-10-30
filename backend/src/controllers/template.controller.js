import mongoose from 'mongoose';
import { SavedTemplate } from '../models/SavedTemplate.model.js';

const KINDS = ['quote', 'excerpt', 'title', 'give'];
const THUMB_RE = /^data:image\/(jpeg|png|webp);base64,/;

function clampSize(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(4096, Math.max(256, n)) : 1080;
}

function fields(body) {
  const out = {};
  if (typeof body.name === 'string' && body.name.trim()) out.name = body.name.trim().slice(0, 80);
  if (KINDS.includes(body.kind)) out.kind = body.kind;
  if (body.width !== undefined) out.width = clampSize(body.width);
  if (body.height !== undefined) out.height = clampSize(body.height);
  if (body.editorState && typeof body.editorState === 'object') out.editorState = body.editorState;
  if (typeof body.thumb === 'string' && THUMB_RE.test(body.thumb) && body.thumb.length < 400000) out.thumb = body.thumb;
  return out;
}

export async function listTemplates(req, res) {
  res.json(await SavedTemplate.find().sort({ updatedAt: -1 }));
}

export async function createTemplate(req, res) {
  const data = fields(req.body);
  if (!data.editorState || !data.width || !data.height) return res.status(400).json({ error: 'editorState, width and height are required' });
  res.status(201).json(await SavedTemplate.create(data));
}

// Saving a canvas into an existing template: the same size as its primary replaces the primary,
// any other size is stored as (or replaces) that size's variant - so one template can be tuned
// separately for portrait, square, landscape and so on.
function mergeSnapshot(doc, data) {
  const { width, height, editorState, thumb, ...rest } = data;
  Object.assign(doc, rest);
  if (!editorState || !width || !height) return;
  if (doc.width === width && doc.height === height) {
    doc.editorState = editorState;
    if (thumb) doc.thumb = thumb;
    return;
  }
  const next = { width, height, editorState, thumb: thumb ?? '' };
  const idx = doc.variants.findIndex((v) => v.width === width && v.height === height);
  if (idx >= 0) doc.variants[idx] = next;
  else doc.variants.push(next);
  doc.markModified('variants');
}

export async function updateTemplate(req, res) {
  const { id } = req.params;
  const doc = mongoose.isValidObjectId(id) ? await SavedTemplate.findById(id) : null;
  if (!doc) return res.status(404).json({ error: 'template not found' });
  mergeSnapshot(doc, fields(req.body));
  await doc.save();
  res.json(doc);
}

export async function deleteTemplate(req, res) {
  if (mongoose.isValidObjectId(req.params.id)) await SavedTemplate.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}

export async function saveOverride(req, res) {
  const baseId = String(req.params.baseId).slice(0, 80);
  const data = fields(req.body);
  if (!data.editorState || !data.width || !data.height) return res.status(400).json({ error: 'editorState, width and height are required' });
  const existing = await SavedTemplate.findOne({ baseId });
  if (!existing) return res.json(await SavedTemplate.create({ ...data, baseId }));
  mergeSnapshot(existing, data);
  await existing.save();
  res.json(existing);
}

export async function deleteOverride(req, res) {
  await SavedTemplate.deleteOne({ baseId: String(req.params.baseId) });
  res.json({ ok: true });
}
