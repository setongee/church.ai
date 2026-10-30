import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { Reel } from '../models/Reel.model.js';
import { Compilation } from '../models/Compilation.model.js';
import { PhotoReel } from '../models/PhotoReel.model.js';
import { DesignAnimation } from '../models/DesignAnimation.model.js';
import { Session } from '../models/Session.model.js';
import { AudioTranscript } from '../models/AudioTranscript.model.js';
import {
  CLIPS_DIR,
  PREVIEWS_DIR,
  REELS_DIR,
  buildMergedAudio,
  ensureLocalAudio,
  localUrl,
} from './audioPipeline.service.js';
import { resolveTheme } from './templates.service.js';
import { OUTRO_STYLES, applyOptions, withDefaults } from './reelOptions.service.js';
import { planTimeline } from './timelinePlan.service.js';
import { makeSilence, mixAudio, overlayWriting, trackPath } from './sounds.service.js';
import { CAROUSEL_DIR, removeStoredFile } from './photoStore.service.js';
import { PHOTO_TEMPLATES, DEFAULT_PHOTO_TEMPLATE } from '../../remotion/photoTemplates.js';
import { normaliseTheme, writingWindows } from '../../remotion/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = path.join(__dirname, '..', '..', 'remotion');
const FPS = 30;

// Changes whenever a composition/template file is edited, so a stale bundle (or a cached
// preview drawn by older template code) is never reused.
function remotionVersion() {
  return fs
    .readdirSync(REMOTION_DIR)
    .filter((f) => /\.(jsx?|tsx?)$/.test(f))
    .reduce((max, f) => Math.max(max, fs.statSync(path.join(REMOTION_DIR, f)).mtimeMs), 0);
}

// Webpack-bundling the compositions takes several seconds, so do it once and reuse it for every
// render until the composition code changes. A failed attempt isn't cached, so the next render
// retries.
let bundleCache = null; // { version, promise }
function getBundle() {
  const version = remotionVersion();
  if (!bundleCache || bundleCache.version !== version) {
    const promise = bundle({
      entryPoint: path.join(REMOTION_DIR, 'index.jsx'),
      publicDir: path.join(REMOTION_DIR, 'public'),
    }).catch((err) => {
      if (bundleCache?.promise === promise) bundleCache = null;
      throw err;
    });
    bundleCache = { version, promise };
  }
  return bundleCache.promise;
}

const MODELS = { reel: Reel, compilation: Compilation, photo: PhotoReel, animation: DesignAnimation };

// Chrome-based rendering is CPU/RAM heavy, so video renders run strictly one at a time; the
// rest wait as "queued" in the DB. State lives in Mongo (not just memory) so the UI can poll it.
const queue = [];
let running = false;

export function enqueueRender(type, id) {
  queue.push({ type, id });
  pump();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const { type, id } = queue.shift();
      try {
        await (type === 'reel' ? renderReel(id) : type === 'photo' ? renderPhotoReel(id) : type === 'animation' ? renderDesignAnimation(id) : type === 'carousel' ? renderCarouselVideos(id) : renderCompilation(id));
      } catch (err) {
        console.error(`[reelRender] ${type} ${id} failed`, err);
        await (type === 'carousel'
          ? PhotoReel.findByIdAndUpdate(id, { 'carousel.status': 'error', 'carousel.error': err.message || 'Render failed' })
          : MODELS[type].findByIdAndUpdate(id, { status: 'error', error: err.message || 'Render failed' }));
      }
    }
  } finally {
    running = false;
  }
}

// A restart kills any in-flight render, leaving its item stuck on queued/rendering forever.
export async function recoverInterruptedReels() {
  for (const Model of Object.values(MODELS)) {
    await Model.updateMany(
      { status: { $in: ['queued', 'rendering'] } },
      { status: 'error', error: 'Render was interrupted by a server restart. Please render it again.' }
    );
  }
  await PhotoReel.updateMany(
    { 'carousel.status': { $in: ['queued', 'rendering'] } },
    { 'carousel.status': 'error', 'carousel.error': 'Render was interrupted by a server restart. Please render it again.' }
  );
}

