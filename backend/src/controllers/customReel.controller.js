import fs from 'fs';
import path from 'path';
import { CustomReel } from '../models/CustomReel.model.js';
import { REELS_DIR, localUrl } from '../services/audioPipeline.service.js';

const TEMPLATES = new Set(['recap-reel']);

function removeFile(url) {
  if (!url) return;
  fs.promises.unlink(path.join(REELS_DIR, path.basename(new URL(url, 'http://x').pathname))).catch(() => {});
}

// Saves a video the browser rendered with a Custom template into the reel library.
export async function createCustomReel(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No video was uploaded.' });
  const title = String(req.body.title || '').trim().slice(0, 120);
  const template = TEMPLATES.has(req.body.template) ? req.body.template : null;
  if (!title || !template) {
    fs.promises.unlink(file.path).catch(() => {});
    return res.status(400).json({ error: 'A title and a known template are required.' });
  }
  let settings = {};
  try {
    const parsed = JSON.parse(req.body.settings || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed;
  } catch {
    /* settings are informational only */
  }
  const durationSec = Number(req.body.durationSec);
  const doc = await CustomReel.create({
    title,
    template,
    videoUrl: localUrl('reels', file.filename),
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
    sizeBytes: file.size,
    settings,
  });
  res.status(201).json(doc);
}

export async function deleteCustomReel(req, res) {
  const doc = await CustomReel.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Reel not found.' });
  removeFile(doc.videoUrl);
  await doc.deleteOne();
  res.json({ ok: true });
}
