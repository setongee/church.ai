// Recap Reel engine: turns service clips + photos, a message audio clip and a music track into a
// beat-synced 9:16 recap reel (hero intro -> beat montage -> the word -> outro -> closing card)
// with sound design, rendered fully in the browser (Canvas 2D + Web Audio + MediaRecorder).
//
// Ported from the standalone recap-reel app. The pipeline is unchanged:
//   buildTimeline() -> buildMix() -> drawFrame(t)
// but every form read is now a typed `ReelSettings` object, so React owns the UI.

export type Grade = 'cool' | 'warm' | 'film' | 'none';
export type Pace = 'standard' | 'calm' | 'fast';

export interface ReelSettings {
  // the word
  msgStart: number;
  msgLen: number;
  wordLabel: string;
  minister: string;
  msgTitle: string;
  showWave: boolean;
  // music + sound
  bpm: number;
  musicStart: number;
  musicVol: number;
  sfxVol: number;
  voiceVol: number;
  // branding + look
  handle: string;
  outroText: string;
  details: string;
  grade: Grade;
  pace: Pace;
  res: 720 | 1080;
  showWm: boolean;
}

export const DEFAULT_SETTINGS: ReelSettings = {
  msgStart: 0,
  msgLen: 20,
  wordLabel: 'THE WORD',
  minister: '',
  msgTitle: '',
  showWave: true,
  bpm: 105,
  musicStart: 0,
  musicVol: 0.7,
  sfxVol: 0.75,
  voiceVol: 1,
  handle: '@yourchurch',
  outroText: 'SEE YOU NEXT WEEK',
  details: 'Sundays · 8:00 AM\nWednesdays · 6:00 PM\nYour venue address\nyourchurch.org',
  grade: 'cool',
  pace: 'standard',
  res: 1080,
  showWm: true,
};

export interface MediaItem {
  id: string;
  file: File;
  name: string;
  url: string;
  type: 'image' | 'video';
  thumb: HTMLCanvasElement;
  thumbUrl: string;
  uses: number;
  dur: number;
  w: number;
  h: number;
  ok?: boolean;
  err?: string;
  el?: HTMLImageElement;
}

interface AudioClip {
  buf: AudioBuffer;
  name: string;
}

interface SegItem {
  m: MediaItem;
  inP: number;
  rate: number;
  dur: number;
}

type SegKind = 'single' | 'split3' | 'grid6' | 'letterbox' | 'end';
type SegSec = 'intro' | 'montage' | 'word' | 'outro' | 'end';

interface Seg {
  sec: SegSec;
  kind: SegKind;
  start: number;
  dur: number;
  items: SegItem[];
  zoom?: 'push' | 'punch' | 'slow';
  bar?: boolean;
  text?: boolean;
  rate?: number;
}

export interface Timeline {
  B: number;
  segs: Seg[];
  total: number;
  montageStart: number;
  wordStart: number;
  wordEnd: number;
  outroStart: number;
  endStart: number;
  textStart: number;
  msgLen: number;
  hasWord: boolean;
}

interface Mix {
  buf: AudioBuffer;
  venv: Float32Array | null;
}

interface SfxEntry {
  hit: number;
  buf: AudioBuffer;
}

export interface RenderResult {
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
}

export interface PlayHooks {
  onStatus?: (text: string) => void;
  /** Called every frame with the playhead position in seconds. */
  onProgress?: (t: number, total: number) => void;
}

export interface AudioInfo {
  name: string;
  duration: number;
  /** Music only: detected tempo and first downbeat. */
  bpm?: number;
  offset?: number;
  /** Message only: where the first sound starts. */
  start?: number;
}