function progressReporter(Model, id) {
  let last = -1;
  return ({ progress }) => {
    const pct = Math.floor(progress * 100);
    // Only write when the whole percent changes - progress fires every frame.
    if (pct !== last) {
      last = pct;
      Model.findByIdAndUpdate(id, { progress: pct }).catch(() => {});
    }
  };
}

function removeOld(dir, url) {
  if (!url) return;
  fs.promises.unlink(path.join(dir, path.basename(new URL(url, 'http://x').pathname))).catch(() => {});
}

const frames = (sec) => Math.max(1, Math.round(sec * FPS));

// Builds the final track for a video: just the voice when no music is chosen, otherwise the
// voice with the background music mixed under it. Returns the URL to play.
export async function musicSettings(options) {
  const o = withDefaults(options);
  const file = o.music.trackId ? await trackPath(o.music.trackId) : null;
  return file && { path: file, level: o.music.volume, fadeIn: o.music.fadeIn, fadeOut: o.music.fadeOut, startSec: o.music.startSec, duck: o.music.duck, build: o.music.build };
}

// `pen` (optional): { windows } - when the Handwritten pen is moving - adds paper-scratching
// under everything else, at the level set in the video's options.
async function buildPlayback({ id, voicePath, voiceUrl, totalSec, options, pen }) {
  const music = await musicSettings(options);
  const writing = withDefaults(options).writing;
  const usePen = pen && writing.enabled && writing.volume > 0 && pen.windows.length > 0;
  if (!music && !usePen) return voiceUrl;
  let basePath = voicePath;
  let tmp = null;
  if (music) {
    tmp = path.join(CLIPS_DIR, `${id}-mix-${Date.now()}.mp3`);
    await mixAudio({ voicePath, outputPath: tmp, totalSec, music });
    basePath = tmp;
  }
  if (usePen) {
    const name = `${id}-mix-${Date.now()}-pen.mp3`;
    const done = await overlayWriting({ basePath, outputPath: path.join(CLIPS_DIR, name), windows: pen.windows, totalSec, volume: writing.volume, voicePath });
    if (tmp) fs.promises.unlink(tmp).catch(() => {});
    if (done) return localUrl('clips', name);
    if (tmp) return localUrl('clips', path.basename(tmp));
    return voiceUrl;
  }
  return localUrl('clips', path.basename(tmp));
}

// The moments the pen scratches: only the Handwritten layout writes on screen.
function penFor({ theme, options, plan, headlines }) {
  if (theme.layout !== 'handwriting') return null;
  const hide = withDefaults(options).show.showHeadline === false || theme.showHeadline === false;
  const windows = [];
  for (const h of headlines) for (const [a, b] of writingWindows({ headline: h.text, showHeadline: !hide })) windows.push([a + h.at, b + h.at]);
  windows.push(...writingWindows({ headline: '', words: plan.words }));
  return { windows };
}

// ---- timeline plans (speed + pause cutting + sentence finishing) -----------------------------

const ECHO_TAIL_SEC = 1.6;

export function planReel(reel, transcript, options) {
  return planTimeline([{ startSec: reel.startSec, endSec: reel.endSec }], transcript.words, withDefaults(options).pace);
}

// Plan for a merged video: every clip back to back on one timeline (no cards, no gaps).
export function planCompilation(comp, transcript, options) {
  const segments = comp.segments.map((s) => (typeof s.toObject === 'function' ? s.toObject() : s));
  const plan = planTimeline(segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec })), transcript.words, withDefaults(options ?? comp.options).pace);
  return { plan, segments };
}

// How the finished video is laid out in time: the speech (plus an echo that rings out after the
// last word), then the closing card. `contentSec` is what the main scene runs for.
export function videoTiming(plan, options) {
  const o = withDefaults(options);
  const echoTail = o.pace.echo ? ECHO_TAIL_SEC : 0;
  const contentSec = plan.totalSec + (echoTail ? 1.1 : 0.5);
  const outroSec = o.outro.enabled ? o.outro.seconds : 0;
  return { echoTail, contentSec, outroSec, totalSec: contentSec + outroSec };
}

