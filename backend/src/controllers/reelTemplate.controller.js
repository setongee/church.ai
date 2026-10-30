import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import { ReelTemplate } from '../models/ReelTemplate.model.js';
import { Reel } from '../models/Reel.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { storeImage } from '../services/imageStore.service.js';
import { listTemplates } from '../services/templates.service.js';
import { queueOutroPreviews, renderTemplatePreview } from '../services/reelRender.service.js';
import { localUrl } from '../services/audioPipeline.service.js';
import { OUTRO_STYLES, sanitizeOptions } from '../services/reelOptions.service.js';
import { FONTS, LAYOUTS, normaliseTheme } from '../../remotion/templates.js';

export async function getTemplates(req, res) {
  res.json({ templates: await listTemplates(), layouts: LAYOUTS, fonts: FONTS, outroStyles: OUTRO_STYLES });
}

// The editor sends a base64 data URI when a new background image was picked; keep the existing
// URL otherwise, and clear it when explicitly removed.
async function themeFromBody(body, existing) {
  const theme = normaliseTheme({ ...(existing || {}), ...(body.theme || {}) });
  if (typeof body.backgroundImage === 'string' && body.backgroundImage.startsWith('data:')) {
    theme.backgroundImageUrl = await storeImage(body.backgroundImage, `reel-bg-${crypto.randomUUID()}`);
  } else if (body.clearBackgroundImage) {
    theme.backgroundImageUrl = '';
  }
  delete theme.brandAccent;
  return theme;
}

export async function createTemplate(req, res) {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Give the template a name.' });
  const theme = await themeFromBody(req.body);
  res.status(201).json(await ReelTemplate.create({ name: name.slice(0, 60), theme }));
}

export async function updateTemplate(req, res) {
  const tpl = await ReelTemplate.findById(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  if (typeof req.body?.name === 'string' && req.body.name.trim()) tpl.name = req.body.name.trim().slice(0, 60);
  tpl.theme = await themeFromBody(req.body, tpl.theme);
  tpl.markModified('theme');
  await tpl.save();
  res.json(tpl);
}

export async function deleteTemplate(req, res) {
  const id = req.params.id;
  const tpl = await ReelTemplate.findById(id);
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  // Anything still pointing at it falls back to the default at render time; reset them now so
  // the UI shows the truth.
  await Promise.all([
    Reel.updateMany({ template: id }, { template: 'builtin:kinetic' }),
    Compilation.updateMany({ template: id }, { template: 'builtin:kinetic' }),
  ]);
  await tpl.deleteOne();
  res.json({ ok: true });
}

// A rendered still of a template - for the picker thumbnails and the creator's live preview.
// Accepts a saved/built-in id, or an unsaved `theme` (+ optional new background image) to
// preview edits before saving.
export async function previewTemplate(req, res) {
  const { templateId, reelId, compilationId, atSec } = req.body || {};
  const options = req.body?.options && typeof req.body.options === 'object' ? sanitizeOptions(req.body.options) : undefined;
  let theme;
  if (req.body?.theme) {
    theme = await themeFromBody({ ...req.body, backgroundImage: undefined });
    if (typeof req.body.backgroundImage === 'string' && req.body.backgroundImage.startsWith('data:')) {
      // Unsaved pick: store under a stable id per content so repeat previews reuse the file.
      const digest = crypto.createHash('sha1').update(req.body.backgroundImage).digest('hex').slice(0, 20);
      theme.backgroundImageUrl = await storeImage(req.body.backgroundImage, `reel-bg-preview-${digest}`);
    }
  }
  const url = await renderTemplatePreview({ templateId, theme, reelId, compilationId, options, atSec: Number.isFinite(Number(atSec)) ? Number(atSec) : undefined });
  res.json({ url, backgroundImageUrl: theme?.backgroundImageUrl || '' });
}

// Thumbnails of the five closing-card designs with the given options' text/colours.
export async function outroPreviews(req, res) {
  const options = req.body?.options && typeof req.body.options === 'object' ? sanitizeOptions(req.body.options) : undefined;
  res.json({ previews: await queueOutroPreviews({ templateId: req.body?.templateId, options }) });
}

// Saves an uploaded image/video for the custom closing card.
// Length of a video file in seconds (read from ffmpeg's own report; there is no ffprobe).
function videoSeconds(file) {
  return new Promise((resolve) => {
    let err = '';
    ffmpeg(file).on('stderr', (l) => (err += l + '\n')).on('error', () => {}).on('end', () => {}).format('null').output('-').duration(0.1).run();
    setTimeout(() => {
      const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0);
    }, 1500);
  });
}

export async function uploadOutroMedia(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Choose an image or video file.' });
  const isVideo = req.file.mimetype.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(req.file.originalname);
  const sec = isVideo ? await videoSeconds(req.file.path) : 0;
  res.status(201).json({ url: localUrl('outro-media', req.file.filename), type: isVideo ? 'video' : 'image', sec: Math.round(sec * 100) / 100 });
}
