import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { MusicTrack } from '../models/MusicTrack.model.js';
import { localUrl } from './audioPipeline.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
export const MUSIC_DIR = path.join(UPLOADS_DIR, 'music');
fs.mkdirSync(MUSIC_DIR, { recursive: true });

// ---------------------------------------------------------------- music library
// Real recordings by Kevin MacLeod (incompetech.com), licensed CC BY 4.0: free to use, including
// commercially, provided the credit below is shown where the video is published. They are
// downloaded once on first use and cached under uploads/music.

const CC_BY = 'Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/';
const BUILTIN_MUSIC = [
  { key: 'eternal-hope', source: 'Eternal Hope', name: 'Eternal Hope', mood: 'Builds from hushed to full — for a message that climbs', startSec: 85 },
  { key: 'lightless-dawn', source: 'Lightless Dawn', name: 'Lightless Dawn', mood: 'Deep, slow and atmospheric — solemn, prayerful moments', startSec: 0 },
  { key: 'gymnopedie', source: 'Gymnopedie No 1', name: 'Gymnopédie No. 1', mood: 'Gentle solo piano — calm and reflective', startSec: 0 },
  { key: 'meditation', source: 'Meditation Impromptu 01', name: 'Meditation Impromptu', mood: 'Contemplative piano — quiet reverence', startSec: 15 },
  { key: 'healing', source: 'Healing', name: 'Healing', mood: 'Warm and flowing — comfort and restoration', startSec: 5 },
  { key: 'heroic-age', source: 'Heroic Age', name: 'Heroic Age', mood: 'Triumphant orchestral — bold declarations', startSec: 0 },
];
const credit = (d) => `${d.source} by Kevin MacLeod (incompetech.com). ${CC_BY}`;

// Every track is stored loudness-matched, so "music level" means the same thing for all of them.
const TRACK_LUFS = -23;
const MAX_TRACK_SEC = 300;

// Runs a fluent-ffmpeg command (writing to `output`, or discarding when omitted) and resolves
// with ffmpeg's stderr, which is where filters like loudnorm report their measurements.
function run(command, output) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    command.on('stderr', (l) => (stderr += l + '\n')).on('end', () => resolve(stderr)).on('error', (err) => reject(new Error(`${err.message}\n${stderr.split('\n').slice(-6).join('\n')}`)));
    if (output) command.save(output);
    else command.format('null').output('-').run();
  });
}

