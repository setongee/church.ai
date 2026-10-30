import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Session } from '../models/Session.model.js';
import { ReelTemplate } from '../models/ReelTemplate.model.js';
import { BUILTIN_TEMPLATES } from '../../remotion/templates.js';
import { Reel } from '../models/Reel.model.js';
import { AudioTranscript } from '../models/AudioTranscript.model.js';
import { TranscriptSegment } from '../models/TranscriptSegment.model.js';
import { generateSummary, generateCarousel } from '../services/openrouter.service.js';
import { analyzeFullTranscript } from '../services/analysis.service.js';
import { Quote } from '../models/Quote.model.js';
import { Insight } from '../models/Insight.model.js';
import {
  REELS_DIR,
  CLIPS_DIR,
  getOrCreateAudioTranscript,
  pickHighlights,
  storeImportedAudio,
} from '../services/audioPipeline.service.js';
import { enqueueRender } from '../services/reelRender.service.js';
import { sanitizeOptions } from '../services/reelOptions.service.js';
import { attachPlanned } from '../services/planned.service.js';
import { publishVideoToInstagram, InstagramConfigError, InstagramApiError } from '../services/instagram.service.js';

const MAX_POINTS = 10;

// Optional { startSec, endSec } limiting generation to one part of the service.
export function parseRange(body) {
  const startSec = Number(body?.startSec);
  const endSec = Number(body?.endSec);
  return Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec ? { startSec, endSec } : undefined;
}

// Accepts a built-in id or an existing custom template's id; anything else is ignored.
export async function validTemplateId(id) {
  if (typeof id !== 'string' || !id) return undefined;
  if (BUILTIN_TEMPLATES.some((t) => t.id === id)) return id;
  return mongoose.isValidObjectId(id) && (await ReelTemplate.exists({ _id: id })) ? id : undefined;
}

// Imports a recording as a brand-new, already-ended session: stores the audio, transcribes it
// (word-timed), and fills in the same summary/carousel a live session gets once it ends.
export async function importAudioSession(req, res) {
  const { id: serviceId } = req.params;
  const { title, preacher } = req.body;
  const file = req.file;
  try {
    if (!file) return res.status(400).json({ error: 'An audio file is required.' });
    if (!title?.trim() || !preacher?.trim()) {
      return res.status(400).json({ error: 'title and preacher are required' });
    }

    const session = await Session.create({
      service: serviceId,
      title: title.trim(),
      preacher: preacher.trim(),
      status: 'ended',
      endedAt: new Date(),
    });

    try {
      session.audioUrl = await storeImportedAudio(session._id.toString(), file.path);
      const transcript = await getOrCreateAudioTranscript(session);

      // Mirror the live transcript's shape so the transcript drawer, chat and summary work the
      // same on imported sessions.
      const sentences = transcript.utterances.length
        ? transcript.utterances
        : [{ text: transcript.words.map((w) => w.w).join(' '), s: 0, e: transcript.durationSec }];
      await TranscriptSegment.insertMany(
        sentences.map((u) => ({
          session: session._id,
          text: u.text,
          isFinal: true,
          startMs: Math.round(u.s * 1000),
          endMs: Math.round(u.e * 1000),
        }))
      );

      const fullText = sentences.map((u) => u.text).join(' ');
      // Summary/carousel and the quotes + notes pass are independent, so run them together.
      const buildSummary = async () => {
        const summary = await generateSummary({ fullText });
        if (summary) {
          session.summary = summary;
          const carousel = await generateCarousel({ summary });
          if (carousel?.length) session.carousel = carousel;
        }
      };
      const buildQuotesAndNotes = () =>
        analyzeFullTranscript(
          session._id.toString(),
          sentences.map((u) => u.text),
          {
            onQuote: ({ text, imagePrompt, caption, sourceText, groupId }) =>
              Quote.create({ session: session._id, text, imagePrompt, caption, sourceText, groupId }),
            onInsight: ({ type, text, reference, items, groupId }) =>
              groupId
                ? Insight.findOneAndUpdate(
                    { session: session._id, groupId },
                    { type, text, reference, items },
                    { new: true, upsert: true }
                  )
                : Insight.create({ session: session._id, type, text, reference }),
          }
        ).catch((err) => console.error('[import] quote/notes extraction failed', err));
      await Promise.all([buildSummary(), buildQuotesAndNotes()]);
      await session.save();
      // "Whole recording" imports get their single full-length reel straight away.
      let reel = null;
      if (req.body?.mode === 'full') {
        reel = await Reel.create({
          session: session._id,
          order: 1,
          headline: session.title.slice(0, 80),
          takeaway: '',
          startSec: 0,
          endSec: transcript.durationSec,
          options: sanitizeOptions({ pace: { trimPauses: false } }),
        });
      }
      res.status(201).json({ ...session.toObject(), reelId: reel?._id });
    } catch (err) {
      // Don't leave a half-built session in the service's list.
      await Promise.all([
        Session.deleteOne({ _id: session._id }),
        TranscriptSegment.deleteMany({ session: session._id }),
        Quote.deleteMany({ session: session._id }),
        Insight.deleteMany({ session: session._id }),
        AudioTranscript.deleteOne({ session: session._id }),
      ]);
      throw err;
    }
  } finally {
    if (file) fs.promises.unlink(file.path).catch(() => {});
  }
}

