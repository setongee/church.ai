import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { TeamRoom, RoomMember } from '../models/TeamRoom.model.js';
import { UPLOADS_DIR } from '../middlewares/upload.js';
import { probeMedia } from '../services/postUpload.service.js';
import { postMessage } from './chat.controller.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const VOICE_DIR = path.join(UPLOADS_DIR, 'chat-voice');
const MAX_SECONDS = 180;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// Browsers record WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari); both stream to a temp file first.
export const voiceUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir(), filename: (req, file, cb) => cb(null, `voice-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname) || '.webm'}`) }),
  fileFilter: (req, file, cb) => (file.mimetype.startsWith('audio/') || /^video\/(webm|mp4)$/.test(file.mimetype) ? cb(null, true) : cb(bad('Only audio can be sent as a voice note.'))),
  limits: { fileSize: 8 * 1024 * 1024 },
}).single('audio');

// (.output() + .run(): .save() already runs the command.)
const run = (cmd) => new Promise((resolve, reject) => cmd.on('end', resolve).on('error', reject).run());
const quiet = (p) => fs.promises.unlink(p).catch(() => {});

// Deleting a voice message deletes its file (only ever inside the chat-voice folder).
export function removeVoiceFile(audioUrl) {
  const name = path.basename(String(audioUrl || ''));
  if (name && /\.m4a$/i.test(name)) void quiet(path.join(VOICE_DIR, name));
}

// POST /api/chat/rooms/:id/voice  (multipart: audio) - converted to AAC .m4a so every phone and browser can play it.
export async function sendVoice(req, res) {
  const tmp = req.file?.path;
  try {
    const room = await TeamRoom.findById(req.params.id);
    if (!room) throw bad('Room not found.', 404);
    if (!(await RoomMember.exists({ room: room._id, user: req.user._id }))) throw bad('Join this room first.', 403);
    if (!tmp) throw bad('No recording came through.');
    await fs.promises.mkdir(VOICE_DIR, { recursive: true });
    const name = `${crypto.randomBytes(10).toString('hex')}.m4a`;
    const out = path.join(VOICE_DIR, name);
    // Convert first and measure the result: browsers' live WebM recordings carry no length in their header.
    try {
      await run(ffmpeg(tmp).noVideo().audioCodec('aac').audioBitrate('48k').audioChannels(1).audioFrequency(32000).format('mp4').outputOptions(['-movflags', '+faststart']).output(out));
    } catch {
      await quiet(out);
      throw bad('That recording couldn’t be read. Try recording again.');
    }
    const { durationSec } = await probeMedia(out);
    if (!(durationSec > 0.4)) {
      await quiet(out);
      throw bad('That recording was empty.');
    }
    if (durationSec > MAX_SECONDS + 5) {
      await quiet(out);
      throw bad('Voice notes can be up to 3 minutes.');
    }
    const msg = await postMessage(room, req.user, { kind: 'voice', audioUrl: `/uploads/chat-voice/${name}`, audioDur: Math.round(durationSec * 10) / 10 });
    res.status(201).json(msg);
  } finally {
    if (tmp) await quiet(tmp);
  }
}
