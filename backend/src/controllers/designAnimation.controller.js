import fs from 'fs';
import path from 'path';
import { Design } from '../models/Design.model.js';
import { DesignAnimation } from '../models/DesignAnimation.model.js';
import { enqueueRender } from '../services/reelRender.service.js';
import { localUrl } from '../services/audioPipeline.service.js';
import { UPLOADS_DIR } from '../middlewares/upload.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { DESIGN_EFFECTS, MAX_DESIGN_ANIM_SEC } from '../../remotion/designEffects.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const ANIM_DIR = path.join(UPLOADS_DIR, 'design-anim');
const clamp = (v, min, max, d) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d);
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// The rendered mp4 plus any gif/webm conversions made from it.
function removeVideoFiles(videoUrl) {
  const mp4 = path.join(UPLOADS_DIR, 'reels', path.basename(new URL(videoUrl).pathname));
  for (const f of [mp4, mp4.replace(/\.mp4$/, '.gif'), mp4.replace(/\.mp4$/, '.webm')]) fs.promises.unlink(f).catch(() => {});
}

export function listEffects(req, res) {
  res.json({ effects: DESIGN_EFFECTS, maxSec: MAX_DESIGN_ANIM_SEC });
}

export async function listAnimations(req, res) {
  res.json(await DesignAnimation.find({ design: req.params.id }, '-layers -background').sort({ createdAt: -1 }).limit(30));
}

// Receives the design already split into layers by the editor: a background image plus one
// transparent PNG per element (multipart: `meta` JSON, `background`, `layer0`..`layerN`).
export async function createAnimation(req, res) {
  const design = await Design.findById(req.params.id);
  if (!design) return res.status(404).json({ error: 'design not found' });
  let meta;
  try {
    meta = JSON.parse(req.body?.meta || '{}');
  } catch {
    return res.status(400).json({ error: 'bad request' });
  }
  const files = Object.fromEntries((req.files ?? []).map((f) => [f.fieldname, f]));
  if (!files.background) return res.status(400).json({ error: 'The design image is missing.' });
  const metaLayers = Array.isArray(meta.layers) ? meta.layers.slice(0, 40) : [];

  const doc = new DesignAnimation({
    design: design._id,
    effect: DESIGN_EFFECTS.some((e) => e.id === meta.effect) ? meta.effect : 'rise',
    lengthSec: clamp(meta.lengthSec, 2, MAX_DESIGN_ANIM_SEC, 6),
    speed: clamp(meta.speed, 0.3, 2.5, 0.9),
    stagger: clamp(meta.stagger, 0, 1.5, 0.4),
    loop: meta.loop !== false,
    bgMotion: meta.bgMotion !== false,
    width: even(clamp(meta.width, 200, 4000, design.width)),
    height: even(clamp(meta.height, 200, 4000, design.height)),
    background: 'pending',
    status: 'queued',
  });
  const dir = path.join(ANIM_DIR, String(doc._id));
  await fs.promises.mkdir(dir, { recursive: true });
  const sub = `design-anim/${doc._id}`;
  await fs.promises.writeFile(path.join(dir, 'bg.png'), files.background.buffer);
  doc.background = localUrl(sub, 'bg.png');
  for (let i = 0; i < metaLayers.length; i += 1) {
    const f = files[`layer${i}`];
    const m = metaLayers[i];
    if (!f) continue;
    await fs.promises.writeFile(path.join(dir, `l${i}.png`), f.buffer);
    doc.layers.push({ src: localUrl(sub, `l${i}.png`), x: Number(m.x) || 0, y: Number(m.y) || 0, w: Math.max(1, Number(m.w) || 1), h: Math.max(1, Number(m.h) || 1), kind: String(m.kind || ''), label: String(m.label || '').slice(0, 60) });
  }
  await doc.save();
  enqueueRender('animation', String(doc._id));
  res.status(201).json(doc);
}