// Integrated loudness (LUFS) of a file, or null if it can't be measured (e.g. pure silence).
export async function measureLufs(file, maxSec = 180, prefilter = '') {
  try {
    const stderr = await run(
      ffmpeg(file).duration(maxSec).audioFilters(`${prefilter}loudnorm=I=-23:print_format=json`)
    );
    const m = /\{[\s\S]*"input_i"\s*:\s*"(-?[\d.]+|-inf|inf)"[\s\S]*?\}/.exec(stderr);
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// Re-encodes a track to stereo mp3 at the common loudness, using a plain gain change (not
// dynamic normalisation) so a crescendo stays a crescendo.
async function prepareTrack(inputPath, outputPath, maxSec = MAX_TRACK_SEC) {
  const lufs = await measureLufs(inputPath, maxSec);
  const gain = lufs === null ? 0 : Math.max(-20, Math.min(30, TRACK_LUFS - lufs));
  await run(
    ffmpeg(inputPath)
      .noVideo()
      .duration(maxSec)
      .audioFilters([`volume=${gain.toFixed(2)}dB`, 'alimiter=limit=0.9'])
      .audioChannels(2)
      .audioFrequency(44100)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3'),
    outputPath
  );
}

function builtinPath(key) {
  return path.join(MUSIC_DIR, `builtin-${key}.mp3`);
}

const inFlight = new Map();
function ensureBuiltin(def) {
  const file = builtinPath(def.key);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return Promise.resolve(file);
  if (!inFlight.has(file)) {
    const job = (async () => {
      const url = `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(def.source)}.mp3`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not download "${def.name}" (${res.status})`);
      const raw = `${file}.download`;
      await fs.promises.writeFile(raw, Buffer.from(await res.arrayBuffer()));
      try {
        await prepareTrack(raw, `${file}.tmp.mp3`);
        await fs.promises.rename(`${file}.tmp.mp3`, file);
      } finally {
        fs.promises.unlink(raw).catch(() => {});
      }
      return file;
    })().finally(() => inFlight.delete(file));
    inFlight.set(file, job);
  }
  return inFlight.get(file);
}

export async function listTracks() {
  const ready = await Promise.all(
    BUILTIN_MUSIC.map((def) =>
      ensureBuiltin(def).then(
        () => def,
        (err) => {
          console.error('[sounds] built-in track unavailable:', err.message);
          return null;
        }
      )
    )
  );
  const custom = await MusicTrack.find().sort({ createdAt: -1 }).lean();
  return [
    ...ready.filter(Boolean).map((d) => ({
      id: `builtin:${d.key}`, name: d.name, description: d.mood, builtin: true, startSec: d.startSec, credit: credit(d),
      url: localUrl('music', `builtin-${d.key}.mp3`),
    })),
    ...custom.map((t) => ({ id: t._id.toString(), name: t.name, description: 'Uploaded', builtin: false, startSec: 0, credit: '', url: localUrl('music', t.filename) })),
  ];
}

// File path of a track id, or null when there is none / it was deleted (a missing track just
// means "no music" - it must never break a render).
export async function trackPath(id) {
  if (!id) return null;
  if (id.startsWith('builtin:')) {
    const def = BUILTIN_MUSIC.find((d) => `builtin:${d.key}` === id);
    return def ? ensureBuiltin(def).catch(() => null) : null;
  }
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await MusicTrack.findById(id).lean();
  const file = doc && path.join(MUSIC_DIR, doc.filename);
  return file && fs.existsSync(file) ? file : null;
}

export async function saveUploadedTrack(name, uploadedPath) {
  const doc = await MusicTrack.create({ name, filename: 'pending' });
  const filename = `${doc._id}.mp3`;
  try {
    await prepareTrack(uploadedPath, path.join(MUSIC_DIR, filename), 900);
  } catch (err) {
    await doc.deleteOne();
    throw err;
  }
  doc.filename = filename;
  await doc.save();
  return doc;
}

export async function deleteTrack(id) {
  const doc = mongoose.isValidObjectId(id) ? await MusicTrack.findById(id) : null;
  if (!doc) return false;
  fs.promises.unlink(path.join(MUSIC_DIR, doc.filename)).catch(() => {});
  await doc.deleteOne();
  return true;
}

// ---------------------------------------------------------------- mixing

// How far below the voice the music sits at 100% level, and how much it dips while speech plays.
export const MUSIC_BELOW_VOICE_DB = 6;
const VOICE_TO_STEREO = 'aformat=channel_layouts=mono,pan=stereo|c0=c0|c1=c0';

// Mixes background music under the voice into one mp3.
//  - Music level is RELATIVE to the voice (measured), so it is audible whatever the recording
//    level: at 100% it sits ~6 dB under the speaker, at 150% about 2 dB under.
//  - It loops to cover the video, starts `startSec` into the track, fades in/out, and with
//    `build` swells from about half to full level across the video (a gentle crescendo).
//  - With `duck` it dips ~3-5 dB while the speaker talks and comes back up in the pauses.
// `stem: 'music'` outputs only the music as mixed (used to verify levels).
export async function mixAudio({ voicePath, outputPath, totalSec, music, stem, absoluteLufs }) {
  // Measure the voice the way it is heard in the mix: folded to mono then sent to both speakers,
  // which counts ~3 dB louder than the mono file on its own. (With no voice at all - photo reels -
  // the music is set to an absolute loudness instead.)
  const voiceLufs = absoluteLufs !== undefined ? absoluteLufs + MUSIC_BELOW_VOICE_DB : (await measureLufs(voicePath, 120, `${VOICE_TO_STEREO},`)) ?? -17;
  const level = Math.max(0.0001, music.level);
  const gainDb = Math.max(-40, Math.min(24, voiceLufs - MUSIC_BELOW_VOICE_DB - TRACK_LUFS + 20 * Math.log10(level)));
  const fi = Math.min(music.fadeIn, totalSec / 2);
  const fo = Math.min(music.fadeOut, totalSec / 2);
  const T = Math.max(1, totalSec);

  const command = ffmpeg(voicePath).input(music.path).inputOptions(['-stream_loop', '-1']);
  const swell = music.build ? `,volume='0.55+0.45*pow(min(t/${T.toFixed(2)}\\,1)\\,1.2)':eval=frame:precision=float` : '';
  const filters = [
    // Voice is spoken word: fold to mono and duplicate to both channels (a plain mono->stereo
    // conversion would drop it 3 dB against the music).
    // Padded to the full length: the ducking filter ends when its control (the voice) ends, which
    // would cut the music off at the last word instead of letting it play through the closing card.
    `[0:a]aresample=44100,${VOICE_TO_STEREO},apad=whole_dur=${totalSec.toFixed(3)}[vo]`,
    `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start=${music.startSec}:end=${music.startSec + totalSec},asetpts=PTS-STARTPTS,` +
      `volume=${gainDb.toFixed(2)}dB:precision=float${swell},afade=t=in:st=0:d=${fi},afade=t=out:st=${Math.max(0, totalSec - fo)}:d=${fo}[mus]`,
  ];
  let mixList;
  if (music.duck) {
    const key = stem === 'music' ? '[vo]' : '[vo2]';
    if (stem !== 'music') filters.push('[vo]asplit=2[vo1][vo2]');
    filters.push(`[mus]${key}sidechaincompress=threshold=0.18:ratio=2:attack=80:release=900[musd]`);
    mixList = stem === 'music' ? '[musd]' : '[vo1][musd]';
  } else {
    if (stem === 'music') filters.push('[vo]anullsink');
    mixList = stem === 'music' ? '[mus]' : '[vo][mus]';
  }
  filters.push(
    stem === 'music'
      ? `${mixList}anull[out]`
      : `${mixList}amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.95[out]`
  );

  await run(
    command
      .complexFilter(filters, ['out'])
      .duration(totalSec)
      .audioCodec('libmp3lame')
      .audioBitrate('160k')
      .format('mp3'),
    outputPath
  );
  return { outputPath, voiceLufs, gainDb };
}

// A silent audio file of the given length (the "voice" of a photo reel, which has none).
export async function makeSilence(outputPath, seconds) {
  await run(
    ffmpeg()
      .input('anullsrc=r=44100:cl=mono')
      .inputFormat('lavfi')
      .duration(seconds)
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .format('mp3'),
    outputPath
  );
  return outputPath;
}

// ---------------------------------------------------------------- paper writing

// Soft pencil-on-paper scratching, one burst per `windows` [startSec, endSec] pair - the
// Handwritten template's pen. It is laid under `basePath` (the voice, or the voice + music) at a
// level relative to the measured voice: volume 1 sits ~14 dB under the speaker, 2 about 8 dB.
export async function overlayWriting({ basePath, outputPath, windows, totalSec, volume = 1, voicePath }) {
  const spans = windows.filter(([a, b]) => b > a && a < totalSec).slice(0, 400);
  if (!spans.length || volume <= 0) return null;
  const gate = spans.map(([a, b]) => `between(t\\,${a.toFixed(3)}\\,${Math.min(b, totalSec).toFixed(3)})`).join('+');
  const raw = `${outputPath}.raw.mp3`;
  // Band-limited noise with a fast tremolo (the stroke-stroke-stroke rhythm of a pen), gated to
  // the words. Fixed level here; the real level is set below once the voice is measured.
  const scratch = [
    'highpass=f=1700', 'lowpass=f=7500', 'tremolo=f=17:d=0.55', 'tremolo=f=5.5:d=0.35',
    `volume='min(1\\,${gate})':eval=frame`, 'afade=t=in:st=0:d=0.01',
  ].join(',');
  try {
    await run(
      ffmpeg()
        .input(`anoisesrc=color=white:amplitude=0.6:sample_rate=44100:duration=${totalSec.toFixed(2)}`)
        .inputFormat('lavfi')
        .audioFilters(scratch)
        .audioChannels(2)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .format('mp3'),
      raw
    );
    const voiceLufs = (await measureLufs(voicePath ?? basePath, 120)) ?? -17;
    const rawLufs = await measureLufs(raw, Math.ceil(totalSec));
    const gainDb = rawLufs === null ? -30 : Math.max(-50, Math.min(10, voiceLufs - 14 - rawLufs + 20 * Math.log10(volume)));
    await run(
      ffmpeg(basePath)
        .input(raw)
        .complexFilter([
          '[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[b]',
          `[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${gainDb.toFixed(2)}dB:precision=float[w]`,
          '[b][w]amix=inputs=2:normalize=0:duration=first:dropout_transition=0,alimiter=limit=0.95[out]',
        ], ['out'])
        .audioCodec('libmp3lame')
        .audioBitrate('160k')
        .format('mp3'),
      outputPath
    );
    return { outputPath, gainDb };
  } finally {
    fs.promises.unlink(raw).catch(() => {});
  }
}
