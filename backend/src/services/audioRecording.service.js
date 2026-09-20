import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Session } from '../models/Session.model.js';
import { uploadAudio } from './cloudinary.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.join(__dirname, '..', '..', 'uploads', 'recordings');
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

// Keyed by sessionId. A session is only ever streamed from one socket at a time, so this
// doesn't need to track per-socket state the way `streamHandler` does.
const activeRecordings = new Map();

export function startRecording(sessionId) {
  const webmPath = path.join(RECORDINGS_DIR, `${sessionId}-${Date.now()}.webm`);
  const writeStream = fs.createWriteStream(webmPath);
  activeRecordings.set(sessionId, { writeStream, webmPath });
}

export function appendAudioChunk(sessionId, chunk) {
  activeRecordings.get(sessionId)?.writeStream.write(chunk);
}

// Closes out the raw recording, transcodes it to mp3, uploads it to Cloudinary, and saves the
// resulting URL on the session. Runs after the client has already stopped streaming, so failures
// here are logged rather than surfaced to the client - there's no one left listening.
export async function finishRecording(sessionId) {
  const recording = activeRecordings.get(sessionId);
  if (!recording) return;
  activeRecordings.delete(sessionId);

  const { writeStream, webmPath } = recording;
  await new Promise((resolve) => writeStream.end(resolve));

  const stats = await fs.promises.stat(webmPath).catch(() => null);
  if (!stats || stats.size === 0) {
    await fs.promises.unlink(webmPath).catch(() => {});
    return;
  }

  const mp3Path = webmPath.replace(/\.webm$/, '.mp3');
  try {
    await convertToMp3(webmPath, mp3Path);
    const audioUrl = await uploadAudio(mp3Path, `session-${sessionId}`);
    if (audioUrl) {
      await Session.findByIdAndUpdate(sessionId, { audioUrl });
    }
  } catch (err) {
    console.error('[audioRecording] failed to process recording for session', sessionId, err);
  } finally {
    await fs.promises.unlink(webmPath).catch(() => {});
    await fs.promises.unlink(mp3Path).catch(() => {});
  }
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
