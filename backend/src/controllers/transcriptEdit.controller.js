import { Session } from '../models/Session.model.js';
import { AudioTranscript } from '../models/AudioTranscript.model.js';
import { computePeaks, detectServiceSections, ensureLocalAudio, getOrCreateAudioTranscript } from '../services/audioPipeline.service.js';

async function requireTranscript(sessionId) {
  const t = await AudioTranscript.findOne({ session: sessionId });
  if (!t) {
    const err = new Error('This session has no word-level transcript yet. Generate reels first.');
    err.status = 404;
    throw err;
  }
  return t;
}

// Overview used by the Reels/Merged tabs: is there a transcript, and what sections exist.
export async function getAudioInfo(req, res) {
  const t = await AudioTranscript.findOne({ session: req.params.id });
  res.json({
    hasTranscript: Boolean(t?.words.length),
    durationSec: t?.durationSec ?? 0,
    sections: (t?.sections ?? []).map((x) => ({ _id: x._id, title: x.title, summary: x.summary, startSec: x.s, endSec: x.e })),
  });
}

// Words overlapping [start, end], with their stable indexes - that index is how edits address
// a word, so edits stay correct no matter which reel or merged video is looking at it.
export async function getWords(req, res) {
  const t = await requireTranscript(req.params.id);
  const start = Number(req.query.start) || 0;
  const end = Number(req.query.end) || t.durationSec;
  const words = [];
  t.words.forEach((w, i) => {
    if (w.e > start && w.s < end) words.push({ i, w: w.w, s: w.s, e: w.e });
  });
  res.json({ durationSec: t.durationSec, words });
}

// Fix spelling / timing of individual words. Blanking a word (w: '') hides it from captions
// without shifting any other word's index.
export async function editWords(req, res) {
  const t = await requireTranscript(req.params.id);
  const edits = Array.isArray(req.body?.edits) ? req.body.edits : [];
  if (edits.length === 0 || edits.length > 500) return res.status(400).json({ error: 'Send between 1 and 500 edits.' });

  const $set = {};
  for (const e of edits) {
    const i = Number(e.i);
    if (!Number.isInteger(i) || i < 0 || i >= t.words.length) return res.status(400).json({ error: `Unknown word index ${e.i}.` });
    const cur = t.words[i];
    const s = e.s !== undefined ? Number(e.s) : cur.s;
    const en = e.e !== undefined ? Number(e.e) : cur.e;
    if (!Number.isFinite(s) || !Number.isFinite(en) || s < 0 || en <= s || en > t.durationSec + 1) {
      return res.status(400).json({ error: 'A word must end after it starts, inside the recording.' });
    }
    if (typeof e.w === 'string') $set[`words.${i}.w`] = e.w.trim().slice(0, 60);
    if (e.s !== undefined) $set[`words.${i}.s`] = s;
    if (e.e !== undefined) $set[`words.${i}.e`] = en;
  }
  await AudioTranscript.updateOne({ _id: t._id }, { $set });
  res.json({ ok: true, edited: edits.length });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-transcript find & replace on words - for a name or native word the speech-to-text got
// wrong everywhere. Matches the word ignoring surrounding punctuation and keeps that punctuation.
export async function replaceWords(req, res) {
  const from = String(req.body?.from ?? '').trim();
  const to = String(req.body?.to ?? '').trim();
  if (!from) return res.status(400).json({ error: 'Enter the word to replace.' });
  const t = await requireTranscript(req.params.id);

  const re = new RegExp(`^([^\\p{L}\\p{N}]*)${escapeRe(from)}([^\\p{L}\\p{N}]*)$`, 'iu');
  let count = 0;
  const $set = {};
  t.words.forEach((w, i) => {
    const m = re.exec(w.w || '');
    if (m) {
      $set[`words.${i}.w`] = `${m[1]}${to}${m[2]}`;
      count += 1;
    }
  });
  if (count > 0) await AudioTranscript.updateOne({ _id: t._id }, { $set });
  res.json({ replaced: count });
}

export async function getPeaks(req, res) {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  const start = Math.max(0, Number(req.query.start) || 0);
  const end = Number(req.query.end);
  if (!Number.isFinite(end) || end <= start || end - start > 600) {
    return res.status(400).json({ error: 'Ask for a range of up to 10 minutes.' });
  }
  const sourcePath = await ensureLocalAudio(session);
  const peaks = await computePeaks({ sourcePath, startSec: start, endSec: end, buckets: Math.min(1200, Math.max(50, Number(req.query.n) || 600)) });
  res.json({ start, end, peaks });
}

export async function detectSectionsEndpoint(req, res) {
  const session = await Session.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  const t = await getOrCreateAudioTranscript(session);
  const sections = await detectServiceSections(t);
  if (sections.length === 0) return res.status(422).json({ error: "Couldn't work out the parts of this service. Try again." });
  t.sections = sections;
  await t.save();
  res.json(t.sections.map((x) => ({ _id: x._id, title: x.title, summary: x.summary, startSec: x.s, endSec: x.e })));
}

// Replaces the section list with the user's edited version.
export async function saveSections(req, res) {
  const t = await requireTranscript(req.params.id);
  const input = Array.isArray(req.body?.sections) ? req.body.sections : [];
  const cleaned = [];
  for (const x of input.slice(0, 20)) {
    const s = Number(x.startSec);
    const e = Number(x.endSec);
    if (typeof x.title !== 'string' || !x.title.trim() || !Number.isFinite(s) || !Number.isFinite(e) || e <= s || s < 0) {
      return res.status(400).json({ error: 'Every section needs a title and a start before its end.' });
    }
    cleaned.push({ title: x.title.trim().slice(0, 60), summary: String(x.summary || '').slice(0, 200), s, e: Math.min(e, t.durationSec || e) });
  }
  t.sections = cleaned;
  await t.save();
  res.json(t.sections.map((x) => ({ _id: x._id, title: x.title, summary: x.summary, startSec: x.s, endSec: x.e })));
}
