import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Carousel } from '../models/Carousel.model.js';
import { Design } from '../models/Design.model.js';
import { Session } from '../models/Session.model.js';
import { DesignAnimation } from '../models/DesignAnimation.model.js';
import { generateInstagramCaption } from '../services/openrouter.service.js';
import { publishCarouselToInstagram, InstagramConfigError, InstagramApiError } from '../services/instagram.service.js';
import { purgeAnimations } from './designAnimation.controller.js';
import { localUrl } from '../services/audioPipeline.service.js';
import { UPLOADS_DIR } from '../middlewares/upload.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const CAROUSEL_DIR = path.join(UPLOADS_DIR, 'carousel');
fs.mkdirSync(CAROUSEL_DIR, { recursive: true });

const MAX_SLIDES = 10;
const isId = (id) => mongoose.isValidObjectId(id);
const clampSize = (v, d) => (Number.isFinite(Math.round(Number(v))) ? Math.min(4096, Math.max(256, Math.round(Number(v)))) : d);
const DESIGN_FIELDS = 'title width height exportedImageUrl updatedAt text editorState';

// A carousel with each design slide's current state attached (for the builder).
async function present(doc) {
  const ids = doc.slides.filter((s) => s.design).map((s) => s.design);
  const designs = ids.length ? await Design.find({ _id: { $in: ids } }).select(DESIGN_FIELDS) : [];
  const byId = new Map(designs.map((d) => [String(d._id), d]));
  const obj = doc.toObject();
  obj.slides = obj.slides.map((s) => ({ ...s, designInfo: s.design ? byId.get(String(s.design)) ?? null : null }));
  return obj;
}

function cleanSlides(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const s of input.slice(0, MAX_SLIDES)) {
    if (!['design', 'image', 'video'].includes(s?.kind)) continue;
    if (s.kind === 'design' && !isId(s.design)) continue;
    const slide = { kind: s.kind, label: String(s.label ?? '').slice(0, 80), owned: Boolean(s.owned) };
    if (s._id && isId(s._id)) slide._id = s._id;
    if (s.kind === 'design') slide.design = s.design;
    else if (s.kind === 'image') slide.imageUrl = String(s.imageUrl ?? '');
    else slide.videoUrl = String(s.videoUrl ?? '');
    out.push(slide);
  }
  return out;
}

function applyFields(doc, body) {
  if (typeof body.title === 'string' && body.title.trim()) doc.title = body.title.trim().slice(0, 120);
  if (typeof body.caption === 'string') doc.caption = body.caption.slice(0, 2200);
  if (body.width !== undefined) doc.width = clampSize(body.width, doc.width);
  if (body.height !== undefined) doc.height = clampSize(body.height, doc.height);
  if (typeof body.savedAsRecipe === 'boolean') doc.savedAsRecipe = body.savedAsRecipe;
  if (body.recipe && typeof body.recipe === 'object') {
    doc.recipe = {
      source: ['keyPoints', 'quotes', 'declarations', 'scriptures', 'mixed'].includes(body.recipe.source) ? body.recipe.source : 'keyPoints',
      count: Math.min(8, Math.max(1, Math.round(Number(body.recipe.count)) || 5)),
      templateId: String(body.recipe.templateId ?? '').slice(0, 80),
      coverTemplateId: String(body.recipe.coverTemplateId ?? '').slice(0, 80),
      cover: body.recipe.cover !== false,
      closing: body.recipe.closing !== false,
    };
  }
  const slides = cleanSlides(body.slides);
  if (slides) doc.slides = slides;
}

export async function listCarousels(req, res) {
  const filter = {};
  if (isId(req.query.session)) filter.session = req.query.session;
  if (req.query.recipes === '1') filter.savedAsRecipe = true;
  const docs = await Carousel.find(filter).sort({ updatedAt: -1 }).limit(100);
  const firstDesignIds = docs.map((d) => d.slides.find((s) => s.design)?.design).filter(Boolean);
  const designs = await Design.find({ _id: { $in: firstDesignIds } }).select('exportedImageUrl');
  const cover = new Map(designs.map((d) => [String(d._id), d.exportedImageUrl]));
  res.json(
    docs.map((d) => {
      const first = d.slides[0];
      const coverUrl = first ? (first.design ? cover.get(String(first.design)) : first.imageUrl) || '' : '';
      return { ...d.toObject(), coverUrl };
    })
  );
}

