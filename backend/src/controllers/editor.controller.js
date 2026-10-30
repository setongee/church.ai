import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Design } from '../models/Design.model.js';
import { ImageAsset } from '../models/ImageAsset.model.js';
import { storeImage } from '../services/imageStore.service.js';
import { getFonts } from '../services/fonts.service.js';
import { enhanceImagePrompt } from '../services/openrouter.service.js';

const IMAGES_URL = 'https://openrouter.ai/api/v1/images';
const GENERATE_TIMEOUT_MS = 120000;
const MAX_PROMPT_CHARS = 2000;
const MAX_REFERENCES = 4;
const QUALITIES = ['low', 'medium', 'high', 'auto'];
const ASPECT_RATIOS = ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '21:9', '9:21'];

// Snap an arbitrary width/height to the nearest supported ratio, compared in log space so that
// 2:1 and 1:2 are equally far from 1:1.
export function snapAspectRatio(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return '1:1';
  const target = Math.log(w / h);
  let best = ASPECT_RATIOS[0];
  let bestDiff = Infinity;
  for (const ratio of ASPECT_RATIOS) {
    const [a, b] = ratio.split(':').map(Number);
    const diff = Math.abs(Math.log(a / b) - target);
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }
  return best;
}

export async function uploadEditorImage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'image file is required' });
  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const url = await storeImage(dataUri, `editor-upload-${crypto.randomUUID()}`);
  // Only pictures the user chose to keep (gallery uploads, lower thirds) go in the image bank;
  // other uploads (e.g. one-off layers) don't.
  const kind = ['upload', 'lower-third'].includes(req.body?.kind) ? req.body.kind : null;
  const asset = kind
    ? await ImageAsset.create({ url, kind, name: String(req.file.originalname || '').replace(/\.[^.]+$/, '').slice(0, 80) })
    : null;
  res.json({ url, asset });
}

// The image bank. `kind=gallery` = uploaded + AI-generated pictures; `kind=lower-third` = overlays.
export async function listImages(req, res) {
  const filter = req.query.kind === 'lower-third' ? { kind: 'lower-third' } : { kind: { $in: ['upload', 'ai'] } };
  res.json(await ImageAsset.find(filter).sort({ createdAt: -1 }).limit(300));
}

export async function deleteImage(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'image not found' });
  const result = await ImageAsset.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'image not found' });
  res.json({ ok: true });
}

// Shared craft instructions so even a one-line brief comes back looking premium rather than generic.
const PREMIUM_STYLE =
  'Premium, gallery-quality result with refined editorial taste: sophisticated composition, intentional negative space, ' +
  'natural cinematic lighting, harmonious restrained colour palette, rich believable textures and depth. ' +
  'Ultra-sharp focus, high detail, clean edges, no noise, no artifacts, no watermark, no logos, no distorted or garbled text.';

function buildPrompt(prompt, mode, hasReferences, text) {
  let full;
  if (mode === 'design') {
    full =
      'Design a finished, premium social media graphic (poster) with professional, award-level typography. ' +
      `Art direction: ${prompt} ` +
      `Typeset EXACTLY this text, spelled exactly as written, with no extra, missing or altered words: "${text}". ` +
      'Typography must be razor sharp, crisp, high-resolution and perfectly legible with strong contrast, a clear hierarchy, ' +
      'elegant kerning and a balanced layout. Keep all text well inside the frame with generous margins (at least 10% from every edge). ' +
      'Do not add any other text, logos or watermarks. ' +
      PREMIUM_STYLE;
  } else if (mode === 'free') {
    full = `${prompt} ${PREMIUM_STYLE}`;
  } else {
    full =
      'Create a premium background image for a social media text graphic. ' +
      `Art direction: ${prompt} ` +
      'Strict rules: absolutely no text, letters, words, numbers, logos or watermarks. ' +
      'Compose it so there is calm, low-detail space where large text can be overlaid, with good tonal contrast. ' +
      PREMIUM_STYLE;
  }
  if (hasReferences) {
    full += ' Use the attached reference image(s) as visual guidance for style, composition and subject.';
  }
  return full;
}