// Cuts and joins the planned pieces of the master recording into the video's voice track, with
// the echo throw on the last word when enabled.
export async function buildVoice({ source, outputPath, plan, echoTail = 0 }) {
  await buildMergedAudio({
    sourcePath: source,
    outputPath,
    ranges: plan.pieces,
    totalSec: plan.rawSec,
    speed: plan.speed,
    echo: echoTail ? { fromSec: plan.lastWordStart, tailSec: echoTail } : null,
  });
}

// The props a single reel is drawn with. Shared by the real render and by previews, so a
// preview is exactly what the render will produce.
function reelProps({ reel, session, total, theme, brand, options, plan, audioSrc, mixSrc }) {
  const applied = applyOptions({ theme, brand, session, options });
  const timing = videoTiming(plan, options);
  return {
    theme: applied.theme,
    headline: reel.headline,
    pointNumber: reel.order,
    totalPoints: total,
    speaker: applied.texts.speaker,
    serviceTitle: applied.texts.serviceTitle,
    churchName: applied.texts.churchName,
    logoUrl: brand.logoUrl,
    sizes: applied.sizes,
    durationSec: timing.contentSec,
    outro: applied.outro,
    outroSec: timing.outroSec,
    audioSrc,
    mixSrc,
    words: plan.words,
  };
}

async function renderReel(reelId) {
  const reel = await Reel.findById(reelId);
  if (!reel) return;
  const session = await Session.findById(reel.session).populate('service');
  const transcript = await AudioTranscript.findOne({ session: reel.session });
  if (!session || !transcript) throw new Error('Session audio or transcript is missing.');

  await Reel.findByIdAndUpdate(reelId, { status: 'rendering', progress: 0, error: null });

  // 1. Build the voice: this point's audio, sentence finished, long pauses cut, at the chosen speed.
  const source = await ensureLocalAudio(session);
  const plan = planReel(reel, transcript, reel.options);
  const timing = videoTiming(plan, reel.options);
  const clipName = `${reelId}.mp3`;
  const voicePath = path.join(CLIPS_DIR, clipName);
  await buildVoice({ source, outputPath: voicePath, plan, echoTail: timing.echoTail });
  const clipUrl = localUrl('clips', clipName);

  // 2. Mix in background music (it keeps playing through the closing card).
  const { theme, brand } = await resolveTheme({ templateId: reel.template });
  const oldMix = reel.mixUrl;
  const mixUrl = await buildPlayback({ id: reelId, voicePath, voiceUrl: clipUrl, totalSec: timing.totalSec, options: reel.options, pen: penFor({ theme, options: reel.options, plan, headlines: [{ text: reel.headline, at: 0 }] }) });

  // 3. Render the composition.
  await ensureBrowser();
  const serveUrl = await getBundle();
  const total = await Reel.countDocuments({ session: reel.session });
  const inputProps = reelProps({ reel, session, total, theme, brand, options: reel.options, plan, audioSrc: clipUrl, mixSrc: mixUrl });

  const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps });
  const videoName = `${reelId}-${Date.now()}.mp4`;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 20,
    inputProps,
    outputLocation: path.join(REELS_DIR, videoName),
    onProgress: progressReporter(Reel, reelId),
  });

  // Re-renders get a fresh filename so browsers and Instagram never see a stale cached file.
  removeOld(REELS_DIR, reel.videoUrl);
  removeOld(CLIPS_DIR, oldMix);
  await Reel.findByIdAndUpdate(reelId, {
    status: 'done',
    progress: 100,
    clipUrl,
    mixUrl: mixUrl === clipUrl ? undefined : mixUrl,
    videoUrl: localUrl('reels', videoName),
    durationSec: timing.totalSec,
    renderedAt: new Date(),
  });
}

