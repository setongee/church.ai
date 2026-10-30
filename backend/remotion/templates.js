// Shared by the backend (to list/validate templates) and the Remotion bundle (to render them),
// so it is plain JS with no imports.

export const LAYOUTS = [
  { id: 'kinetic', label: 'Kinetic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'block', label: 'Bold block' },
  { id: 'quote', label: 'Quote card' },
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'poster', label: 'Poster' },
  { id: 'neon', label: 'Neon' },
  { id: 'aurora', label: 'Aurora glass' },
  { id: 'scripture', label: 'Scripture page' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'handwriting', label: 'Handwritten' },
];


export const FONTS = [
  { id: 'bricolage', label: 'Bricolage Grotesque' },
  { id: 'bebas', label: 'Bebas Neue' },
  { id: 'jakarta', label: 'Plus Jakarta Sans' },
  { id: 'lufga', label: 'Lufga' },
  { id: 'playfair', label: 'Playfair Display' },
  { id: 'caveat', label: 'Caveat (handwriting)' },
];

export const DEFAULT_THEME = {
  layout: 'kinetic',
  bg: '#0f172a',
  bg2: '#05070d',
  text: '#ffffff',
  accent: '#f59e0b',
  accentText: '#0b0b0b',
  font: 'bricolage',
  backgroundImageUrl: '',
  overlay: 0.6,
  showLogo: true,
  showChurch: true,
  showHeadline: true,
  showSpeaker: true,
  showSessionTitle: true,
  showWaveform: true,
  showProgress: true,
  footerText: '',
};

export const BUILTIN_TEMPLATES = [
  {
    id: 'builtin:kinetic',
    name: 'Midnight Gold',
    description: 'Dark canvas, big uppercase headline, glowing accent.',
    theme: { layout: 'kinetic', brandAccent: true },
  },
  {
    id: 'builtin:minimal',
    name: 'Soft Paper',
    description: 'Warm paper tone, elegant serif, calm and readable.',
    theme: {
      layout: 'minimal', bg: '#f6f1e7', bg2: '#ece3d2', text: '#1c1917', accent: '#b4532a', accentText: '#ffffff',
      font: 'playfair', showWaveform: true,
    },
  },
  {
    id: 'builtin:block',
    name: 'Bold Block',
    description: 'Loud yellow block, huge condensed type, scrolling ticker.',
    theme: {
      layout: 'block', bg: '#ffd400', bg2: '#ffc300', text: '#0b0b0b', accent: '#0b0b0b', accentText: '#ffd400',
      font: 'bebas', showWaveform: false,
    },
  },
  {
    id: 'builtin:quote',
    name: 'Quote Card',
    description: 'Large quotation mark, serif words that light up as spoken.',
    theme: {
      layout: 'quote', bg: '#0b1b3a', bg2: '#050b1a', text: '#ffffff', accent: '#e8c27a', accentText: '#0b1b3a',
      font: 'playfair', showSessionTitle: true,
    },
  },
  {
    id: 'builtin:karaoke',
    name: 'Karaoke Pop',
    description: 'Vivid gradient, each spoken word pops in a colour pill.',
    theme: {
      layout: 'karaoke', bg: '#4c1d95', bg2: '#be185d', text: '#ffffff', accent: '#fde047', accentText: '#1e1b4b',
      font: 'lufga',
    },
  },
  {
    id: 'builtin:poster',
    name: 'Poster',
    description: 'Image or gradient on top, clean caption card below.',
    theme: {
      layout: 'poster', bg: '#14532d', bg2: '#052e16', text: '#0f172a', accent: '#16a34a', accentText: '#ffffff',
      font: 'jakarta', showSessionTitle: true,
    },
  },
  {
    id: 'builtin:neon',
    name: 'Neon Night',
    description: 'Glowing neon type over a dark synthwave grid.',
    theme: {
      layout: 'neon', bg: '#07070f', bg2: '#12062b', text: '#f5f3ff', accent: '#22d3ee', accentText: '#07070f',
      font: 'bebas', showSessionTitle: true,
    },
  },
  {
    id: 'builtin:aurora',
    name: 'Aurora Glass',
    description: 'Drifting aurora colours with a frosted-glass caption card.',
    theme: {
      layout: 'aurora', bg: '#0b1020', bg2: '#312e81', text: '#ffffff', accent: '#5eead4', accentText: '#042f2e',
      font: 'jakarta', showSessionTitle: true,
    },
  },
  {
    id: 'builtin:scripture',
    name: 'Scripture Page',
    description: 'Parchment page with a gold frame and classic serif.',
    theme: {
      layout: 'scripture', bg: '#f4e8cf', bg2: '#e6d2a6', text: '#3b2412', accent: '#9a3412', accentText: '#ffffff',
      font: 'playfair', showWaveform: false, showSessionTitle: true,
    },
  },
  {
    id: 'builtin:broadcast',
    name: 'Broadcast',
    description: 'News-style lower third, subtitles and a scrolling ticker.',
    theme: {
      layout: 'broadcast', bg: '#0a1a3a', bg2: '#020617', text: '#ffffff', accent: '#ef4444', accentText: '#ffffff',
      font: 'lufga', showSessionTitle: true, showWaveform: false,
    },
  },
  {
    id: 'builtin:sunrise',
    name: 'Sunrise',
    description: 'A warm sun rising behind centred, calm captions.',
    theme: {
      layout: 'sunrise', bg: '#7c2d12', bg2: '#f59e0b', text: '#fff7ed', accent: '#fde68a', accentText: '#7c2d12',
      font: 'playfair', showSessionTitle: true,
    },
  },
  {
    id: 'builtin:handwriting',
    name: 'Handwritten',
    description: 'Notebook paper - the headline and every spoken word are written out in ink as you hear them.',
    theme: {
      layout: 'handwriting', bg: '#f8f2e4', bg2: '#efe5cc', text: '#1e2a4f', accent: '#c2410c', accentText: '#ffffff',
      font: 'caveat', showWaveform: false, showSessionTitle: true,
    },
  },
];

