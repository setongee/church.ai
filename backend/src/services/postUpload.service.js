import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { PostUpload } from '../models/PostUpload.model.js';
import { UPLOADS_DIR } from '../middlewares/upload.js';
import { transcribeFile } from './deepgram.service.js';
import { aiIssue, callOpenRouterJSON } from './openrouter.service.js';
import { publishImageToInstagram, publishVideoToInstagram } from './instagram.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const POST_DIR = path.join(UPLOADS_DIR, 'post-uploads');
fs.mkdirSync(POST_DIR, { recursive: true });
const urlOf = (file) => `/uploads/post-uploads/${file}`;

// ffprobe isn't bundled, so read what's needed from `ffmpeg -i`: length, picture size, and whether there is any sound.
export function probeMedia(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegInstaller.path, ['-hide_banner', '-i', file]);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', () => {
      const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      const size = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(err);
      resolve({ durationSec: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0, width: size ? +size[1] : 0, height: size ? +size[2] : 0, hasAudio: /Audio:/.test(err), hasVideo: /Video:/.test(err) });
    });
    p.on('error', () => resolve({ durationSec: 0, width: 0, height: 0, hasAudio: false, hasVideo: false }));
  });
}

// `.output()` (not `.save()`, which would start the command a second time on top of this one).
const run = (cmd) => new Promise((resolve, reject) => cmd.on('end', resolve).on('error', reject).run());

// ---- the pipeline ---------------------------------------------------------------------------------

async function stage(id, text) {
  await PostUpload.updateOne({ _id: id }, { stage: text });
}

// Converts the upload so Instagram accepts it, listens to it, and writes the captions. Runs in the background; the page polls.
export async function processUpload(id, sourcePath) {
  try {
    const doc = await PostUpload.findById(id);
    if (!doc) return;
    const probe = await probeMedia(sourcePath);
    if (doc.kind === 'video' && !probe.hasVideo) throw new Error('That file doesn’t contain a video.');

    if (doc.kind === 'image') {
      await stage(id, 'Preparing the picture for Instagram…');
      const out = `${id}.jpg`;
      await run(ffmpeg(sourcePath).outputOptions(['-frames:v', '1', '-vf', "scale='min(1440,iw)':-2", '-q:v', '2']).output(path.join(POST_DIR, out)));
      await PostUpload.updateOne({ _id: id }, { mediaUrl: urlOf(out), posterUrl: urlOf(out), width: probe.width, height: probe.height });
    } else {
      await stage(id, 'Converting the video for Instagram…');
      const out = `${id}.mp4`;
      await run(
        ffmpeg(sourcePath)
          .outputOptions(['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-vf', "scale='min(1080,iw)':-2", '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart'])
          .output(path.join(POST_DIR, out))
      );
      const poster = `${id}.jpg`;
      await run(ffmpeg(path.join(POST_DIR, out)).seekInput(Math.min(1, Math.max(0, probe.durationSec / 3))).outputOptions(['-frames:v', '1', '-q:v', '3']).output(path.join(POST_DIR, poster))).catch(() => {});
      await PostUpload.updateOne({ _id: id }, { mediaUrl: urlOf(out), posterUrl: fs.existsSync(path.join(POST_DIR, poster)) ? urlOf(poster) : '', durationSec: Math.round(probe.durationSec * 10) / 10, width: probe.width, height: probe.height });

      if (probe.hasAudio) {
        await stage(id, 'Listening to the video…');
        const wav = path.join(os.tmpdir(), `post-${id}.mp3`);
        try {
          await run(ffmpeg(path.join(POST_DIR, out)).noVideo().audioChannels(1).audioFrequency(16000).audioBitrate('64k').format('mp3').output(wav));
          const { words } = await transcribeFile(await fs.promises.readFile(wav));
          await PostUpload.updateOne({ _id: id }, { transcript: words.map((w) => w.w).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim() });
        } catch (err) {
          // No speech-to-text (not set up, or it failed): carry on, the captions just work from the notes.
          console.error('[post-upload] transcription failed', err.message);
        } finally {
          fs.promises.unlink(wav).catch(() => {});
        }
      }
    }

    await stage(id, 'Writing caption ideas…');
    await generateCaptions(id);
    await PostUpload.updateOne({ _id: id }, { status: 'ready', stage: '', error: '' });
  } catch (err) {
    console.error('[post-upload] processing failed', err);
    await PostUpload.updateOne({ _id: id }, { status: 'error', stage: '', error: err.message || 'Something went wrong while preparing this.' });
  } finally {
    fs.promises.unlink(sourcePath).catch(() => {});
  }
}

// ---- captions ---------------------------------------------------------------------------------------

