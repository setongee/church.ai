// Per-reel / per-merged-video customisation, stored as `options` on the document:
//   texts  - overrides for the church name, service title, preacher name and footer line
//            (empty string = use the automatic value)
//   sizes  - multipliers for the headline, caption and detail text
//   show   - per-item overrides of the template's show/hide switches
//   pace   - playback speed, cutting of long pauses, finishing the last sentence
//   outro  - the closing card (church info) and how long music plays through it
//   music  - background music track and how it is mixed

export const DEFAULT_OPTIONS = {
  texts: { churchName: '', serviceTitle: '', speaker: '', footerText: '' },
  sizes: { headline: 1, captions: 1, info: 1 },
  show: {},
  // speed: playback speed of the whole video (voice included); trimPauses/maxPause: cut silent
  // gaps longer than maxPause seconds down to a short beat.
  pace: { speed: 1, trimPauses: true, maxPause: 1.5, finishSentence: true, echo: true },
  // The closing card shown after the content. Empty text = use the Brand page values.
  // style: which closing-card design (see OUTRO_STYLES); thanks/linkText/bg/accent customise the
  // newer designs (empty = the design's own defaults).
  outro: { enabled: true, seconds: 5, style: 'thanks', thanks: '', linkText: '', bg: '', accent: '', mediaUrl: '', mediaType: 'image', mediaSec: 0, mediaOverlay: false, cta: '', serviceTimes: '', address: '', follow: '' },
  // Pen-on-paper scratching under the Handwritten template (volume: 0-2, 1 = a soft bed).
  writing: { enabled: true, volume: 1 },
  // `volume` is the music level relative to the voice: 1 = a clear bed ~6 dB under the speaker.
  music: { trackId: '', volume: 1, fadeIn: 1.5, fadeOut: 2.5, startSec: 0, duck: true, build: true },
};

export const OUTRO_STYLES = [
  { id: 'thanks', label: 'Thank you' },
  { id: 'script', label: 'Handwritten note' },
  { id: 'bold', label: 'Bold block' },
  { id: 'glass', label: 'Glass cards' },
  { id: 'info', label: 'Church info' },
  { id: 'media', label: 'Your image / video' },
];
const HEX6 = /^#[0-9a-f]{6}$/i;
const SHOW_KEYS = ['showLogo', 'showChurch', 'showHeadline', 'showSpeaker', 'showSessionTitle', 'showWaveform', 'showProgress'];
const clamp = (v, min, max, fallback) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback);
const str = (v, max, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);

