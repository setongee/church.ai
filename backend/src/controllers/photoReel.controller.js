import { PhotoReel } from '../models/PhotoReel.model.js';
import { sanitizeOptions } from '../services/reelOptions.service.js';
import { storePhoto, removeStoredFile, PHOTOS_DIR, CAROUSEL_DIR } from '../services/photoStore.service.js';
import { enqueueRender, peekPhotoStills, photoCycleSec, photoSeconds, queuePhotoStills } from '../services/reelRender.service.js';
import { CAROUSEL_CYCLE, CAROUSEL_LAYOUTS, LOWER_THIRDS, PHOTO_TEMPLATES } from '../../remotion/photoTemplates.js';
import { publishToInstagram } from './reel.controller.js';
import { ENHANCE_PRESETS, enhancePhoto } from '../services/photoEnhance.service.js';

const MAX_PHOTOS = 60;
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v, min, max, fallback) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback);
const isBusy = (d) => d.status === 'queued' || d.status === 'rendering' || d.carousel?.status === 'queued' || d.carousel?.status === 'rendering';

// Adds the video's real length (photos + closing card) for the UI.
function present(doc) {
  const obj = doc.toObject();
  obj.videoSec = photoSeconds(doc);
  obj.photoSec = photoCycleSec(doc);
  return obj;
}

async function find(req, res) {
  const doc = await PhotoReel.findById(req.params.id);
  if (!doc) res.status(404).json({ error: 'photo reel not found' });
  return doc;
}

export function getPhotoTemplates(req, res) {
  res.json({
    templates: PHOTO_TEMPLATES,
    layouts: CAROUSEL_LAYOUTS,
    lowerThirds: LOWER_THIRDS,
    enhancements: Object.entries(ENHANCE_PRESETS).map(([id, p]) => ({ id, label: p.label, hint: p.hint })),
  });
}

export async function listPhotoReels(req, res) {
  res.json((await PhotoReel.find().sort({ updatedAt: -1 }).limit(100)).map(present));
}

export async function createPhotoReel(req, res) {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Give the reel a title.' });
  const doc = await PhotoReel.create({
    title: title.slice(0, 80),
    intro: { enabled: true, title: title.slice(0, 80), subtitle: '' },
    options: sanitizeOptions({}),
  });
  res.status(201).json(present(doc));
}

// The editable fields, shared by saving and by previewing unsaved edits.
function editableFields(body, existing) {
  const out = {};
  if (typeof body.title === 'string' && body.title.trim()) out.title = body.title.trim().slice(0, 80);
  if (PHOTO_TEMPLATES.some((t) => t.id === body.template)) out.template = body.template;
  if (body.intro && typeof body.intro === 'object') {
    out.intro = {
      enabled: typeof body.intro.enabled === 'boolean' ? body.intro.enabled : existing.intro?.enabled ?? true,
      title: typeof body.intro.title === 'string' ? body.intro.title.trim().slice(0, 80) : existing.intro?.title ?? '',
      subtitle: typeof body.intro.subtitle === 'string' ? body.intro.subtitle.trim().slice(0, 100) : existing.intro?.subtitle ?? '',
    };
  }
  if (body.lengthSec !== undefined) out.lengthSec = Math.round(clamp(body.lengthSec, 3, 60, existing.lengthSec ?? 8));
  if (body.colors && typeof body.colors === 'object') {
    out.colors = { ...(existing.colors?.toObject?.() ?? existing.colors ?? {}) };
    for (const k of ['accent', 'tintA', 'tintB']) {
      if (typeof body.colors[k] === 'string') out.colors[k] = HEX.test(body.colors[k]) ? body.colors[k] : '';
    }
  }
  if (body.lowerThird && typeof body.lowerThird === 'object') {
    const cur = existing.lowerThird?.toObject?.() ?? existing.lowerThird ?? {};
    const t = (v, max, fallback) => (typeof v === 'string' ? v.trim().slice(0, max) : fallback ?? '');
    out.lowerThird = {
      style: LOWER_THIRDS.some((l) => l.id === body.lowerThird.style) ? body.lowerThird.style : cur.style ?? 'none',
      title: t(body.lowerThird.title, 60, cur.title),
      subtitle: t(body.lowerThird.subtitle, 40, cur.subtitle),
      left: t(body.lowerThird.left, 40, cur.left),
      right: t(body.lowerThird.right, 90, cur.right),
    };
  }
  if (body.options && typeof body.options === 'object') out.options = sanitizeOptions(body.options, existing.options);
  return out;
}

