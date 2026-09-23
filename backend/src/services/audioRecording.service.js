import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { uploadAudio } from './cloudinary.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.join(__dirname, '..', '..', 'uploads', 'recordings');
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

// Keyed by sessionId. A session is only ever streamed from one socket at a time, so this
// doesn't need to track per-socket state the way `streamHandler` does.
const activeRecordings = new Map();
// Tracks the in-flight close of a session's current segment, so `finalizeRecording` (triggered
// by the separate "End session" HTTP request) can wait for a same-moment `stream:stop` to
// actually finish flushing its file to disk instead of racing it.
const pendingCloses = new Map();

function sessionDir(sessionId) {
  return path.join(RECORDINGS_DIR, sessionId);
}

function segmentIndexOf(filename) {
  return Number(filename.match(/^segment-(\d+)\.webm$/)?.[1] ?? 0);
}

export function startRecording(sessionId) {
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  // Pausing and resuming reuses the same session, so each resume starts a new segment
  // alongside whatever earlier segments are already on disk rather than overwriting them.
  const segmentIndex = fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).length;
  const webmPath = path.join(dir, `segment-${segmentIndex}.webm`);
  const writeStream = fs.createWriteStream(webmPath);
  activeRecordings.set(sessionId, { writeStream, webmPath });
}

export function appendAudioChunk(sessionId, chunk) {
  activeRecordings.get(sessionId)?.writeStream.write(chunk);
}

// Closes out the session's current segment file without touching Cloudinary/the DB - used both
// for an actual pause (client may resume and add more segments) and, defensively, from
// `finalizeRecording` in case a segment is still open when the session ends.
async function closeCurrentSegment(sessionId) {
  const recording = activeRecordings.get(sessionId);
  if (!recording) return;
  activeRecordings.delete(sessionId);

  const { writeStream, webmPath } = recording;
  const closePromise = new Promise((resolve) => writeStream.end(resolve)).then(async () => {
    const stats = await fs.promises.stat(webmPath).catch(() => null);
    if (!stats || stats.size === 0) {
      await fs.promises.unlink(webmPath).catch(() => {});
    }
  });
  pendingCloses.set(sessionId, closePromise);
  try {
    await closePromise;
  } finally {
    pendingCloses.delete(sessionId);
  }
}

// Called when the client stops/pauses streaming (`stream:stop` or a socket disconnect). Leaves
// the segment on disk - it gets picked up and merged in `finalizeRecording` once the session
// actually ends, whether the client resumes in between or not.
export async function pauseRecording(sessionId) {
  await closeCurrentSegment(sessionId);
}

function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

// Decodes and concatenates multiple segments (each a fully independent, separately-headered
// WebM file - one per pause/resume cycle) into one continuous mp3. Uses the `concat` filter
// (not the concat demuxer) since it works on decoded audio and doesn't require the inputs to
// share container-level framing.
function mergeSegmentsToMp3(inputPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    inputPaths.forEach((p) => command.input(p));
    command
      .complexFilter([{ filter: 'concat', options: { n: inputPaths.length, v: 0, a: 1 }, outputs: 'merged' }], [
        'merged',
      ])
      .audioCodec('libmp3lame')
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

// Runs once, when the session actually ends: merges every segment recorded across the session's
// pause/resume cycles into one seamless mp3, uploads it, and cleans up local files. Returns the
// uploaded URL (or null if there was nothing to upload / the upload failed), for the caller to
// save on the session.
export async function finalizeRecording(sessionId) {
  // A same-moment `stream:stop` may still be flushing its segment to disk; wait for it, then
  // close out anything still open defensively (e.g. "End" reached here via a disconnect race).
  await pendingCloses.get(sessionId);
  await closeCurrentSegment(sessionId);

  const dir = sessionDir(sessionId);
  let segmentFiles;
  try {
    segmentFiles = (await fs.promises.readdir(dir))
      .filter((f) => f.endsWith('.webm'))
      .sort((a, b) => segmentIndexOf(a) - segmentIndexOf(b))
      .map((f) => path.join(dir, f));
  } catch {
    return null; // no recording directory for this session - nothing was ever recorded
  }

  if (segmentFiles.length === 0) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    return null;
  }

  const mp3Path = path.join(dir, 'merged.mp3');
  try {
    if (segmentFiles.length === 1) {
      await convertToMp3(segmentFiles[0], mp3Path);
    } else {
      await mergeSegmentsToMp3(segmentFiles, mp3Path);
    }
    return await uploadAudio(mp3Path, `session-${sessionId}`);
  } catch (err) {
    console.error('[audioRecording] failed to finalize recording for session', sessionId, err);
    return null;
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
