import { purgeAnimations } from './designAnimation.controller.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Design } from '../models/Design.model.js';
import { Quote } from '../models/Quote.model.js';
import { Session } from '../models/Session.model.js';
import { ensureSummary } from '../services/sessionSummary.service.js';
import { storeImage } from '../services/imageStore.service.js';
import { generateInstagramCaption } from '../services/openrouter.service.js';
import { publishImageToInstagram, InstagramConfigError, InstagramApiError } from '../services/instagram.service.js';

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/;
const PATCHABLE = ['title', 'editorState', 'width', 'height', 'caption', 'imagePrompt', 'backgroundUrl', 'text', 'presentation'];

function clampSize(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(4096, Math.max(256, n));
}

function isId(id) {
  return mongoose.isValidObjectId(id);
}

function titleFromText(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > 40 ? `${t.slice(0, 40).trim()}...` : t;
}

export async function listDesigns(req, res) {
  const { session, scope } = req.query;
  let filter = {};
  if (session) {
    if (!isId(session)) return res.status(400).json({ error: 'invalid session' });
    filter = { session };
  } else if (scope === 'standalone') {
    filter = { session: { $in: [null, undefined] } };
  } else if (scope !== 'all') {
    return res.status(400).json({ error: 'session is required' });
  }
  if (req.query.presentation === '1') filter = { ...filter, presentation: true };
  const designs = await Design.find(filter)
    .select('-editorState')
    .populate('session', 'title')
    .sort({ updatedAt: -1 })
    .limit(200);
  res.json(designs);
}

export async function createDesign(req, res) {
  const { sessionId, sourceId, copyFrom } = req.body;
  const source = ['blank', 'quote', 'post'].includes(req.body.source) ? req.body.source : 'blank';
  // No sessionId = a standalone studio design.
  const hasSession = sessionId !== undefined && sessionId !== null && sessionId !== '';
  if (hasSession) {
    if (!isId(sessionId)) return res.status(404).json({ error: 'session not found' });
    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'session not found' });
  }

  const sid = sourceId !== undefined && sourceId !== null && sourceId !== '' ? String(sourceId) : undefined;

  if ((source === 'quote' || source === 'post') && sid) {
    const existing = await Design.findOne({ session: hasSession ? sessionId : null, source, sourceId: sid });
    if (existing) return res.status(200).json({ design: existing, existing: true });
  }

  const data = { source };
  if (hasSession) data.session = sessionId;
  if (sid) data.sourceId = sid;
  for (const key of ['text', 'title', 'imagePrompt', 'backgroundUrl', 'caption']) {
    if (typeof req.body[key] === 'string' && req.body[key] !== '') data[key] = req.body[key];
  }
  if (req.body.width !== undefined) data.width = clampSize(req.body.width, 1080);
  if (req.body.height !== undefined) data.height = clampSize(req.body.height, 1350);
  // Presentation designs are always 16:9 (full HD) - they fill the screen.
  if (req.body.presentation === true) Object.assign(data, { presentation: true, width: 1920, height: 1080 });

  if (source === 'quote' && sid && isId(sid)) {
    const quote = await Quote.findById(sid);
    if (quote) {
      data.text ??= quote.text;
      data.imagePrompt ??= quote.imagePrompt;
      data.caption ??= quote.caption;
      data.backgroundUrl ??= quote.customImageUrl;
    }
  }

  if (copyFrom && isId(copyFrom)) {
    const original = await Design.findById(copyFrom);
    if (original) {
      Object.assign(data, {
        text: original.text,
        width: original.width,
        height: original.height,
        editorState: original.editorState,
        backgroundUrl: original.backgroundUrl,
        imagePrompt: original.imagePrompt,
        caption: original.caption,
        generatedImages: original.generatedImages,
        title: `${original.title} (copy)`,
        presentation: original.presentation,
        source: 'blank',
      });
      delete data.sourceId;
    }
  }

  if (!data.title) data.title = titleFromText(data.text) || 'Untitled design';

  const design = await Design.create(data);
  res.status(201).json({ design, existing: false });
}

