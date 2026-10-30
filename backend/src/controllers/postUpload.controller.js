import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';
import { PostUpload } from '../models/PostUpload.model.js';
import { generateCaptions, processUpload, publishUploadToInstagram, removeUploadFiles } from '../services/postUpload.service.js';
import { ContentItem } from '../models/ContentItem.model.js';
import { InstagramApiError, InstagramConfigError } from '../services/instagram.service.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const isId = (id) => mongoose.isValidObjectId(id);

export const postFileUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir(), filename: (req, file, cb) => cb(null, `post-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`) }),
  fileFilter: (req, file, cb) => (/^(video|image)\//.test(file.mimetype) || /\.(mp4|mov|m4v|webm|png|jpe?g|webp|heic)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Upload a video or a picture.'))),
  limits: { fileSize: 800 * 1024 * 1024 },
});

const shape = (d) => d.toObject();
const find = async (id) => {
  const doc = isId(id) ? await PostUpload.findById(id) : null;
  if (!doc) throw bad('That upload wasn’t found.', 404);
  return doc;
};

export async function createUpload(req, res) {
  if (!req.file) throw bad('Choose a video or a picture first.');
  const isImage = req.file.mimetype.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/i.test(req.file.originalname);
  const doc = await PostUpload.create({
    kind: isImage ? 'image' : 'video',
    originalName: req.file.originalname.slice(0, 200),
    title: req.file.originalname.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120),
    notes: String(req.body?.notes ?? '').slice(0, 1500),
    tone: String(req.body?.tone ?? '').slice(0, 40),
    createdBy: req.user?._id,
    stage: 'Starting…',
  });
  void processUpload(String(doc._id), req.file.path);
  res.status(201).json(shape(doc));
}

export async function listUploads(req, res) {
  res.json((await PostUpload.find().sort({ createdAt: -1 }).limit(40).select('-transcript -options')).map(shape));
}

export async function getUpload(req, res) {
  res.json(shape(await find(req.params.id)));
}

// Edit the caption, the notes or the tone.
export async function updateUpload(req, res) {
  const doc = await find(req.params.id);
  const b = req.body ?? {};
  if (typeof b.caption === 'string') doc.caption = b.caption.slice(0, 2200);
  if (typeof b.notes === 'string') doc.notes = b.notes.slice(0, 1500);
  if (typeof b.tone === 'string') doc.tone = b.tone.slice(0, 40);
  if (typeof b.title === 'string' && b.title.trim()) doc.title = b.title.trim().slice(0, 120);
  await doc.save();
  res.json(shape(doc));
}

// Write new caption ideas (optionally with fresh notes / a different tone).
export async function regenerate(req, res) {
  const doc = await find(req.params.id);
  if (doc.status === 'processing') throw bad('Still getting this ready.');
  if (typeof req.body?.notes === 'string') doc.notes = req.body.notes.slice(0, 1500);
  if (typeof req.body?.tone === 'string') doc.tone = req.body.tone.slice(0, 40);
  const previous = doc.options.map((o) => o.caption);
  await doc.save();
  await generateCaptions(doc._id, { previous });
  res.json(shape(await find(req.params.id)));
}

// Publishes to the real Instagram account - the page asks for confirmation first.
export async function publishUpload(req, res) {
  const doc = await find(req.params.id);
  if (doc.status !== 'ready' || !doc.mediaUrl) throw bad('This isn’t ready to post yet.');
  if (doc.instagramMediaId) throw bad('This has already been posted.', 409);
  const caption = String(req.body?.caption ?? doc.caption ?? '').trim().slice(0, 2200);
  try {
    await publishUploadToInstagram(doc, caption);
    // A calendar item built on this upload is now out too.
    await ContentItem.updateMany({ upload: doc._id, status: { $ne: 'published' } }, { status: 'published', publishedAt: doc.instagramPublishedAt, instagramMediaId: doc.instagramMediaId, instagramPermalink: doc.instagramPermalink, error: '' });
    res.json(shape(doc));
  } catch (err) {
    if (err instanceof InstagramConfigError || err instanceof InstagramApiError) throw bad(err.message, err instanceof InstagramConfigError ? 400 : 502);
    throw err;
  }
}

export async function removeUpload(req, res) {
  const doc = await find(req.params.id);
  removeUploadFiles(doc);
  // A calendar item that was going to post this loses its media; a scheduled one goes back to 'ready' with a note.
  await ContentItem.updateMany({ upload: doc._id, status: 'scheduled' }, { upload: null, status: 'ready', error: 'The attached media was deleted - attach it again before scheduling.' });
  await ContentItem.updateMany({ upload: doc._id }, { upload: null });
  await doc.deleteOne();
  res.json({ ok: true });
}