export const DEFAULT_TEMPLATE_ID = 'builtin:kinetic';

const HEX = /^#[0-9a-f]{6}$/i;
const BOOLS = ['showLogo', 'showChurch', 'showHeadline', 'showSpeaker', 'showSessionTitle', 'showWaveform', 'showProgress'];

// Fills in defaults and drops anything invalid, so a hand-edited or stale stored theme can
// never crash a render.
export function normaliseTheme(input = {}) {
  const t = { ...DEFAULT_THEME };
  if (LAYOUTS.some((l) => l.id === input.layout)) t.layout = input.layout;
  if (FONTS.some((f) => f.id === input.font)) t.font = input.font;
  for (const k of ['bg', 'bg2', 'text', 'accent', 'accentText']) if (HEX.test(input[k] || '')) t[k] = input[k];
  for (const k of BOOLS) if (typeof input[k] === 'boolean') t[k] = input[k];
  if (typeof input.backgroundImageUrl === 'string') t.backgroundImageUrl = input.backgroundImageUrl;
  if (typeof input.footerText === 'string') t.footerText = input.footerText.slice(0, 80);
  if (Number.isFinite(input.overlay)) t.overlay = Math.min(0.95, Math.max(0, input.overlay));
  if (input.brandAccent) t.brandAccent = true;
  return t;
}


// ---- handwriting timing ----------------------------------------------------------------------
// When the "pen" is moving: the headline is written first, then each spoken word as it is said.
// Shared by the Handwritten layout (to animate) and the paper-writing sound (to time the
// scratching), so the two always line up.
export const HEADLINE_WRITE_START = 0.3;
export function headlineWriteSec(headline) {
  const n = String(headline || '').replace(/\s+/g, '').length;
  return n ? Math.min(2.2, Math.max(0.6, n * 0.06)) : 0;
}
export function writingWindows({ headline, showHeadline = true, words = [] }) {
  const out = [];
  const h = headlineWriteSec(headline);
  if (showHeadline && h) {
    const parts = String(headline).split(/\s+/).filter(Boolean);
    const total = parts.reduce((a, w) => a + w.length, 0) || 1;
    let t = HEADLINE_WRITE_START;
    for (const w of parts) {
      const d = (w.length / total) * h;
      out.push([t, t + d]);
      t += d;
    }
  }
  for (const w of words) out.push([w.start, w.start + Math.max(0.14, Math.min(0.9, (w.end ?? w.start) - w.start))]);
  return out;
}