// Finished animations across all designs, newest first (for adding them to a carousel).
export async function listFinishedAnimations(req, res) {
  const filter = { status: 'done', videoUrl: { $exists: true, $ne: null } };
  // ?presentation=1 -> only animations of designs tagged for the Present screen.
  if (req.query.presentation === '1') {
    const ids = await Design.find({ presentation: true }).distinct('_id');
    filter.design = { $in: ids };
  }
  const docs = await DesignAnimation.find(filter, 'design effect lengthSec width height videoUrl createdAt')
    .sort({ createdAt: -1 })
    .limit(60)
    .populate('design', 'title');
  res.json(docs.filter((d) => d.design).map((d) => ({ _id: d._id, design: { _id: d.design._id, title: d.design.title }, effect: d.effect, lengthSec: d.lengthSec, width: d.width, height: d.height, videoUrl: d.videoUrl, createdAt: d.createdAt })));
}

export async function getAnimation(req, res) {
  const doc = await DesignAnimation.findById(req.params.animId, '-layers -background');
  if (!doc) return res.status(404).json({ error: 'animation not found' });
  res.json(doc);
}

export async function deleteAnimation(req, res) {
  const doc = await DesignAnimation.findById(req.params.animId);
  if (!doc) return res.status(404).json({ error: 'animation not found' });
  if (doc.status === 'queued' || doc.status === 'rendering') return res.status(409).json({ error: 'Wait for it to finish rendering first.' });
  if (doc.videoUrl) removeVideoFiles(doc.videoUrl);
  fs.promises.rm(path.join(ANIM_DIR, String(doc._id)), { recursive: true, force: true }).catch(() => {});
  await doc.deleteOne();
  res.json({ ok: true });
}

// Removes the animations (records + files) of designs that are being deleted.
export async function purgeAnimations(designIds) {
  const docs = await DesignAnimation.find({ design: { $in: designIds } });
  for (const doc of docs) {
    if (doc.videoUrl) removeVideoFiles(doc.videoUrl);
    fs.promises.rm(path.join(ANIM_DIR, String(doc._id)), { recursive: true, force: true }).catch(() => {});
  }
  await DesignAnimation.deleteMany({ design: { $in: designIds } });
}

const FORMATS = {
  mp4: { ext: 'mp4', type: 'video/mp4' },
  gif: { ext: 'gif', type: 'image/gif' },
  webm: { ext: 'webm', type: 'video/webm' },
};
const GIF_MAX_WIDTH = 720;

function convert(input, output, format, width) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(input);
    if (format === 'gif') {
      // One shared palette for the whole clip keeps colours clean; 15fps and a capped width keep
      // the file size sensible.
      const w = Math.min(width, GIF_MAX_WIDTH);
      cmd.complexFilter([
        `fps=15,scale=${w}:-1:flags=lanczos,split[a][b]`,
        '[a]palettegen=stats_mode=diff[p]',
        '[b][p]paletteuse=dither=bayer:bayer_scale=4',
      ]).outputOptions(['-loop', '0']);
    } else if (format === 'webm') {
      cmd.videoCodec('libvpx-vp9').outputOptions(['-crf', '32', '-b:v', '0', '-an']);
    }
    cmd.format(format === 'gif' ? 'gif' : format).on('end', resolve).on('error', reject).save(output);
  });
}

// Downloads a finished animation as mp4 (as rendered), gif or webm. Conversions are cached next
// to the video so a repeat download is instant.
export async function downloadAnimation(req, res) {
  const fmt = FORMATS[String(req.query.format || 'mp4')];
  if (!fmt) return res.status(400).json({ error: 'Choose mp4, gif or webm.' });
  const doc = await DesignAnimation.findById(req.params.animId);
  if (!doc || doc.status !== 'done' || !doc.videoUrl) return res.status(404).json({ error: 'That animation is not ready yet.' });
  const source = path.join(UPLOADS_DIR, 'reels', path.basename(new URL(doc.videoUrl).pathname));
  if (!fs.existsSync(source)) return res.status(404).json({ error: 'The rendered video is missing. Create the animation again.' });
  let file = source;
  if (fmt.ext !== 'mp4') {
    file = source.replace(/\.mp4$/, `.${fmt.ext}`);
    if (!fs.existsSync(file)) {
      try {
        await convert(source, file, fmt.ext, doc.width);
      } catch (err) {
        fs.promises.unlink(file).catch(() => {});
        console.error('[animation] conversion failed', err);
        return res.status(500).json({ error: `Could not make the ${fmt.ext.toUpperCase()}.` });
      }
    }
  }
  res.setHeader('Content-Type', fmt.type);
  res.download(file, `animation-${String(doc._id).slice(-6)}.${fmt.ext}`);
}