// Validates user input on top of what is already stored (fields that are not sent are kept).
export function sanitizeOptions(input = {}, existing = {}) {
  const base = withDefaults(existing);
  const t = input.texts ?? {};
  const z = input.sizes ?? {};
  const m = input.music ?? {};
  const pc = input.pace ?? {};
  const ot = input.outro ?? {};
  const wr = input.writing ?? {};
  const show = { ...base.show };
  if (input.show && typeof input.show === 'object') {
    for (const k of SHOW_KEYS) {
      if (typeof input.show[k] === 'boolean') show[k] = input.show[k];
      else if (input.show[k] === null) delete show[k];
    }
  }
  return {
    texts: {
      churchName: str(t.churchName, 80, base.texts.churchName),
      serviceTitle: str(t.serviceTitle, 120, base.texts.serviceTitle),
      speaker: str(t.speaker, 80, base.texts.speaker),
      footerText: str(t.footerText, 80, base.texts.footerText),
    },
    sizes: {
      headline: clamp(z.headline, 0.5, 1.8, base.sizes.headline),
      captions: clamp(z.captions, 0.5, 1.8, base.sizes.captions),
      info: clamp(z.info, 0.5, 1.8, base.sizes.info),
    },
    show,
    pace: {
      speed: clamp(pc.speed, 0.5, 2, base.pace.speed),
      trimPauses: typeof pc.trimPauses === 'boolean' ? pc.trimPauses : base.pace.trimPauses,
      maxPause: clamp(pc.maxPause, 0.3, 10, base.pace.maxPause),
      finishSentence: typeof pc.finishSentence === 'boolean' ? pc.finishSentence : base.pace.finishSentence,
      echo: typeof pc.echo === 'boolean' ? pc.echo : base.pace.echo,
    },
    outro: {
      enabled: typeof ot.enabled === 'boolean' ? ot.enabled : base.outro.enabled,
      seconds: clamp(ot.seconds, 2, 15, base.outro.seconds),
      style: OUTRO_STYLES.some((x) => x.id === ot.style) ? ot.style : base.outro.style,
      thanks: str(ot.thanks, 60, base.outro.thanks),
      mediaUrl: typeof ot.mediaUrl === 'string' ? (/^https?:\/\/[^\s]+$/.test(ot.mediaUrl) ? ot.mediaUrl.slice(0, 400) : '') : base.outro.mediaUrl,
      mediaType: ot.mediaType === 'video' || ot.mediaType === 'image' ? ot.mediaType : base.outro.mediaType,
      mediaSec: clamp(ot.mediaSec, 0, 3600, base.outro.mediaSec ?? 0),
      mediaOverlay: typeof ot.mediaOverlay === 'boolean' ? ot.mediaOverlay : base.outro.mediaOverlay,
      linkText: str(ot.linkText, 90, base.outro.linkText),
      bg: ot.bg === '' ? '' : HEX6.test(ot.bg || '') ? ot.bg : base.outro.bg,
      accent: ot.accent === '' ? '' : HEX6.test(ot.accent || '') ? ot.accent : base.outro.accent,
      cta: str(ot.cta, 80, base.outro.cta),
      serviceTimes: typeof ot.serviceTimes === 'string' ? ot.serviceTimes.trim().slice(0, 300) : base.outro.serviceTimes,
      address: str(ot.address, 200, base.outro.address),
      follow: typeof ot.follow === 'string' ? ot.follow.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join('\n').slice(0, 240) : base.outro.follow,
    },
    writing: {
      enabled: typeof wr.enabled === 'boolean' ? wr.enabled : base.writing.enabled,
      volume: clamp(wr.volume, 0, 2, base.writing.volume),
    },
    music: {
      trackId: typeof m.trackId === 'string' ? m.trackId.slice(0, 60) : base.music.trackId,
      volume: clamp(m.volume, 0, 1.5, base.music.volume),
      fadeIn: clamp(m.fadeIn, 0, 10, base.music.fadeIn),
      fadeOut: clamp(m.fadeOut, 0, 10, base.music.fadeOut),
      startSec: clamp(m.startSec, 0, 3600, base.music.startSec),
      duck: typeof m.duck === 'boolean' ? m.duck : base.music.duck,
      build: typeof m.build === 'boolean' ? m.build : base.music.build,
    },
  };
}

export function withDefaults(stored = {}) {
  const s = stored && typeof stored.toObject === 'function' ? stored.toObject() : stored || {};
  return {
    texts: { ...DEFAULT_OPTIONS.texts, ...(s.texts ?? {}) },
    sizes: { ...DEFAULT_OPTIONS.sizes, ...(s.sizes ?? {}) },
    show: { ...(s.show ?? {}) },
    pace: { ...DEFAULT_OPTIONS.pace, ...(s.pace ?? {}) },
    outro: { ...DEFAULT_OPTIONS.outro, ...(s.outro ?? {}) },
    writing: { ...DEFAULT_OPTIONS.writing, ...(s.writing ?? {}) },
    // Music saved by the first version used a different scale (a raw gain of ~0.2 that made it
    // inaudible); it has no `build` flag, so drop its volume and use the new default.
    music: { ...DEFAULT_OPTIONS.music, ...(s.music ?? {}), ...(s.music && s.music.build === undefined ? { volume: DEFAULT_OPTIONS.music.volume } : {}) },
  };
}