export async function updatePhotoReel(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (isBusy(doc)) return res.status(409).json({ error: 'This reel is rendering - wait for it to finish before editing.' });
  Object.assign(doc, editableFields(req.body, doc));
  if (doc.options) doc.markModified('options');

  // Reorder photos: send the full list of image ids in the new order.
  if (Array.isArray(req.body.imageOrder)) {
    const byId = new Map(doc.images.map((i) => [i._id.toString(), i]));
    const ordered = req.body.imageOrder.map((id) => byId.get(String(id))).filter(Boolean);
    if (ordered.length === doc.images.length) doc.images = ordered;
  }
  if (doc.status === 'done') doc.status = 'draft';
  await doc.save();
  res.json(present(doc));
}

export async function deletePhotoReel(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (isBusy(doc)) return res.status(409).json({ error: 'This reel is rendering - wait for it to finish before deleting.' });
  doc.images.forEach((i) => {
    removeStoredFile(i.url, PHOTOS_DIR);
    removeStoredFile(i.originalUrl, PHOTOS_DIR);
  });
  doc.carousel.renderedUrls.forEach((u) => removeStoredFile(u, CAROUSEL_DIR));
  await doc.deleteOne();
  res.json({ ok: true });
}

export async function addPhotos(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (isBusy(doc)) return res.status(409).json({ error: 'This reel is rendering - wait for it to finish before adding photos.' });
  const files = req.files ?? [];
  if (files.length === 0) return res.status(400).json({ error: 'Choose at least one photo.' });
  if (doc.images.length + files.length > MAX_PHOTOS) return res.status(400).json({ error: `A reel can have at most ${MAX_PHOTOS} photos.` });

  const added = [];
  const failed = [];
  for (const f of files) {
    try {
      added.push({ url: await storePhoto(f.buffer, f.originalname) });
    } catch (err) {
      failed.push(`${f.originalname}: ${err.message}`);
    }
  }
  if (added.length === 0) return res.status(400).json({ error: failed[0] || 'None of those files could be read as photos.' });
  doc.images.push(...added);
  if (doc.status === 'done') doc.status = 'draft';
  await doc.save();
  res.status(201).json({ ...present(doc), warnings: failed });
}

export async function removePhoto(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (isBusy(doc)) return res.status(409).json({ error: 'This reel is rendering - wait for it to finish.' });
  const img = doc.images.id(req.params.imageId);
  if (!img) return res.status(404).json({ error: 'photo not found' });
  removeStoredFile(img.url, PHOTOS_DIR);
  removeStoredFile(img.originalUrl, PHOTOS_DIR);
  const url = img.url;
  img.deleteOne();
  // Slides that used the photo fall back to the remaining ones.
  for (const s of doc.carousel.slides) s.images = s.images.filter((u) => u !== url);
  if (doc.status === 'done') doc.status = 'draft';
  await doc.save();
  res.json(present(doc));
}

export async function renderPhotoReelEndpoint(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (isBusy(doc)) return res.json(present(doc));
  if (doc.images.length === 0) return res.status(400).json({ error: 'Add at least one photo first.' });
  doc.status = 'queued';
  doc.progress = 0;
  doc.error = undefined;
  await doc.save();
  enqueueRender('photo', doc._id.toString());
  res.json(present(doc));
}

// One still of the reel (optionally with unsaved edits in `draft`).
export async function previewPhotoReel(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  const draft = editableFields(req.body?.draft || {}, doc);
  const [{ url }] = await queuePhotoStills(doc, [{ draft, atSec: clamp(req.body?.atSec, 0, 120, 4) }]);
  res.json({ url });
}

// A still for every template, using this reel's own photos - for the template picker.
export async function templatePreviews(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  const draft = editableFields(req.body?.draft || {}, doc);
  const atSec = clamp(req.body?.atSec, 0, 120, 3.6);
  const requests = PHOTO_TEMPLATES.map((t) => ({ template: t.id, draft, atSec }));
  // cachedOnly: hand back whatever is already rendered, instantly, so the picker never waits on a browser.
  if (req.body?.cachedOnly) return res.json((await peekPhotoStills(doc, requests)).filter(Boolean));
  res.json(await queuePhotoStills(doc, requests));
}

export async function publishPhotoReelToInstagram(req, res) {
  await publishToInstagram(await PhotoReel.findById(req.params.id), req.body?.caption, res);
}

// ---------------------------------------------------------------------------------- carousel

const layoutInfo = (id) => CAROUSEL_LAYOUTS.find((l) => l.id === id);