export async function createCarousel(req, res) {
  const doc = new Carousel({ title: 'Untitled carousel' });
  if (isId(req.body.sessionId)) {
    const session = await Session.findById(req.body.sessionId).select('_id title');
    if (!session) return res.status(404).json({ error: 'session not found' });
    doc.session = session._id;
    doc.title = `${session.title} carousel`;
  }
  applyFields(doc, req.body);
  await doc.save();
  res.status(201).json(await present(doc));
}

export async function getCarousel(req, res) {
  const doc = isId(req.params.id) ? await Carousel.findById(req.params.id) : null;
  if (!doc) return res.status(404).json({ error: 'carousel not found' });
  res.json(await present(doc));
}

export async function updateCarousel(req, res) {
  const doc = isId(req.params.id) ? await Carousel.findById(req.params.id) : null;
  if (!doc) return res.status(404).json({ error: 'carousel not found' });
  applyFields(doc, req.body);
  await doc.save();
  res.json(await present(doc));
}

// Deletes the carousel and the designs it generated itself (never designs the user added from
// elsewhere, and never anything else).
export async function deleteCarousel(req, res) {
  const doc = isId(req.params.id) ? await Carousel.findById(req.params.id) : null;
  if (!doc) return res.json({ ok: true });
  const owned = doc.slides.filter((s) => s.owned && s.design).map((s) => String(s.design));
  if (owned.length) {
    await purgeAnimations(owned);
    await Design.deleteMany({ _id: { $in: owned } });
  }
  await doc.deleteOne();
  res.json({ ok: true });
}

function toJpeg(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input).outputOptions(['-q:v', '2', '-vf', "scale='min(2048,iw)':-2"]).frames(1).on('end', resolve).on('error', reject).save(output);
  });
}

// Instagram only takes H.264/AAC mp4 (up to 60s in a carousel), so whatever was uploaded is
// re-encoded into that.
function toInstagramMp4(input, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', '60', '-vf', "scale='min(1080,iw)':-2", '-r', '30', '-crf', '23'])
      .format('mp4')
      .on('end', resolve)
      .on('error', reject)
      .save(output);
  });
}

// Adds an uploaded image or video as a slide.
export async function addMediaSlide(req, res) {
  const doc = isId(req.params.id) ? await Carousel.findById(req.params.id) : null;
  const file = req.file;
  try {
    if (!doc) return res.status(404).json({ error: 'carousel not found' });
    if (!file) return res.status(400).json({ error: 'A file is required.' });
    if (doc.slides.length >= MAX_SLIDES) return res.status(400).json({ error: `A carousel can have up to ${MAX_SLIDES} slides.` });
    const isVideo = file.mimetype.startsWith('video/');
    const base = `${doc._id}-${Date.now()}`;
    const name = `${base}.${isVideo ? 'mp4' : 'jpg'}`;
    const target = path.join(CAROUSEL_DIR, name);
    try {
      await (isVideo ? toInstagramMp4(file.path, target) : toJpeg(file.path, target));
    } catch (err) {
      console.error('[carousel] media conversion failed', err);
      return res.status(422).json({ error: isVideo ? 'That video could not be processed.' : 'That image could not be processed.' });
    }
    doc.slides.push({ kind: isVideo ? 'video' : 'image', [isVideo ? 'videoUrl' : 'imageUrl']: localUrl('carousel', name), label: String(file.originalname || '').replace(/\.[^.]+$/, '').slice(0, 80) });
    await doc.save();
    res.status(201).json(await present(doc));
  } finally {
    if (file) fs.promises.unlink(file.path).catch(() => {});
  }
}

export async function generateCarouselCaption(req, res) {
  const doc = isId(req.params.id) ? await Carousel.findById(req.params.id) : null;
  if (!doc) return res.status(404).json({ error: 'carousel not found' });
  const ids = doc.slides.filter((s) => s.design).map((s) => s.design);
  const designs = await Design.find({ _id: { $in: ids } }).select('text');
  const text = designs.map((d) => d.text).filter(Boolean).join('\n');
  const caption = await generateInstagramCaption({ quoteText: text || doc.title, sourceText: '', previousCaption: doc.caption || '' });
  if (!caption) return res.status(502).json({ error: 'Failed to generate a caption. Check OPENROUTER_API_KEY and try again.' });
  doc.caption = caption;
  await doc.save();
  res.json(await present(doc));
}

