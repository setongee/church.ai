import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { UPLOADS_DIR } from '../middlewares/upload.js';
import { mixAudio, makeSilence, trackPath, listTracks } from './sounds.service.js';
import { probeMedia } from './postUpload.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Instagram's API cannot attach a song from Instagram's own music library to a post, so music is mixed into the file
// itself. The track comes from the app's music library (the built-in beds or something the team uploaded).
//  - a video keeps its own sound, with the music sitting underneath it;
//  - a picture, or a set of slides, becomes a short video (a Reel) with the music playing over it - a still post
//    cannot carry sound.

const run = (cmd, output) =>
  new Promise((resolve, reject) => {
    let stderr = '';
    cmd.on('stderr', (l) => (stderr += l + '\n')).on('end', resolve).on('error', (err) => reject(new Error(`${err.message}\n${stderr.split('\n').slice(-5).join('\n')}`)));
    if (output) cmd.save(output);
    else cmd.run();
  });

const tmp = (ext) => path.join(os.tmpdir(), `postmusic-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
const rm = (...files) => files.forEach((f) => f && fs.promises.unlink(f).catch(() => {}));

export const clampLevel = (v) => Math.min(1.5, Math.max(0.2, Number.isFinite(Number(v)) ? Number(v) : 1));

// The track's file and where playback starts, or null when it is gone (callers say so; a missing track is never silent).
async function resolveTrack(trackId) {
  const file = await trackPath(trackId);
  if (!file) return null;
  const meta = (await listTracks()).find((t) => t.id === trackId);
  return { path: file, startSec: meta?.startSec ?? 0, name: meta?.name ?? 'track', credit: meta?.credit ?? '' };
}

export async function trackInfo(trackId) {
  const t = await resolveTrack(trackId);
  return t ? { name: t.name, credit: t.credit } : null;
}

// Turns a path the app serves (/uploads/...) - or a full URL, which is downloaded - into a file on disk.
// `temp` lists files that were created here and should be deleted afterwards.
export async function localFile(urlOrPath, temp) {
  let pathname = urlOrPath;
  let remote = false;
  try {
    const u = new URL(urlOrPath, 'http://placeholder');
    remote = /^https?:/i.test(urlOrPath) && !u.pathname.startsWith('/uploads/');
    pathname = u.pathname;
  } catch {
    // keep as is
  }
  if (!remote && pathname.startsWith('/uploads/')) {
    const file = path.normalize(path.join(UPLOADS_DIR, pathname.slice('/uploads/'.length)));
    if (!file.startsWith(UPLOADS_DIR) || !fs.existsSync(file)) throw new Error('One of the files is missing. Add it again.');
    return file;
  }
  if (!remote) throw new Error('One of the files can’t be found.');
  const res = await fetch(urlOrPath);
  if (!res.ok) throw new Error('One of the pictures could not be downloaded.');
  const file = tmp(path.extname(new URL(urlOrPath).pathname) || '.jpg');
  await fs.promises.writeFile(file, Buffer.from(await res.arrayBuffer()));
  temp.push(file);
  return file;
}

// Mixes music under an existing H.264 video (its picture is copied, not re-encoded).
export async function mixMusicIntoVideo({ videoPath, outputPath, trackId, level = 1 }) {
  const track = await resolveTrack(trackId);
  if (!track) throw new Error('That music track is no longer available. Choose another.');
  const probe = await probeMedia(videoPath);
  if (!probe.hasVideo) throw new Error('That file doesn’t contain a video.');
  const totalSec = Math.max(1, probe.durationSec || 1);
  const mixed = tmp('.mp3');
  const silent = probe.hasAudio ? null : tmp('.mp3');
  try {
    const music = { path: track.path, startSec: track.startSec, level: clampLevel(level), fadeIn: 1, fadeOut: 2, duck: probe.hasAudio, build: false };
    if (silent) {
      await makeSilence(silent, totalSec);
      await mixAudio({ voicePath: silent, outputPath: mixed, totalSec, music, absoluteLufs: -16 });
    } else {
      await mixAudio({ voicePath: videoPath, outputPath: mixed, totalSec, music });
    }
    await run(ffmpeg(videoPath).input(mixed).outputOptions(['-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart']), outputPath);
  } finally {
    rm(mixed, silent);
  }
}

// One vertical video from a list of slides - `{ type: 'image' | 'video', path }` - each picture shown for `secondsPerImage`,
// each video for its own length (up to 30 s). Pictures that aren't 9:16 sit on a blurred copy of themselves. With a
// track, the music plays over the whole thing (the clips' own sound is dropped so the music is what people hear).
// Reels can run to 90 s, so the result is cut there.
export async function slideshowVideo({ slides, outputPath, trackId, level = 1, secondsPerImage = 3 }) {
  if (!slides.length) throw new Error('There is nothing to put in the video.');
  const track = trackId ? await resolveTrack(trackId) : null;
  if (trackId && !track) throw new Error('That music track is no longer available. Choose another.');
  const W = 1080;
  const H = 1920;
  const per = Math.min(10, Math.max(1, Number(secondsPerImage) || 3));

  const durations = [];
  const cmd = ffmpeg();
  for (const s of slides) {
    if (s.type === 'video') {
      const probe = await probeMedia(s.path);
      durations.push(Math.min(30, Math.max(1, probe.durationSec || per)));
      cmd.input(s.path);
    } else {
      durations.push(per);
      cmd.input(s.path).inputOptions(['-loop', '1', '-t', String(per)]);
    }
  }
  const total = Math.min(90, durations.reduce((a, b) => a + b, 0));
  const filters = [];
  slides.forEach((s, i) => {
    filters.push(
      `[${i}:v]trim=duration=${durations[i]},setpts=PTS-STARTPTS,split=2[a${i}][b${i}]`,
      `[a${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:5[bg${i}]`,
      `[b${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg${i}]`,
      `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[v${i}]`
    );
  });
  filters.push(`${slides.map((_, i) => `[v${i}]`).join('')}concat=n=${slides.length}:v=1:a=0[out]`);

  const silent = tmp('.mp3');
  const mixed = tmp('.mp3');
  const picture = tmp('.mp4');
  try {
    await run(cmd.complexFilter(filters, ['out']).outputOptions(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-t', String(total), '-an', '-movflags', '+faststart']), picture);
    if (!track) {
      fs.copyFileSync(picture, outputPath);
      return { durationSec: total };
    }
    await makeSilence(silent, total);
    await mixAudio({ voicePath: silent, outputPath: mixed, totalSec: total, music: { path: track.path, startSec: track.startSec, level: clampLevel(level), fadeIn: 1, fadeOut: 2, duck: false, build: false }, absoluteLufs: -16 });
    await run(ffmpeg(picture).input(mixed).outputOptions(['-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart']), outputPath);
    return { durationSec: total };
  } finally {
    rm(silent, mixed, picture);
  }
}