function buildSlides(doc, count) {
  const urls = doc.images.map((i) => i.url);
  let cursor = 0;
  const take = (k) => Array.from({ length: k }, () => urls[cursor++ % urls.length]);
  const slides = [{ layout: 'title', images: take(1), title: doc.intro?.title || doc.title, subtitle: doc.intro?.subtitle || '', lengthSec: 8 }];
  const middle = count - 2;
  for (let i = 0; i < middle; i += 1) {
    const layout = CAROUSEL_CYCLE[i % CAROUSEL_CYCLE.length];
    slides.push({ layout, images: take(layoutInfo(layout).photos), title: '', subtitle: '', lengthSec: 8 });
  }
  slides.push({ layout: 'info', images: [], title: '', subtitle: '', lengthSec: 8 });
  return slides;
}

export async function generateCarousel(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (doc.images.length === 0) return res.status(400).json({ error: 'Add some photos first.' });
  const count = Math.round(clamp(req.body?.slides, 3, 10, 5));
  doc.carousel.slides = buildSlides(doc, count);
  doc.markModified('carousel');
  await doc.save();
  res.json(present(doc));
}

export async function saveCarousel(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  const input = Array.isArray(req.body?.slides) ? req.body.slides.slice(0, 10) : [];
  const known = new Set(doc.images.map((i) => i.url));
  const cleaned = [];
  for (const s of input) {
    const info = layoutInfo(s.layout);
    if (!info) return res.status(400).json({ error: `Unknown slide layout "${s.layout}".` });
    let images = (Array.isArray(s.images) ? s.images : []).filter((u) => known.has(u)).slice(0, info.photos);
    // Top up from the reel's photos if the slide has fewer than its layout needs.
    const urls = [...known];
    for (let k = 0; images.length < info.photos && urls.length; k += 1) images.push(urls[(cleaned.length + k) % urls.length]);
    cleaned.push({
      layout: info.id,
      images,
      title: String(s.title || '').trim().slice(0, 80),
      subtitle: String(s.subtitle || '').trim().slice(0, 100),
      lengthSec: Math.round(clamp(s.lengthSec, 3, 30, 8)),
    });
  }
  doc.carousel.slides = cleaned;
  doc.markModified('carousel');
  await doc.save();
  res.json(present(doc));
}

// Starts rendering the slide videos in the background (they take a while); the UI polls progress.
export async function renderCarouselEndpoint(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (doc.carousel.slides.length === 0) return res.status(400).json({ error: 'Generate the slides first.' });
  if (['queued', 'rendering'].includes(doc.carousel.status)) return res.json(present(doc));
  doc.carousel.status = 'queued';
  doc.carousel.progress = 0;
  doc.carousel.error = undefined;
  doc.markModified('carousel');
  await doc.save();
  enqueueRender('carousel', doc._id.toString());
  res.json(present(doc));
}

// ------------------------------------------------------------------------------ AI photo editing

// Carousel slides refer to photos by URL, so when a photo's file changes the slides follow it.
function repoint(doc, from, to) {
  for (const s of doc.carousel.slides) s.images = s.images.map((u) => (u === from ? to : u));
  doc.markModified('carousel');
}

export async function enhancePhotoEndpoint(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (isBusy(doc)) return res.status(409).json({ error: 'This reel is rendering - wait for it to finish.' });
  const img = doc.images.id(req.params.imageId);
  if (!img) return res.status(404).json({ error: 'photo not found' });

  // Always edit from the ORIGINAL upload, so re-running a preset never stacks edits on edits.
  const source = img.originalUrl || img.url;
  const newUrl = await enhancePhoto({ url: source, preset: String(req.body?.preset || ''), extra: String(req.body?.extra || '') });

  const previous = img.url;
  if (!img.originalUrl) img.originalUrl = img.url;
  else removeStoredFile(previous, PHOTOS_DIR); // drop the earlier edited version, keep the original
  img.url = newUrl;
  img.enhancedWith = String(req.body.preset);
  repoint(doc, previous, newUrl);
  if (doc.status === 'done') doc.status = 'draft';
  await doc.save();
  res.json(present(doc));
}

export async function revertPhotoEndpoint(req, res) {
  const doc = await find(req, res);
  if (!doc) return;
  if (isBusy(doc)) return res.status(409).json({ error: 'This reel is rendering - wait for it to finish.' });
  const img = doc.images.id(req.params.imageId);
  if (!img) return res.status(404).json({ error: 'photo not found' });
  if (!img.originalUrl) return res.json(present(doc));

  const edited = img.url;
  img.url = img.originalUrl;
  img.originalUrl = undefined;
  img.enhancedWith = undefined;
  removeStoredFile(edited, PHOTOS_DIR);
  repoint(doc, edited, img.url);
  if (doc.status === 'done') doc.status = 'draft';
  await doc.save();
  res.json(present(doc));
}
