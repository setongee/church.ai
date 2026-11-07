import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import { Prayer } from '../models/Prayer.model.js';
import { ScriptureBox } from '../models/ScriptureBox.model.js';
import { SceneTemplate } from '../models/SceneTemplate.model.js';
import { cleanFrame, cleanSections } from './schedule.controller.js';
import { Wrapper } from '../models/Wrapper.model.js';
import { PresentQuote } from '../models/PresentQuote.model.js';
import { PresentMedia } from '../models/PresentMedia.model.js';
import { Slideshow } from '../models/Slideshow.model.js';
import { ImageAsset } from '../models/ImageAsset.model.js';
import { storeImage } from '../services/imageStore.service.js';
import { UPLOADS_DIR } from '../middlewares/upload.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? '').slice(0, max);

const BG_TYPES = new Set(['gradient', 'color', 'image', 'video']);
// A background is { type, value } or nothing.
export const cleanBackground = (b) => (b && BG_TYPES.has(b.type) && typeof b.value === 'string' && b.value ? { type: b.type, value: str(b.value, 1000) } : null);

// ---- Custom templates (scenes) ------------------------------------------------------------------

export async function listSceneTemplates(req, res) {
  // ?kind=prayer lists the prayer templates; otherwise the general ones (older templates have no kind).
  const filter = req.query.kind === 'prayer' ? { kind: 'prayer' } : { kind: { $ne: 'prayer' } };
  res.json(await SceneTemplate.find(filter).sort({ name: 1 }).limit(200));
}
export async function saveSceneTemplate(req, res) {
  const name = str(req.body?.name, 120).trim();
  if (!name) throw bad('Give the template a name.');
  const fields = {
    name,
    ...(req.params.id ? {} : { kind: req.body?.kind === 'prayer' ? 'prayer' : 'general' }),
    background: cleanBackground(req.body?.background),
    frame: cleanFrame(req.body?.frame),
    frameBg: cleanBackground(req.body?.frameBg),
    align: req.body?.align === 'left' ? 'left' : 'center',
    scale: Math.min(3.4, Math.max(0.3, Number(req.body?.scale) || 1)),
    // Looks of its own for scripture / song / prayer (anything not set uses the template's default look above).
    sections: req.body?.kind === 'prayer' ? null : cleanSections(req.body?.sections),
  };
  const doc = req.params.id ? await SceneTemplate.findByIdAndUpdate(req.params.id, fields, { new: true }) : await SceneTemplate.create(fields);
  if (!doc) throw bad('Template not found.', 404);
  res.json(doc);
}
export async function deleteSceneTemplate(req, res) {
  await SceneTemplate.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}

// ---- Scripture box ----------------------------------------------------------------------------

export async function listScriptureBox(req, res) {
  res.json(await ScriptureBox.find().sort({ createdAt: -1 }).limit(500));
}
// Adds a scripture; the same reference + version + text twice just returns the existing one.
export async function addScriptureBox(req, res) {
  const reference = str(req.body?.reference, 100).trim();
  const text = str(req.body?.text, 6000).trim();
  if (!reference || !text) throw bad('A scripture needs a reference and text.');
  const version = str(req.body?.version, 20).trim();
  const existing = await ScriptureBox.findOne({ reference, version, text });
  if (existing) return res.json({ item: existing, added: false });
  const item = await ScriptureBox.create({ reference, version, text });
  res.status(201).json({ item, added: true });
}
export async function deleteScriptureBox(req, res) {
  await ScriptureBox.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}

// ---- Prayers ----------------------------------------------------------------------------------

export async function listPrayers(req, res) {
  res.json(await Prayer.find().sort({ title: 1 }).limit(300));
}
export async function savePrayer(req, res) {
  const title = str(req.body?.title, 200).trim();
  if (!title) throw bad('A prayer needs a title.');
  const template = req.body?.template && mongoose.isValidObjectId(req.body.template) ? req.body.template : null; // the prayer template it uses
  const fields = { title, body: str(req.body?.body, 20000), background: cleanBackground(req.body?.background), template };
  const doc = req.params.id ? await Prayer.findByIdAndUpdate(req.params.id, fields, { new: true }) : await Prayer.create(fields);
  if (!doc) throw bad('Prayer not found.', 404);
  res.json(doc);
}
export async function deletePrayer(req, res) {
  await Prayer.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}