export async function listReels(req, res) {
  res.json(await attachPlanned(await Reel.find({ session: req.params.id }).sort({ order: 1 }), 'reel'));
}

// Finds the session's top moments and creates a draft reel for each. Replaces the previous
// drafts, but keeps any reel that has already been rendered so finished work isn't lost.
export async function generateReels(req, res) {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (session.status !== 'ended') {
    return res.status(400).json({ error: 'Reels can be generated once the session has ended.' });
  }

  const count = Math.min(MAX_POINTS, Math.max(1, Number(req.body?.count) || 5));
  const transcript = await getOrCreateAudioTranscript(session);
  const range = parseRange(req.body);
  const points = await pickHighlights(transcript, count, range);
  if (points.length === 0) {
    return res.status(422).json({ error: "Couldn't find strong standalone moments in this audio. Try again." });
  }

  const stale = await Reel.find({ session: session._id, status: { $ne: 'done' } });
  await Reel.deleteMany({ _id: { $in: stale.map((r) => r._id) } });
  const kept = await Reel.countDocuments({ session: session._id });

  const template = await validTemplateId(req.body?.template);
  await Reel.insertMany(points.map((p, i) => ({ session: session._id, order: kept + i + 1, ...(template && { template }), ...p })));
  res.status(201).json(await attachPlanned(await Reel.find({ session: session._id }).sort({ order: 1 }), 'reel'));
}

// One reel that uses the WHOLE recording - for announcements, confessions, short messages - with
// no moment-picking and no cutting. (Long pauses and the last sentence are still handled by the
// pace settings, which can be switched off on the reel.)
export const MAX_REEL_SEC = 90;
export const MAX_FULL_REEL_SEC = 300; // a full message reel: 5 minutes

// One reel from a long stretch of the recording kept whole - the full message (up to 5 minutes),
// not a highlight. Pick a section, or give start/end; with neither, the whole recording is used
// (when it fits).
export async function createFullReel(req, res) {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  const transcript = await getOrCreateAudioTranscript(session);
  const template = await validTemplateId(req.body?.template);
  let start = 0;
  let end = transcript.durationSec;
  const section = req.body?.sectionId && transcript.sections.find((x) => String(x._id) === String(req.body.sectionId));
  if (section) {
    start = section.s;
    end = section.e;
  }
  if (req.body?.startSec !== undefined && req.body?.startSec !== null && req.body.startSec !== '') start = Number(req.body.startSec);
  if (req.body?.endSec !== undefined && req.body?.endSec !== null && req.body.endSec !== '') end = Number(req.body.endSec);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 3) {
    return res.status(400).json({ error: 'Choose a start and end at least 3 seconds apart.' });
  }
  end = Math.min(end, transcript.durationSec || end);
  if (end - start > MAX_FULL_REEL_SEC) {
    const mins = Math.round((end - start) / 6) / 10;
    return res.status(400).json({ error: `That is ${mins} minutes - a full-message reel can be up to 5. Pick a section or set a shorter start and end.` });
  }
  const order = (await Reel.countDocuments({ session: session._id })) + 1;
  const reel = await Reel.create({
    session: session._id,
    order,
    headline: String(req.body?.headline || session.title).trim().slice(0, 80) || 'Untitled',
    takeaway: '',
    startSec: start,
    endSec: end,
    full: true,
    // Keep the message as spoken by default; pause cutting and speed can be switched on in the options.
    options: sanitizeOptions({ pace: { trimPauses: false } }),
    ...(template && { template }),
  });
  res.status(201).json(await attachPlanned(reel, 'reel'));
}

