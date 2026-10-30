import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { env } from '../config/env.js';
import { AudioTranscript } from '../models/AudioTranscript.model.js';
import { transcribeFile } from './deepgram.service.js';
import { extractReelHighlights, extractCompilation, detectSections } from './openrouter.service.js';
import { PassThrough } from 'stream';
import { planTimeline } from './timelinePlan.service.js';
import { uploadAudio } from './cloudinary.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
// Master mp3 per session (what clips are cut from) and the clips/videos derived from it. All of
// it is served statically at /uploads by server.js, which is also how Remotion's headless
// browser fetches the audio while rendering.
export const AUDIO_DIR = path.join(UPLOADS_DIR, 'audio');
export const CLIPS_DIR = path.join(UPLOADS_DIR, 'clips');
export const REELS_DIR = path.join(UPLOADS_DIR, 'reels');
export const PREVIEWS_DIR = path.join(UPLOADS_DIR, 'previews');
for (const dir of [AUDIO_DIR, CLIPS_DIR, REELS_DIR, PREVIEWS_DIR]) fs.mkdirSync(dir, { recursive: true });

const MIN_CLIP_SEC = 8;
const MAX_CLIP_SEC = 45;

export function localUrl(subdir, filename) {
  return `${env.publicBaseUrl || `http://localhost:${env.port}`}/uploads/${subdir}/${filename}`;
}

export function masterPath(sessionId) {
  return path.join(AUDIO_DIR, `${sessionId}.mp3`);
}

// Re-encodes whatever was uploaded (wav/m4a/ogg/webm/mp4...) to a plain mp3 so every downstream
// step - transcription, clipping, rendering - deals with exactly one format.
export function transcodeToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

// Imported sessions already have the master on disk. Sessions recorded live only have the
// Cloudinary copy, so pull it down the first time reels are requested.
export async function ensureLocalAudio(session) {
  const target = masterPath(session._id.toString());
  if (fs.existsSync(target)) return target;
  if (!session.audioUrl) {
    const err = new Error('This session has no audio recording yet.');
    err.status = 400;
    throw err;
  }
  const res = await fetch(session.audioUrl);
  if (!res.ok) {
    const err = new Error(`Could not download the session audio (${res.status}).`);
    err.status = 502;
    throw err;
  }
  await fs.promises.writeFile(target, Buffer.from(await res.arrayBuffer()));
  return target;
}

// Stores an uploaded audio file as the session's master mp3 and returns the URL to save as
// session.audioUrl (Cloudinary when configured, otherwise the locally served copy).
export async function storeImportedAudio(sessionId, uploadedPath) {
  const target = masterPath(sessionId);
  await transcodeToMp3(uploadedPath, target);
  const cloudUrl = await uploadAudio(target, `session-${sessionId}`).catch((err) => {
    console.error('[audioPipeline] cloud upload failed, falling back to local copy', err);
    return null;
  });
  return cloudUrl || localUrl('audio', `${sessionId}.mp3`);
}