function compilationProps({ comp, session, theme, brand, planned, audioSrc, mixSrc }) {
  const { plan, segments } = planned;
  const applied = applyOptions({ theme, brand, session, options: comp.options });
  const timing = videoTiming(plan, comp.options);
  return {
    theme: applied.theme,
    title: comp.title,
    speaker: applied.texts.speaker,
    serviceTitle: applied.texts.serviceTitle,
    churchName: applied.texts.churchName,
    logoUrl: brand.logoUrl,
    sizes: applied.sizes,
    audioSrc,
    mixSrc,
    totalFrames: frames(timing.contentSec),
    outro: applied.outro,
    outroSec: timing.outroSec,
    words: plan.words,
    segments: segments.map((s, i) => {
      const start = frames(plan.starts[i]);
      const end = i < segments.length - 1 ? frames(plan.starts[i + 1]) : frames(timing.contentSec);
      return { headline: s.headline, startFrame: start, frames: end - start };
    }),
  };
}

async function renderCompilation(id) {
  const comp = await Compilation.findById(id);
  if (!comp) return;
  if (comp.segments.length === 0) throw new Error('Add at least one clip before rendering.');
  const session = await Session.findById(comp.session).populate('service');
  const transcript = await AudioTranscript.findOne({ session: comp.session });
  if (!session || !transcript) throw new Error('Session audio or transcript is missing.');

  await Compilation.findByIdAndUpdate(id, { status: 'rendering', progress: 0, error: null });

  const planned = planCompilation(comp, transcript);
  const timing = videoTiming(planned.plan, comp.options);
  const source = await ensureLocalAudio(session);
  const voiceName = `${id}-voice.mp3`;
  const voicePath = path.join(CLIPS_DIR, voiceName);
  await buildVoice({ source, outputPath: voicePath, plan: planned.plan, echoTail: timing.echoTail });
  const voiceUrl = localUrl('clips', voiceName);

  const { theme, brand } = await resolveTheme({ templateId: comp.template });
  const oldMix = comp.mixUrl;
  const mixUrl = await buildPlayback({ id, voicePath, voiceUrl, totalSec: timing.totalSec, options: comp.options, pen: penFor({ theme, options: comp.options, plan: planned.plan, headlines: planned.segments.map((sg, i) => ({ text: sg.headline, at: planned.plan.starts[i] })) }) });

  await ensureBrowser();
  const serveUrl = await getBundle();
  const inputProps = compilationProps({ comp, session, theme, brand, planned, audioSrc: voiceUrl, mixSrc: mixUrl });

  const composition = await selectComposition({ serveUrl, id: 'Compilation', inputProps });
  const videoName = `${id}-${Date.now()}.mp4`;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 20,
    inputProps,
    outputLocation: path.join(REELS_DIR, videoName),
    onProgress: progressReporter(Compilation, id),
  });

  removeOld(REELS_DIR, comp.videoUrl);
  removeOld(CLIPS_DIR, oldMix);
  await Compilation.findByIdAndUpdate(id, {
    status: 'done',
    progress: 100,
    mixUrl: mixUrl === voiceUrl ? undefined : mixUrl,
    videoUrl: localUrl('reels', videoName),
    durationSec: timing.totalSec,
    renderedAt: new Date(),
  });
}

// Words shown in template previews when there is no real reel to draw from. Timed to land
// mid-phrase at the preview frame.
const SAMPLE_TEXT = 'Faith is not the absence of fear. It is choosing to move forward while fear is still in the room.'.split(' ');
const SAMPLE_WORDS = SAMPLE_TEXT.map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.28 }));

// One PNG of what the template looks like, cached on disk by a hash of everything that affects
// it (so a re-preview of unchanged settings is instant and an edit always gets a fresh frame).
// Each still launches its own Chrome, so previews (a picker can ask for several at once) take
// turns instead of stampeding the machine.
let previewChain = Promise.resolve();
export function renderTemplatePreview(args) {
  const run = previewChain.then(() => renderTemplatePreviewNow(args));
  previewChain = run.catch(() => {});
  return run;
}