/** Public base of the sound-effects pack (manifest.json + mp3s). */
const SFX_BASE = '/recap-reel/sfx/';
const FONT_BASE = '/recap-reel/fonts/';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeIO = (x: number) => {
  x = clamp(x, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const back = (x: number) => {
  x = clamp(x, 0, 1);
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function formatTime(s: number): string {
  s = Math.max(0, s);
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/** How many of the last items form the outro (smiles and waves) for n items. */
export function outroCount(n: number): number {
  return n >= 6 ? 2 : n >= 4 ? 1 : 0;
}

let fontsReady: Promise<void> | null = null;
/** Loads the three display fonts the canvas draws with (once). */
export function loadReelFonts(): Promise<void> {
  if (!fontsReady) {
    const faces: [string, string, string][] = [
      ['Anton', 'Anton-Regular.ttf', '400'],
      ['Bowlby One', 'BowlbyOne-Regular.ttf', '400'],
      ['Archivo', 'Archivo.ttf', '100 900'],
    ];
    fontsReady = Promise.all(
      faces.map(async ([family, file, weight]) => {
        const face = new FontFace(family, `url(${FONT_BASE}${file})`, { weight });
        await face.load();
        document.fonts.add(face);
      }),
    ).then(() => undefined);
    fontsReady.catch(() => {
      fontsReady = null; // allow a retry
    });
  }
  return fontsReady;
}

export class RecapReelEngine {
  media: MediaItem[] = [];
  msg: AudioClip | null = null;
  music: AudioClip | null = null;
  logo: HTMLImageElement | null = null;
  s: ReelSettings = { ...DEFAULT_SETTINGS };
  TL: Timeline | null = null;

  private cv: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private MIX: Mix | null = null;
  private actx: AudioContext | null = null;
  private sfx: Record<string, SfxEntry> | null = null;
  private live = new Map<string, HTMLVideoElement & { _it?: SegItem; _exp?: number }>();
  private textCache = new Map<string, HTMLCanvasElement>();
  private playing: { finish: (cancelled: boolean) => void } | null = null;
  private busy = false;
  private disposed = false;

  get isPlaying(): boolean {
    return this.busy;
  }

  /* ---------------- setup ---------------- */

  attach(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.setCanvas(720);
  }

  setSettings(patch: Partial<ReelSettings>) {
    this.s = { ...this.s, ...patch };
  }

  dispose() {
    this.disposed = true;
    this.playing?.finish(true);
    this.clearVideos();
    this.media.forEach((m) => URL.revokeObjectURL(m.url));
    this.actx?.close().catch(() => {});
  }

  private AC(): AudioContext {
    if (!this.actx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.actx = new Ctor();
    }
    return this.actx;
  }

  private setCanvas(r: number) {
    if (!this.cv) return;
    const w = r === 1080 ? 1080 : 720;
    const h = (w * 16) / 9;
    if (this.cv.width !== w) {
      this.cv.width = w;
      this.cv.height = h;
      this.ctx = this.cv.getContext('2d');
      this.textCache.clear();
    }
  }

  /* ---------------- media ingest ---------------- */

  async addMedia(file: File): Promise<MediaItem> {
    const thumb = document.createElement('canvas');
    thumb.width = 90;
    thumb.height = 160;
    const m: MediaItem = {
      id: Math.random().toString(36).slice(2),
      file,
      name: file.name,
      url: URL.createObjectURL(file),
      type: file.type.startsWith('image') ? 'image' : 'video',
      thumb,
      thumbUrl: '',
      uses: 0,
      dur: 0,
      w: 0,
      h: 0,
    };
    this.media.push(m);
    try {
      if (m.type === 'image') {
        const img = new Image();
        img.src = m.url;
        await img.decode();
        m.el = img;
        m.w = img.naturalWidth;
        m.h = img.naturalHeight;
        m.dur = 99;
        drawCover(thumb.getContext('2d')!, img, m.w, m.h, 0, 0, 90, 160, 1, 0, 0);
      } else {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.src = m.url;
        await new Promise<void>((res, rej) => {
          v.onloadedmetadata = () => res();
          v.onerror = () => rej(new Error('decode'));
          setTimeout(() => rej(new Error('timeout')), 15000);
        });
        m.dur = v.duration;
        m.w = v.videoWidth;
        m.h = v.videoHeight;
        if (!m.w) throw new Error('decode');
        v.currentTime = Math.min(m.dur * 0.4, 1.5);
        await new Promise<void>((r) => {
          v.onseeked = () => r();
          setTimeout(r, 3000);
        });
        drawCover(thumb.getContext('2d')!, v, m.w, m.h, 0, 0, 90, 160, 1, 0, 0);
        v.removeAttribute('src');
        v.load();
      }
      m.thumbUrl = thumb.toDataURL('image/jpeg', 0.7);
      m.ok = true;
    } catch {
      m.ok = false;
      m.err =
        m.type === 'video'
          ? "Can't play this video here. Try Safari or Chrome, or export it as H.264 MP4."
          : "Can't open this image. HEIC isn't supported, use JPG or PNG.";
    }
    return m;
  }

  removeMedia(id: string) {
    const i = this.media.findIndex((m) => m.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(this.media[i].url);
    this.media.splice(i, 1);
  }

  moveMedia(id: string, dir: -1 | 1) {
    const i = this.media.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.media.length) return;
    [this.media[i], this.media[j]] = [this.media[j], this.media[i]];
  }

  private async decodeAudio(file: File): Promise<AudioBuffer> {
    return this.AC().decodeAudioData(await file.arrayBuffer());
  }

  /** Loads the sermon clip. Returns where the first sound starts so the UI can pre-set the sliders. */
  async setMessage(file: File | null): Promise<AudioInfo | null> {
    if (!file) {
      this.msg = null;
      return null;
    }
    const buf = await this.decodeAudio(file);
    this.msg = { buf, name: file.name };
    return { name: file.name, duration: buf.duration, start: firstSound(buf) };
  }

  /** Loads the music track and detects its tempo and first downbeat. */
  async setMusic(file: File | null): Promise<AudioInfo | null> {
    if (!file) {
      this.music = null;
      return null;
    }
    const buf = await this.decodeAudio(file);
    this.music = { buf, name: file.name };
    await sleep(30); // let the UI paint "detecting tempo" before the heavy loop
    const d = detectBeat(buf);
    return { name: file.name, duration: buf.duration, bpm: d.bpm, offset: d.offset };
  }

  async setLogo(file: File | null): Promise<string | null> {
    if (!file) {
      this.logo = null;
      return null;
    }
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    this.logo = img;
    return img.src;
  }

  /* ---------------- timeline ---------------- */

  buildTimeline(): Timeline | null {
    const items = this.media.filter((m) => m.ok);
    if (!items.length) return null;
    const s = this.s;
    const B = 60 / clamp(s.bpm || 105, 60, 180);
    const n = items.length;
    const nOut = outroCount(n);
    const hero = items[0];
    const outro = nOut ? items.slice(n - nOut) : [items[n - 1]];
    let pool = items.slice(1, n - nOut);
    if (!pool.length) pool = items.slice();
    items.forEach((m) => (m.uses = 0));
    let pi = 0;
    const next = () => pool[pi++ % pool.length];
    const segs: Seg[] = [];
    let t = 0;
    const it = (m: MediaItem, dur: number, rate = 1): SegItem => {
      let inP = 0;
      if (m.type === 'video') {
        const need = dur * rate + 0.2;
        const avail = Math.max(0, m.dur - need);
        inP = avail * ((0.18 + 0.41 * m.uses) % 1);
      }
      m.uses++;
      return { m, inP, rate, dur };
    };
    const add = (sec: SegSec, kind: SegKind, dur: number, ms: MediaItem[], extra: Partial<Seg> = {}) => {
      const seg: Seg = { sec, kind, start: t, dur, items: ms.map((m) => it(m, dur, extra.rate || 1)), ...extra };
      segs.push(seg);
      t += dur;
      return seg;
    };
    // INTRO
    add('intro', 'single', 4 * B, [hero], { zoom: 'push' });
    add('intro', 'single', 2 * B, [pool.length > 1 ? next() : hero], { zoom: 'punch' });
    const montageStart = t;
    // MONTAGE - pace sets beats per cut for clips / photos
    const pace = s.pace;
    const vb = pace === 'fast' ? 1 : pace === 'calm' ? 4 : 2;
    const pb = pace === 'fast' ? 2 : pace === 'calm' ? 4 : 3;
    const mb = clamp(Math.ceil((pool.length * vb + 6) / 4) * 4, 16, 36);
    for (let b = 0; b < mb; ) {
      if (b >= 8 && b < 8 + vb && pool.length >= 3 && !segs.some((x) => x.kind === 'split3')) {
        add('montage', 'split3', Math.max(2, vb) * B, [next(), next(), next()]);
        b += Math.max(2, vb);
        continue;
      }
      const m = next();
      const nb = Math.min(m.type === 'image' ? pb : vb, mb - b);
      add('montage', 'single', nb * B, [m], { zoom: m.type === 'image' ? 'slow' : 'punch', bar: b % 4 === 0 });
      b += nb;
    }
    // WORD
    const wordStart = t;
    let wordEnd = t;
    const msgLen = this.msg ? Math.min(s.msgLen, this.msg.buf.duration - s.msgStart) : 0;
    if (this.msg && msgLen > 1) {
      const bars = Math.ceil((msgLen + 0.8) / (4 * B));
      for (let k = 0; k < bars; k++) {
        if (k === 1 && pool.length >= 6) add('word', 'grid6', 4 * B, [next(), next(), next(), next(), next(), next()], { rate: 0.6 });
        else if (k === 1 && pool.length >= 3) add('word', 'split3', 4 * B, [next(), next(), next()], { rate: 0.6 });
        else if (k === 3) add('word', 'letterbox', 4 * B, [next()], { rate: 0.6, zoom: 'slow' });
        else add('word', 'single', 4 * B, [next()], { rate: 0.6, zoom: 'slow' });
      }
      wordEnd = t;
    }
    // OUTRO
    const outroStart = t;
    outro.forEach((m, i) => {
      const last = i === outro.length - 1;
      add('outro', 'single', (last ? 8 : 3) * B, [m], { zoom: last ? 'slow' : 'punch', text: last });
    });
    const textStart = segs[segs.length - 1].start + 0.5 * B;
    // END
    const endStart = t;
    add('end', 'end', Math.max(8 * B, 4.2), []);
    return { B, segs, total: t, montageStart, wordStart, wordEnd, outroStart, endStart, textStart, msgLen, hasWord: wordEnd > wordStart };
  }

  /** Rebuilds the timeline from the current media + settings and paints a still. Skipped mid-playback. */
  async refresh(): Promise<Timeline | null> {
    if (this.busy) return this.TL;
    this.TL = this.buildTimeline();
    this.MIX = null;
    if (this.TL) {
      this.setCanvas(720);
      this.manageVideos(1, false);
      await sleep(400);
      if (!this.busy && !this.disposed) this.drawFrame(1);
    } else if (this.ctx && this.cv) {
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    }
    return this.TL;
  }

  /* ---------------- audio ---------------- */

  private async sfxLib(): Promise<Record<string, SfxEntry>> {
    if (this.sfx) return this.sfx;
    const man: Record<string, { file: string; hit: number }> = await (await fetch(SFX_BASE + 'manifest.json')).json();
    const out: Record<string, SfxEntry> = {};
    await Promise.all(
      Object.entries(man).map(async ([k, v]) => {
        const ab = await (await fetch(SFX_BASE + v.file)).arrayBuffer();
        out[k] = { hit: v.hit, buf: await this.AC().decodeAudioData(ab) };
      }),
    );
    this.sfx = out;
    return out;
  }

  private outroWords(): string[] {
    return (this.s.outroText || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  }

  /** Fallback gospel-pop beat when no music track is uploaded. */
  private genMusic(ac: BaseAudioContext, out: AudioNode, T: Timeline) {
    const B = T.B;
    const bars = Math.ceil(T.total / (4 * B)) + 1;
    const prog = [
      [0, 4, 7],
      [7, 11, 14],
      [9, 12, 16],
      [5, 9, 12],
    ];
    const root = [0, 7, 9, 5];
    const base = 261.63 / 2;
    const pad = ac.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = 1400;
    const padG = ac.createGain();
    padG.gain.value = 0.05;
    pad.connect(padG).connect(out);
    const drums = ac.createGain();
    drums.gain.value = 0.9;
    drums.connect(out);
    const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = nb.getChannelData(0);
    const r = rnd(77);
    for (let i = 0; i < nd.length; i++) nd[i] = r();
    const inSec = (t: number) => T.segs.find((s) => t >= s.start && t < s.start + s.dur) || { sec: 'end' };
    const noise = (type: BiquadFilterType, freq: number, q: number | null, t: number, peak: number, tail: number, len: number, dest: AudioNode) => {
      const s = ac.createBufferSource();
      s.buffer = nb;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q !== null) f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + tail);
      s.connect(f).connect(g).connect(dest);
      s.start(t, Math.random() * 0.5, len);
    };
    for (let k = 0; k < bars; k++) {
      const t0 = k * 4 * B;
      const ch = prog[k % 4];
      ch.forEach((st) =>
        [-6, 0, 6].forEach((dt) => {
          const o = ac.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = base * 2 * Math.pow(2, st / 12);
          o.detune.value = dt;
          const g = ac.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(1, t0 + 0.25);
          g.gain.setValueAtTime(1, t0 + 4 * B - 0.1);
          g.gain.linearRampToValueAtTime(0, t0 + 4 * B + 0.15);
          o.connect(g).connect(pad);
          o.start(t0);
          o.stop(t0 + 4 * B + 0.2);
        }),
      );
      for (let bt = 0; bt < 4; bt++) {
        const tb = t0 + bt * B;
        const sec = inSec(tb + 0.01).sec;
        const full = sec === 'montage' || sec === 'outro' || (sec === 'intro' && tb >= 2 * B);
        // bass
        const bo = ac.createOscillator();
        bo.type = 'sine';
        bo.frequency.value = (base / 2) * Math.pow(2, root[k % 4] / 12);
        const bg = ac.createGain();
        bg.gain.setValueAtTime(0, tb);
        bg.gain.linearRampToValueAtTime(sec === 'end' ? 0 : 0.32, tb + 0.08);
        bg.gain.linearRampToValueAtTime(0, tb + B * 0.95);
        bo.connect(bg).connect(out);
        bo.start(tb);
        bo.stop(tb + B);
        if (!full) continue;
        // kick
        const ko = ac.createOscillator();
        ko.frequency.setValueAtTime(150, tb);
        ko.frequency.exponentialRampToValueAtTime(42, tb + 0.12);
        const kg = ac.createGain();
        kg.gain.setValueAtTime(0.95, tb);
        kg.gain.exponentialRampToValueAtTime(0.001, tb + 0.4);
        ko.connect(kg).connect(drums);
        ko.start(tb);
        ko.stop(tb + 0.45);
        // snare, off-beat hat, 16th shakers
        if (bt % 2 === 1) noise('bandpass', 1600, 0.8, tb, 0.55, 0.2, 0.25, drums);
        noise('highpass', 7500, null, tb + 0.5 * B, 0.22, 0.06, 0.08, drums);
        for (let q = 0; q < 4; q++) noise('highpass', 9000, null, tb + (q * B) / 4, q % 2 ? 0.07 : 0.035, 0.04, 0.05, drums);
      }
    }
  }

  private async buildMix(T: Timeline): Promise<Mix> {
    const s = this.s;
    const sr = 44100;
    const len = Math.ceil((T.total + 0.3) * sr);
    const ac = new OfflineAudioContext(2, len, sr);
    const master = ac.createDynamicsCompressor();
    master.threshold.value = -8;
    master.knee.value = 6;
    master.ratio.value = 10;
    master.attack.value = 0.003;
    master.release.value = 0.2;
    master.connect(ac.destination);
    const verb = ac.createConvolver();
    verb.buffer = reverbIR(ac);
    const verbG = ac.createGain();
    verbG.gain.value = 0.28;
    verb.connect(verbG).connect(master);
    const mv = s.musicVol;
    const sv = s.sfxVol;
    const vv = s.voiceVol;
    // music bus with ducking automation
    const mus = ac.createGain();
    mus.connect(master);
    const g = mus.gain;
    const lv = mv * 0.9;
    const duck = mv * 0.17;
    g.setValueAtTime(0, 0);
    g.linearRampToValueAtTime(lv, 0.08);
    if (T.hasWord) {
      g.setValueAtTime(lv, T.wordStart - 0.6);
      g.linearRampToValueAtTime(duck, T.wordStart + 0.3);
      const ve = T.wordStart + 0.25 + T.msgLen;
      g.setValueAtTime(duck, ve - 0.2);
      g.linearRampToValueAtTime(lv * 0.8, ve + 0.9);
      g.linearRampToValueAtTime(lv, T.outroStart + 0.05);
    }
    g.setValueAtTime(lv, T.endStart);
    g.linearRampToValueAtTime(lv * 0.45, T.endStart + 0.4);
    g.linearRampToValueAtTime(0, T.total);
    if (this.music) {
      const src = ac.createBufferSource();
      src.buffer = this.music.buf;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 30;
      src.connect(hp).connect(mus);
      src.start(0, s.musicStart);
    } else this.genMusic(ac, mus, T);
    // voice chain
    if (T.hasWord && this.msg) {
      const vb = this.msg.buf;
      let pk = 0;
      for (let c = 0; c < vb.numberOfChannels; c++) {
        const d = vb.getChannelData(c);
        for (let i = 0; i < d.length; i += 3) pk = Math.max(pk, Math.abs(d[i]));
      }
      const src = ac.createBufferSource();
      src.buffer = vb;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 85;
      const pres = ac.createBiquadFilter();
      pres.type = 'peaking';
      pres.frequency.value = 3200;
      pres.Q.value = 0.9;
      pres.gain.value = 3.5;
      const mud = ac.createBiquadFilter();
      mud.type = 'peaking';
      mud.frequency.value = 300;
      mud.Q.value = 1;
      mud.gain.value = -2.5;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      comp.knee.value = 8;
      const vg = ac.createGain();
      const vs = ac.createGain();
      vs.gain.value = 0.08;
      const on = T.wordStart + 0.25;
      const dur = T.msgLen;
      const lvl = (0.85 / Math.max(pk, 0.05)) * vv * 1.25;
      vg.gain.setValueAtTime(0, on);
      vg.gain.linearRampToValueAtTime(lvl, on + 0.06);
      vg.gain.setValueAtTime(lvl, on + dur - 0.6);
      vg.gain.linearRampToValueAtTime(0, on + dur);
      src.connect(hp).connect(mud).connect(pres).connect(comp).connect(vg).connect(master);
      vg.connect(vs).connect(verb);
      src.start(on, s.msgStart, dur + 0.05);
    }
    // SFX placement - each sound aligned to its hit point
    const sfx = ac.createGain();
    sfx.gain.value = sv;
    sfx.connect(master);
    const L = await this.sfxLib();
    const play = (k: string, t: number, gain = 1, pan = 0, o: { offset?: number; dur?: number } = {}) => {
      const e = L[k];
      if (!e) return;
      let st = t - e.hit;
      let off = o.offset || 0;
      if (st < 0) {
        off += -st;
        st = 0;
      }
      if (off >= e.buf.duration) return;
      const src = ac.createBufferSource();
      src.buffer = e.buf;
      const gg = ac.createGain();
      gg.gain.value = gain;
      let n: AudioNode = src.connect(gg);
      if (pan && ac.createStereoPanner) {
        const p = ac.createStereoPanner();
        p.pan.value = pan;
        n = gg.connect(p);
      }
      n.connect(sfx);
      if (o.dur) src.start(st, off, o.dur);
      else src.start(st, off);
    };
    const B = T.B;
    // opening
    play('sub3', 0, 1);
    play('impact4', 0, 0.45);
    play('low5', 0, 0.55);
    // intro light leak
    play('flame', 4 * B, 0.75);
    // drop into montage
    play('revriser', T.montageStart, 0.7);
    play('sub1', T.montageStart, 0.8);
    play('low4', T.montageStart, 0.45);
    let vc = 0;
    T.segs
      .filter((x) => x.sec === 'montage')
      .forEach((x, i) => {
        if (i === 0) return;
        if (x.kind === 'split3') {
          play('t1', x.start, 0.55);
          return;
        }
        if (x.items[0].m.type === 'image') {
          play('shutter', x.start, 0.55, i % 2 ? 0.25 : -0.25);
          return;
        }
        if (vc++ % 2 === 0) play(vc % 4 === 1 ? 'fastswish' : 'sharp', x.start, 0.38, vc % 4 === 1 ? -0.3 : 0.3);
      });
    // the word
    if (T.hasWord) {
      play('verylong', T.wordStart, 0.7);
      play('sub5', T.wordStart, 0.65);
      T.segs
        .filter((x) => x.sec === 'word')
        .slice(1)
        .forEach((x) => {
          if (x.kind === 'grid6') play('bips', x.start, 0.22, 0, { dur: 0.7 });
          else if (x.kind === 'split3') play('t2', x.start, 0.3);
          else if (x.kind === 'letterbox') play('panoramic', x.start, 0.38);
        });
    }
    // outro
    play('long', T.outroStart, 0.6);
    play('golden', T.outroStart + 0.05, 0.45);
    play('sub2', T.outroStart, 0.5);
    T.segs
      .filter((x) => x.sec === 'outro')
      .slice(1)
      .forEach((x) => {
        if (!x.text) play('sharp', x.start, 0.35);
      });
    if (this.outroWords().length) play('whip', T.textStart, 0.5);
    // end card
    play('impact1', T.endStart, 0.95);
    play('low4', T.endStart, 0.55);
    play('camera', T.endStart + 1.1, 0.45);
    const out = await ac.startRendering();
    // normalise
    let pk = 0;
    for (let c = 0; c < 2; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > pk) pk = a;
      }
    }
    const k = pk > 0 ? 0.94 / pk : 1;
    for (let c = 0; c < 2; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
    // voice envelope for the waveform visualiser
    let venv: Float32Array | null = null;
    if (T.hasWord && this.msg) {
      const vb = this.msg.buf;
      const d = vb.getChannelData(0);
      const fps = 30;
      const st = Math.floor(s.msgStart * vb.sampleRate);
      const hop = Math.floor(vb.sampleRate / fps);
      const nfr = Math.ceil(T.msgLen * fps);
      venv = new Float32Array(nfr);
      let mx = 0;
      for (let f = 0; f < nfr; f++) {
        let sum = 0;
        for (let j = 0; j < hop; j += 8) {
          const x = d[st + f * hop + j] || 0;
          sum += x * x;
        }
        venv[f] = Math.sqrt(sum / (hop / 8));
        mx = Math.max(mx, venv[f]);
      }
      for (let f = 0; f < nfr; f++) venv[f] /= mx || 1;
    }
    return { buf: out, venv };
  }

  /* ---------------- video element pool ---------------- */

  private manageVideos(t: number, running: boolean, exact = false) {
    const TL = this.TL;
    if (!TL) return;
    for (const s of TL.segs) {
      for (const [k, it] of s.items.entries()) {
        if (it.m.type !== 'video') continue;
        const key = s.start.toFixed(3) + '_' + k;
        const near = t > s.start - 1.6 && t < s.start + s.dur + 0.25;
        let v = this.live.get(key);
        if (near && !v) {
          v = document.createElement('video');
          v.muted = true;
          v.playsInline = true;
          v.preload = 'auto';
          v.src = it.m.url;
          v.currentTime = it.inP;
          v._it = it;
          this.live.set(key, v);
        }
        if (!v) continue;
        if (!near) {
          v.pause();
          v.removeAttribute('src');
          v.load();
          this.live.delete(key);
          continue;
        }
        const local = t - s.start;
        const exp = Math.min(it.inP + Math.max(0, local) * it.rate, (v.duration || 1e9) - 0.06);
        v._exp = exp;
        if (local >= 0 && running) {
          if (v.paused) {
            v.playbackRate = it.rate;
            v.play().catch(() => {});
          }
          if (Math.abs(v.currentTime - exp) > 0.25 && !v.seeking) v.currentTime = exp;
        } else if (!running && local >= 0) {
          if (Math.abs(v.currentTime - exp) > (exact ? 0.004 : 0.05) && !v.seeking) v.currentTime = exp;
        }
      }
    }
  }

  private clearVideos() {
    for (const v of this.live.values()) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    this.live.clear();
  }

  private async waitReady(t: number) {
    this.manageVideos(t, false);
    const deadline = performance.now() + 6000;
    while (performance.now() < deadline) {
      let ok = true;
      for (const v of this.live.values()) if (v.readyState < 2) ok = false;
      if (ok) break;
      await sleep(100);
    }
  }

  private srcFor(s: Seg, k: number): { el: CanvasImageSource; w: number; h: number } {
    const it = s.items[k];
    if (it.m.type === 'image') return { el: it.m.el!, w: it.m.w, h: it.m.h };
    const v = this.live.get(s.start.toFixed(3) + '_' + k);
    if (v && v.readyState >= 2) return { el: v, w: v.videoWidth, h: v.videoHeight };
    return { el: it.m.thumb, w: 90, h: 160 };
  }

  /* ---------------- drawing ---------------- */

  drawFrame(t: number) {
    const ctx = this.ctx;
    const cv = this.cv;
    if (!ctx || !cv) return;
    const W = cv.width;
    const H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const T = this.TL;
    if (!T || t < 0) return;
    const B = T.B;
    const s = T.segs.find((x) => t >= x.start && t < x.start + x.dur) || T.segs[T.segs.length - 1];
    const local = t - s.start;
    const p = local / s.dur;
    if (s.kind === 'end') {
      this.drawEnd(local, s.dur, W, H);
      return;
    }
    // camera shake on montage bars
    let sx = 0;
    let sy = 0;
    if (s.sec === 'montage' && local < 0.18) {
      const a = (1 - local / 0.18) * W * 0.008;
      sx = Math.sin(t * 90) * a;
      sy = Math.cos(t * 70) * a;
    }
    if (s.sec === 'intro' && t < 0.25) {
      const a = (1 - t / 0.25) * W * 0.012;
      sx = Math.sin(t * 80) * a;
      sy = Math.cos(t * 60) * a;
    }
    ctx.save();
    ctx.translate(sx, sy);
    const R = rects(s.kind, W, H);
    if (s.kind !== 'single') {
      ctx.fillStyle = s.kind === 'letterbox' ? '#000' : '#0b0d12';
      ctx.fillRect(0, 0, W, H);
    }
    R.forEach((r, k) => {
      const src = this.srcFor(s, k);
      let z = 1;
      let px = 0;
      let py = 0;
      const img = s.items[k].m.type === 'image';
      if (s.zoom === 'punch') z = 1 + 0.14 * (1 - ease(local / 0.32));
      else if (s.zoom === 'push') z = 1.12 - 0.1 * easeIO(p);
      else if (s.zoom === 'slow') z = 1.02 + 0.08 * p;
      if (img) {
        z *= 1.04 + 0.1 * p;
        px = (k % 2 ? 1 : -1) * 0.5 * (p - 0.5);
        py = 0.3 * (p - 0.5);
      }
      let [x] = r;
      const [, y, w, h] = r;
      if (s.kind === 'split3' || s.kind === 'grid6') {
        const d = clamp((local - k * (s.kind === 'grid6' ? 0.04 : 0.07)) / 0.26, 0, 1);
        const e = ease(d);
        x += (1 - e) * W * (k % 2 ? 1 : -1);
        ctx.globalAlpha = e;
      }
      drawCover(ctx, src.el, src.w, src.h, x, y, w, h, z, px, py);
      ctx.globalAlpha = 1;
    });
    if (s.kind === 'split3' || s.kind === 'grid6') {
      ctx.fillStyle = 'rgba(225,232,245,.9)';
      const g = Math.max(2, Math.round(W * 0.004));
      R.forEach(([x, y, , h]) => {
        if (y > 0) ctx.fillRect(0, y - g * 1.5, W, g);
        if (x > 0) ctx.fillRect(x - g * 1.5, y, g, h);
      });
    }
    ctx.restore();
    this.grade(W, H);
    // bar flash in montage
    if (s.sec === 'montage' && s.bar && local < 0.12) {
      ctx.fillStyle = `rgba(255,255,255,${0.28 * (1 - local / 0.12)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // light leaks
    this.leak(t - 4 * B, W, H, false);
    this.leak(t - T.outroStart, W, H, true);
    if (T.hasWord) {
      const d = t - T.wordStart;
      if (d > -0.12 && d < 0.35) {
        const a = d < 0 ? (d + 0.12) / 0.12 : 1 - d / 0.35;
        ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    const d0 = t - T.montageStart;
    if (d0 > -0.05 && d0 < 0.2) {
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - Math.abs(d0 - 0.02) / 0.2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // word overlays
    if (T.hasWord && t >= T.wordStart && t < T.wordEnd) this.drawWord(t - T.wordStart, W, H);
    if (s.text) this.drawOutroText(t - T.textStart, W, H, t);
    // fade to black before end card
    const fe = T.endStart - t;
    if (fe < 0.12) {
      ctx.fillStyle = `rgba(0,0,0,${1 - fe / 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.s.showWm) this.watermark(W, H, s.kind === 'split3' ? 'left' : 'right');
    this.drawLogoSmall(W, H);
  }

  private grade(W: number, H: number) {
    const ctx = this.ctx!;
    const g = this.s.grade;
    ctx.save();
    if (g === 'cool') {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(30,80,255,.42)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(0,20,60,.18)';
      ctx.fillRect(0, 0, W, H);
    } else if (g === 'warm') {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(255,150,60,.38)';
      ctx.fillRect(0, 0, W, H);
    } else if (g === 'film') {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(0,90,110,.32)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,170,90,.12)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  private leak(d: number, W: number, H: number, warm: boolean) {
    if (d < -0.45 || d > 0.6) return;
    const ctx = this.ctx!;
    const a = d < 0 ? ease((d + 0.45) / 0.45) : 1 - ease(d / 0.6);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cols = warm ? ['255,150,60', '255,90,140', '255,240,210'] : ['255,120,40', '255,60,120', '255,255,255'];
    const mv = (d + 0.45) / 1.05;
    [
      [0.2 + mv * 0.9, 0.25, 0.9],
      [0.95 - mv * 0.7, 0.65, 0.8],
      [0.6, 0.4 + mv * 0.2, 0.6],
    ].forEach(([x, y, r], i) => {
      const g = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * r * 1.3);
      g.addColorStop(0, `rgba(${cols[i]},${0.95 * a})`);
      g.addColorStop(1, `rgba(${cols[i]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    if (Math.abs(d) < 0.12) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - Math.abs(d) / 0.12)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  private watermark(W: number, H: number, pos: 'left' | 'right') {
    const ctx = this.ctx!;
    const s = W * 0.042;
    const x = pos === 'left' ? W * 0.075 : W * 0.86;
    const y = pos === 'left' ? H * 0.415 : H * 0.1;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = W * 0.008;
    igGlyph(ctx, x, y, s, '#fff');
    ctx.font = `400 ${Math.round(W * 0.02)}px Anton`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = pos === 'left' ? 'left' : 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.s.handle.toUpperCase(), pos === 'left' ? x - s / 2 : x, y + s * 0.85);
    ctx.restore();
  }

  private drawLogoSmall(W: number, H: number) {
    const logo = this.logo;
    if (!logo) return;
    const ctx = this.ctx!;
    const r = W * 0.026;
    const x = W / 2;
    const y = H * 0.965;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
    ctx.clip();
    const lw = logo.naturalWidth;
    const lh = logo.naturalHeight;
    const sc = Math.min((r * 1.6) / lw, (r * 1.6) / lh);
    ctx.drawImage(logo, x - (lw * sc) / 2, y - (lh * sc) / 2, lw * sc, lh * sc);
    ctx.restore();
  }

  private drawWord(lt: number, W: number, H: number) {
    const ctx = this.ctx!;
    const T = this.TL!;
    const title = this.s.msgTitle.trim();
    const min = this.s.minister.trim();
    const lab = this.s.wordLabel.trim();
    const show = 4.6;
    const a = lt < show ? ease(lt / 0.5) * (lt > show - 0.5 ? 1 - ease((lt - (show - 0.5)) / 0.5) : 1) : 0;
    if (a > 0 && (title || lab || min)) {
      ctx.save();
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
      const off = (1 - ease(lt / 0.6)) * H * 0.03;
      let y = H * 0.73 + off;
      ctx.globalAlpha = a;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const x = W * 0.075;
      if (lab) {
        ctx.font = `800 ${Math.round(W * 0.03)}px Archivo`;
        ctx.fillStyle = '#7fb0ff';
        ctx.letterSpacing = W * 0.006 + 'px';
        ctx.fillText(lab.toUpperCase(), x, y);
        ctx.letterSpacing = '0px';
        const lw = ctx.measureText(lab.toUpperCase()).width + lab.length * W * 0.006;
        ctx.fillRect(x, y + W * 0.014, Math.min(lw, W * 0.25) * ease(lt / 0.8), W * 0.004);
        y += W * 0.1;
      }
      if (title) {
        ctx.font = `400 ${Math.round(W * 0.085)}px Anton`;
        ctx.fillStyle = '#fff';
        wrap(ctx, title.toUpperCase(), W * 0.85)
          .slice(0, 3)
          .forEach((l) => {
            ctx.fillText(l, x, y);
            y += W * 0.095;
          });
      }
      if (min) {
        ctx.font = `600 ${Math.round(W * 0.036)}px Archivo`;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillText('— ' + min, x, y + W * 0.01);
      }
      ctx.restore();
    }
    if (this.s.showWave && this.MIX && this.MIX.venv) {
      const vt = lt - 0.25;
      if (vt < 0 || vt > T.msgLen) return;
      const fr = Math.floor(vt * 30);
      const nb = 32;
      const bw = W * 0.012;
      const gap = W * 0.008;
      const tot = nb * (bw + gap);
      let x = (W - tot) / 2;
      const yb = H * 0.915;
      const fa = Math.min(1, vt / 0.4, (T.msgLen - vt) / 0.4);
      ctx.save();
      ctx.globalAlpha = 0.85 * fa;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < nb; i++) {
        const idx = (fr - Math.abs(i - nb / 2)) | 0;
        const v = this.MIX.venv[Math.max(0, idx)] || 0;
        const h = W * 0.006 + v * W * 0.07 * (1 - Math.abs(i - nb / 2) / (nb * 0.7));
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, yb - h / 2, bw, h, bw / 2);
        else ctx.rect(x, yb - h / 2, bw, h);
        ctx.fill();
        x += bw + gap;
      }
      ctx.restore();
    }
  }

  private wordSprite(word: string, size: number): HTMLCanvasElement {
    const key = word + size;
    const hit = this.textCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    const x = c.getContext('2d')!;
    x.font = `400 ${size}px "Bowlby One"`;
    const w = Math.ceil(x.measureText(word).width + size * 0.5);
    c.width = w;
    c.height = Math.ceil(size * 1.35);
    x.font = `400 ${size}px "Bowlby One"`;
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = size * 0.16;
    x.strokeStyle = '#0a0a0a';
    x.strokeText(word, size * 0.25, c.height / 2);
    x.fillStyle = '#fff';
    x.fillText(word, size * 0.25, c.height / 2);
    this.textCache.set(key, c);
    return c;
  }

  private drawOutroText(lt: number, W: number, H: number, t: number) {
    const words = this.outroWords();
    if (!words.length || lt < 0) return;
    const ctx = this.ctx!;
    const B = this.TL!.B;
    ctx.save();
    const base = W * 0.19;
    let y = H * 0.035;
    words.forEach((w, i) => {
      const st = i * B * 0.5;
      const d = lt - st;
      if (d < 0) return;
      ctx.font = `400 ${base}px "Bowlby One"`;
      const mw = ctx.measureText(w).width;
      const size = Math.min(base, (base * (W * 0.78)) / mw);
      const spr = this.wordSprite(w, Math.round(size));
      const sc = back(d / 0.3);
      const rot = (i % 2 ? 1 : -1) * 0.05 * (1 - ease(d / 0.4));
      const cx = W * 0.07 + spr.width / 2;
      const cy = y + spr.height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      const sl = Math.max(2, Math.round(W / 270));
      for (let x = 0; x < spr.width; x += sl) {
        const off = Math.sin(x * 0.018 + t * 3.2 + i) * size * 0.07;
        ctx.drawImage(spr, x, 0, sl, spr.height, x - spr.width / 2, -spr.height / 2 + off, sl, spr.height);
      }
      ctx.restore();
      y += spr.height * 0.68;
    });
    ctx.restore();
  }

  private drawEnd(lt: number, dur: number, W: number, H: number) {
    const ctx = this.ctx!;
    const logo = this.logo;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const s = W * 0.13 * back(lt / 0.35);
    const cy = logo ? H * 0.43 : H * 0.4;
    const gr = ctx.createLinearGradient(W / 2 - s / 2, cy + s / 2, W / 2 + s / 2, cy - s / 2);
    ['#feda75', '#fa7e1e', '#d62976', '#962fbf', '#4f5bd5'].forEach((c, i) => gr.addColorStop(i / 4, c));
    const sw = clamp((lt - 1.1) / 0.35, 0, 1);
    if (logo) {
      const a = ease((lt - 0.2) / 0.5);
      const lw = logo.naturalWidth;
      const lh = logo.naturalHeight;
      const sc = Math.min((W * 0.22) / lw, (W * 0.22) / lh);
      ctx.globalAlpha = a;
      ctx.drawImage(logo, W / 2 - (lw * sc) / 2, H * 0.25 - (lh * sc) / 2 + (1 - a) * 20, lw * sc, lh * sc);
      ctx.globalAlpha = 1;
    }
    if (s > 0) {
      ctx.globalAlpha = 1 - sw;
      igGlyph(ctx, W / 2, cy, s, gr, s * 0.1);
      ctx.globalAlpha = sw;
      igGlyph(ctx, W / 2, cy, s, '#fff', s * 0.1);
      ctx.globalAlpha = 1;
    }
    const ha = ease((lt - 0.15) / 0.4);
    ctx.globalAlpha = ha;
    ctx.fillStyle = '#fff';
    ctx.font = `400 ${Math.round(W * 0.05)}px Anton`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.s.handle.toUpperCase(), W / 2, cy + s * 0.75 + (1 - ha) * 12);
    const lines = this.s.details
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 6);
    let y = cy + s * 0.75 + W * 0.1;
    lines.forEach((l, i) => {
      const a = ease((lt - 0.7 - i * 0.15) / 0.4);
      ctx.globalAlpha = a;
      ctx.font = `${i === 0 ? 800 : 400} ${Math.round(W * (i === 0 ? 0.036 : 0.032))}px Archivo`;
      ctx.fillStyle = i === 0 ? '#fff' : 'rgba(255,255,255,.72)';
      ctx.fillText(l, W / 2, y + (1 - a) * 14);
      y += W * 0.055;
    });
    ctx.globalAlpha = 1;
    const fo = dur - lt;
    if (fo < 0.35) {
      ctx.fillStyle = `rgba(0,0,0,${1 - fo / 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------- playback / render ---------------- */

  private async ensureMix(hooks: PlayHooks) {
    this.TL = this.buildTimeline();
    hooks.onStatus?.('Building the soundtrack…');
    await loadReelFonts();
    this.MIX = await this.buildMix(this.TL!);
  }

  /**
   * Plays the reel on the canvas in real time. With `record` it also captures canvas + soundtrack
   * with MediaRecorder and resolves with the finished video; a plain preview resolves with null,
   * as does a cancelled render.
   */
  async play(record: boolean, hooks: PlayHooks = {}): Promise<RenderResult | null> {
    if (this.busy || !this.cv) return null;
    this.busy = true;
    try {
      const ac = this.AC();
      await ac.resume();
      this.setCanvas(record ? this.s.res : 720);
      await this.ensureMix(hooks);
      const cv = this.cv;
      const T = this.TL!;
      const mix = this.MIX!;
      this.clearVideos();
      await this.waitReady(-0.5);
      hooks.onStatus?.('');

      const src = ac.createBufferSource();
      src.buffer = mix.buf;
      const dest = ac.createMediaStreamDestination();
      src.connect(ac.destination);
      src.connect(dest);

      let rec: MediaRecorder | null = null;
      const chunks: Blob[] = [];
      let mime = '';
      if (record) {
        const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
        const types = [
          'video/mp4;codecs=avc1.640028,mp4a.40.2',
          'video/mp4;codecs=avc1,mp4a',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ];
        mime = types.find((x) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(x)) || '';
        rec = new MediaRecorder(stream, {
          mimeType: mime || undefined,
          videoBitsPerSecond: this.s.res === 1080 ? 12e6 : 7e6,
          audioBitsPerSecond: 192000,
        });
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      }

      return await new Promise<RenderResult | null>((resolve) => {
        const t0 = ac.currentTime + 0.25;
        src.start(t0);
        let started = false;
        let ended = false;
        const finish = (cancelled: boolean) => {
          if (ended) return;
          ended = true;
          this.playing = null;
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
          this.clearVideos();
          if (!rec || rec.state === 'inactive') {
            resolve(null);
            return;
          }
          rec.onstop = () => {
            if (cancelled) return resolve(null);
            const ext = mime.includes('mp4') ? 'mp4' : 'webm';
            resolve({ blob: new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' }), mime, ext });
          };
          try {
            rec.stop();
          } catch {
            resolve(null);
          }
        };
        this.playing = { finish };
        const loop = () => {
          if (ended) return;
          const t = ac.currentTime - t0;
          if (rec && !started && t >= -0.02) {
            rec.start(500);
            started = true;
          }
          this.manageVideos(t, true);
          this.drawFrame(t);
          hooks.onProgress?.(t, T.total);
          if (t >= T.total + 0.15) return finish(false);
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
    } finally {
      this.busy = false;
    }
  }

  stop() {
    this.playing?.finish(true);
  }
}

/* ---------------- pure helpers ---------------- */

function drawCover(c: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, x: number, y: number, w: number, h: number, zoom = 1, px = 0, py = 0) {
  if (!sw || !sh) return;
  const s = Math.max(w / sw, h / sh) * zoom;
  const dw = sw * s;
  const dh = sh * s;
  const dx = x + (w - dw) / 2 + (px * (dw - w)) / 2;
  const dy = y + (h - dh) / 2 + (py * (dh - h)) / 2;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  try {
    c.drawImage(src, dx, dy, dw, dh);
  } catch {
    /* frame not decoded yet */
  }
  c.restore();
}

function rects(kind: SegKind, W: number, H: number): [number, number, number, number][] {
  const g = Math.round(W * 0.009);
  if (kind === 'split3') {
    const h = (H - 2 * g) / 3;
    return [0, 1, 2].map((i) => [0, i * (h + g), W, h]);
  }
  if (kind === 'grid6') {
    const w = (W - g) / 2;
    const h = (H - 2 * g) / 3;
    const r: [number, number, number, number][] = [];
    for (let i = 0; i < 6; i++) r.push([(i % 2) * (w + g), Math.floor(i / 2) * (h + g), w, h]);
    return r;
  }
  if (kind === 'letterbox') return [[0, H * 0.19, W, H * 0.62]];
  return [[0, 0, W, H]];
}

function igGlyph(c: CanvasRenderingContext2D, x: number, y: number, s: number, stroke: string | CanvasGradient, lw?: number) {
  c.save();
  c.lineWidth = lw || s * 0.09;
  c.strokeStyle = stroke;
  c.fillStyle = stroke;
  const r = s * 0.28;
  c.beginPath();
  if (c.roundRect) c.roundRect(x - s / 2, y - s / 2, s, s, r);
  else c.rect(x - s / 2, y - s / 2, s, s);
  c.stroke();
  c.beginPath();
  c.arc(x, y, s * 0.23, 0, 7);
  c.stroke();
  c.beginPath();
  c.arc(x + s * 0.27, y - s * 0.27, s * 0.055, 0, 7);
  c.fill();
  c.restore();
}

function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (c.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function rnd(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

function reverbIR(ac: BaseAudioContext, dur = 2.4): AudioBuffer {
  const sr = ac.sampleRate;
  const n = Math.ceil(dur * sr);
  const b = ac.createBuffer(2, n, sr);
  const L = b.getChannelData(0);
  const R = b.getChannelData(1);
  const a = rnd(41);
  const c = rnd(43);
  for (let i = 0; i < n; i++) {
    const e = Math.pow(1 - i / n, 3);
    L[i] = a() * e;
    R[i] = c() * e;
  }
  return b;
}

/** Seconds into the buffer where the first audible sound starts. */
export function firstSound(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  const sr = b.sampleRate;
  const w = Math.floor(sr * 0.05);
  let pk = 0;
  for (let i = 0; i < d.length; i += 97) pk = Math.max(pk, Math.abs(d[i]));
  const th = pk * 0.08;
  for (let i = 0; i < d.length - w; i += w) {
    let s = 0;
    for (let j = 0; j < w; j += 4) s = Math.max(s, Math.abs(d[i + j]));
    if (s > th) return Math.max(0, i / sr - 0.05);
  }
  return 0;
}

/** Beat detection: onset-envelope autocorrelation, refined to a fractional tempo and first downbeat. */
function detectBeat(b: AudioBuffer): { bpm: number; offset: number } {
  const sr = b.sampleRate;
  const hop = Math.floor(sr / 100);
  const L = b.getChannelData(0);
  const R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
  const n = Math.min(Math.floor(L.length / hop), 100 * 90);
  const env = new Float32Array(n);
  let lp = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < hop; j += 2) {
      const x = (L[i * hop + j] + R[i * hop + j]) * 0.5;
      lp += 0.08 * (x - lp);
      e += lp * lp;
    }
    e = Math.log(1e-6 + e);
    env[i] = Math.max(0, e - prev);
    prev = e;
  }
  let best = 0;
  let bl = 60;
  for (let lag = Math.floor(6000 / 170); lag <= Math.floor(6000 / 70); lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += env[i] * env[i + lag];
    s /= n - lag;
    const bpm = 6000 / lag;
    const w = Math.exp(-Math.pow(Math.log2(bpm / 112), 2) * 1.2);
    if (s * w > best) {
      best = s * w;
      bl = lag;
    }
  }
  // refine with fractional lag
  let bpm = 6000 / bl;
  let bestS = -1;
  let bestB = bpm;
  for (let c = bpm - 2; c <= bpm + 2; c += 0.05) {
    const per = 6000 / c;
    let sc = 0;
    for (let o = 0; o < per; o += 1) {
      let a = 0;
      for (let k = 0; o + k * per < n; k++) a += env[Math.round(o + k * per)] || 0;
      if (a > sc) sc = a;
    }
    if (sc > bestS) {
      bestS = sc;
      bestB = c;
    }
  }
  bpm = bestB;
  const per = 6000 / bpm;
  let bo = 0;
  let bs = -1;
  for (let o = 0; o < per; o++) {
    let a = 0;
    for (let k = 0; o + k * per < n; k++) a += env[Math.round(o + k * per)] || 0;
    if (a > bs) {
      bs = a;
      bo = o;
    }
  }
  let off = bo / 100;
  const fs = firstSound(b);
  while (off < fs - 0.01) off += per / 100;
  return { bpm, offset: off };
}