export async function updateReel(req, res) {
  const reel = await Reel.findById(req.params.id);
  if (!reel) return res.status(404).json({ error: 'reel not found' });
  if (reel.status === 'queued' || reel.status === 'rendering') {
    return res.status(409).json({ error: 'This reel is rendering - wait for it to finish before editing.' });
  }

  const { headline, takeaway, startSec, endSec } = req.body;
  const template = await validTemplateId(req.body.template);
  if (template) reel.template = template;
  if (typeof headline === 'string' && headline.trim()) reel.headline = headline.trim().slice(0, 80);
  if (typeof takeaway === 'string') reel.takeaway = takeaway.trim().slice(0, 200);

  const start = startSec !== undefined ? Number(startSec) : reel.startSec;
  const end = endSec !== undefined ? Number(endSec) : reel.endSec;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 3 || end - start > (reel.full ? MAX_FULL_REEL_SEC : MAX_REEL_SEC)) {
    return res.status(400).json({ error: reel.full ? 'A full-message reel must be between 3 seconds and 5 minutes long.' : 'A reel must be between 3 and 90 seconds long.' });
  }
  const transcript = await AudioTranscript.findOne({ session: reel.session });
  if (transcript?.durationSec && end > transcript.durationSec + 0.5) {
    return res.status(400).json({ error: 'The end time is past the end of the recording.' });
  }
  reel.startSec = start;
  reel.endSec = end;

  if (req.body.options && typeof req.body.options === 'object') {
    reel.options = sanitizeOptions(req.body.options, reel.options);
    reel.markModified('options');
  }

  // Changing text or timing makes the existing video stale.
  if (reel.status === 'done') reel.status = 'draft';
  await reel.save();
  res.json(await attachPlanned(reel, 'reel'));
}

export async function renderReelEndpoint(req, res) {
  const reel = await Reel.findById(req.params.id);
  if (!reel) return res.status(404).json({ error: 'reel not found' });
  if (reel.status === 'queued' || reel.status === 'rendering') return res.json(await attachPlanned(reel, 'reel'));

  reel.status = 'queued';
  reel.progress = 0;
  reel.error = undefined;
  await reel.save();
  enqueueRender('reel', reel._id.toString());
  res.json(await attachPlanned(reel, 'reel'));
}

export async function renderAllReels(req, res) {
  const reels = await Reel.find({ session: req.params.id, status: { $in: ['draft', 'error'] } }).sort({ order: 1 });
  for (const reel of reels) {
    reel.status = 'queued';
    reel.progress = 0;
    reel.error = undefined;
    await reel.save();
    enqueueRender('reel', reel._id.toString());
  }
  res.json(await attachPlanned(await Reel.find({ session: req.params.id }).sort({ order: 1 }), 'reel'));
}

export async function deleteReel(req, res) {
  const reel = await Reel.findById(req.params.id);
  if (!reel) return res.status(404).json({ error: 'reel not found' });
  if (reel.status === 'queued' || reel.status === 'rendering') {
    return res.status(409).json({ error: 'This reel is rendering - wait for it to finish before deleting.' });
  }
  for (const [dir, url] of [[REELS_DIR, reel.videoUrl], [CLIPS_DIR, reel.clipUrl], [CLIPS_DIR, reel.mixUrl]]) {
    if (url) fs.promises.unlink(path.join(dir, path.basename(new URL(url, 'http://x').pathname))).catch(() => {});
  }
  await reel.deleteOne();
  res.json({ ok: true });
}

// Switches every reel of the session to one template (finished videos go back to "draft" since
// they no longer match what would be rendered).
export async function applyTemplateToAll(req, res) {
  const template = await validTemplateId(req.body?.template);
  if (!template) return res.status(400).json({ error: 'Unknown template.' });
  await Reel.updateMany({ session: req.params.id, status: { $in: ['draft', 'done', 'error'] } }, [
    { $set: { template, status: { $cond: [{ $eq: ['$status', 'done'] }, 'draft', '$status'] } } },
  ]);
  res.json(await attachPlanned(await Reel.find({ session: req.params.id }).sort({ order: 1 }), 'reel'));
}

// Shared by reels and merged videos: posts the finished video to Instagram as a Reel and records
// where it went. This publishes to the real account, so the UI asks for confirmation first.
export async function publishToInstagram(item, caption, res) {
  if (!item) return res.status(404).json({ error: 'not found' });
  if (item.status !== 'done' || !item.videoUrl) return res.status(400).json({ error: 'Render the video first.' });
  try {
    const { mediaId, permalink } = await publishVideoToInstagram({ videoUrl: item.videoUrl, caption: String(caption || '').slice(0, 2200) });
    item.instagramMediaId = mediaId;
    item.instagramPermalink = permalink;
    item.instagramPublishedAt = new Date();
    await item.save();
    res.json(item);
  } catch (err) {
    if (err instanceof InstagramConfigError || err instanceof InstagramApiError) {
      return res.status(err instanceof InstagramConfigError ? 400 : 502).json({ error: err.message });
    }
    throw err;
  }
}

export async function publishReelToInstagram(req, res) {
  await publishToInstagram(await Reel.findById(req.params.id), req.body?.caption, res);
}