async function renderTemplatePreviewNow({ templateId, theme: inlineTheme, reelId, compilationId, options: optionsOverride, atSec = 2.4 }) {
  const { theme, brand } = await resolveTheme({ templateId, theme: inlineTheme });
  const fakeSession = { title: 'Sunday Service', preacher: 'Pastor Name', service: { name: 'Sunday Worship Service' } };

  let compositionId = 'Reel';
  let inputProps;

  if (compilationId) {
    const comp = await Compilation.findById(compilationId);
    const session = comp && (await Session.findById(comp.session).populate('service'));
    const transcript = comp && (await AudioTranscript.findOne({ session: comp.session }));
    if (comp && session && transcript) {
      compositionId = 'Compilation';
      const merged = { title: comp.title, segments: comp.segments, options: optionsOverride ?? comp.options };
      inputProps = compilationProps({ comp: merged, session, theme, brand, planned: planCompilation(merged, transcript), audioSrc: '', mixSrc: '' });
    }
  }
  if (!inputProps && reelId) {
    const reel = await Reel.findById(reelId);
    const session = reel && (await Session.findById(reel.session).populate('service'));
    const transcript = reel && (await AudioTranscript.findOne({ session: reel.session }));
    if (reel && session && transcript) {
      const options = optionsOverride ?? reel.options;
      inputProps = reelProps({
        reel, session, theme, brand, options,
        total: await Reel.countDocuments({ session: reel.session }),
        plan: planReel(reel, transcript, options),
        audioSrc: '', mixSrc: '',
      });
    }
  }
  if (!inputProps) {
    const sampleReel = { headline: 'Waiting Is Not Wasted', order: 1 };
    inputProps = reelProps({
      reel: sampleReel, session: fakeSession, total: 5, theme, brand, options: optionsOverride,
      plan: { totalSec: 12, words: SAMPLE_WORDS }, audioSrc: '', mixSrc: '',
    });
  }

  const hash = crypto.createHash('sha1').update(JSON.stringify({ inputProps, atSec, v: remotionVersion() })).digest('hex').slice(0, 16);
  const file = `${hash}.png`;
  const out = path.join(PREVIEWS_DIR, file);
  if (!fs.existsSync(out)) {
    await ensureBrowser();
    const serveUrl = await getBundle();
    const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
    await renderStill({
      composition,
      serveUrl,
      inputProps,
      output: out,
      frame: Math.min(composition.durationInFrames - 1, Math.round(atSec * FPS)),
    });
  }
  return localUrl('previews', file);
}