export async function publishCarousel(req, res) {
  const doc = isId(req.params.id) ? await Carousel.findById(req.params.id) : null;
  if (!doc) return res.status(404).json({ error: 'carousel not found' });
  if (doc.slides.length < 2 || doc.slides.length > MAX_SLIDES) {
    return res.status(400).json({ error: `A carousel needs between 2 and ${MAX_SLIDES} slides (it has ${doc.slides.length}).` });
  }
  const ratio = doc.width / doc.height;
  if (ratio > 1.91 || ratio < 0.8) {
    return res.status(400).json({ error: 'Carousel slides must be between 4:5 (portrait) and 1.91:1 (landscape). Pick a different size.' });
  }
  const designs = await Design.find({ _id: { $in: doc.slides.filter((s) => s.design).map((s) => s.design) } }).select('exportedImageUrl title');
  const byId = new Map(designs.map((d) => [String(d._id), d]));
  const items = [];
  for (const [i, s] of doc.slides.entries()) {
    if (s.kind === 'design') {
      const url = byId.get(String(s.design))?.exportedImageUrl;
      if (!url) return res.status(400).json({ error: `Slide ${i + 1} has not been exported to an image yet.` });
      items.push({ type: 'image', url });
    } else if (s.kind === 'image') items.push({ type: 'image', url: s.imageUrl });
    else items.push({ type: 'video', url: s.videoUrl });
  }
  try {
    const { mediaId, permalink } = await publishCarouselToInstagram({ items, caption: doc.caption });
    doc.instagramMediaId = mediaId;
    doc.instagramPermalink = permalink;
    doc.instagramPublishedAt = new Date();
    await doc.save();
    res.json(await present(doc));
  } catch (err) {
    if (err instanceof InstagramConfigError || err instanceof InstagramApiError) {
      return res.status(err instanceof InstagramConfigError ? 400 : 502).json({ error: err.message });
    }
    console.error('[carousel] instagram publish failed', err);
    res.status(500).json({ error: 'Failed to publish to Instagram.' });
  }
}

// Adds a finished editor animation as a video slide. The mp4 is copied into the carousel's own
// folder so deleting the animation later can't break the post. `replace` swaps the slide at
// `index` (e.g. a design slide for its animated version) instead of inserting after it.
export async function addAnimationSlide(req, res) {
  const doc = isId(req.params.id) ? await Carousel.findById(req.params.id) : null;
  if (!doc) return res.status(404).json({ error: 'carousel not found' });
  const anim = isId(req.body?.animationId) ? await DesignAnimation.findById(req.body.animationId).populate('design', 'title') : null;
  if (!anim || anim.status !== 'done' || !anim.videoUrl) return res.status(404).json({ error: 'That animation is not ready.' });
  const index = Number.isInteger(req.body?.index) ? req.body.index : doc.slides.length - 1;
  const replace = Boolean(req.body?.replace) && index >= 0 && index < doc.slides.length;
  if (!replace && doc.slides.length >= MAX_SLIDES) return res.status(400).json({ error: `A carousel can have up to ${MAX_SLIDES} slides.` });

  const source = path.join(UPLOADS_DIR, 'reels', path.basename(new URL(anim.videoUrl).pathname));
  if (!fs.existsSync(source)) return res.status(404).json({ error: 'The animation file is missing. Create it again in the editor.' });
  const name = `${doc._id}-${Date.now()}.mp4`;
  await fs.promises.copyFile(source, path.join(CAROUSEL_DIR, name));

  const slide = { kind: 'video', videoUrl: localUrl('carousel', name), label: `Animated · ${anim.design?.title ?? 'design'}`.slice(0, 80) };
  if (replace) doc.slides.splice(index, 1, slide);
  else doc.slides.splice(index + 1, 0, slide);
  await doc.save();
  res.status(201).json(await present(doc));
}