const CAPTION_SYSTEM = `You write Instagram captions for a church's media team. You are given what is said in a video (a transcript), any notes from the poster, and the tone they want. Write captions that make people stop scrolling, watch to the end, and engage.
Rules:
- The first line is the hook: under 90 characters, so it shows in full before "more". It must stand alone and create curiosity or name a real need - never generic ("Check this out!").
- Real, warm, conversational voice. Not corporate, not preachy, no clichés, no fake hype.
- Only say what the video actually says or what the notes say. Never invent quotes, scriptures, events, dates or names.
- End with one clear, easy ask: a reflective question, "save this for later", "send this to someone who needs it", or a soft invitation - one, not several.
- 0-2 tasteful emoji. Then a blank line and 5-8 specific hashtags (topic + faith/community), never 20 broad ones.
- If "previous" captions are given, write genuinely different angles, not rewordings.
Return ONLY JSON: {"summary": string (one plain sentence: what the video is about), "options": [ {"label": "Hook & story", "caption": string, "why": string (max 14 words: why it should work)}, {"label": "Short & punchy", "caption": string (under 220 characters before hashtags), "why": string}, {"label": "Question-led", "caption": string (opens with a question), "why": string} ]}`;

const firstSentences = (text, max) => {
  const s = text.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const parts = s.match(/[^.!?]+[.!?]+/g) ?? [s];
  let out = '';
  for (const p of parts) {
    if ((out + p).length > max) break;
    out += p;
  }
  return (out || s.slice(0, max)).trim();
};

// The built-in writer, used when the AI can't be reached: built from the transcript, so it's still on-message.
function fallbackOptions({ transcript, notes, kind }) {
  const source = transcript || notes;
  const hook = firstSentences(source, 90) || (kind === 'video' ? 'Watch this one to the end.' : 'Take a moment with this.');
  const body = firstSentences(source.slice(hook.length), 260);
  const tags = '#faith #church #hope #encouragement #sermon';
  return {
    summary: firstSentences(source, 160),
    options: [
      { label: 'Hook & story', caption: [hook, body, 'What does this stir in you? Tell us below. 👇', tags].filter(Boolean).join('\n\n'), why: 'Opens with the video’s own strongest line.' },
      { label: 'Short & punchy', caption: `${hook}\n\nSave this for later. 🔖\n\n${tags}`, why: 'Short, with a save prompt.' },
      { label: 'Question-led', caption: `Have you ever felt this?\n\n${hook}\n\nSend this to someone who needs to hear it.\n\n${tags}`, why: 'Starts with a question to draw comments.' },
    ],
  };
}

export async function generateCaptions(id, { previous = [] } = {}) {
  const doc = await PostUpload.findById(id);
  if (!doc) return;
  const input = { kind: doc.kind, transcript: doc.transcript.slice(0, 6000), notes: doc.notes, tone: doc.tone, durationSec: doc.durationSec, previous: previous.slice(0, 6) };
  let written = null;
  if (doc.transcript || doc.notes) {
    written = await callOpenRouterJSON({ system: CAPTION_SYSTEM, user: JSON.stringify(input), maxTokens: 1100, temperature: previous.length ? 0.9 : 0.7 }).catch(() => null);
  }
  const ok = Array.isArray(written?.options) && written.options.some((o) => o?.caption);
  const result = ok
    ? { summary: String(written.summary || ''), options: written.options.filter((o) => o?.caption).slice(0, 4).map((o) => ({ label: String(o.label || 'Caption').slice(0, 40), caption: String(o.caption).slice(0, 2200), why: String(o.why || '').slice(0, 120) })) }
    : fallbackOptions({ transcript: doc.transcript, notes: doc.notes, kind: doc.kind });
  doc.summary = result.summary;
  doc.options = result.options;
  doc.aiWritten = ok;
  doc.aiIssue = ok ? '' : doc.transcript || doc.notes ? (aiIssue() ?? 'unavailable') : 'nothing-to-go-on';
  // The first option becomes the caption unless the person has already written their own.
  if (!doc.caption || doc.options.some((o) => o.caption === doc.caption) || previous.includes(doc.caption)) doc.caption = result.options[0]?.caption ?? doc.caption;
  await doc.save();
}

export function removeUploadFiles(doc) {
  for (const u of [doc.mediaUrl, doc.posterUrl, doc.musicUrl]) if (u) fs.promises.unlink(path.join(POST_DIR, path.basename(u))).catch(() => {});
}

// Publishes a ready upload to the real Instagram account (a video as a Reel, a picture as a post) and records where it
// went on the upload. Shared by the "Post to Instagram" button and the content calendar's scheduler. Throws the
// Instagram errors for the caller to word.
export async function publishUploadToInstagram(doc, caption) {
  // With music added, even a picture goes out as a video: a still post can't carry sound.
  const { mediaId, permalink } = doc.musicUrl ? await publishVideoToInstagram({ videoUrl: doc.musicUrl, caption }) : doc.kind === 'video' ? await publishVideoToInstagram({ videoUrl: doc.mediaUrl, caption }) : await publishImageToInstagram({ imagePath: doc.mediaUrl, caption });
  doc.caption = caption;
  doc.instagramMediaId = mediaId;
  doc.instagramPermalink = permalink;
  doc.instagramPublishedAt = new Date();
  await doc.save();
  return doc;
}
