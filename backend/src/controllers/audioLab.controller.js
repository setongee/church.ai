import mongoose from 'mongoose';
import { AudioMerge } from '../models/AudioMerge.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { Session } from '../models/Session.model.js';
import { getOrCreateAudioTranscript } from '../services/audioPipeline.service.js';
import { AudioTranscript } from '../models/AudioTranscript.model.js';
import { MAX_SEGMENTS, buildMergeTranscript, formatMergeTranscript, mergeFilePath, planMerge, suggestTopics, removeMergedFile, renderMergedAudio } from '../services/audioLab.service.js';

const isId = (id) => mongoose.isValidObjectId(id);
const STYLES = ['viral', 'story', 'highlights'];
const running = new Set();

async function setStage(id, status, stage) {
  await AudioMerge.updateOne({ _id: id }, { status, stage });
}

async function renderInto(merge, session) {
  await setStage(merge._id, 'rendering', 'Stitching and balancing the audio…');
  const { audioUrl, durationSec } = await renderMergedAudio({ session, mergeId: String(merge._id), segments: merge.segments });
  await AudioMerge.updateOne({ _id: merge._id }, { status: 'done', stage: '', audioUrl, durationSec, error: undefined });
}

// Runs in the background after the request returns: plan -> review -> render, reporting each
// stage on the document so the page can show progress.
async function runMerge(mergeId) {
  if (running.has(String(mergeId))) return;
  running.add(String(mergeId));
  try {
    const merge = await AudioMerge.findById(mergeId);
    const session = await Session.findById(merge.session);
    const audioTranscript = await getOrCreateAudioTranscript(session);
    const plan = await planMerge({
      audioTranscript,
      prompt: merge.prompt,
      style: merge.style,
      targetSec: merge.targetSec,
      onStage: (status, stage) => setStage(mergeId, status, stage),
    });
    merge.title = plan.title;
    merge.summary = plan.summary;
    merge.review = plan.review;
    merge.segments = plan.segments;
    await merge.save();
    await renderInto(merge, session);
  } catch (err) {
    console.error('[audioLab] failed', err);
    await AudioMerge.updateOne({ _id: mergeId }, { status: 'error', stage: '', error: err.message || 'Something went wrong.' });
  } finally {
    running.delete(String(mergeId));
  }
}

async function runRender(mergeId) {
  if (running.has(String(mergeId))) return;
  running.add(String(mergeId));
  try {
    const merge = await AudioMerge.findById(mergeId);
    await renderInto(merge, await Session.findById(merge.session));
  } catch (err) {
    console.error('[audioLab] render failed', err);
    await AudioMerge.updateOne({ _id: mergeId }, { status: 'error', stage: '', error: err.message || 'Could not render the audio.' });
  } finally {
    running.delete(String(mergeId));
  }
}

export async function listMerges(req, res) {
  const filter = isId(req.query.session) ? { session: req.query.session } : {};
  const docs = await AudioMerge.find(filter).sort({ createdAt: -1 }).limit(filter.session ? 50 : 30).populate('session', 'title preacher service');
  res.json(docs);
}

export async function getMerge(req, res) {
  const doc = isId(req.params.id) ? await AudioMerge.findById(req.params.id).populate('session', 'title preacher service') : null;
  if (!doc) return res.status(404).json({ error: 'audio cut not found' });
  res.json(doc);
}

export async function generateMerge(req, res) {
  const session = isId(req.params.id) ? await Session.findById(req.params.id) : null;
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!session.audioUrl) return res.status(400).json({ error: 'This session has no audio yet. Upload audio or wait for the recording to finish.' });
  const prompt = String(req.body?.prompt || '').trim().slice(0, 500);
  const style = STYLES.includes(req.body?.style) ? req.body.style : 'viral';
  const targetSec = Math.min(300, Math.max(15, Number(req.body?.targetSec) || 60));
  const merge = await AudioMerge.create({ session: session._id, prompt, style, targetSec, status: 'planning', stage: 'Getting the transcript ready…' });
  runMerge(merge._id);
  res.status(201).json(merge);
}

// Saves a hand-edited list of pieces (removed, reordered or trimmed) and renders it again.
export async function updateMerge(req, res) {
  const merge = isId(req.params.id) ? await AudioMerge.findById(req.params.id) : null;
  if (!merge) return res.status(404).json({ error: 'audio cut not found' });
  if (['planning', 'reviewing', 'rendering'].includes(merge.status)) return res.status(409).json({ error: 'Wait for this cut to finish first.' });
  if (typeof req.body?.title === 'string' && req.body.title.trim()) merge.title = req.body.title.trim().slice(0, 80);
  if (Array.isArray(req.body?.segments)) {
    const known = new Map(merge.segments.map((s) => [String(s._id), s]));
    const next = [];
    for (const x of req.body.segments.slice(0, MAX_SEGMENTS)) {
      const base = known.get(String(x._id));
      const startSec = Number(x.startSec ?? base?.startSec);
      const endSec = Number(x.endSec ?? base?.endSec);
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec - startSec < 1 || endSec - startSec > 120) {
        return res.status(400).json({ error: 'Each piece needs to be between 1 and 120 seconds.' });
      }
      next.push({ ...(base ? base.toObject() : {}), startSec, endSec, headline: String(x.headline ?? base?.headline ?? '').slice(0, 80) });
    }
    if (next.length < 1) return res.status(400).json({ error: 'Keep at least one piece.' });
    merge.segments = next;
    merge.status = 'rendering';
    merge.stage = 'Stitching and balancing the audio…';
  }
  await merge.save();
  if (merge.status === 'rendering') runRender(merge._id);
  res.json(merge);
}