// ---- Quotes & excerpts ------------------------------------------------------------------------

export async function listQuotes(req, res) {
  res.json(await PresentQuote.find().sort({ createdAt: -1 }).limit(300));
}
export async function saveQuote(req, res) {
  const text = str(req.body?.text, 4000).trim();
  if (!text) throw bad('Type the quote.');
  const fields = { text, attribution: str(req.body?.attribution, 200).trim(), background: cleanBackground(req.body?.background) };
  const doc = req.params.id ? await PresentQuote.findByIdAndUpdate(req.params.id, fields, { new: true }) : await PresentQuote.create(fields);
  if (!doc) throw bad('Quote not found.', 404);
  res.json(doc);
}
export async function deleteQuote(req, res) {
  await PresentQuote.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}

// ---- Quote slide shows ----------------------------------------------------------------------------

function cleanShow(b) {
  const name = str(b?.name, 120).trim();
  if (!name) throw bad('Give the slide show a name.');
  const quotes = (Array.isArray(b.quotes) ? b.quotes : [])
    .slice(0, 200)
    .map((q) => ({ text: str(q?.text, 4000).trim(), attribution: str(q?.attribution, 200).trim(), background: cleanBackground(q?.background) }))
    .filter((q) => q.text);
  if (!quotes.length) throw bad('Add at least one quote.');
  const c = b.closing || {};
  return {
    name,
    quotes,
    seconds: Math.min(600, Math.max(2, Math.round(Number(b.seconds) || 8))),
    loop: Boolean(b.loop),
    closing: { enabled: Boolean(c.enabled), text: str(c.text, 300).trim(), subtext: str(c.subtext, 600).trim(), background: cleanBackground(c.background) },
    background: cleanBackground(b.background),
  };
}

export async function listSlideshows(req, res) {
  res.json(await Slideshow.find().sort({ updatedAt: -1 }).limit(200));
}
export async function saveSlideshow(req, res) {
  const fields = cleanShow(req.body);
  const doc = req.params.id ? await Slideshow.findByIdAndUpdate(req.params.id, fields, { new: true }) : await Slideshow.create(fields);
  if (!doc) throw bad('Slide show not found.', 404);
  res.json(doc);
}
export async function deleteSlideshow(req, res) {
  await Slideshow.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}

// ---- Media (pictures, GIFs, videos) -----------------------------------------------------------

export const MEDIA_DIR = path.join(UPLOADS_DIR, 'present-media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const FILE_URL_PREFIX = '/uploads/present-media/';

// Browsers label files properly; other clients sometimes send application/octet-stream, so fall back to the extension.
const typeOf = (mime, name = '') => {
  if (mime === 'image/gif' || /\.gif$/i.test(name)) return 'gif';
  if (mime.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogv)$/i.test(name)) return 'video';
  return 'image';
};
const kindToPurpose = { 'present-bg': 'background', 'present-image': 'media' };