// Word-timed transcript of the session's master audio, transcribed once and cached.
export async function getOrCreateAudioTranscript(session) {
  const existing = await AudioTranscript.findOne({ session: session._id });
  if (existing?.words.length) return existing;

  const file = await ensureLocalAudio(session);
  const { durationSec, words, utterances } = await transcribeFile(await fs.promises.readFile(file));
  if (words.length === 0) {
    const err = new Error('No speech was detected in this audio.');
    err.status = 422;
    throw err;
  }
  return AudioTranscript.findOneAndUpdate(
    { session: session._id },
    { durationSec, words, utterances },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const fmt = (n) => Math.round(n * 10) / 10;

// Snaps an LLM-proposed range onto real utterance boundaries (it only sees rounded numbers, and
// models drift) and keeps it within sane reel lengths.
function snapRange(utterances, startSec, endSec, durationSec) {
  const startIdx = utterances.reduce(
    (best, u, i) => (Math.abs(u.s - startSec) < Math.abs(utterances[best].s - startSec) ? i : best),
    0
  );
  let endIdx = utterances.reduce(
    (best, u, i) => (Math.abs(u.e - endSec) < Math.abs(utterances[best].e - endSec) ? i : best),
    startIdx
  );
  if (endIdx < startIdx) endIdx = startIdx;
  // Trim from the tail if it ran too long, or pull in following sentences if it's too short.
  while (endIdx > startIdx && utterances[endIdx].e - utterances[startIdx].s > MAX_CLIP_SEC) endIdx -= 1;
  while (endIdx < utterances.length - 1 && utterances[endIdx].e - utterances[startIdx].s < MIN_CLIP_SEC) endIdx += 1;
  const s = utterances[startIdx].s;
  const e = Math.min(utterances[endIdx].e, durationSec || Infinity);
  return { startSec: s, endSec: e };
}

export function utterancesOf(audioTranscript) {
  return audioTranscript.utterances.length ? audioTranscript.utterances : groupWordsIntoUtterances(audioTranscript.words);
}

// Utterances (optionally limited to a [startSec, endSec] section) and their prompt-ready text.
function scopedUtterances(audioTranscript, range) {
  const all = utterancesOf(audioTranscript);
  const scoped = range ? all.filter((u) => u.e > range.startSec && u.s < range.endSec) : all;
  return scoped.length ? scoped : all;
}
const toLines = (utterances) =>
  utterances.map((u) => `[${fmt(u.s)}-${fmt(u.e)}] ${u.text}`).join('\n').slice(0, 150000);

// Turns LLM-proposed clips into validated, non-overlapping, time-ordered ones.
function finaliseClips(raw, utterances, durationSec, count) {
  const picked = [];
  for (const p of raw) {
    if (typeof p?.headline !== 'string' || !Number.isFinite(p.startSec) || !Number.isFinite(p.endSec)) continue;
    const range = snapRange(utterances, p.startSec, p.endSec, durationSec);
    if (range.endSec - range.startSec < 3) continue;
    // Drop anything that overlaps an earlier (more important) pick.
    if (picked.some((q) => range.startSec < q.endSec && range.endSec > q.startSec)) continue;
    picked.push({
      headline: p.headline.trim().slice(0, 80),
      takeaway: typeof p.takeaway === 'string' ? p.takeaway.trim().slice(0, 200) : '',
      ...range,
    });
    if (picked.length >= count) break;
  }
  // Present in the order they occur in the audio, so "Point 1..N" follows the message.
  return picked.sort((a, b) => a.startSec - b.startSec);
}

// Picks `count` highlight moments from the session's word-timed transcript.
export async function pickHighlights(audioTranscript, count, range) {
  const utterances = scopedUtterances(audioTranscript, range);
  const raw = await extractReelHighlights({ transcriptLines: toLines(utterances), count });
  return finaliseClips(raw, utterances, audioTranscript.durationSec, count);
}

// Picks the clips for a merged reel (kind: key-points | top-moments | custom) so that the
// finished video - after speed and pause cutting - runs close to `targetSec`.
export async function pickCompilation(audioTranscript, { kind, prompt, targetSec, range, pace }) {
  const utterances = scopedUtterances(audioTranscript, range);
  let result = await extractCompilation({ transcriptLines: toLines(utterances), kind, prompt, targetSec });
  // The model occasionally returns nothing on a first try; one more attempt is cheap.
  if (result.clips.length === 0) result = await extractCompilation({ transcriptLines: toLines(utterances), kind, prompt, targetSec });
  const { title, kicker, clips } = result;

  const valid = [];
  for (const p of clips) {
    if (typeof p?.headline !== 'string' || !Number.isFinite(p.startSec) || !Number.isFinite(p.endSec)) continue;
    const r = snapRange(utterances, p.startSec, p.endSec, audioTranscript.durationSec);
    if (r.endSec - r.startSec < 3) continue;
    if (valid.some((q) => r.startSec < q.endSec && r.endSec > q.startSec)) continue;
    valid.push({
      headline: p.headline.trim().slice(0, 80),
      takeaway: typeof p.takeaway === 'string' ? p.takeaway.trim().slice(0, 200) : '',
      priority: Number.isFinite(p.priority) ? p.priority : valid.length + 1,
      ...r,
    });
  }

  const fitted = fitToDuration(valid.slice(0, 12), utterances, audioTranscript.words, targetSec, pace);
  const segments = fitted.sort((a, b) => a.startSec - b.startSec).map(({ priority, ...seg }) => seg);
  return { title: matchCountInTitle(title, segments.length), kicker, segments };
}

const lengthOf = (clips, words, pace) => planTimeline(clips.map((c) => ({ startSec: c.startSec, endSec: c.endSec })), words, pace).totalSec;

// Brings a set of clips within ~12% of the target length: first drops the least essential clips
// (highest priority number), and if one clip alone is still too long, ends it earlier at a
// sentence boundary.
function fitToDuration(clips, utterances, words, targetSec, pace) {
  const keep = [...clips];
  const over = targetSec * 1.12;
  while (keep.length > 1 && lengthOf(keep, words, pace) > over) {
    const idx = keep.reduce((worst, c, i) => (c.priority > keep[worst].priority ? i : worst), 0);
    keep.splice(idx, 1);
  }
  if (keep.length && lengthOf(keep, words, pace) > over) {
    const c = keep[0];
    const ends = utterances.filter((u) => u.e > c.startSec + 8 && u.e < c.endSec).map((u) => u.e);
    while (ends.length && lengthOf(keep, words, pace) > over) c.endSec = ends.pop();
  }
  return keep;
}

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// The LLM titles a merge before we know how many of its clips survive validation ("5 Keys To..."
// with only 3 clips would be a lie on screen), so rewrite any count in the title to the real one.
function matchCountInTitle(title, n) {
  const word = NUMBER_WORDS[n - 1];
  return (title || '')
    .replace(/\b\d{1,2}\b/, String(n))
    .replace(new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b`, 'i'), (m) =>
      word ? (m[0] === m[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word) : m
    );
}

// Splits the whole recording into its parts (worship, prayer, message...) and makes sure the
// result is contiguous and inside the audio, whatever the LLM returned.
export async function detectServiceSections(audioTranscript) {
  const utterances = utterancesOf(audioTranscript);
  const raw = (await detectSections({ transcriptLines: toLines(utterances) }))
    .filter((x) => typeof x?.title === 'string' && Number.isFinite(x.startSec) && Number.isFinite(x.endSec))
    .sort((a, b) => a.startSec - b.startSec);
  const end = audioTranscript.durationSec || utterances.at(-1)?.e || 0;
  const sections = raw.map((x, i) => ({
    title: x.title.trim().slice(0, 60),
    summary: typeof x.summary === 'string' ? x.summary.trim().slice(0, 200) : '',
    s: i === 0 ? 0 : raw[i - 1].endSec,
    e: i === raw.length - 1 ? end : x.endSec,
  }));
  return sections.filter((x) => x.e - x.s > 1);
}

// Fallback when Deepgram returns no utterance split: break words into sentence-ish lines.
function groupWordsIntoUtterances(words) {
  const out = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    const endsSentence = /[.!?]$/.test(w.w);
    if ((endsSentence && cur.length >= 6) || cur.length >= 40) {
      out.push({ text: cur.map((x) => x.w).join(' '), s: cur[0].s, e: cur.at(-1).e });
      cur = [];
    }
  }
  if (cur.length) out.push({ text: cur.map((x) => x.w).join(' '), s: cur[0].s, e: cur.at(-1).e });
  return out;
}

// Cuts [startSec, endSec] out of the master mp3 with a short fade in/out so the clip doesn't pop
// at the edges. Returns the path of the clip.
export function cutClip({ sourcePath, outputPath, startSec, endSec }) {
  const duration = Math.max(0.5, endSec - startSec);
  const fade = Math.min(0.3, duration / 4);
  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .setStartTime(startSec)
      .duration(duration)
      .audioFilters([`afade=t=in:st=0:d=${fade}`, `afade=t=out:st=${Math.max(0, duration - fade)}:d=${fade}`])
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

// Words that fall inside the clip, re-timed so 0 = the clip's first frame.
export function wordsForClip(words, startSec, endSec) {
  return words
    .filter((w) => w.w && w.w.trim() && w.e > startSec && w.s < endSec)
    .map((w) => ({ text: w.w, start: Math.max(0, w.s - startSec), end: Math.min(endSec, w.e) - startSec }));
}

// Loudness envelope of [startSec, endSec] as `buckets` values in 0..1, for drawing a waveform.
// Decoded at a low sample rate - it only has to look right, not sound right.
export function computePeaks({ sourcePath, startSec, endSec, buckets = 600 }) {
  return new Promise((resolve, reject) => {
    const sink = new PassThrough();
    const chunks = [];
    sink.on('data', (c) => chunks.push(c));
    sink.on('end', () => {
      const buf = Buffer.concat(chunks);
      const samples = Math.floor(buf.length / 2);
      if (samples === 0) return resolve(new Array(buckets).fill(0));
      const per = samples / buckets;
      const peaks = new Array(buckets).fill(0);
      for (let b = 0; b < buckets; b += 1) {
        let max = 0;
        const from = Math.floor(b * per);
        const to = Math.min(samples, Math.max(from + 1, Math.floor((b + 1) * per)));
        for (let i = from; i < to; i += 1) max = Math.max(max, Math.abs(buf.readInt16LE(i * 2)));
        peaks[b] = Math.round((max / 32768) * 1000) / 1000;
      }
      resolve(peaks);
    });
    ffmpeg(sourcePath)
      .setStartTime(startSec)
      .duration(Math.max(0.5, endSec - startSec))
      .audioChannels(1)
      .audioFrequency(4000)
      .format('s16le')
      .on('error', reject)
      .pipe(sink, { end: true });
  });
}


// Joins several [start,end] ranges of the master mp3 into one track, with each range placed at
// its own offset on the final timeline (so a title card's worth of silence can lead in, and the
// visuals can be laid out against the same numbers). `ranges[i].offsetSec` is where it starts.
// `echo` ({ fromSec, tailSec }) puts a cinematic echo/reverb "throw" on the very last word: from
// `fromSec` (on the final, sped-up timeline) the voice goes through a multi-tap echo, and the
// track is extended by `tailSec` so the repeats ring out instead of the audio just stopping.
export function buildMergedAudio({ sourcePath, outputPath, ranges, totalSec, fadeSec = 0.04, speed = 1, echo = null }) {
  const chains = ranges.map((r, i) => {
    const dur = Math.max(0.2, r.endSec - r.startSec);
    const fade = Math.min(fadeSec, dur / 4);
    const delay = Math.round(r.offsetSec * 1000);
    return (
      `[0:a]atrim=start=${r.startSec}:end=${r.endSec},asetpts=PTS-STARTPTS,aresample=44100,` +
      `aformat=channel_layouts=mono,afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, dur - fade)}:d=${fade},` +
      `adelay=${delay}[a${i}]`
    );
  });
  // amix handles a single input too; atempo changes speed without changing pitch.
  const tempo = Math.abs(speed - 1) > 0.001 ? `,atempo=${speed}` : '';
  const filters = [...chains];
  let finalLabel = 'out';
  let length = totalSec / speed;
  if (echo) {
    const from = Math.max(0, echo.fromSec).toFixed(3);
    filters.push(`${ranges.map((_, i) => `[a${i}]`).join('')}amix=inputs=${ranges.length}:normalize=0:dropout_transition=0${tempo},apad=pad_dur=${echo.tailSec},asplit=2[dryall][wetall]`);
    // Before the last word: the plain voice. From the last word on: the echoed voice, whose
    // repeats keep going into the padded silence.
    filters.push(`[dryall]volume='lt(t\\,${from})':eval=frame:precision=float[drypart]`);
    filters.push(
      `[wetall]aecho=0.92:0.9:140|300|500|760|1060|1400:0.62|0.52|0.43|0.34|0.25|0.17,lowpass=f=4600,` +
        `volume='gte(t\\,${from})':eval=frame:precision=float[wetpart]`
    );
    filters.push('[drypart][wetpart]amix=inputs=2:normalize=0:dropout_transition=0[out]');
    length += echo.tailSec;
  } else {
    filters.push(`${ranges.map((_, i) => `[a${i}]`).join('')}amix=inputs=${ranges.length}:normalize=0:dropout_transition=0${tempo}[out]`);
  }
  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .complexFilter(filters, [finalLabel])
      .duration(length)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}
