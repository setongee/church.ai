import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Reel } from '../models/Reel.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { Session } from '../models/Session.model.js';
import { AudioTranscript } from '../models/AudioTranscript.model.js';
import { ensureLocalAudio, localUrl, PREVIEWS_DIR } from '../services/audioPipeline.service.js';
import { buildVoice, musicSettings, planCompilation, planReel, videoTiming } from '../services/reelRender.service.js';
import { sanitizeOptions } from '../services/reelOptions.service.js';
import { mixAudio } from '../services/sounds.service.js';

const PREVIEW_SEC = 30;

// A short, real mix (the first ~30 seconds of the voice with the chosen music under it) built
// from the options currently on screen - so the music can be judged by ear before committing to
// a full video render.
export async function audioPreview(req, res) {
  const { reelId, compilationId } = req.body || {};
  const item = reelId ? await Reel.findById(reelId) : compilationId ? await Compilation.findById(compilationId) : null;
  if (!item) return res.status(404).json({ error: 'Nothing to preview.' });
  const session = await Session.findById(item.session);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const options = sanitizeOptions(req.body.options ?? {}, item.options);
  const music = await musicSettings(options);
  if (!music) return res.status(400).json({ error: 'Pick a music track first.' });

  const source = await ensureLocalAudio(session);
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify({ id: String(item._id), music: options.music, pace: options.pace, outro: options.outro, range: reelId ? [item.startSec, item.endSec] : item.segments.map((s) => [s.startSec, s.endSec]) }))
    .digest('hex')
    .slice(0, 16);
  const out = path.join(PREVIEWS_DIR, `${key}.mp3`);
  if (!fs.existsSync(out)) {
    const voice = path.join(PREVIEWS_DIR, `${key}-voice.mp3`);
    const transcript = await AudioTranscript.findOne({ session: item.session });
    if (!transcript) return res.status(400).json({ error: 'This session has no word-level transcript yet.' });
    const plan = reelId ? planReel(item, transcript, options) : planCompilation(item, transcript, options).plan;
    const timing = videoTiming(plan, options);
    const total = Math.min(PREVIEW_SEC, timing.totalSec);
    await buildVoice({ source, outputPath: voice, plan, echoTail: timing.echoTail });
    try {
      await mixAudio({ voicePath: voice, outputPath: out, totalSec: total, music });
    } finally {
      fs.promises.unlink(voice).catch(() => {});
    }
  }
  res.json({ url: localUrl('previews', `${key}.mp3`) });
}
