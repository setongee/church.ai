import fs from 'fs';
import path from 'path';
import { Session } from '../models/Session.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { getOrCreateAudioTranscript, pickCompilation, CLIPS_DIR, REELS_DIR } from '../services/audioPipeline.service.js';
import { enqueueRender } from '../services/reelRender.service.js';
import { sanitizeOptions } from '../services/reelOptions.service.js';
import { attachPlanned } from '../services/planned.service.js';
import { parseRange, validTemplateId, publishToInstagram } from './reel.controller.js';

const KINDS = ['key-points', 'top-moments', 'custom'];
const MAX_SEGMENTS = 12;

export async function listCompilations(req, res) {
  res.json(await attachPlanned(await Compilation.find({ session: req.params.id }).sort({ createdAt: -1 }), 'compilation'));
}

// Finds the clips for a merged video (e.g. each of the four things the pastor listed) and saves
// them as an editable draft.
export async function generateCompilation(req, res) {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (session.status !== 'ended') return res.status(400).json({ error: 'Merged reels can be made once the session has ended.' });

  const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'key-points';
  const prompt = String(req.body?.prompt || '').trim().slice(0, 300);
  if (kind === 'custom' && !prompt) return res.status(400).json({ error: 'Describe what to gather for a custom merge.' });
  // Desired length of the finished video, in seconds (15s to 10 min).
  const targetSec = Math.min(600, Math.max(15, Number(req.body?.targetSec) || 60));

  const transcript = await getOrCreateAudioTranscript(session);
  const pace = sanitizeOptions(req.body?.options ?? {}).pace;
  const { title, kicker, segments } = await pickCompilation(transcript, { kind, prompt, targetSec, range: parseRange(req.body), pace });
  if (segments.length < 1) return res.status(422).json({ error: "Couldn't find clips for that. Try describing it differently." });

  const template = await validTemplateId(req.body?.template);
  const comp = await Compilation.create({
    session: session._id,
    title: title.trim().slice(0, 80) || `${segments.length} key points`,
    kicker: kicker.trim().slice(0, 40),
    kind,
    prompt,
    targetSec,
    ...(template && { template }),
    segments,
  });
  res.status(201).json(await attachPlanned(comp, 'compilation'));
}

export async function updateCompilation(req, res) {
  const comp = await Compilation.findById(req.params.id);
  if (!comp) return res.status(404).json({ error: 'merged reel not found' });
  if (comp.status === 'queued' || comp.status === 'rendering') {
    return res.status(409).json({ error: 'This video is rendering - wait for it to finish before editing.' });
  }

  const { title, segments } = req.body;
  if (typeof title === 'string' && title.trim()) comp.title = title.trim().slice(0, 80);
  if (req.body.options && typeof req.body.options === 'object') {
    comp.options = sanitizeOptions(req.body.options, comp.options);
    comp.markModified('options');
  }
  const template = await validTemplateId(req.body.template);
  if (template) comp.template = template;

  if (Array.isArray(segments)) {
    if (segments.length < 1 || segments.length > MAX_SEGMENTS) {
      return res.status(400).json({ error: `A merged reel needs between 1 and ${MAX_SEGMENTS} clips.` });
    }
    const cleaned = [];
    for (const x of segments) {
      const s = Number(x.startSec);
      const e = Number(x.endSec);
      if (!String(x.headline || '').trim() || !Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e - s < 3 || e - s > 90) {
        return res.status(400).json({ error: 'Each clip needs a headline and to be between 3 and 90 seconds long.' });
      }
      cleaned.push({ headline: String(x.headline).trim().slice(0, 80), takeaway: String(x.takeaway || '').trim().slice(0, 200), startSec: s, endSec: e });
    }
    comp.segments = cleaned;
  }
  if (comp.status === 'done') comp.status = 'draft';
  await comp.save();
  res.json(await attachPlanned(comp, 'compilation'));
}

export async function renderCompilationEndpoint(req, res) {
  const comp = await Compilation.findById(req.params.id);
  if (!comp) return res.status(404).json({ error: 'merged reel not found' });
  if (comp.status === 'queued' || comp.status === 'rendering') return res.json(await attachPlanned(comp, 'compilation'));
  comp.status = 'queued';
  comp.progress = 0;
  comp.error = undefined;
  await comp.save();
  enqueueRender('compilation', comp._id.toString());
  res.json(await attachPlanned(comp, 'compilation'));
}

export async function deleteCompilation(req, res) {
  const comp = await Compilation.findById(req.params.id);
  if (!comp) return res.status(404).json({ error: 'merged reel not found' });
  if (comp.status === 'queued' || comp.status === 'rendering') {
    return res.status(409).json({ error: 'This video is rendering - wait for it to finish before deleting.' });
  }
  for (const [dir, url] of [[REELS_DIR, comp.videoUrl], [CLIPS_DIR, comp.mixUrl], [CLIPS_DIR, `/uploads/clips/${comp._id}-voice.mp3`]]) {
    if (url) fs.promises.unlink(path.join(dir, path.basename(new URL(url, 'http://x').pathname))).catch(() => {});
  }
  await comp.deleteOne();
  res.json({ ok: true });
}

export async function publishCompilationToInstagram(req, res) {
  await publishToInstagram(await Compilation.findById(req.params.id), req.body?.caption, res);
}