// Applies the options to a resolved theme + brand + session, giving the exact texts, switches
// and sizes the video is drawn with. The service title defaults to the SERVICE's name (e.g.
// "Sunday Communion Service"), not the individual session's title.
export function applyOptions({ theme, brand, session, options }) {
  const o = withDefaults(options);
  const out = { ...theme };
  for (const k of SHOW_KEYS) if (typeof o.show[k] === 'boolean') out[k] = o.show[k];
  if (o.texts.footerText) out.footerText = o.texts.footerText;
  const service = session?.service && typeof session.service === 'object' ? session.service : null;
  const churchName = o.texts.churchName || brand.churchName;
  return {
    theme: out,
    texts: {
      churchName,
      serviceTitle: o.texts.serviceTitle || service?.name || session?.title || '',
      speaker: o.texts.speaker || session?.preacher || '',
    },
    sizes: o.sizes,
    outro: resolveOutro({ outro: o.outro, brand, churchName }),
  };
}

const SOCIAL_LABELS = { instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok', x: 'X' };

// "https://www.instagram.com/church/" -> "@church"; "youtube.com/c/ChurchTV" -> "ChurchTV".
function tidyHandle(platform, value) {
  let v = String(value).trim();
  if (!/^(https?:\/\/|www\.|[a-z0-9-]+\.(com|tv|org|ng|net)\/)/i.test(v)) return v;
  v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[?#]/)[0].replace(/\/+$/, '');
  const last = v.split('/').filter(Boolean).pop() ?? v;
  const name = last.replace(/^@/, '');
  return ['instagram', 'tiktok', 'x'].includes(platform) ? `@${name}` : name;
}

// "Instagram  @church" / "@church" / "youtube.com/church" -> { platform, label, handle }.
function parseHandle(line) {
  const m = /^(instagram|youtube|facebook|tiktok|x|twitter)\b[\s:|-]*(.*)$/i.exec(line.trim());
  if (m && m[2]) {
    const platform = m[1].toLowerCase() === 'twitter' ? 'x' : m[1].toLowerCase();
    return { platform, label: SOCIAL_LABELS[platform], handle: tidyHandle(platform, m[2]) };
  }
  return line.trim() ? { platform: '', label: '', handle: line.trim() } : null;
}

// What the closing card shows: per-video overrides first, then the Brand page values.
export function resolveOutro({ outro, brand, churchName }) {
  const lines = (outro.serviceTimes || brand.serviceTimes || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
  const socials = brand.socials || {};
  const handles = outro.follow
    ? outro.follow.split('\n').map(parseHandle).filter(Boolean)
    : Object.keys(SOCIAL_LABELS).filter((k) => socials[k]).slice(0, 4).map((k) => ({ platform: k, label: SOCIAL_LABELS[k], handle: tidyHandle(k, socials[k]) }));
  const follow = handles.map((h) => (h.label ? `${h.label}  ${h.handle}` : h.handle));
  return {
    enabled: outro.enabled,
    seconds: outro.seconds,
    style: outro.style === 'media' && !outro.mediaUrl ? 'thanks' : outro.style,
    mediaUrl: outro.mediaUrl,
    mediaType: outro.mediaType,
    mediaSec: outro.mediaSec || 0,
    mediaOverlay: outro.mediaOverlay,
    thanks: outro.thanks || 'Thanks for watching',
    linkText: outro.linkText || 'Get the full message - link in our bio',
    bg: outro.bg,
    accent: outro.accent,
    handles,
    cta: outro.cta || brand.outroCta || 'Get the full message',
    churchName,
    logoUrl: brand.logoUrl,
    tagline: brand.tagline || '',
    serviceTimes: lines,
    address: outro.address || brand.address || '',
    website: brand.website || '',
    follow,
  };
}