// Thumbnails of every closing-card design, filled with the user's own text/colours/brand. They
// share one browser and are cached on disk by what they contain.
export async function renderOutroPreviews({ templateId, options }) {
  const { theme, brand } = await resolveTheme({ templateId });
  const fakeSession = { title: 'Sunday Service', preacher: '', service: { name: 'Sunday Worship Service' } };
  await ensureBrowser();
  const serveUrl = await getBundle();
  const browser = await openBrowser('chrome');
  try {
    const out = [];
    for (const st of OUTRO_STYLES) {
      const opts = withDefaults({ ...(options || {}), outro: { ...withDefaults(options).outro, style: st.id, enabled: true } });
      const applied = applyOptions({ theme, brand, session: fakeSession, options: opts });
      const inputProps = { theme: applied.theme, outro: applied.outro, sizes: applied.sizes };
      const hash = crypto.createHash('sha1').update(JSON.stringify({ inputProps, v: remotionVersion(), o: 3 })).digest('hex').slice(0, 16);
      const file = `${hash}.png`;
      const dest = path.join(PREVIEWS_DIR, file);
      if (!fs.existsSync(dest)) {
        const composition = await selectComposition({ serveUrl, id: 'OutroPreview', inputProps, puppeteerInstance: browser });
        await renderStill({ composition, serveUrl, inputProps, output: dest, frame: 0, puppeteerInstance: browser });
      }
      out.push({ id: st.id, label: st.label, url: localUrl('previews', file) });
    }
    return out;
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}

let outroChain = Promise.resolve();
export function queueOutroPreviews(args) {
  const run = outroChain.then(() => renderOutroPreviews(args));
  outroChain = run.catch(() => {});
  return run;
}

// ==================================================================================== photo reels

const HEX = /^#[0-9a-f]{6}$/i;

// The template's palette with any colours the user picked laid over it.
export function photoPalette(doc) {
  const base = (PHOTO_TEMPLATES.find((t) => t.id === doc.template) ?? PHOTO_TEMPLATES.find((t) => t.id === DEFAULT_PHOTO_TEMPLATE)).palette;
  const c = doc.colors || {};
  return {
    ...base,
    ...(HEX.test(c.accent || '') && { accent: c.accent }),
    ...(HEX.test(c.tintA || '') && { tintA: c.tintA }),
    ...(HEX.test(c.tintB || '') && { tintB: c.tintB }),
  };
}

export const MIN_PHOTO_SEC = 0.5;

// A photo reel is a fixed length (8s unless changed); the photos share it equally. Very many
// photos in a short reel would flash by, so each gets at least half a second and the reel simply
// loops through as many as fit.
export function photoSeconds(doc) {
  return doc.lengthSec ?? 8;
}

export function photoCycleSec(doc) {
  return Math.max(MIN_PHOTO_SEC, photoSeconds(doc) / Math.max(1, doc.images.length));
}

// Stored image URLs are absolute, so ones saved while a dev tunnel (ngrok) was configured keep that
// dead/slow host forever. The renderer runs on this machine, so re-point /uploads/ files at it.
function renderableUrl(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/uploads/')) return `http://localhost:${env.port}${u.pathname}`;
  } catch {
    // relative or malformed - leave untouched
  }
  return url;
}

// The props a photo reel is drawn with (shared by renders and previews).
async function photoProps(doc, { template, draft } = {}) {
  const d = { ...doc.toObject?.() ?? doc, ...(draft || {}) };
  if (template) d.template = template;
  const pal = photoPalette(d);
  const outroTheme = normaliseTheme({ layout: 'kinetic', bg: pal.bg, bg2: pal.bg2, text: pal.text, accent: pal.accent, accentText: pal.accentText, font: pal.font });
  const { theme, brand } = await resolveTheme({ theme: outroTheme });
  const fakeSession = { title: d.title, preacher: '', service: { name: d.options?.texts?.serviceTitle || '' } };
  const applied = applyOptions({ theme, brand, session: fakeSession, options: d.options });
  const intro = {
    enabled: d.intro?.enabled !== false,
    title: d.intro?.title || d.title,
    subtitle: d.intro?.subtitle || '',
  };
  return {
    style: d.template,
    images: d.images.map((i) => renderableUrl(i.url)),
    intro,
    cycleSec: photoCycleSec(d),
    photoSec: photoSeconds(d),
    pal,
    theme: applied.theme,
    // Photos sit on dark scrims, so the bottom logo is the light variant when there is one.
    logoUrl: brand.logoLightUrl || brand.logoUrl,
    showLogo: applied.theme.showLogo,
    churchName: applied.texts.churchName,
    lowerThird: {
      style: d.lowerThird?.style ?? 'none',
      // Blank fields fall back to the reel's own title so a freshly switched-on overlay isn't empty.
      title: d.lowerThird?.title || intro.title,
      subtitle: d.lowerThird?.subtitle ?? '',
      left: d.lowerThird?.left ?? '',
      right: d.lowerThird?.right ?? '',
    },
    sizes: applied.sizes,
    // Photo reels end on the photos - no closing card. (The church-info card is only used as the
    // last slide of a carousel.)
    outro: { ...applied.outro, enabled: false },
    outroSec: 0,
  };
}