export async function downloadMerge(req, res) {
  const merge = isId(req.params.id) ? await AudioMerge.findById(req.params.id) : null;
  if (!merge || merge.status !== 'done') return res.status(404).json({ error: 'That audio is not ready yet.' });
  const safe = (merge.title || 'audio-cut').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'audio-cut';
  res.download(mergeFilePath(merge._id), `${safe}.mp3`, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'The audio file is missing. Rebuild this cut.' });
  });
}

// The transcript of the NEW audio (not the whole session): what is actually said in the cut, with times counted from
// the start of the cut. ?format=json (default, for the page) | txt | timestamped | srt | vtt; add &download=1 for a file.
export async function getMergeTranscript(req, res) {
  const merge = isId(req.params.id) ? await AudioMerge.findById(req.params.id) : null;
  if (!merge || merge.status !== 'done') return res.status(404).json({ error: 'That audio is not ready yet.' });
  const timed = await AudioTranscript.findOne({ session: merge.session }).select('words').lean();
  const t = buildMergeTranscript(merge, timed?.words);
  const format = ['txt', 'timestamped', 'srt', 'vtt'].includes(req.query.format) ? req.query.format : 'json';
  if (format === 'json') return res.json(t);
  const body = formatMergeTranscript(t, format);
  const safe = (merge.title || 'audio-cut').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'audio-cut';
  const ext = format === 'timestamped' ? 'timestamps.txt' : format;
  res.type(format === 'vtt' ? 'text/vtt' : format === 'srt' ? 'application/x-subrip' : 'text/plain');
  if (req.query.download) res.set('Content-Disposition', `attachment; filename="${safe}.${ext}"`);
  res.send(body);
}

// Hands the cut to the Merged reel tool: same pieces, same order, ready to style and render.
export async function createReelFromMerge(req, res) {
  const merge = isId(req.params.id) ? await AudioMerge.findById(req.params.id) : null;
  if (!merge) return res.status(404).json({ error: 'audio cut not found' });
  const segments = merge.segments
    .filter((s) => s.endSec - s.startSec >= 3 && s.endSec - s.startSec <= 90)
    .slice(0, 12)
    .map((s) => ({ headline: s.headline || s.text.slice(0, 60) || 'Moment', takeaway: s.why.slice(0, 200), startSec: s.startSec, endSec: s.endSec }));
  if (segments.length === 0) return res.status(400).json({ error: 'None of the pieces can be used in a reel.' });
  const comp = await Compilation.create({
    session: merge.session,
    title: (merge.title || 'Audio cut').slice(0, 80),
    kind: 'custom',
    prompt: merge.prompt,
    targetSec: merge.targetSec,
    segments,
  });
  res.status(201).json({ compilation: comp, sessionId: merge.session });
}

export async function deleteMerge(req, res) {
  const merge = isId(req.params.id) ? await AudioMerge.findById(req.params.id) : null;
  if (!merge) return res.status(404).json({ error: 'audio cut not found' });
  if (['planning', 'reviewing', 'rendering'].includes(merge.status)) return res.status(409).json({ error: 'Wait for this cut to finish first.' });
  await removeMergedFile(merge._id);
  await merge.deleteOne();
  res.json({ ok: true });
}

// A server restart kills in-flight jobs; mark them failed instead of showing them as "working"
// forever.
export async function failInterruptedMerges() {
  await AudioMerge.updateMany(
    { status: { $in: ['planning', 'reviewing', 'rendering'] } },
    { status: 'error', stage: '', error: 'This was interrupted by a server restart. Please run it again.' }
  );
}

// Hot topics and moments the AI spotted in the message, for one-click ideas. Generated once per
// recording and saved; ?refresh=1 asks again.
export async function getSuggestions(req, res) {
  const session = isId(req.params.id) ? await Session.findById(req.params.id) : null;
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!session.audioUrl) return res.json({ topics: [] });
  const transcript = await getOrCreateAudioTranscript(session);
  if (transcript.labTopics?.length && req.query.refresh !== '1') return res.json({ topics: transcript.labTopics });
  const topics = await suggestTopics(transcript);
  if (topics.length) {
    transcript.labTopics = topics;
    await transcript.save();
  }
  res.json({ topics });
}