// Everything uploaded here, plus pictures uploaded before videos/GIFs were supported (kept in the
// image bank), newest first, in one shape.
export async function listMedia(req, res) {
  const purpose = req.query.purpose === 'background' ? 'background' : req.query.purpose === 'media' ? 'media' : null;
  const [fresh, legacy] = await Promise.all([
    PresentMedia.find(purpose ? { purpose } : {}).sort({ createdAt: -1 }).limit(300).lean(),
    ImageAsset.find({ kind: purpose ? (purpose === 'background' ? 'present-bg' : 'present-image') : { $in: ['present-bg', 'present-image'] } }).sort({ createdAt: -1 }).limit(300).lean(),
  ]);
  const items = [
    ...fresh.map((m) => ({ _id: String(m._id), url: m.url, name: m.name, type: m.type, purpose: m.purpose, createdAt: m.createdAt })),
    ...legacy.map((m) => ({ _id: String(m._id), url: m.url, name: m.name, type: 'image', purpose: kindToPurpose[m.kind] || 'media', createdAt: m.createdAt })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
}

// Multer has saved the upload to disk. Ordinary pictures go through the image store (Cloudinary when
// configured); GIFs and videos stay on disk, served from /uploads.
export async function uploadMedia(req, res) {
  const file = req.file;
  if (!file) throw bad('Choose a picture, GIF or video.');
  const purpose = req.body?.purpose === 'background' || kindToPurpose[req.body?.kind] === 'background' ? 'background' : 'media';
  const type = typeOf(file.mimetype, file.originalname);
  const name = str(Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/\.[^.]+$/, ''), 80);
  try {
    let url = `${FILE_URL_PREFIX}${file.filename}`;
    if (type === 'image') {
      const dataUri = `data:${file.mimetype.startsWith('image/') ? file.mimetype : 'image/png'};base64,${(await fs.promises.readFile(file.path)).toString('base64')}`;
      url = await storeImage(dataUri, `present-${path.parse(file.filename).name}`);
      await fs.promises.rm(file.path, { force: true });
    }
    const doc = await PresentMedia.create({ url, name, type, purpose, mime: file.mimetype, size: file.size });
    res.json({ _id: String(doc._id), url: doc.url, name: doc.name, type: doc.type, purpose: doc.purpose, createdAt: doc.createdAt });
  } catch (err) {
    await fs.promises.rm(file.path, { force: true }).catch(() => {});
    throw err;
  }
}

export async function deleteMedia(req, res) {
  const id = req.params.id;
  const doc = await PresentMedia.findByIdAndDelete(id);
  if (doc) {
    // Remove the file only if it's one of ours, by its own name (never touch anything else in uploads).
    if (doc.url.startsWith(FILE_URL_PREFIX)) {
      const file = path.join(MEDIA_DIR, path.basename(doc.url));
      if (path.dirname(file) === MEDIA_DIR) await fs.promises.rm(file, { force: true }).catch(() => {});
    }
  } else {
    await ImageAsset.deleteOne({ _id: id, kind: { $in: ['present-bg', 'present-image'] } });
  }
  res.json({ ok: true });
}

// ---- Service wrappers ---------------------------------------------------------------------------------

const ANNOUNCEMENT_IDS = new Set(['classic', 'bold', 'split', 'glass', 'spotlight', 'poster', 'lower', 'ticket', 'editorial', 'wave']);
const QUOTE_IDS = new Set(['classic', 'centered', 'bold', 'bar', 'card', 'minimal', 'bigmark']);
const CHAT_SKIN_IDS = new Set(['default', 'warm', 'midnight', 'forest', 'ocean', 'rose']);
const LAYOUT_IDS = new Set(['classic', 'stage', 'mirror']);

// Pick only a real template id (or nothing).
async function templateRef(v) {
  if (!v || !mongoose.isValidObjectId(v)) return null;
  return (await SceneTemplate.exists({ _id: v })) ? v : null;
}

export async function listWrappers(req, res) {
  res.json(await Wrapper.find().sort({ name: 1 }).limit(200));
}
export async function saveWrapper(req, res) {
  const b = req.body ?? {};
  const name = str(b.name, 120).trim();
  if (!name) throw bad('Give the wrapper a name.');
  const weight = Number(b.weight);
  const fields = {
    name,
    scripture: await templateRef(b.scripture),
    prayer: await templateRef(b.prayer),
    song: await templateRef(b.song),
    background: cleanBackground(b.background),
    font: str(b.font, 80),
    weight: [400, 500, 700].includes(weight) ? weight : null,
    announcementTemplate: ANNOUNCEMENT_IDS.has(b.announcementTemplate) ? b.announcementTemplate : '',
    quoteLayout: QUOTE_IDS.has(b.quoteLayout) ? b.quoteLayout : '',
    chatSkin: CHAT_SKIN_IDS.has(b.chatSkin) ? b.chatSkin : '',
    layout: LAYOUT_IDS.has(b.layout) ? b.layout : '',
  };
  const doc = req.params.id ? await Wrapper.findByIdAndUpdate(req.params.id, fields, { new: true }) : await Wrapper.create(fields);
  if (!doc) throw bad('Wrapper not found.', 404);
  res.json(doc);
}
export async function deleteWrapper(req, res) {
  await Wrapper.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}