async function callImageApi(body) {
  const res = await fetch(IMAGES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.openrouterSiteUrl,
      'X-Title': env.openrouterAppName,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
  });
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // non-JSON body; fall back to raw text for the error message
  }
  const message = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || raw.slice(0, 300);
  return { res, data, message };
}

function isTimeout(err) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError';
}

export async function generateImage(req, res) {
  const { width, height, designId } = req.body;
  const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
  if (!prompt) return res.status(400).json({ error: 'Describe the image you want to generate.' });
  if (!env.openrouterApiKey) {
    return res.status(503).json({ error: "AI image generation isn't configured. Set OPENROUTER_API_KEY on the backend." });
  }

  const mode = ['free', 'design'].includes(req.body.mode) ? req.body.mode : 'background';
  const text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, 1200) : '';
  if (mode === 'design' && !text) {
    return res.status(400).json({ error: 'Add the text you want on the design first.' });
  }
  // A finished design has to hold legible type, so it always renders at the highest tier.
  const quality = mode === 'design' ? 'high' : QUALITIES.includes(req.body.quality) ? req.body.quality : 'high';
  const aspect = snapAspectRatio(width, height);
  // An art-director pass turns a terse brief into a rich prompt; if the LLM is unavailable the
  // original brief is used as-is.
  let brief = prompt;
  if (req.body.enhance !== false) {
    try {
      brief = (await enhanceImagePrompt({ prompt, mode, text, hasReferences: Array.isArray(req.body.referenceImages) && req.body.referenceImages.length > 0, aspect })) || prompt;
    } catch (err) {
      console.error('[editor] prompt enhancement failed', err.message);
    }
  }
  const references = (Array.isArray(req.body.referenceImages) ? req.body.referenceImages : [])
    .filter((u) => typeof u === 'string' && (/^data:image\//.test(u) || /^https?:\/\//.test(u)))
    .slice(0, MAX_REFERENCES);

  const body = {
    model: env.openrouterImageModel,
    prompt: buildPrompt(brief, mode, references.length > 0, text),
    aspect_ratio: aspect,
    quality,
    n: 1,
    output_format: 'jpeg',
  };
  // Every mode renders at the 2K tier; the retry below drops these if a model rejects them.
  body.resolution = '2K';
  body.output_compression = 95;
  if (references.length) {
    body.input_references = references.map((url) => ({ type: 'image_url', image_url: { url } }));
  }

  let result;
  try {
    result = await callImageApi(body);
    if (result.res.status === 400 && /aspect_ratio|quality|output_format|resolution|output_compression/i.test(result.message)) {
      console.error('[editor] image API rejected optional params, retrying without them:', result.message);
      const { aspect_ratio, quality: _q, output_format, resolution, output_compression, ...slim } = body;
      result = await callImageApi(slim);
    }
  } catch (err) {
    if (isTimeout(err)) {
      console.error('[editor] image generation timed out');
      return res.status(504).json({ error: 'Image generation timed out. Try again.' });
    }
    console.error('[editor] image generation request failed', err);
    return res.status(502).json({ error: `Image generation failed: ${err.message}` });
  }

  const item = result.data?.data?.[0];
  if (!result.res.ok || !item?.b64_json) {
    const message = result.message || (result.res.ok ? 'no image was returned' : `status ${result.res.status}`);
    console.error('[editor] image generation failed', result.res.status, message);
    return res.status(502).json({ error: `Image generation failed: ${message}` });
  }

  const dataUri = `data:${item.media_type || 'image/png'};base64,${item.b64_json}`;
  const url = await storeImage(dataUri, `generated-${crypto.randomUUID()}`);

  if (designId && mongoose.isValidObjectId(designId)) {
    try {
      await Design.findByIdAndUpdate(designId, {
        $push: { generatedImages: { $each: [url], $slice: -30 } },
        $set: { imagePrompt: prompt },
      });
    } catch (err) {
      console.error('[editor] failed to record generated image on design', err.message);
    }
  }

  const asset = await ImageAsset.create({ url, kind: 'ai', prompt, name: prompt.slice(0, 80) }).catch((err) => {
    console.error('[editor] failed to record generated image in the bank', err.message);
    return null;
  });
  res.json({ url, asset });
}

export async function listFonts(req, res) {
  const fonts = await getFonts();
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ fonts });
}