export async function getDesign(req, res) {
  const { id } = req.params;
  const design = isId(id) ? await Design.findById(id) : null;
  if (!design) return res.status(404).json({ error: 'design not found' });
  const session = design.session ? await Session.findById(design.session).populate('service') : null;
  // An ended session that missed its summary gets it now, so the editor's points are never empty.
  await ensureSummary(session);
  res.json({ design, session });
}

export async function updateDesign(req, res) {
  const { id } = req.params;
  const set = {};
  for (const key of PATCHABLE) {
    if (req.body[key] === undefined) continue;
    if (key === 'width') set.width = clampSize(req.body.width, 1080);
    else if (key === 'height') set.height = clampSize(req.body.height, 1350);
    else if (key === 'presentation') set.presentation = Boolean(req.body.presentation);
    else set[key] = req.body[key];
  }
  const design = isId(id) ? await Design.findByIdAndUpdate(id, { $set: set }, { new: true }) : null;
  if (!design) return res.status(404).json({ error: 'design not found' });
  res.json(design);
}

export async function deleteDesign(req, res) {
  const { id } = req.params;
  if (isId(id)) {
    await purgeAnimations([id]);
    await Design.findByIdAndDelete(id);
  }
  res.json({ ok: true });
}

export async function exportDesign(req, res) {
  const { id } = req.params;
  const { dataUrl, editorState } = req.body;
  const design = isId(id) ? await Design.findById(id) : null;
  if (!design) return res.status(404).json({ error: 'design not found' });
  if (typeof dataUrl !== 'string' || !DATA_URL_RE.test(dataUrl)) {
    return res.status(400).json({ error: 'dataUrl must be a base64 png/jpeg/webp image' });
  }

  // storeImage throws an error with status 502 and a readable message on failure.
  design.exportedImageUrl = await storeImage(dataUrl, `design-${id}-export-${crypto.randomUUID()}`);
  if (editorState !== undefined) {
    design.editorState = editorState;
    design.markModified('editorState');
  }
  await design.save();
  res.json(design);
}

export async function generateDesignCaption(req, res) {
  const { id } = req.params;
  const design = isId(id) ? await Design.findById(id) : null;
  if (!design) return res.status(404).json({ error: 'design not found' });

  const caption = await generateInstagramCaption({
    quoteText: design.text,
    sourceText: '',
    previousCaption: design.caption || '',
  });
  if (!caption) {
    return res.status(502).json({ error: 'Failed to generate a caption. Check OPENROUTER_API_KEY and try again.' });
  }
  design.caption = caption;
  await design.save();
  res.json(design);
}

export async function publishDesignToInstagram(req, res) {
  const { id } = req.params;
  const design = isId(id) ? await Design.findById(id) : null;
  if (!design) return res.status(404).json({ error: 'design not found' });
  if (!design.exportedImageUrl) {
    return res.status(400).json({ error: 'Export an image for this design before posting it.' });
  }

  const ratio = design.width / design.height;
  if (ratio > 1.91) {
    return res.status(400).json({ error: "Instagram feed posts can't be wider than 1.91:1. Pick a different size." });
  }
  // Taller than 4:5 (e.g. 9:16) isn't a valid feed ratio, so it goes out as a Story.
  const isStory = ratio < 0.8;

  try {
    const { mediaId, permalink } = await publishImageToInstagram({
      imagePath: design.exportedImageUrl,
      caption: design.caption || '',
      mediaType: isStory ? 'STORIES' : undefined,
    });
    design.instagramMediaId = mediaId;
    design.instagramPermalink = permalink;
    design.instagramPublishedAt = new Date();
    await design.save();
    res.json(design);
  } catch (err) {
    if (err instanceof InstagramConfigError || err instanceof InstagramApiError) {
      return res.status(err instanceof InstagramConfigError ? 400 : 502).json({ error: err.message });
    }
    console.error('[design] instagram publish failed', err);
    res.status(500).json({ error: 'Failed to publish to Instagram.' });
  }
}