// A design from the image editor, brought to life: background + one PNG per element, each
// entering with the chosen effect. Output is a short (max 8s) looping MP4 at the design's size.
async function renderDesignAnimation(id) {
  const anim = await DesignAnimation.findById(id);
  if (!anim) return;
  await DesignAnimation.findByIdAndUpdate(id, { status: 'rendering', progress: 0, error: null });
  await ensureBrowser();
  const serveUrl = await getBundle();
  const inputProps = {
    background: anim.background,
    layers: anim.layers.map((l) => ({ src: l.src, x: l.x, y: l.y, w: l.w, h: l.h })),
    effect: anim.effect,
    lengthSec: anim.lengthSec,
    speed: anim.speed,
    stagger: anim.stagger,
    loop: anim.loop,
    bgMotion: anim.bgMotion,
    width: anim.width,
    height: anim.height,
  };
  const composition = await selectComposition({ serveUrl, id: 'DesignAnim', inputProps });
  const videoName = `anim-${id}-${Date.now()}.mp4`;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 18,
    inputProps,
    outputLocation: path.join(REELS_DIR, videoName),
    onProgress: progressReporter(DesignAnimation, id),
  });
  removeOld(REELS_DIR, anim.videoUrl);
  await DesignAnimation.findByIdAndUpdate(id, { status: 'done', progress: 100, videoUrl: localUrl('reels', videoName), durationSec: anim.lengthSec });
}

async function renderPhotoReel(id) {
  const doc = await PhotoReel.findById(id);
  if (!doc) return;
  if (doc.images.length === 0) throw new Error('Add at least one photo before rendering.');
  await PhotoReel.findByIdAndUpdate(id, { status: 'rendering', progress: 0, error: null });

  const props = await photoProps(doc);
  const totalSec = props.photoSec;

  // Music only - there is no voice. The music is set to a comfortable absolute loudness.
  let mixUrl = '';
  const music = await musicSettings(doc.options);
  const oldMix = doc.mixUrl;
  if (music) {
    const silent = path.join(CLIPS_DIR, `${id}-silence.mp3`);
    await makeSilence(silent, totalSec);
    const name = `${id}-mix-${Date.now()}.mp3`;
    try {
      await mixAudio({ voicePath: silent, outputPath: path.join(CLIPS_DIR, name), totalSec, music: { ...music, duck: false }, absoluteLufs: -16 });
    } finally {
      fs.promises.unlink(silent).catch(() => {});
    }
    mixUrl = localUrl('clips', name);
  }

  await ensureBrowser();
  const serveUrl = await getBundle();
  const inputProps = { ...props, mixSrc: mixUrl };
  const composition = await selectComposition({ serveUrl, id: 'PhotoReel', inputProps });
  const videoName = `${id}-${Date.now()}.mp4`;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 20,
    inputProps,
    outputLocation: path.join(REELS_DIR, videoName),
    onProgress: progressReporter(PhotoReel, id),
  });

  removeOld(REELS_DIR, doc.videoUrl);
  removeOld(CLIPS_DIR, oldMix);
  await PhotoReel.findByIdAndUpdate(id, {
    status: 'done',
    progress: 100,
    mixUrl: mixUrl || undefined,
    videoUrl: localUrl('reels', videoName),
    durationSec: totalSec,
    renderedAt: new Date(),
  });
}

// Stills of a photo reel. Several share one browser, so a whole template picker costs about as
// much as a single preview. Results are cached on disk by what they contain.
const stillHash = (inputProps, atSec) => crypto.createHash('sha1').update(JSON.stringify({ inputProps, at: atSec, v: remotionVersion() })).digest('hex').slice(0, 16);

// Stills that are already on disk, without starting a browser. Missing ones come back as null.
export async function peekPhotoStills(doc, requests) {
  return Promise.all(requests.map(async (r) => {
    const inputProps = await photoProps(doc, { template: r.template, draft: r.draft });
    const file = `${stillHash(inputProps, r.atSec)}.png`;
    return fs.existsSync(path.join(PREVIEWS_DIR, file)) ? { id: r.template ?? doc.template, url: localUrl('previews', file) } : null;
  }));
}

export async function renderPhotoStills(doc, requests) {
  await ensureBrowser();
  const serveUrl = await getBundle();
  const browser = await openBrowser('chrome');
  try {
    const out = [];
    for (const r of requests) {
      const inputProps = await photoProps(doc, { template: r.template, draft: r.draft });
      const hash = stillHash(inputProps, r.atSec);
      const file = `${hash}.png`;
      const dest = path.join(PREVIEWS_DIR, file);
      if (!fs.existsSync(dest)) {
        const composition = await selectComposition({ serveUrl, id: 'PhotoReel', inputProps, puppeteerInstance: browser });
        await renderStill({ composition, serveUrl, inputProps, output: dest, frame: Math.min(composition.durationInFrames - 1, Math.round(r.atSec * FPS)), puppeteerInstance: browser });
      }
      out.push({ id: r.template ?? doc.template, url: localUrl('previews', file) });
    }
    return out;
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}

let photoChain = Promise.resolve();
export function queuePhotoStills(doc, requests) {
  const run = photoChain.then(() => renderPhotoStills(doc, requests));
  photoChain = run.catch(() => {});
  return run;
}

// ---- carousel ----------------------------------------------------------------------------------

export const DEFAULT_SLIDE_SEC = 8;

// Renders every slide of the carousel as its own looping MP4 (1080x1350, 4:5), one after another,
// reporting overall progress. The project's music, if any, plays under each slide.
async function renderCarouselVideos(id) {
  const doc = await PhotoReel.findById(id);
  if (!doc) return;
  const slides = doc.carousel.slides;
  if (slides.length === 0) throw new Error('Generate the slides first.');
  await PhotoReel.findByIdAndUpdate(id, { 'carousel.status': 'rendering', 'carousel.progress': 0, 'carousel.error': null });

  const base = await photoProps(doc);
  const music = await musicSettings(doc.options);
  await ensureBrowser();
  const serveUrl = await getBundle();
  const stamp = Date.now();
  const urls = [];

  for (let i = 0; i < slides.length; i += 1) {
    const sl = slides[i];
    const lengthSec = sl.lengthSec ?? DEFAULT_SLIDE_SEC;

    let mixSrc = '';
    if (music) {
      const silent = path.join(CLIPS_DIR, `${id}-s${i}-silence.mp3`);
      const mixName = `${id}-s${i}-mix-${stamp}.mp3`;
      await makeSilence(silent, lengthSec);
      try {
        await mixAudio({ voicePath: silent, outputPath: path.join(CLIPS_DIR, mixName), totalSec: lengthSec, music: { ...music, duck: false }, absoluteLufs: -16 });
        mixSrc = localUrl('clips', mixName);
      } finally {
        fs.promises.unlink(silent).catch(() => {});
      }
    }

    const inputProps = {
      lengthSec,
      mixSrc,
      layout: sl.layout,
      images: sl.images,
      title: sl.title,
      subtitle: sl.subtitle,
      pal: base.pal,
      theme: base.theme,
      logoUrl: base.logoUrl,
      showLogo: base.showLogo,
      lowerThird: base.lowerThird,
      outro: { ...base.outro, enabled: true },
      sizes: base.sizes,
    };
    const name = `${id}-${i + 1}-${stamp}.mp4`;
    const composition = await selectComposition({ serveUrl, id: 'CarouselSlide', inputProps });
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      crf: 20,
      inputProps,
      outputLocation: path.join(CAROUSEL_DIR, name),
      onProgress: ({ progress }) => {
        const pct = Math.floor(((i + progress) / slides.length) * 100);
        if (pct !== last) {
          last = pct;
          PhotoReel.findByIdAndUpdate(id, { 'carousel.progress': pct }).catch(() => {});
        }
      },
    });
    urls.push(localUrl('carousel', name));
    if (mixSrc) removeOld(CLIPS_DIR, mixSrc);
  }

  const fresh = await PhotoReel.findById(id);
  for (const old of fresh?.carousel.renderedUrls ?? []) removeStoredFile(old, CAROUSEL_DIR);
  await PhotoReel.findByIdAndUpdate(id, {
    'carousel.status': 'done',
    'carousel.progress': 100,
    'carousel.renderedUrls': urls,
    'carousel.renderedAt': new Date(),
  });
}
