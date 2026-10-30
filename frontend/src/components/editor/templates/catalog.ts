import type { FabricObject } from 'fabric';
import { readableOn, styleRefLine, type Builder, type Row, type Template } from './engine';
import type { Textbox } from 'fabric';

// Design notes (from current quote-post trends): oversized confident type with minimal supporting
// text, a highlighter stroke behind key words, one repeatable layout per style so a feed stays
// consistent, bold light-on-dark for sermon graphics, and generous negative space.
// Every layout derives from the canvas size, so each template works at 1:1, 4:5, 9:16, 16:9, etc.

const SANS = 'Google Sans';
const JAKARTA = 'Plus Jakarta Sans';

const h = (o: FabricObject) => (o.height ?? 0) * (o.scaleY ?? 1);

const shift = (objs: FabricObject[], dy: number) =>
  objs.forEach((o) => {
    o.set({ top: (o.top ?? 0) + dy });
    o.setCoords();
  });

// Left-aligned quote text width: narrower on landscape so lines stay readable.
const textWidth = (c: Builder, wideFrac = 0.7) => (c.isWide ? c.w * wideFrac : c.cw);

function authorText(c: Builder, o: { font?: string; weight?: number; fill: string; size?: number; left: number; width: number; align?: 'left' | 'center' | 'right'; upper?: boolean; spacing?: number; prefix?: string; opacity?: number }) {
  if (!c.author) return null;
  return c.text(`${o.prefix ?? ''}${c.author}`, {
    slot: 'author',
    pre: o.prefix,
    font: o.font ?? JAKARTA,
    weight: o.weight ?? 700,
    fill: o.fill,
    size: o.size ?? c.u * 0.028,
    left: o.left,
    width: o.width,
    align: o.align,
    upper: o.upper,
    spacing: o.spacing,
    opacity: o.opacity,
  });
}

// ---------------------------------------------------------------- quotes

const minimalInk: Template = {
  id: 'minimal-ink',
  name: 'Minimal Ink',
  kind: 'quote',
  blurb: 'Clean, left-aligned, lots of air',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#f9f9f9');
    const bw = textWidth(c);
    const rule = c.rect({ left: c.m, w: c.u * 0.09, h: Math.max(5, c.u * 0.008), fill: c.accent('#111111') });
    const q = c.fitText(c.q, { slot: 'quote', font: SANS, weight: 700, fill: '#111111', left: c.m, width: bw, lh: 1.08, spacing: -15, size: c.quoteSize() }, c.regionH() * 0.72);
    const a = authorText(c, { fill: '#6b6b6b', left: c.m, width: bw, prefix: '— ' });
    c.stackV([rule, q, a], [c.u * 0.045, c.u * 0.04]);
    await c.footer({ dark: false, align: 'left' });
  },
};

const editorialSerif: Template = {
  id: 'editorial-serif',
  name: 'Editorial Serif',
  kind: 'quote',
  blurb: 'Warm paper, serif, oversized mark',
  fonts: ['DM Serif Display', 'Instrument Serif', JAKARTA],
  build: async (c) => {
    c.bgSolid('#f1ebe0');
    const acc = c.accent('#b5532c');
    const bw = c.isWide ? c.w * 0.74 : c.cw;
    const left = (c.w - bw) / 2;
    const mark = c.text('“', { font: 'DM Serif Display', fill: acc, left: 0, width: c.w, align: 'center', size: c.u * 0.26, lh: 0.8 });
    const a = authorText(c, { fill: acc, left, width: bw, align: 'center', upper: true, spacing: 300, size: c.u * 0.022 });
    const room = c.regionH() - h(mark) + c.u * 0.03 - (a ? h(a) + c.u * 0.05 : 0);
    const q = c.fitText(c.q, { slot: 'quote', font: 'Instrument Serif', fill: '#2a2118', left, width: bw, align: 'center', lh: 1.1, size: c.quoteSize(1.3) }, room);
    c.stackV([mark, q, a], [-c.u * 0.03, c.u * 0.05]);
    await c.footer({ dark: false, align: 'center' });
  },
};

const midnight: Template = {
  id: 'midnight',
  name: 'Midnight',
  kind: 'quote',
  blurb: 'Bold white type on near-black',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#0b0b0f');
    const acc = c.accent('#e8c872');
    c.add(c.circle({ cx: c.w, cy: c.h, r: c.u * 0.5, stroke: acc, sw: 2, opacity: 0.22 }));
    const bw = textWidth(c);
    const rule = c.rect({ left: c.m, w: c.u * 0.06, h: Math.max(5, c.u * 0.007), fill: acc });
    const q = c.fitText(c.q, { slot: 'quote', font: SANS, weight: 600, fill: '#ffffff', left: c.m, width: bw, lh: 1.1, spacing: -10, size: c.quoteSize() }, c.regionH() * 0.72);
    const a = authorText(c, { fill: '#9a9aa8', left: c.m, width: bw, upper: true, spacing: 200, size: c.u * 0.024 });
    c.stackV([rule, q, a], [c.u * 0.05, c.u * 0.045]);
    await c.footer({ dark: true, align: 'left' });
  },
};

const aurora: Template = {
  id: 'aurora',
  name: 'Aurora',
  kind: 'quote',
  blurb: 'Deep gradient with soft glows',
  fonts: ['Bricolage Grotesque', JAKARTA],
  build: async (c) => {
    c.bgGradient('#1b1464', '#c0397b', 150);
    c.add(c.circle({ cx: c.w * 0.88, cy: c.h * 0.12, r: c.u * 0.45, fill: '#ffffff', opacity: 0.07 }), c.circle({ cx: c.w * 0.08, cy: c.h * 0.92, r: c.u * 0.34, fill: '#ffffff', opacity: 0.06 }));
    const bw = c.isWide ? c.w * 0.72 : c.cw;
    const left = (c.w - bw) / 2;
    const q = c.fitText(c.q, { slot: 'quote', font: 'Bricolage Grotesque', weight: 700, fill: '#ffffff', left, width: bw, align: 'center', lh: 1.1, spacing: -10, size: c.quoteSize(1.05) }, c.regionH() * 0.7);
    const a = authorText(c, { fill: '#ffffff', left, width: bw, align: 'center', upper: true, spacing: 250, size: c.u * 0.023, opacity: 0.8 });
    c.stackV([q, a], c.u * 0.06);
    await c.footer({ dark: true, align: 'center' });
  },
};

const peachSoft: Template = {
  id: 'peach-soft',
  name: 'Peach Card',
  kind: 'quote',
  blurb: 'Soft pastel with a frosted card',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgGradient('#ffe5d4', '#ffcadb', 160);
    const pad = c.u * 0.07;
    const cardW = c.isWide ? c.w * 0.72 : c.cw;
    const left = (c.w - cardW) / 2;
    const q = c.fitText(c.q, { slot: 'quote', font: SANS, weight: 700, fill: '#2b1a1a', left: left + pad, width: cardW - pad * 2, align: 'center', lh: 1.15, size: c.quoteSize(0.9) }, c.regionH() * 0.62 - pad * 2);
    const card = c.rect({ left, w: cardW, h: (q.height ?? 0) + pad * 2, fill: '#ffffff', rx: c.u * 0.04, opacity: 0.62 });
    const a = authorText(c, { fill: '#7a4a4a', left, width: cardW, align: 'center', upper: true, spacing: 250, size: c.u * 0.023 });
    c.stackV([card, a], c.u * 0.05);
    q.set({ top: (card.top ?? 0) + pad });
    q.setCoords();
    c.add(q);
    await c.footer({ dark: false, align: 'center' });
  },
};

const boldStatement: Template = {
  id: 'bold-statement',
  name: 'Bold Statement',
  kind: 'quote',
  blurb: 'Loud condensed caps on a colour block',
  fonts: ['Anton', JAKARTA],
  build: async (c) => {
    const af = c.accentFill('#ff4d2e');
    c.bgSolid(af.fill);
    const bw = textWidth(c, 0.8);
    const q = c.fitText(c.q, { slot: 'quote', font: 'Anton', fill: af.on, left: c.m, width: bw, lh: 0.98, upper: true, size: c.quoteSize(1.35) }, c.regionH() * 0.78);
    const rule = c.rect({ left: c.m, w: c.u * 0.12, h: Math.max(8, c.u * 0.012), fill: af.on });
    const a = authorText(c, { fill: af.on, weight: 800, left: c.m, width: bw, upper: true, spacing: 200, size: c.u * 0.026 });
    c.stackV([q, rule, a], [c.u * 0.05, c.u * 0.03]);
    await c.footer({ dark: af.on === '#ffffff', align: 'left' });
  },
};

const highlightMarker: Template = {
  id: 'highlight-marker',
  name: 'Highlighter',
  kind: 'quote',
  blurb: 'Marker stroke behind the words',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#fbfaf7');
    const mk = c.accentFill('#ffe14d');
    const marker = mk.fill;
    const bw = textWidth(c);
    const q = c.fitText(c.q, { slot: 'quote', font: SANS, weight: 700, fill: mk.on, left: c.m, width: bw, lh: 1.34, bg: marker, size: c.quoteSize(0.92) }, c.regionH() * 0.72);
    const dot = c.u * 0.014;
    const a = authorText(c, { fill: '#555555', left: c.m + dot * 3.4, width: bw, size: c.u * 0.027 });
    const box = c.stackV([q, a], c.u * 0.05);
    if (a) c.add(c.circle({ cx: c.m + dot, cy: (a.top ?? box.bottom) + (a.height ?? 0) / 2, r: dot, fill: marker }));
    await c.footer({ dark: false, align: 'left' });
  },
};

const forestCalm: Template = {
  id: 'forest-calm',
  name: 'Forest Calm',
  kind: 'quote',
  blurb: 'Deep green, cream italic serif',
  fonts: ['Cormorant Garamond', JAKARTA],
  build: async (c) => {
    c.bgSolid('#12332a');
    const acc = c.accent('#c9b37e');
    c.add(c.circle({ cx: c.w, cy: 0, r: c.u * 0.55, fill: '#1b4a3c' }), c.circle({ cx: 0, cy: c.h, r: c.u * 0.3, fill: '#174136' }));
    const bw = c.isWide ? c.w * 0.72 : c.cw;
    const left = (c.w - bw) / 2;
    const q = c.fitText(c.q, { slot: 'quote', font: 'Cormorant Garamond', weight: 600, italic: true, fill: '#f4ecd8', left, width: bw, align: 'center', lh: 1.1, size: c.quoteSize(1.4) }, c.regionH() * 0.7);
    const rule = c.rect({ left: (c.w - c.u * 0.07) / 2, w: c.u * 0.07, h: 3, fill: acc });
    const a = authorText(c, { fill: acc, left, width: bw, align: 'center', upper: true, spacing: 300, size: c.u * 0.022 });
    c.stackV([q, rule, a], [c.u * 0.05, c.u * 0.035]);
    await c.footer({ dark: true, align: 'center' });
  },
};

const giantMark: Template = {
  id: 'giant-mark',
  name: 'Giant Quote Mark',
  kind: 'quote',
  blurb: 'Outlined mark, strong left edge',
  fonts: ['DM Serif Display', SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#151515');
    const acc = c.accent('#f5c542');
    const bw = textWidth(c);
    const mark = c.text('“', { font: 'DM Serif Display', fill: 'transparent', stroke: acc, strokeWidth: Math.max(2, c.u * 0.003), left: c.m - c.u * 0.015, width: c.u * 0.5, size: c.u * 0.42, lh: 0.8 });
    const a = authorText(c, { fill: acc, left: c.m, width: bw, size: c.u * 0.027 });
    // The oversized mark takes real space: give the quote whatever is left.
    const room = c.regionH() - h(mark) + c.u * 0.1 - (a ? h(a) + c.u * 0.05 : 0);
    const q = c.fitText(c.q, { slot: 'quote', font: SANS, weight: 500, fill: '#ffffff', left: c.m, width: bw, lh: 1.16, size: c.quoteSize(0.9) }, room);
    c.stackV([mark, q, a], [-c.u * 0.1, c.u * 0.05]);
    await c.footer({ dark: true, align: 'left' });
  },
};

const splitPastor: Template = {
  id: 'split-pastor',
  name: 'Pastor Split',
  kind: 'quote',
  blurb: 'Pastor photo + quote (uses Brand assets)',
  fonts: [SANS, JAKARTA, 'DM Serif Display'],
  build: async (c) => {
    c.bgSolid('#f9f9f9');
    const b = c.content.brand;
    const panel = c.isWide ? { left: 0, top: 0, w: c.w * 0.42, h: c.h } : { left: 0, top: 0, w: c.w, h: c.h * 0.42 };
    const pf = c.accentFill('#111111');
    c.add(c.rect({ ...panel, fill: pf.fill }));
    // Whole photo, resting on the panel's bottom edge - nothing is cropped.
    const photo = await c.pastor({ anchor: 'bc', maxW: panel.w * 0.92, maxH: panel.h * 0.96, box: panel });
    if (photo) c.add(photo);
    else c.add(c.text('“', { font: 'DM Serif Display', fill: pf.on, opacity: 0.9, left: panel.left, width: panel.w, align: 'center', top: panel.top + panel.h * 0.08, size: Math.min(panel.w, panel.h) * 0.8, lh: 0.9 }));
    const x = c.isWide ? panel.w + c.m * 0.9 : c.m;
    const width = c.isWide ? c.w - x - c.m : c.cw;
    const region = c.isWide ? c.region() : c.region(panel.h + c.m * 0.6);
    const q = c.fitText(c.q, { slot: 'quote', font: SANS, weight: 700, fill: '#111111', left: x, width, lh: 1.1, spacing: -10, size: c.quoteSize(0.78) }, (region.bottom - region.top) * 0.7);
    const name = c.author || b?.pastorName || '';
    const a = name ? c.text(name, { slot: 'author', font: JAKARTA, weight: 800, fill: '#111111', left: x, width, size: c.u * 0.028 }) : null;
    const t = c.content.useBrand && b?.pastorTitle ? c.text(b.pastorTitle, { font: JAKARTA, weight: 500, fill: '#777777', left: x, width, size: c.u * 0.022 }) : null;
    c.stackV([q, a, t], [c.u * 0.04, c.u * 0.008], region);
    await c.footer({ dark: false, align: 'left', x, width });
  },
};

const frame: Template = {
  id: 'frame',
  name: 'Gallery Frame',
  kind: 'quote',
  blurb: 'Thin frame, centred serif',
  fonts: ['Playfair Display', JAKARTA],
  build: async (c) => {
    c.bgSolid('#ffffff');
    const inset = c.m * 0.45;
    c.add(c.rect({ left: inset, top: inset, w: c.w - inset * 2, h: c.h - inset * 2, stroke: '#111111', sw: Math.max(3, c.u * 0.007) }));
    const bw = c.isWide ? c.w * 0.68 : c.cw * 0.9;
    const left = (c.w - bw) / 2;
    const q = c.fitText(c.q, { slot: 'quote', font: 'Playfair Display', weight: 700, fill: '#111111', left, width: bw, align: 'center', lh: 1.2, size: c.quoteSize(0.92) }, c.regionH() * 0.7);
    const rule = c.rect({ left: (c.w - c.u * 0.06) / 2, w: c.u * 0.06, h: 3, fill: '#111111' });
    const a = authorText(c, { fill: '#555555', left, width: bw, align: 'center', upper: true, spacing: 300, size: c.u * 0.021 });
    c.stackV([q, rule, a], [c.u * 0.05, c.u * 0.035]);
    await c.footer({ dark: false, align: 'center' });
  },
};

const neonLime: Template = {
  id: 'neon-lime',
  name: 'Neon Lime',
  kind: 'quote',
  blurb: 'Tech-sharp black with electric accent',
  fonts: ['Space Grotesk'],
  build: async (c) => {
    c.bgSolid('#0a0a0a');
    const acc = c.accent('#c6ff3d');
    c.add(c.circle({ cx: c.w, cy: 0, r: c.u * 0.2, stroke: acc, sw: Math.max(3, c.u * 0.005) }));
    const bw = textWidth(c);
    const q = c.fitText(c.q, { slot: 'quote', font: 'Space Grotesk', weight: 700, fill: '#ffffff', left: c.m, width: bw, lh: 1.06, spacing: -20, size: c.quoteSize(1.05) }, c.regionH() * 0.74);
    const a = authorText(c, { font: 'Space Grotesk', weight: 600, fill: acc, left: c.m, width: bw, size: c.u * 0.03, prefix: '→ ' });
    c.stackV([q, a], c.u * 0.05);
    await c.footer({ dark: true, align: 'left' });
  },
};

// -------------------------------------------------------------- excerpts

interface ListOpts {
  titleFont: string;
  titleWeight: number;
  titleColor: string;
  titleItalic?: boolean;
  subColor: string;
  label?: string;
  labelColor?: string;
  left?: number;
  width?: number;
}

// Title block shared by every excerpt layout; returns the y where the list may start.
function titleBlock(c: Builder, o: ListOpts) {
  const left = o.left ?? c.m;
  const width = o.width ?? (c.isWide ? c.w * 0.8 : c.cw);
  let y = c.m;
  if (o.label) {
    const l = c.text(o.label, { font: JAKARTA, weight: 800, fill: o.labelColor ?? o.subColor, left, width, top: y, upper: true, spacing: 300, size: c.u * 0.021 });
    c.add(l);
    y += (l.height ?? 0) + c.u * 0.02;
  }
  const title = c.title || 'Key points';
  const t = c.fitText(title, { slot: 'title', font: o.titleFont, weight: o.titleWeight, italic: o.titleItalic, fill: o.titleColor, left, width, top: y, lh: 1.05, spacing: -10, size: c.u * 0.078 }, c.regionH() * 0.26);
  c.add(t);
  y += (t.height ?? 0);
  if (c.author) {
    const a = c.text(c.author, { slot: 'author', font: JAKARTA, weight: 600, fill: o.subColor, left, width, top: y + c.u * 0.015, size: c.u * 0.026 });
    c.add(a);
    y += c.u * 0.015 + (a.height ?? 0);
  }
  return { y: y + c.u * 0.05, left, width };
}

function placeRows(c: Builder, rows: Row[], top: number, availH: number, total: number) {
  const dy = top + Math.max(0, (availH - total) / 2);
  rows.forEach((r) => shift(r.objs, dy));
  rows.forEach((r) => c.add(...r.objs));
  return dy;
}

const numbered: Template = {
  id: 'list-numbered',
  name: 'Numbered Points',
  kind: 'excerpt',
  blurb: 'Big numerals, clean rows',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#f9f9f9');
    const acc = c.accent('#ff5a36');
    const tb = titleBlock(c, { titleFont: SANS, titleWeight: 700, titleColor: '#111111', subColor: '#777777', label: 'Key points', labelColor: acc });
    const avail = c.h - c.m - c.footerH - tb.y;
    const { rows, height } = c.fitRows(
      (i, text, s, y) => {
        const numW = s * 2.3;
        const num = c.text(String(i + 1).padStart(2, '0'), { font: SANS, weight: 700, fill: acc, left: tb.left, width: numW, top: y, size: s * 1.15 });
        const t = c.text(text, { slot: `point:${i}`, font: JAKARTA, weight: 500, fill: '#222222', left: tb.left + numW, width: tb.width - numW, top: y, lh: 1.35, size: s });
        const rh = Math.max(h(num), h(t));
        const line = i > 0 ? [c.rect({ left: tb.left, top: y - s * 0.45, w: tb.width, h: 2, fill: '#e3e3e3' })] : [];
        return { objs: [...line, num, t], h: rh, cy: y + rh / 2 };
      },
      avail,
      c.u * 0.056,
      (s) => s * 0.95
    );
    placeRows(c, rows, tb.y, avail, height);
    await c.footer({ dark: false, align: 'left' });
  },
};
const takeawaysDark: Template = {
  id: 'takeaways-dark',
  name: 'Takeaways Dark',
  kind: 'excerpt',
  blurb: 'Bullets with hairline dividers',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#0b0b0f');
    const acc = c.accent('#7cf0c1');
    const tb = titleBlock(c, { titleFont: SANS, titleWeight: 700, titleColor: '#ffffff', subColor: '#8e8e9a', label: 'Key takeaways', labelColor: acc });
    const avail = c.h - c.m - c.footerH - tb.y;
    const { rows, height } = c.fitRows(
      (i, text, s, y) => {
        const dotR = s * 0.2;
        const t = c.text(text, { slot: `point:${i}`, font: JAKARTA, weight: 500, fill: '#f2f2f5', left: tb.left + dotR * 3.2, width: tb.width - dotR * 3.2, top: y, lh: 1.35, size: s });
        const dot = c.circle({ cx: tb.left + dotR, cy: y + s * 0.78, r: dotR, fill: acc });
        const line = i > 0 ? [c.rect({ left: tb.left, top: y - s * 0.45, w: tb.width, h: 2, fill: '#ffffff', opacity: 0.12 })] : [];
        return { objs: [...line, dot, t], h: h(t), cy: y + h(t) / 2 };
      },
      avail,
      c.u * 0.056,
      (s) => s * 0.95
    );
    placeRows(c, rows, tb.y, avail, height);
    await c.footer({ dark: true, align: 'left' });
  },
};

const cardStack: Template = {
  id: 'card-stack',
  name: 'Card Stack',
  kind: 'excerpt',
  blurb: 'Each point on its own white card',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#e9e4d8');
    const accF = c.accentFill('#111111');
    const acc = accF.fill;
    const tb = titleBlock(c, { titleFont: SANS, titleWeight: 700, titleColor: '#111111', subColor: '#6f6a5c' });
    const avail = c.h - c.m - c.footerH - tb.y;
    const { rows, height } = c.fitRows(
      (i, text, s, y) => {
        const padX = s * 0.9;
        const padY = s * 0.75;
        const badge = s * 1.5;
        const t = c.text(text, { slot: `point:${i}`, font: JAKARTA, weight: 600, fill: '#1a1a1a', left: tb.left + padX + badge + s * 0.7, width: tb.width - padX * 2 - badge - s * 0.7, top: y + padY, lh: 1.3, size: s });
        const ch = Math.max(h(t), badge) + padY * 2;
        const card = c.rect({ left: tb.left, top: y, w: tb.width, h: ch, fill: '#ffffff', rx: s * 0.8 });
        const bd = c.circle({ cx: tb.left + padX + badge / 2, cy: y + ch / 2, r: badge / 2, fill: acc });
        const n = c.text(String(i + 1), { font: SANS, weight: 700, fill: accF.on, left: tb.left + padX, width: badge, top: 0, align: 'center', size: s * 0.85 });
        n.set({ top: y + ch / 2 - h(n) / 2 });
        t.set({ top: y + ch / 2 - h(t) / 2 });
        return { objs: [card, bd, n, t], h: ch, cy: y + ch / 2 };
      },
      avail,
      c.u * 0.05,
      (s) => s * 0.55
    );
    placeRows(c, rows, tb.y, avail, height);
    await c.footer({ dark: false, align: 'left' });
  },
};

const timeline: Template = {
  id: 'timeline',
  name: 'Timeline',
  kind: 'excerpt',
  blurb: 'Connected steps down the page',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#f9f9f9');
    const acc = c.accent('#2f5bff');
    const tb = titleBlock(c, { titleFont: SANS, titleWeight: 700, titleColor: '#111111', subColor: '#777777', label: 'The journey', labelColor: acc });
    const avail = c.h - c.m - c.footerH - tb.y;
    const { rows, height } = c.fitRows(
      (i, text, s, y) => {
        const r = s * 0.42;
        const t = c.text(text, { slot: `point:${i}`, font: JAKARTA, weight: 600, fill: '#1c1c1c', left: tb.left + r * 4, width: tb.width - r * 4, top: y, lh: 1.3, size: s });
        const node = c.circle({ cx: tb.left + r, cy: y + s * 0.78, r, fill: acc, stroke: '#f9f9f9', sw: s * 0.14 });
        return { objs: [node, t], h: h(t), cy: y + s * 0.78 };
      },
      avail,
      c.u * 0.056,
      (s) => s * 0.9
    );
    const dy = tb.y + Math.max(0, (avail - height) / 2);
    if (rows.length > 1) {
      const r = rows[0];
      const first = rows[0].cy + dy;
      const last = rows[rows.length - 1].cy + dy;
      const x = (r.objs[0].left ?? tb.left) - 2;
      c.add(c.rect({ left: x, top: first, w: 4, h: last - first, fill: acc, opacity: 0.35 }));
    }
    placeRows(c, rows, tb.y, avail, height);
    await c.footer({ dark: false, align: 'left' });
  },
};

const scriptureSerif: Template = {
  id: 'scripture-serif',
  name: 'Study Notes',
  kind: 'excerpt',
  blurb: 'Warm serif, numbered notes',
  fonts: ['Instrument Serif', 'Cormorant Garamond', JAKARTA],
  build: async (c) => {
    c.bgSolid('#f3ede2');
    const acc = c.accent('#b5532c');
    const tb = titleBlock(c, { titleFont: 'Instrument Serif', titleWeight: 400, titleColor: '#2a2118', subColor: '#8a7c68', label: 'Notes from the message', labelColor: acc });
    const avail = c.h - c.m - c.footerH - tb.y;
    const { rows, height } = c.fitRows(
      (i, text, s, y) => {
        const numW = s * 2.2;
        const num = c.text(String(i + 1).padStart(2, '0'), { font: JAKARTA, weight: 800, fill: acc, left: tb.left, width: numW, top: y + s * 0.18, size: s * 0.62, spacing: 100 });
        const t = c.text(text, { slot: `point:${i}`, font: 'Cormorant Garamond', weight: 600, fill: '#2a2118', left: tb.left + numW, width: tb.width - numW, top: y, lh: 1.22, size: s * 1.22 });
        const line = i > 0 ? [c.rect({ left: tb.left, top: y - s * 0.5, w: tb.width, h: 2, fill: '#2a2118', opacity: 0.14 })] : [];
        return { objs: [...line, num, t], h: h(t), cy: y + h(t) / 2 };
      },
      avail,
      c.u * 0.056,
      (s) => s * 0.95
    );
    placeRows(c, rows, tb.y, avail, height);
    await c.footer({ dark: false, align: 'left' });
  },
};

const glassPoints: Template = {
  id: 'glass-points',
  name: 'Glass Cards',
  kind: 'excerpt',
  blurb: 'Gradient with frosted point cards',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgGradient('#312e81', '#be185d', 150);
    c.add(c.circle({ cx: c.w * 0.9, cy: c.h * 0.08, r: c.u * 0.4, fill: '#ffffff', opacity: 0.06 }));
    const tb = titleBlock(c, { titleFont: SANS, titleWeight: 700, titleColor: '#ffffff', subColor: '#ffffffb3', label: 'Key points', labelColor: '#ffffffb3' });
    const avail = c.h - c.m - c.footerH - tb.y;
    const { rows, height } = c.fitRows(
      (i, text, s, y) => {
        const padX = s * 0.9;
        const padY = s * 0.7;
        const t = c.text(text, { slot: `point:${i}`, font: SANS, weight: 500, fill: '#ffffff', left: tb.left + padX + s * 1.6, width: tb.width - padX * 2 - s * 1.6, top: y + padY, lh: 1.3, size: s });
        const ch = h(t) + padY * 2;
        const card = c.rect({ left: tb.left, top: y, w: tb.width, h: ch, fill: '#ffffff', rx: s * 0.8, opacity: 0.14, stroke: '#ffffff', sw: 2 });
        const n = c.text(String(i + 1).padStart(2, '0'), { font: JAKARTA, weight: 800, fill: '#ffffff', opacity: 0.75, left: tb.left + padX, width: s * 1.6, top: 0, size: s * 0.8 });
        n.set({ top: y + padY + s * 0.12 });
        return { objs: [card, n, t], h: ch, cy: y + ch / 2 };
      },
      avail,
      c.u * 0.05,
      (s) => s * 0.5
    );
    placeRows(c, rows, tb.y, avail, height);
    await c.footer({ dark: true, align: 'left' });
  },
};


// ------------------------------------------------------ reference-inspired

function words(str: string) {
  const out: { start: number; end: number; word: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) out.push({ start: m.index, end: m.index + m[0].length, word: m[0] });
  return out;
}

const handleOf = (v: string) => (v ? (/^https?:\/\//.test(v) ? v.replace(/^https?:\/\/(www\.)?/, '') : `@${v.replace(/^@/, '')}`) : '');

// Small social badge: a drawn Instagram glyph, or a lettered circle for other networks.
function socialBadge(c: Builder, kind: string, x: number, y: number, size: number, color: string) {
  const sw = Math.max(2, size * 0.1);
  if (kind === 'instagram') {
    return [
      c.rect({ left: x, top: y, w: size, h: size, rx: size * 0.3, stroke: color, sw }),
      c.circle({ cx: x + size / 2, cy: y + size / 2, r: size * 0.22, stroke: color, sw }),
      c.circle({ cx: x + size * 0.76, cy: y + size * 0.24, r: size * 0.06, fill: color }),
    ];
  }
  const letter = ({ facebook: 'f', youtube: '▶', x: 'X', tiktok: '♪' } as Record<string, string>)[kind] ?? '•';
  const t = c.text(letter, { font: SANS, weight: 700, fill: color, left: x, width: size, align: 'center', size: size * 0.62 });
  t.set({ top: y + size / 2 - h(t) / 2 });
  return [c.circle({ cx: x + size / 2, cy: y + size / 2, r: size / 2, stroke: color, sw }), t];
}

function socialHandles(c: Builder, max = 2) {
  const b = c.content.brand;
  if (!c.content.useBrand || !b) return [];
  return (['instagram', 'facebook', 'youtube', 'x', 'tiktok'] as const)
    .filter((k) => b.socials[k])
    .slice(0, max)
    .map((k) => ({ kind: k, handle: handleOf(b.socials[k]) }));
}

// Row of icon + handle pairs, left-aligned at x.
function socialRow(c: Builder, x: number, y: number, color: string, size = c.u * 0.034, max = 2) {
  let cx = x;
  socialHandles(c, max).forEach(({ kind, handle }) => {
    const icon = socialBadge(c, kind, cx, y, size, color);
    c.add(...icon);
    const t = c.text(handle, { font: SANS, weight: 500, fill: color, left: cx + size * 1.4, width: c.w, size: size * 0.78 });
    t.set({ top: y + size / 2 - h(t) / 2, width: Math.ceil(t.calcTextWidth()) + 4 });
    c.add(t);
    cx += size * 1.4 + Math.ceil(t.calcTextWidth()) + size * 1.2;
  });
  return cx - x;
}

// Logo (recoloured if it would vanish) + church name at the top-left.
async function brandHeader(c: Builder, color: string, x = c.m * 0.7, y = c.m * 0.6) {
  const b = c.content.brand;
  if (!c.content.useBrand || !b) return;
  const rowH = c.u * 0.07;
  const img = await c.logo({ left: x, top: y, w: rowH * 3, h: rowH, onDark: luminanceOf(color) > 0.5 });
  if (img) c.add(img);
  else if (b.churchName) c.add(c.text(b.churchName, { slot: 'org', font: SANS, weight: 600, fill: color, left: x, width: c.w * 0.6, size: c.u * 0.034, top: y }));
}

const luminanceOf = (hex: string) => (readableOn(hex) === '#111111' ? 1 : 0);

// Header row used by the sermon-graphic templates: [service name] [logo] [church], on one line.
async function headerRow(
  c: Builder,
  o: { color: string; onDark: boolean; serviceFont?: string; serviceWeight?: number; serviceColor?: string; align?: 'center' | 'left'; y?: number; serviceSize?: number; centerX?: number }
) {
  const b = c.content.brand;
  const useB = c.content.useBrand && b;
  const rowH = c.u * 0.07;
  const y = o.y ?? c.m * 0.55;
  const gap = c.u * 0.03;
  const parts: { obj: FabricObject; w: number }[] = [];
  const svc = c.content.service.trim();
  if (svc) {
    const t = c.text(svc, { slot: 'service', font: o.serviceFont ?? SANS, weight: o.serviceWeight ?? 700, fill: o.serviceColor ?? o.color, left: 0, width: c.w * 0.4, size: o.serviceSize ?? c.u * 0.034, upper: true, lh: 1, align: 'left' });
    const w = Math.min(c.w * 0.4, Math.ceil(t.calcTextWidth()) + 6);
    t.set({ width: w });
    parts.push({ obj: t, w });
  }
  const logo = await c.logo({ left: 0, top: y, w: rowH * 3, h: rowH, onDark: o.onDark });
  if (logo) parts.push({ obj: logo, w: (logo.width ?? 0) * (logo.scaleX ?? 1) });
  if (useB && b?.churchName) {
    const t = c.text(b.churchName, { slot: 'org', font: JAKARTA, weight: 700, fill: o.color, left: 0, width: c.w * 0.22, size: c.u * 0.02, upper: true, lh: 1.15 });
    const w = Math.min(c.w * 0.22, Math.ceil(t.calcTextWidth()) + 6);
    t.set({ width: w });
    parts.push({ obj: t, w });
  }
  if (!parts.length) return;
  const total = parts.reduce((s, p) => s + p.w, 0) + gap * (parts.length - 1);
  let x = o.align === 'left' ? c.m * 0.7 : (o.centerX ?? c.w / 2) - total / 2;
  for (const p of parts) {
    p.obj.set(p.obj.type === 'image' ? { left: x + p.w / 2, top: y + rowH / 2 } : { left: x, top: y + rowH / 2 - h(p.obj) / 2 });
    p.obj.setCoords();
    c.add(p.obj);
    x += p.w + gap;
  }
}

// "Ministering: NAME" block (name = the session's preacher), built at y = 0 for the caller to place.
function ministeringBlock(
  c: Builder,
  o: { x: number; width: number; labelColor: string; nameColor: string; nameFont: string; nameWeight?: number; nameSize?: number; label?: string; labelFont?: string; spacing?: number; upper?: boolean; lastColor?: string }
) {
  const b = c.content.brand;
  const name = c.author || (c.content.useBrand && b?.pastorName) || '';
  if (!name) return { objs: [] as FabricObject[], h: 0 };
  const label = c.text(o.label ?? 'MINISTERING:', { font: o.labelFont ?? JAKARTA, weight: 600, fill: o.labelColor, left: o.x, width: o.width, top: 0, size: c.u * 0.016, spacing: o.spacing ?? 450 });
  const n = c.text(name, { slot: 'author', font: o.nameFont, weight: o.nameWeight ?? 700, fill: o.nameColor, left: o.x, width: o.width, top: label.height! + c.u * 0.012, size: o.nameSize ?? c.u * 0.05, upper: o.upper !== false, lh: 1.0 });
  return { objs: [label, n], h: label.height! + c.u * 0.012 + h(n) };
}

// "Live Stream on YouTube ▶ / <channel or church>" footer line.
function liveStream(c: Builder, o: { x: number; y: number; color: string; width?: number; align?: 'left' | 'center' }) {
  const b = c.content.brand;
  if (!c.content.useBrand || !b || !(b.socials.youtube || b.churchName)) return;
  const size = c.u * 0.021;
  const first = c.text('Live Stream on YouTube', { font: JAKARTA, weight: 800, fill: o.color, left: 0, width: c.w, top: 0, size });
  const second = c.text(b.socials.youtube ? handleOf(b.socials.youtube) : b.churchName, { font: JAKARTA, weight: 400, fill: o.color, left: 0, width: c.w, top: 0, size });
  const fw = Math.ceil(first.calcTextWidth()) + 4;
  const sw = Math.ceil(second.calcTextWidth()) + 4;
  first.set({ width: fw });
  second.set({ width: sw });
  const icon = size * 1.5;
  const total = fw + icon * 1.5 + sw + size * 1.2;
  const x0 = o.align === 'center' ? (c.w - total) / 2 : o.x;
  const rowTop = o.y;
  first.set({ left: x0, top: rowTop });
  const px = x0 + fw + size * 0.6;
  const play = c.rect({ left: px, top: rowTop + (h(first) - icon * 0.72) / 2, w: icon, h: icon * 0.72, fill: '#ff2d2d', rx: icon * 0.18 });
  const tri = c.path(`M ${px + icon * 0.38} ${rowTop + (h(first) - icon * 0.72) / 2 + icon * 0.16} L ${px + icon * 0.66} ${rowTop + h(first) / 2} L ${px + icon * 0.38} ${rowTop + (h(first) - icon * 0.72) / 2 + icon * 0.56} Z`, { fill: '#ffffff' });
  second.set({ left: px + icon + size * 0.6, top: rowTop });
  c.add(first, play, tri, second);
}

const wordCapsule: Template = {
  id: 'word-capsule',
  name: 'Word Capsule',
  kind: 'excerpt',
  blurb: 'Purple glow, pastor photo, points card',
  fonts: [SANS, JAKARTA, 'Bebas Neue'],
  build: async (c) => {
    c.bgGradient('#7a4be0', '#271a8c', 165);
    c.add(c.blob(c.w * 0.88, c.h * 0.08, c.u * 0.7, '#c4a8ff', 0.5), c.blob(c.w * 0.06, c.h * 0.96, c.u * 0.7, '#140c66', 0.7), c.blob(c.w * 0.5, c.h * 0.55, c.u * 0.5, '#5a8bff', 0.18));
    const b = c.content.brand;
    const useB = c.content.useBrand && b;
    const name = c.author || (useB && b?.pastorName) || '';
    const navy = '#16206b';

    // Whole pastor photo, resting on the bottom-left corner so it bleeds off the edges uncropped.
    const photo = await c.pastor({ anchor: 'bl', maxW: c.isWide ? c.w * 0.38 : c.w * 0.5, maxH: c.isWide ? c.h : c.h * 0.58 });
    const photoW = photo ? (photo.width ?? 0) * (photo.scaleX ?? 1) : 0;
    const cardLeft = photo ? Math.max(c.w * 0.34, Math.min(photoW * 0.78, c.w * 0.46)) : c.m;
    const cardW = c.w - cardLeft - c.m * 0.7;
    const pad = c.u * 0.045;
    const innerW = cardW - pad * 2;
    const cardTop = c.m * 0.6 + c.u * 0.15;
    const nameReserve = name ? (c.isWide ? c.u * 0.1 : c.u * 0.2) : c.u * 0.04;
    const maxCardH = c.h - cardTop - nameReserve - c.m * 0.5;

    const wordTitle = c.title.trim();
    const title = wordTitle ? c.fitText(wordTitle, { slot: 'title', font: 'Bebas Neue', fill: navy, left: cardLeft + pad, width: innerW, lh: 1.0, upper: true, size: c.u * 0.085 }, maxCardH * 0.28) : null;
    const titleH = title ? h(title) + c.u * 0.03 : 0;
    const avail = maxCardH - pad * 2 - titleH;
    const { rows, height } = c.fitRows(
      (i, text, s, y) => {
        const star = c.text('*', { font: SANS, weight: 700, fill: navy, left: cardLeft + pad, width: s * 1.2, top: y, size: s * 1.25 });
        const colon = text.indexOf(':');
        const lead = colon > 0 && colon < 60 ? colon + 1 : 0;
        const ref = (c.content.pointRefs?.[i] ?? '').trim();
        const t = c.rich(ref ? `${text}\n${ref}` : text, { slot: `point:${i}`, font: SANS, weight: 400, fill: '#1b1b22', left: cardLeft + pad + s * 1.3, width: innerW - s * 1.3, top: y, lh: 1.28, size: s }, lead ? [{ from: 0, to: lead, weight: 700 }] : []);
        if (ref) styleRefLine(t, text.length + 1);
        return { objs: [star, t], h: h(t), cy: y + h(t) / 2 };
      },
      avail,
      // Reads at about 32px on a 1080 canvas; only shrinks when the points would not fit the card.
      c.u * 0.0254,
      (s) => s * 0.7
    );
    const cardH = pad + titleH + height + pad;
    // Photo sits behind the card so no text is ever covered.
    if (photo) c.add(photo);
    c.add(c.shadow(c.rect({ left: cardLeft, top: cardTop, w: cardW, h: cardH, fill: '#ffffff', rx: c.u * 0.035 }), { color: 'rgba(10,5,60,0.35)', blur: c.u * 0.05, y: c.u * 0.02 }));
    if (title) c.place(title, cardTop + pad);
    placeRows(c, rows, cardTop + pad + titleH, height, height);

    // lime tag straddling the card's top-left edge
    const tagText = c.text('KEY POINTS', { font: SANS, weight: 700, italic: true, fill: navy, left: 0, width: 600, size: c.u * 0.03 });
    const tw = Math.ceil(tagText.calcTextWidth()) + 4;
    const cx = cardLeft + pad * 0.8 + (tw + pad) / 2;
    tagText.set({ width: tw, originX: 'center', originY: 'center', left: cx, top: cardTop, angle: -3, textAlign: 'center' });
    const tag = c.rect({ left: 0, top: 0, w: tw + pad, h: h(tagText) + c.u * 0.025, fill: '#d6f23c', rx: c.u * 0.006 });
    tag.set({ originX: 'center', originY: 'center', left: cx, top: cardTop, angle: -3 });
    c.add(tag, tagText);

    // service name, top right
    const svc = c.content.service.trim();
    if (svc) {
      const t = c.text(svc, { slot: 'service', font: 'Bebas Neue', fill: '#ffffff', left: c.w * 0.5, width: c.w * 0.5 - c.m * 0.7, align: 'right', top: c.m * 0.6 + c.u * 0.012, size: c.u * 0.062, upper: true, lh: 1 });
      c.add(t);
    }
    await brandHeader(c, '#ffffff');

    // preacher name block, bottom right
    if (name) {
      const nx = c.isWide ? c.w * 0.62 : c.w * 0.54;
      const nw = c.w - nx - c.m * 0.7;
      const n = c.fitText(name, { slot: 'author', font: 'Bebas Neue', fill: '#ffffff', left: nx, width: nw, lh: 1.0, upper: true, size: c.u * 0.075 }, c.u * 0.17);
      const role = [useB && b?.pastorTitle, useB && b?.churchName].filter(Boolean).join(', ');
      const r = role ? c.text(role, { font: JAKARTA, weight: 500, fill: '#ffffff', left: nx, width: nw, size: c.u * 0.022, lh: 1.3 }) : null;
      const total = h(n) + (r ? h(r) + c.u * 0.025 : 0);
      c.stackV([n, r], c.u * 0.025, { top: c.h - c.m * 0.7 - total, bottom: c.h - c.m * 0.7 }, false);
    }
  },
};

const notepaper: Template = {
  id: 'notepaper',
  name: 'Notepaper',
  kind: 'quote',
  blurb: 'Ruled note on a dreamy sky',
  fonts: ['Space Grotesk', JAKARTA, 'DM Serif Display'],
  build: async (c) => {
    c.bgGradient('#2c6b73', '#caa079', 172);
    c.add(
      c.blob(c.w * 0.82, c.h * 0.22, c.u * 0.6, '#ffffff', 0.5),
      c.blob(c.w * 0.1, c.h * 0.6, c.u * 0.55, '#ffffff', 0.35),
      c.blob(c.w * 0.7, c.h * 0.85, c.u * 0.6, '#3b2a35', 0.5),
      c.blob(c.w * 0.05, c.h * 0.05, c.u * 0.5, '#143f4a', 0.6)
    );
    const b = c.content.brand;
    const useB = c.content.useBrand && b;
    await brandHeader(c, '#ffffff');
    const ig = socialHandles(c, 1)[0];
    if (ig) {
      const t = c.text(ig.handle, { font: SANS, weight: 600, fill: '#ffffff', left: 0, width: 600, size: c.u * 0.028 });
      const tw = Math.ceil(t.calcTextWidth()) + 4;
      const size = c.u * 0.034;
      const x = c.w - c.m * 0.7 - tw - size * 1.4;
      c.add(...socialBadge(c, ig.kind, x, c.m * 0.6, size, '#ffffff'));
      t.set({ left: x + size * 1.4, top: c.m * 0.6 + size / 2 - h(t) / 2, width: tw });
      c.add(t);
    }

    const photoUrl = useB && b && b.pastorImageUrl ? b.pastorImageUrl : '';
    const showPhoto = Boolean(photoUrl) && !c.isWide;
    const eyebrow = c.title || c.service;
    const paperW = c.isWide ? c.w * 0.62 : c.w - c.m * 1.1;
    const paperLeft = c.isWide ? (c.w - paperW) / 2 : c.m * 0.55;
    const pad = c.u * 0.07;
    const innerLeft = paperLeft + pad * 1.15;
    const innerW = paperW - pad * 2.1;
    const top = c.m * 0.6 + c.u * 0.16;
    const lowerReserve = (showPhoto ? c.u * 0.3 : 0) + (eyebrow ? c.u * 0.17 : c.u * 0.05) + c.footerH * 0.2;
    const maxPaperH = c.h - top - lowerReserve - c.m * 0.5;
    const a = c.author ? c.text(`— ${c.author}`, { font: 'Space Grotesk', weight: 700, fill: '#2b2b30', left: innerLeft, width: innerW, align: 'center', spacing: 40, size: c.u * 0.03 }) : null;
    const q = c.fitText(c.q, { slot: 'quote', font: 'Space Grotesk', weight: 500, fill: '#2b2b30', left: innerLeft, width: innerW, align: 'center', lh: 1.22, spacing: 50, size: c.quoteSize(0.9) }, maxPaperH - pad * 2 - (a ? h(a) + c.u * 0.04 : 0));
    const paperH = Math.min(maxPaperH, Math.max(maxPaperH * 0.7, h(q) + (a ? h(a) + c.u * 0.04 : 0) + pad * 2.2));

    const paper = c.shadow(c.rect({ left: paperLeft, top, w: paperW, h: paperH, fill: '#fbfbf7' }), { color: 'rgba(0,0,0,0.35)', blur: c.u * 0.04, y: c.u * 0.015 });
    c.add(paper);
    const lineGap = c.u * 0.043;
    for (let y = top + lineGap * 1.6; y < top + paperH - lineGap * 0.5; y += lineGap) {
      c.add(c.rect({ left: paperLeft, top: y, w: paperW, h: Math.max(1.5, c.u * 0.0018), fill: '#bcd2ec' }));
    }
    c.add(c.rect({ left: paperLeft + c.u * 0.075, top, w: Math.max(2, c.u * 0.002), h: paperH, fill: '#f0a8a8', opacity: 0.55 }));
    for (let y = top + lineGap * 0.7; y < top + paperH - lineGap; y += lineGap * 1.55) {
      c.add(c.rect({ left: paperLeft + c.u * 0.008, top: y, w: c.u * 0.028, h: c.u * 0.02, fill: '#5d6a73', rx: c.u * 0.008, opacity: 0.9 }));
    }
    // paperclip
    const clipX = paperLeft + paperW * 0.2;
    c.add(c.rect({ left: clipX, top: top - c.u * 0.06, w: c.u * 0.034, h: c.u * 0.14, rx: c.u * 0.017, stroke: '#aab0b6', sw: Math.max(3, c.u * 0.004) }), c.rect({ left: clipX + c.u * 0.008, top: top - c.u * 0.035, w: c.u * 0.018, h: c.u * 0.1, rx: c.u * 0.009, stroke: '#aab0b6', sw: Math.max(3, c.u * 0.004) }));

    const used = h(q) + (a ? h(a) + c.u * 0.04 : 0);
    const startY = top + (paperH - used) / 2;
    q.set({ top: startY });
    q.setCoords();
    c.add(q);
    if (a) {
      a.set({ top: startY + h(q) + c.u * 0.04 });
      a.setCoords();
      c.add(a);
    }

    let y = top + paperH;
    if (showPhoto) {
      const d = c.u * 0.3;
      const img = await c.image(photoUrl, { left: (c.w - d) / 2, top: y - d * 0.18, w: d, h: d, fit: 'cover', shape: 'circle' });
      if (img) {
        c.add(c.circle({ cx: c.w / 2, cy: y - d * 0.18 + d / 2, r: d / 2 + c.u * 0.006, fill: '#fbfbf7' }), img);
      }
      y += d * 0.82;
    }
    if (eyebrow) {
      const kicker = c.text(useB && b?.churchName ? b.churchName : 'MESSAGE', { font: JAKARTA, weight: 700, fill: '#ffffff', left: c.m, width: c.cw, align: 'center', upper: true, spacing: 250, size: c.u * 0.02, opacity: 0.85 });
      const t = c.fitText(eyebrow, { font: 'DM Serif Display', fill: '#f1d58b', left: c.m, width: c.cw, align: 'center', lh: 1.0, size: c.u * 0.075 }, c.u * 0.14);
      c.stackV([kicker, t], c.u * 0.012, { top: y + c.u * 0.03, bottom: c.h - c.m * 0.6 }, false);
    }
  },
};

const stickerCut: Template = {
  id: 'sticker-cut',
  name: 'Sticker Cut',
  kind: 'quote',
  blurb: 'Heavy red type with a cream cut-out edge',
  fonts: ['Anton', JAKARTA],
  build: async (c) => {
    c.bgGradient('#9fae98', '#c9a67d', 140);
    c.add(c.blob(c.w * 0.85, c.h * 0.8, c.u * 0.65, '#7a3f1d', 0.6), c.blob(c.w * 0.05, c.h * 0.55, c.u * 0.5, '#5a1f1f', 0.5), c.blob(c.w * 0.5, c.h * 0.05, c.u * 0.5, '#e8efe0', 0.4));
    const bw = c.isWide ? c.w * 0.74 : c.cw;
    const left = (c.w - bw) / 2;
    const edge = c.u * 0.034;
    const q = c.fitText(c.q, { slot: 'quote', font: 'Anton', fill: '#dd2420', stroke: '#efe8d8', strokeWidth: edge * 2, roundJoin: true, left, width: bw, align: 'center', lh: 0.9, spacing: -25, upper: true, size: c.quoteSize(1.35) }, c.regionH() * 0.72);
    c.shadow(q, { color: 'rgba(0,0,0,0.25)', blur: c.u * 0.03, y: c.u * 0.01 });
    const items: (Textbox | null)[] = [q];
    c.stackV(items, 0);
    if (c.author) {
      const t = c.text(c.author, { font: JAKARTA, weight: 800, fill: '#dd2420', left: 0, width: 800, upper: true, spacing: 200, size: c.u * 0.024 });
      const tw = Math.ceil(t.calcTextWidth()) + 4;
      const padX = c.u * 0.03;
      const pillTop = (q.top ?? 0) + h(q) + edge + c.u * 0.03;
      t.set({ width: tw, left: (c.w - tw) / 2, top: pillTop + c.u * 0.014 });
      c.add(c.rect({ left: (c.w - tw) / 2 - padX, top: pillTop, w: tw + padX * 2, h: h(t) + c.u * 0.028, fill: '#efe8d8', rx: c.u * 0.02 }), t);
    }
    await c.footer({ dark: true, align: 'center' });
  },
};

const frostedGlass: Template = {
  id: 'frosted-glass',
  name: 'Frosted Glass',
  kind: 'quote',
  blurb: 'Soft blue haze, hairline glass frame',
  fonts: ['Montserrat', JAKARTA],
  build: async (c) => {
    c.bgGradient('#1b57a8', '#5f93d1', 168);
    c.add(
      c.blob(c.w * 0.85, c.h * 0.12, c.u * 0.7, '#1f63b8', 0.7),
      c.blob(c.w * 0.1, c.h * 0.55, c.u * 0.5, '#e9a56c', 0.4),
      c.blob(c.w * 0.4, c.h * 0.95, c.u * 0.6, '#9ec0e8', 0.5),
      c.blob(c.w * 0.5, c.h * 0.35, c.u * 0.5, '#6aa4e8', 0.45)
    );
    const cardW = c.isWide ? c.w * 0.52 : c.w * 0.72;
    const cardH = c.isWide ? c.h * 0.74 : Math.min(c.h * 0.66, c.w * 0.98);
    const cardLeft = (c.w - cardW) / 2;
    const cardTop = (c.h - cardH) / 2 + (c.isWide ? 0 : c.u * 0.02);
    // hairline from the top edge down to the card, like it's hanging
    c.add(c.rect({ left: c.w / 2, top: 0, w: Math.max(1.5, c.u * 0.0018), h: cardTop, fill: '#ffffff', opacity: 0.55 }));
    c.add(c.rect({ left: cardLeft, top: cardTop, w: cardW, h: cardH, fill: '#ffffff', opacity: 0.1, rx: c.u * 0.05, stroke: '#ffffff', sw: Math.max(2, c.u * 0.0025) }));
    const pad = cardW * 0.14;
    const ws = words(c.q.toUpperCase());
    const boldTo = ws.length ? ws[Math.max(0, Math.ceil(ws.length * 0.45) - 1)].end : 0;
    const upper = c.q.toUpperCase();
    const a = c.author ? c.text(c.author, { font: JAKARTA, weight: 500, fill: '#ffffff', left: cardLeft, width: cardW, align: 'center', size: c.u * 0.022 }) : null;
    const maxQ = cardH - pad * 1.4 - (a ? h(a) + c.u * 0.08 : 0);
    // fit by shrinking the whole rich text
    let size = c.u * 0.1 * (c.q.length < 60 ? 1.2 : c.q.length < 110 ? 0.9 : 0.68) * (c.isTall ? 1.15 : 1);
    let q = c.rich(upper, { font: 'Montserrat', weight: 300, fill: '#ffffff', left: cardLeft + pad, width: cardW - pad * 2, align: 'center', lh: 1.02, spacing: -10, size }, [{ from: 0, to: boldTo, weight: 800 }]);
    for (let i = 0; i < 40 && h(q) > maxQ && size > c.u * 0.022; i += 1) {
      size *= 0.93;
      q = c.rich(upper, { font: 'Montserrat', weight: 300, fill: '#ffffff', left: cardLeft + pad, width: cardW - pad * 2, align: 'center', lh: 1.02, spacing: -10, size }, [{ from: 0, to: boldTo, weight: 800 }]);
    }
    c.stackV([q, a], c.u * 0.07, { top: cardTop, bottom: cardTop + cardH });
    await c.footer({ dark: true, align: 'center' });
  },
};

const annotatedSerif: Template = {
  id: 'annotated-serif',
  name: 'Annotated Serif',
  kind: 'quote',
  blurb: 'Serif quote with hand-drawn marks',
  fonts: ['DM Serif Display', JAKARTA],
  build: async (c) => {
    c.bgGradient('#2a8397', '#3a6a86', 170);
    c.add(
      c.blob(c.w * 0.95, c.h * 0.5, c.u * 0.65, '#d49a58', 0.75),
      c.blob(c.w * 0.1, c.h * 0.2, c.u * 0.55, '#7fc3cf', 0.4),
      c.blob(c.w * 0.05, c.h * 0.95, c.u * 0.5, '#0e2430', 0.7),
      c.blob(c.w * 0.5, c.h * 0.85, c.u * 0.5, '#1e5b78', 0.5)
    );
    const bw = c.isWide ? c.w * 0.6 : c.cw * 0.86;
    const left = (c.w - bw) / 2;
    const text = c.q;
    const ws = words(text);
    // Emphasis picks: italic+underline the longest word, circle the next-longest short word.
    const ranked = [...ws].filter((w) => w.word.replace(/\W/g, '').length >= 4).sort((a, b) => b.word.length - a.word.length);
    const em = ranked[0];
    const circ = ws.length >= 4 ? ranked.find((w) => w !== em && Math.abs(w.start - (em?.start ?? 0)) > 3) : undefined;
    const ranges = em ? [{ from: em.start, to: em.end - (/\W$/.test(em.word) ? 1 : 0), italic: true, underline: true }] : [];
    const mk = (size: number) => c.rich(text, { slot: 'quote', font: 'DM Serif Display', fill: '#ffffff', left, width: bw, align: 'center', lh: 1.04, spacing: -15, size }, ranges);
    let size = c.quoteSize(1.15);
    let q = mk(size);
    const maxH = c.regionH() * 0.62;
    for (let i = 0; i < 40 && h(q) > maxH && size > c.u * 0.025; i += 1) {
      size *= 0.93;
      q = mk(size);
    }
    const a = c.author ? c.text(c.author, { font: JAKARTA, weight: 600, fill: '#ffffff', left, width: bw, align: 'center', upper: true, spacing: 250, size: c.u * 0.022, opacity: 0.85 }) : null;
    const region = c.region();
    const total = h(q) + (a ? h(a) + c.u * 0.1 : 0) + c.u * 0.07;
    q.set({ top: region.top + Math.max(0, (region.bottom - region.top - total) / 2) });
    q.setCoords();
    c.add(q);
    const white = '#ffffff';
    const sw = Math.max(2.5, c.u * 0.0035);
    if (circ) {
      const box = c.wordBox(q, circ.start, circ.end - (/\W$/.test(circ.word) ? 1 : 0));
      if (box) {
        const rx = box.w / 2 + c.u * 0.02;
        const ry = box.h * 0.46;
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h * 0.56;
        c.add(c.path(`M ${cx - rx} ${cy} C ${cx - rx} ${cy - ry * 1.35}, ${cx + rx} ${cy - ry * 1.35}, ${cx + rx} ${cy - ry * 0.1} C ${cx + rx} ${cy + ry * 1.35}, ${cx - rx} ${cy + ry * 1.4}, ${cx - rx * 0.97} ${cy - ry * 0.3}`, { stroke: white, sw, opacity: 0.9 }));
      }
    }
    const bottom = (q.top ?? 0) + h(q);
    // underline with arrowhead, then a looping arrow tail on the left
    const ay = bottom + c.u * 0.035;
    const x0 = left + bw * 0.08;
    const x1 = left + bw * 0.97;
    c.add(c.path(`M ${x0} ${ay} Q ${(x0 + x1) / 2} ${ay + c.u * 0.006} ${x1} ${ay - c.u * 0.002} M ${x1 - c.u * 0.022} ${ay - c.u * 0.018} L ${x1} ${ay - c.u * 0.002} L ${x1 - c.u * 0.022} ${ay + c.u * 0.016}`, { stroke: white, sw, opacity: 0.9 }));
    const lx = left - c.u * 0.015;
    const ly = (q.top ?? 0) + h(q) * 0.72;
    c.add(c.path(`M ${lx + c.u * 0.1} ${ly - c.u * 0.04} C ${lx - c.u * 0.02} ${ly - c.u * 0.02}, ${lx - c.u * 0.05} ${ly + c.u * 0.05}, ${lx - c.u * 0.015} ${ly + c.u * 0.11} M ${lx - c.u * 0.035} ${ly + c.u * 0.09} L ${lx - c.u * 0.015} ${ly + c.u * 0.115} L ${lx + c.u * 0.008} ${ly + c.u * 0.09}`, { stroke: white, sw: sw * 0.85, opacity: 0.85 }));
    if (a) {
      a.set({ top: ay + c.u * 0.06 });
      a.setCoords();
      c.add(a);
    }
    await c.footer({ dark: true, align: 'center' });
  },
};


// ---------------------------------------------- sermon-graphic families
// Modelled on church sermon posters: header logos, a statement card, whole pastor photo bleeding
// off an edge, "Ministering" credit and live-stream line. Each family has a quote and a title layout.

// ---- Fortune (deep green) ----

async function fortuneBase(c: Builder) {
  c.bgGradient('#0f4a3f', '#041a16', 172);
  c.add(
    c.blob(c.w * 0.8, c.h * 0.12, c.u * 0.7, '#2f8a73', 0.45),
    c.blob(c.w * 0.02, c.h * 0.42, c.u * 0.13, '#e9b93a', 0.85),
    c.blob(c.w * 0.99, c.h * 0.3, c.u * 0.17, '#e9b93a', 0.85),
    c.blob(c.w * 0.3, c.h * 0.97, c.u * 0.6, '#000000', 0.55)
  );
  const g = await c.grain(0.35);
  if (g) c.add(g);
  await headerRow(c, { color: '#ffffff', onDark: true, serviceFont: 'Instrument Serif', serviceWeight: 400, serviceColor: '#f3d98b', serviceSize: c.u * 0.052 });
}

function fortuneGeometry(c: Builder) {
  const left = c.m * 0.8;
  const width = c.isWide ? c.w * 0.5 : c.w * 0.6;
  const top = c.isWide ? c.h * 0.24 : c.h * 0.27;
  const bottom = c.isWide ? c.h * 0.84 : c.h * 0.82;
  return { left, width, top, bottom, pad: c.u * 0.06 };
}

async function fortunePhoto(c: Builder) {
  const p = await c.pastor({ anchor: 'br', maxW: c.isWide ? c.w * 0.42 : c.w * 0.46, maxH: c.isWide ? c.h * 0.96 : c.h * 0.52 });
  if (p) c.add(p);
}

const fortuneQuote: Template = {
  id: 'fortune-quote',
  name: 'Fortune Quote',
  kind: 'quote',
  blurb: 'Deep green, serif quote, gold keywords',
  fonts: ['Instrument Serif', JAKARTA, 'Bebas Neue'],
  build: async (c) => {
    await fortuneBase(c);
    const { left, width, top, bottom, pad } = fortuneGeometry(c);
    const gold = c.accent('#f5a52a');
    const mb = ministeringBlock(c, { x: left + pad, width: width - pad * 2, labelColor: gold, nameColor: '#ffffff', nameFont: 'Bebas Neue', nameSize: c.u * 0.052 });
    const room = bottom - top - pad * 2 - mb.h - (mb.h ? c.u * 0.05 : 0);
    const q = c.fitText(c.q, { slot: 'quote', font: 'Instrument Serif', fill: '#ffffff', left: left + pad, width: width - pad * 2, lh: 1.0, spacing: -10, size: c.quoteSize(1.2) }, room);
    c.emphasize(q, gold);
    const qh = h(q);
    const cardH = pad + qh + (mb.h ? c.u * 0.05 + mb.h : 0) + pad;
    c.add(c.rect({ left, top, w: width, h: cardH, fill: '#0b2a24', rx: c.u * 0.05, opacity: 0.6 }));
    c.place(q, top + pad);
    mb.objs.forEach((o) => {
      o.set({ top: (o.top ?? 0) + top + pad + qh + c.u * 0.05 });
      o.setCoords();
      c.add(o);
    });
    await fortunePhoto(c);
    liveStream(c, { x: c.m * 0.8, y: c.h - c.m * 0.75, color: '#ffffff', align: 'left' });
  },
};

const fortuneTitle: Template = {
  id: 'fortune-title',
  name: 'Fortune Series Title',
  kind: 'title',
  blurb: 'Series title card with script kicker',
  fonts: ['Instrument Serif', 'Mrs Saint Delafield', JAKARTA, 'Bebas Neue'],
  build: async (c) => {
    await fortuneBase(c);
    const { left, width, top, bottom, pad } = fortuneGeometry(c);
    const gold = c.accent('#f5a52a');
    const mb = ministeringBlock(c, { x: left + pad, width: width - pad * 2, labelColor: gold, nameColor: '#ffffff', nameFont: 'Bebas Neue', nameSize: c.u * 0.052 });
    const kicker = c.text('Teaching Series:', { font: 'Mrs Saint Delafield', fill: '#ffffff', left: left + pad, width: width - pad * 2, size: c.u * 0.085, lh: 1 });
    const part = c.part.trim() ? c.text(c.part.trim(), { slot: 'part', font: 'Instrument Serif', italic: true, fill: gold, left: left + pad, width: width - pad * 2, size: c.u * 0.075, lh: 1 }) : null;
    const room = bottom - top - pad * 2 - mb.h - h(kicker) - (part ? h(part) : 0) - c.u * 0.1;
    const t = c.fitText(c.title || 'Message title', { slot: 'title', font: 'Instrument Serif', fill: '#ffffff', left: left + pad, width: width - pad * 2, lh: 1.0, spacing: -10, size: c.u * 0.13 }, room);
    const cardH = pad + h(kicker) + c.u * 0.015 + h(t) + (part ? h(part) + c.u * 0.01 : 0) + (mb.h ? c.u * 0.05 + mb.h : 0) + pad;
    c.add(c.rect({ left, top, w: width, h: cardH, fill: '#0b2a24', rx: c.u * 0.05, opacity: 0.6 }));
    let y = top + pad;
    c.place(kicker, y);
    y += h(kicker) + c.u * 0.015;
    c.place(t, y);
    y += h(t) + c.u * 0.01;
    if (part) {
      c.place(part, y);
      y += h(part);
    }
    mb.objs.forEach((o) => {
      o.set({ top: (o.top ?? 0) + y + c.u * 0.05 });
      o.setCoords();
      c.add(o);
    });
    await fortunePhoto(c);
    liveStream(c, { x: c.m * 0.8, y: c.h - c.m * 0.75, color: '#ffffff', align: 'left' });
  },
};

// ---- Heat (orange / red) ----

async function heatBase(c: Builder) {
  c.bgGradient('#ffcb2e', '#f0281c', 165);
  c.add(
    c.blob(c.w * 0.1, c.h * 0.05, c.u * 0.75, '#ffe45e', 0.85),
    c.blob(c.w * 0.62, c.h * 0.02, c.u * 0.45, '#ff5fb0', 0.5),
    c.blob(c.w * 0.85, c.h * 0.55, c.u * 0.6, '#ff4a1c', 0.55),
    c.blob(c.w * 0.1, c.h * 0.95, c.u * 0.6, '#ffb820', 0.65)
  );
  // vertical curtain folds
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const folds = 16;
  for (let i = 0; i < folds; i += 1) {
    const w = c.u * (0.018 + rnd() * 0.05);
    c.add(c.rect({ left: (i / folds) * c.w + rnd() * c.u * 0.03, top: 0, w, h: c.h, fill: rnd() > 0.5 ? '#8a0c0c' : '#ffb000', opacity: 0.05 + rnd() * 0.09 }));
  }
  const g = await c.grain(0.5);
  if (g) c.add(g);
  await headerRow(c, { color: '#ffffff', onDark: true, serviceFont: 'Archivo Black', serviceWeight: 400, serviceSize: c.u * 0.036 });
}

async function heatPhoto(c: Builder) {
  const p = await c.pastor({ anchor: 'br', maxW: c.isWide ? c.w * 0.44 : c.w * 0.5, maxH: c.isWide ? c.h * 0.96 : c.h * 0.52 });
  if (p) c.add(p);
}

function heatMinistering(c: Builder, x: number, width: number, top: number) {
  const mb = ministeringBlock(c, { x, width, labelColor: '#ffffff', nameColor: '#ffffff', nameFont: 'Barlow Condensed', nameWeight: 700, nameSize: c.u * 0.045, spacing: 900 });
  mb.objs.forEach((o) => {
    o.set({ top: (o.top ?? 0) + top });
    o.setCoords();
    c.add(o);
  });
  return mb.h;
}

function heatLive(c: Builder) {
  const b = c.content.brand;
  if (!c.content.useBrand || !b || !(b.socials.youtube || b.churchName)) return;
  const x = c.m * 0.85;
  const y = c.h - c.m * 1.6;
  const a = c.text('Live Stream on', { font: JAKARTA, weight: 800, fill: '#ffffff', left: x, width: c.w * 0.3, top: y, size: c.u * 0.021 });
  const b2 = c.text('YouTube', { font: JAKARTA, weight: 800, fill: '#ffffff', left: x, width: c.w * 0.3, top: y + h(a), size: c.u * 0.021 });
  const c3 = c.text(b.socials.youtube ? handleOf(b.socials.youtube) : b.churchName, { font: JAKARTA, weight: 400, fill: '#ffffff', left: x, width: c.w * 0.3, top: y + h(a) + h(b2), size: c.u * 0.021 });
  c.add(a, b2, c3);
}

const heatQuote: Template = {
  id: 'heat-quote',
  name: 'Heat Excerpt',
  kind: 'quote',
  blurb: 'Hot gradient, bold condensed caps',
  fonts: ['Barlow Condensed', 'Mrs Saint Delafield', 'Archivo Black', JAKARTA],
  build: async (c) => {
    await heatBase(c);
    const left = c.m * 0.85;
    const width = c.isWide ? c.w * 0.48 : c.w * 0.62;
    const top = c.h * 0.3;
    const mbH = c.author || (c.content.useBrand && c.content.brand?.pastorName) ? c.u * 0.12 : 0;
    const q = c.fitText(c.q, { slot: 'quote', font: 'Barlow Condensed', weight: 700, fill: '#ffffff', left, width, lh: 0.98, upper: true, spacing: -10, size: c.quoteSize(1.05) }, c.h * 0.7 - top - mbH - c.u * 0.06);
    const script = c.text('word excerpts', { font: 'Mrs Saint Delafield', fill: '#3fd6dc', left: left + width * 0.45, width: width * 0.7, top: top - c.u * 0.15, size: c.u * 0.1, lh: 1 });
    c.add(script);
    c.place(q, top + c.u * 0.03);
    heatMinistering(c, left, width, top + c.u * 0.03 + h(q) + c.u * 0.07);
    await heatPhoto(c);
    heatLive(c);
  },
};

const heatTitle: Template = {
  id: 'heat-title',
  name: 'Heat Series Title',
  kind: 'title',
  blurb: 'Huge poster title with script accent',
  fonts: ['Archivo Black', 'Mrs Saint Delafield', 'Barlow Condensed', JAKARTA],
  build: async (c) => {
    await heatBase(c);
    const left = c.m * 0.85;
    const width = c.w - left - c.m * 0.5;
    const top = c.h * 0.17;
    const t = c.fitText(c.title || 'Message title', { slot: 'title', font: 'Archivo Black', fill: '#ffffff', left, width, lh: 0.88, upper: true, spacing: -30, size: c.u * 0.2 }, c.h * 0.42);
    c.place(t, top);
    if (c.part.trim()) {
      const p = c.text(c.part.trim(), { slot: 'part', font: 'Mrs Saint Delafield', fill: '#3fd6dc', left: left + width * 0.2, width: width * 0.5, size: c.u * 0.1, lh: 1 });
      c.place(p, top + h(t) - c.u * 0.015);
    }
    heatMinistering(c, left, width * 0.5, c.h * 0.7);
    await heatPhoto(c);
    heatLive(c);
  },
};

// ---- Paper (red/purple with a cream sheet) ----

async function paperBase(c: Builder) {
  c.bgGradient('#b3121c', '#6e1f6e', 140);
  c.add(
    c.blob(c.w * 0.85, c.h * 0.15, c.u * 0.7, '#6a2fd8', 0.55),
    c.blob(c.w * 0.1, c.h * 0.9, c.u * 0.6, '#ff3a2a', 0.5),
    c.blob(c.w * 0.5, c.h * 0.5, c.u * 0.6, '#d10f2a', 0.4)
  );
  const ghost = c.content.service.trim() || 'Sermon';
  c.add(
    c.text(ghost, { font: 'Playfair Display', fill: '#ffffff', opacity: 0.12, left: -c.w * 0.05, top: c.h * -0.02, width: c.w * 1.3, size: c.u * 0.38, lh: 0.9, upper: false }).set({ angle: -8 }),
    c.text(ghost, { font: 'Playfair Display', fill: '#ffffff', opacity: 0.1, left: -c.w * 0.1, top: c.h * 0.86, width: c.w * 1.3, size: c.u * 0.3, lh: 0.9 }).set({ angle: -8 })
  );
  const g = await c.grain(0.55);
  if (g) c.add(g);
}

function paperGeometry(c: Builder) {
  const paper = c.isWide
    ? { left: c.w * 0.05, top: c.h * 0.1, w: c.w * 0.44, h: c.h * 0.8 }
    : { left: c.w * 0.04, top: c.h * 0.28, w: c.w * 0.56, h: c.h * 0.52 };
  const dark = { cx: paper.left + paper.w * 0.62, cy: paper.top + paper.h * 0.45, w: paper.w * 1.2, h: paper.h * 1.18 };
  return { paper, dark };
}

async function paperCards(c: Builder, g: ReturnType<typeof paperGeometry>) {
  const dk = c.rect({ left: 0, top: 0, w: g.dark.w, h: g.dark.h, fill: '#17171a', stroke: '#37c8c0', sw: Math.max(3, c.u * 0.004) });
  dk.set({ originX: 'center', originY: 'center', left: g.dark.cx, top: g.dark.cy, angle: 4 });
  const pp = c.rect({ left: 0, top: 0, w: g.paper.w, h: g.paper.h, fill: '#fffdf4', stroke: '#37c8c0', sw: Math.max(2, c.u * 0.0025) });
  pp.set({ originX: 'center', originY: 'center', left: g.paper.left + g.paper.w / 2, top: g.paper.top + g.paper.h / 2, angle: -1.5 });
  c.shadow(pp, { color: 'rgba(0,0,0,0.35)', blur: c.u * 0.03 });
  c.add(dk, pp);
  await headerRow(c, { color: '#ffffff', onDark: true, y: g.dark.cy - g.dark.h / 2 + c.u * 0.012, centerX: g.dark.cx, serviceFont: 'Playfair Display', serviceWeight: 700, serviceSize: c.u * 0.028 });
}

async function paperPhoto(c: Builder) {
  const p = await c.pastor({ anchor: 'br', maxW: c.isWide ? c.w * 0.42 : c.w * 0.42, maxH: c.isWide ? c.h * 0.96 : c.h * 0.58 });
  if (p) c.add(p);
  liveStream(c, { x: c.isWide ? c.w * 0.06 : c.w * 0.06, y: c.h - c.m * 0.85, color: '#ffffff' });
}

const paperQuote: Template = {
  id: 'paper-quote',
  name: 'Paper Excerpt',
  kind: 'quote',
  blurb: 'Cream sheet on a tilted dark card',
  fonts: ['Instrument Serif', 'Playfair Display', 'Inter Tight', JAKARTA],
  build: async (c) => {
    await paperBase(c);
    const g = paperGeometry(c);
    await paperCards(c, g);
    const { paper } = g;
    const pad = paper.w * 0.1;
    const x = paper.left + pad;
    const w = paper.w - pad * 2;
    const label = c.text('WORD EXCERPTS', { font: 'Inter Tight', weight: 500, fill: '#3a3a3a', left: x, width: w, top: paper.top + pad * 0.9, size: c.u * 0.02, spacing: 450 });
    c.add(label);
    const mb = ministeringBlock(c, { x, width: w, labelColor: '#222222', nameColor: '#111111', nameFont: 'Inter Tight', nameWeight: 700, nameSize: c.u * 0.036, upper: false, spacing: 0, label: 'Ministering:', labelFont: 'Inter Tight' });
    const qTop = paper.top + pad * 0.9 + h(label) + pad * 0.7;
    const room = paper.top + paper.h - pad - mb.h - qTop - c.u * 0.04;
    const q = c.fitText(c.q, { slot: 'quote', font: 'Instrument Serif', fill: '#7a1215', left: x, width: w, lh: 1.03, spacing: -20, size: c.quoteSize(1.0) }, room);
    c.place(q, qTop);
    mb.objs.forEach((o) => {
      o.set({ top: (o.top ?? 0) + paper.top + paper.h - pad * 0.7 - mb.h });
      o.setCoords();
      c.add(o);
    });
    await paperPhoto(c);
  },
};

const paperTitle: Template = {
  id: 'paper-title',
  name: 'Paper Series Title',
  kind: 'title',
  blurb: 'Burgundy word blocks on cream',
  fonts: ['Instrument Serif', 'Playfair Display', 'Inter Tight', JAKARTA],
  build: async (c) => {
    await paperBase(c);
    const g = paperGeometry(c);
    await paperCards(c, g);
    const { paper } = g;
    const pad = paper.w * 0.1;
    const x = paper.left + pad;
    const w = paper.w - pad * 2;
    const kicker = c.text('TEACHING SERIES:', { font: 'Inter Tight', weight: 500, fill: '#7a1215', left: x, width: w, top: paper.top + pad * 0.9, size: c.u * 0.022, spacing: 250 });
    c.add(kicker);
    const mb = ministeringBlock(c, { x, width: w, labelColor: '#222222', nameColor: '#111111', nameFont: 'Inter Tight', nameWeight: 700, nameSize: c.u * 0.036, upper: false, spacing: 0, label: 'Ministering:', labelFont: 'Inter Tight' });
    const tTop = paper.top + pad * 0.9 + h(kicker) + pad * 0.6;
    const room = paper.top + paper.h - pad - mb.h - tTop - c.u * 0.07;
    const t = c.fitText(c.title || 'Message title', { slot: 'title', font: 'Instrument Serif', fill: '#f6efe0', bg: '#7a1215', left: x, width: w, lh: 1.22, spacing: -10, size: c.u * 0.11 }, room);
    c.place(t, tTop);
    if (c.part.trim()) {
      const p = c.text(c.part.trim(), { slot: 'part', font: 'Instrument Serif', fill: '#7a1215', left: x, width: w, align: 'right', size: c.u * 0.034 });
      c.place(p, tTop + h(t) + c.u * 0.012);
    }
    mb.objs.forEach((o) => {
      o.set({ top: (o.top ?? 0) + paper.top + paper.h - pad * 0.7 - mb.h });
      o.setCoords();
      c.add(o);
    });
    await paperPhoto(c);
  },
};

// ---- Showers (royal blue) ----

const showersQuote: Template = {
  id: 'showers-quote',
  name: 'Showers Excerpt',
  kind: 'quote',
  blurb: 'Royal blue, white serif, yellow highlights',
  fonts: ['Instrument Serif', 'Mrs Saint Delafield', 'Archivo Black', JAKARTA],
  build: async (c) => {
    c.bgGradient('#0c5ad0', '#083f9c', 175);
    c.add(...c.specks(60, '#4fd3ff', 0.55), c.blob(c.w * 0.8, c.h * 0.1, c.u * 0.6, '#2b86ff', 0.4));
    const g = await c.grain(0.5);
    if (g) c.add(g);
    await headerRow(c, { color: '#ffffff', onDark: true, serviceFont: 'Archivo Black', serviceWeight: 400, serviceSize: c.u * 0.034 });

    const left = c.m * 0.85;
    const width = c.isWide ? c.w * 0.5 : c.w * 0.68;
    const top = c.h * 0.27;
    const mb = ministeringBlock(c, { x: left, width: c.w * 0.3, labelColor: '#ffffff', nameColor: '#ffffff', nameFont: JAKARTA, nameWeight: 800, nameSize: c.u * 0.03, upper: false, spacing: 300 });
    const q = c.fitText(c.q, { slot: 'quote', font: 'Instrument Serif', fill: '#ffffff', left, width, lh: 1.0, spacing: -15, size: c.quoteSize(1.25) }, c.h * 0.62 - top);
    c.emphasize(q, '#fff200');
    c.place(q, top);
    c.add(c.text('word excerpts', { font: 'Mrs Saint Delafield', fill: '#6fd8ff', opacity: 0.85, left: left + width * 0.1, width: width * 0.6, top: top + h(q) + c.u * 0.015, size: c.u * 0.075, lh: 1 }).set({ angle: -4 }));

    // photo with a light-blue halo behind it
    const p = await c.pastor({ anchor: 'br', maxW: c.isWide ? c.w * 0.36 : c.w * 0.4, maxH: c.isWide ? c.h * 0.9 : c.h * 0.42 });
    if (p) {
      const pw = (p.width ?? 0) * (p.scaleX ?? 1);
      const ph = (p.height ?? 0) * (p.scaleY ?? 1);
      const halo = c.circle({ cx: (p.left ?? 0) + pw / 2, cy: (p.top ?? 0) + ph * 0.5, r: Math.max(pw, ph) * 0.52, fill: '#25b4ff' });
      c.add(halo, p);
    }
    const my = c.h - c.m * 0.95 - mb.h - c.u * 0.045;
    mb.objs.forEach((o) => {
      o.set({ top: (o.top ?? 0) + my });
      o.setCoords();
      c.add(o);
    });
    liveStream(c, { x: left, y: c.h - c.m * 0.75, color: '#ffffff' });
  },
};

// ---- Offering (green giving card) ----

const offering: Template = {
  id: 'offering',
  name: 'Offering Card',
  kind: 'give',
  blurb: 'Giving card with account details',
  fonts: ['Anton', JAKARTA],
  build: async (c) => {
    c.bgGradient('#12a436', '#05601b', 170);
    c.add(c.blob(c.w * 0.5, c.h * 0.2, c.u * 0.7, '#4be06c', 0.35), c.blob(c.w * 0.05, c.h * 0.8, c.u * 0.5, '#022f0d', 0.45));
    const word = (c.title || 'Offering').toUpperCase();
    // ghost repeats behind the headline
    const fitW = (size: number) => {
      const t = c.text(word, { font: 'Anton', fill: '#ffffff', left: 0, width: c.w * 3, size });
      return Math.ceil(t.calcTextWidth());
    };
    let size = c.u * 0.32;
    size = Math.min(size, c.isWide ? c.h * 0.26 : size);
    for (let i = 0; i < 30 && fitW(size) > c.cw; i += 1) size *= 0.93;
    const headTop = c.isWide ? c.h * 0.13 : c.h * 0.1;
    const rowH = size * 1.05;
    for (const [dy, dx] of [[-1.0, -0.28], [1.0, 0.1]] as const) {
      c.add(c.text(word, { font: 'Anton', fill: 'transparent', stroke: '#ffffff', strokeWidth: Math.max(2, c.u * 0.0025), opacity: 0.28, left: c.m + dx * c.w, width: c.w * 2, top: headTop + dy * rowH, size }));
      c.add(c.text(word, { font: 'Anton', fill: 'transparent', stroke: '#ffffff', strokeWidth: Math.max(2, c.u * 0.0025), opacity: 0.2, left: c.m - dx * c.w * 0.9 + c.w * 0.75, width: c.w * 2, top: headTop + dy * rowH, size }));
    }
    c.add(c.text(word, { slot: 'title', font: 'Anton', fill: '#ffffff', left: c.m, width: c.cw, align: 'center', top: headTop, size }));
    await headerRow(c, { color: '#ffffff', onDark: true, align: 'left', y: c.m * 0.35, serviceSize: c.u * 0.03 });

    // envelopes
    const cy = c.isWide ? c.h * 0.52 : c.h * 0.5;
    const env = (cx: number, angle: number) => {
      const w = c.u * 0.34;
      const hh = c.u * 0.22;
      const body = c.rect({ left: 0, top: 0, w, h: hh, fill: '#fbfbf8', rx: c.u * 0.008 });
      body.set({ originX: 'center', originY: 'center', left: cx, top: cy, angle });
      c.shadow(body, { color: 'rgba(0,0,0,0.3)', blur: c.u * 0.03, y: c.u * 0.012 });
      const flap = c.path(`M ${-w / 2} ${-hh / 2} L 0 ${hh * 0.12} L ${w / 2} ${-hh / 2}`, { stroke: '#cdd3cb', sw: Math.max(2, c.u * 0.003) });
      flap.set({ left: cx, top: cy - hh * 0.2, originX: 'center', originY: 'center', angle });
      c.add(body, flap);
    };
    env(c.w * 0.38, -12);
    env(c.w * 0.62, 10);

    // account bar
    const b = c.content.brand;
    const barTop = c.isWide ? c.h * 0.74 : c.h * 0.74;
    c.add(c.rect({ left: 0, top: barTop, w: c.w, h: c.h - barTop + c.u * 0.1, fill: '#ffffff', rx: c.u * 0.07 }));
    const num = (b?.accountNumber || '0123456789').trim();
    const acct = (b?.accountName || 'Account name').toUpperCase();
    const bank = (b?.bankName || 'Bank name').toUpperCase();
    const green = '#15b83a';
    const innerTop = barTop + (c.h - barTop) * 0.18;
    if (c.isWide) {
      const nt = c.fitText(num, { font: 'Anton', fill: green, left: c.m, width: c.w * 0.38, size: c.u * 0.16 }, c.h * 0.18);
      c.place(nt, innerTop);
      const colX = c.w * 0.5;
      const a = c.fitText(acct, { font: 'Anton', fill: '#111111', left: colX, width: c.w * 0.45, size: c.u * 0.07, lh: 1.05 }, c.h * 0.12);
      const k = c.text(bank, { font: 'Anton', fill: '#e03c3c', left: colX, width: c.w * 0.45, size: c.u * 0.07 });
      c.place(a, innerTop);
      c.place(k, innerTop + h(a));
    } else {
      const nt = c.fitText(num, { font: 'Anton', fill: green, left: c.m, width: c.cw, align: 'center', size: c.u * 0.17 }, (c.h - barTop) * 0.4);
      c.place(nt, innerTop);
      const a = c.fitText(acct, { font: 'Anton', fill: '#111111', left: c.m, width: c.cw, align: 'center', size: c.u * 0.06, lh: 1.05 }, (c.h - barTop) * 0.2);
      const k = c.text(bank, { font: 'Anton', fill: '#e03c3c', left: c.m, width: c.cw, align: 'center', size: c.u * 0.06 });
      c.place(a, innerTop + h(nt) + c.u * 0.012);
      c.place(k, innerTop + h(nt) + c.u * 0.012 + h(a));
    }
  },
};

// ------------------------------------------------- photo + statement layouts (from reference posts)

// Photo across the top, bold quote on a white panel below with the last word in an italic accent.
const photoPanelQuote: Template = {
  id: 'photo-panel',
  name: 'Photo + Quote Panel',
  kind: 'quote',
  blurb: 'Pastor photo above, bold quote with an italic accent word',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#fbfaf6');
    const b = c.content.brand;
    const box = c.isWide ? { left: 0, top: 0, w: c.w * 0.5, h: c.h } : { left: 0, top: 0, w: c.w, h: c.h * 0.58 };
    const url = c.content.useBrand && b?.pastorImageUrl;
    // A solid brand-colour backdrop first: pastor photos are usually cut-outs on transparency.
    const pf = c.accentFill('#2f6fc4');
    c.add(c.rect({ ...box, fill: pf.fill }));
    const img = url ? await c.image(url, { ...box, fit: 'cover' }) : null;
    if (img) c.add(img);
    const brandName = (c.content.useBrand && b?.churchName) || '';
    if (brandName) c.add(c.text(brandName, { font: SANS, weight: 700, fill: '#ffffff', opacity: 0.85, left: c.m, width: box.w - c.m * 2, top: c.m, size: c.u * 0.04, lh: 1.0, spacing: -10 }));

    const x = c.isWide ? box.w + c.m : c.m;
    const width = c.isWide ? c.w - x - c.m : c.cw;
    const region = c.isWide ? c.region() : c.region(box.h + c.m * 0.9);
    const acc = c.accent('#d9573a', '#fbfaf6');
    const q = c.fitText(c.q, { slot: 'quote', font: SANS, weight: 800, fill: '#111111', left: x, width, lh: 1.02, spacing: -30, size: c.quoteSize(0.95) }, (region.bottom - region.top) * 0.72);
    // The closing word, in the accent colour and italic - the quote's emphasis.
    const text = q.text ?? '';
    const cut = text.trimEnd().lastIndexOf(' ') + 1;
    if (cut > 0) {
      q.setSelectionStyles({ fill: acc, fontStyle: 'italic', fontWeight: 400 }, cut, text.length);
      q.initDimensions();
    }
    const name = c.author || b?.pastorName || '';
    const a = name ? c.text(name, { slot: 'author', font: JAKARTA, weight: 700, fill: '#222222', left: x, width, size: c.u * 0.03, upper: true, spacing: 30 }) : null;
    c.stackV([q, a], c.u * 0.05, region);
    await c.footer({ dark: false, align: 'left', x, width });
  },
};

// Solid colour, brand wordmark on top, a big plain statement.
const blueStatement: Template = {
  id: 'blue-statement',
  name: 'Bold Statement',
  kind: 'quote',
  blurb: 'Solid brand colour, huge plain statement, follow line',
  fonts: [JAKARTA, 'Cormorant Garamond'],
  build: async (c) => {
    const pf = c.accentFill('#2f6fc4');
    c.bgSolid(pf.fill);
    const b = c.content.brand;
    const brandName = (c.content.useBrand && b?.churchName) || '';
    if (brandName) c.add(c.text(brandName, { font: 'Cormorant Garamond', weight: 600, fill: pf.on, opacity: 0.9, left: c.m, width: c.cw, top: c.m, size: c.u * 0.045, upper: true, spacing: 40 }));
    const q = c.fitText(c.q, { slot: 'quote', font: JAKARTA, weight: 800, fill: pf.on, left: c.m, width: c.isWide ? c.w * 0.82 : c.cw, lh: 1.06, spacing: -25, size: c.quoteSize(1.15) }, c.regionH() * 0.62);
    const a = authorText(c, { fill: pf.on, left: c.m, width: c.cw, opacity: 0.8, size: c.u * 0.03 });
    c.stackV([q, a], c.u * 0.05, c.region(c.m * 2.2, c.h - c.m * 2.6));
    c.add(c.text('Liked this? Follow for more', { font: JAKARTA, weight: 500, fill: pf.on, opacity: 0.75, left: c.m, width: c.cw, top: c.h - c.m * 1.7, size: c.u * 0.04 }));
  },
};

// Centred headline + supporting line, the pastor's photo rising from the bottom edge, and an
// "next slide" arrow pill - the carousel look.
async function headlinePhoto(c: Builder, dark: boolean) {
  const pf = c.accentFill('#2f6fc4');
  c.bgSolid(dark ? pf.fill : '#e5f3ff');
  const ink = dark ? '#eaf4ff' : pf.fill;
  const b = c.content.brand;
  const brandName = (c.content.useBrand && b?.churchName) || '';
  const top = c.m * 0.9;
  if (brandName) c.add(c.text(brandName, { font: 'Cormorant Garamond', weight: 600, fill: ink, left: c.m, width: c.cw, align: 'center', top, size: c.u * 0.042, upper: true, spacing: 40 }));

  const q = c.fitText(c.q, { slot: 'quote', font: JAKARTA, weight: 800, fill: ink, left: c.m, width: c.cw, align: 'center', lh: 1.05, spacing: -25, size: c.quoteSize(0.85) }, c.h * 0.22);
  c.place(q, top + c.u * 0.14);
  const a = authorText(c, { fill: ink, left: c.m * 1.2, width: c.w - c.m * 2.4, align: 'center', weight: 500, size: c.u * 0.036, opacity: 0.9 });
  if (a) c.place(a, (q.top ?? 0) + h(q) + c.u * 0.03);

  const photo = await c.pastor({ anchor: 'bc', maxW: c.w * 0.92, maxH: c.h * 0.5 });
  if (photo) c.add(photo);

  const pillW = c.u * 0.3;
  const pillH = c.u * 0.1;
  const px = c.w - c.m - pillW;
  const py = c.h - c.m * 0.7 - pillH;
  c.add(c.rect({ left: px, top: py, w: pillW, h: pillH, fill: dark ? '#eaf4ff' : pf.fill, rx: pillH / 2 }));
  const ax1 = px + pillW * 0.2;
  const ax2 = px + pillW * 0.8;
  const ay = py + pillH / 2;
  const ah = pillH * 0.16;
  c.add(c.path(`M ${ax1} ${ay} L ${ax2} ${ay} M ${ax2 - ah} ${ay - ah} L ${ax2} ${ay} L ${ax2 - ah} ${ay + ah}`, { stroke: dark ? pf.fill : '#ffffff', sw: Math.max(3, c.u * 0.004) }));
}

const headlinePhotoLight: Template = {
  id: 'headline-photo-light',
  name: 'Headline + Photo (light)',
  kind: 'quote',
  blurb: 'Pale blue slide, centred headline, photo from the bottom, arrow',
  fonts: [JAKARTA, 'Cormorant Garamond'],
  build: (c) => headlinePhoto(c, false),
};

const headlinePhotoBlue: Template = {
  id: 'headline-photo-blue',
  name: 'Headline + Photo (colour)',
  kind: 'quote',
  blurb: 'Brand-colour slide, centred headline, photo from the bottom, arrow',
  fonts: [JAKARTA, 'Cormorant Garamond'],
  build: (c) => headlinePhoto(c, true),
};

// Full-bleed photo with a caption bar, a logo tab rising from the middle, and details left/right.
const eventBar: Template = {
  id: 'event-bar',
  name: 'Event Photo Bar',
  kind: 'title',
  blurb: 'Full photo, caption bar with a logo + title tab',
  fonts: [SANS, JAKARTA],
  build: async (c) => {
    c.bgSolid('#14161c');
    const b = c.content.brand;
    const url = c.content.useBrand && b?.pastorImageUrl;
    const full = { left: 0, top: 0, w: c.w, h: c.h };
    const img = url ? await c.image(url, { ...full, fit: 'cover' }) : null;
    if (img) c.add(img);
    else c.bgGradient('#1b1464', '#c0397b', 150);
    c.add(c.rect({ left: 0, top: c.h * 0.55, w: c.w, h: c.h * 0.45, fill: '#000000', opacity: 0.25 }));

    const barH = c.u * 0.1;
    const barTop = c.h - c.m * 0.9 - barH;
    const acc = c.accent('#a62b2b', '#14161c');
    c.add(c.rect({ left: 0, top: barTop, w: c.w, h: barH, fill: acc, opacity: 0.9 }));
    const small = c.u * 0.03;
    c.add(c.text(c.service || 'Service name', { slot: 'service', font: JAKARTA, weight: 700, fill: '#ffffff', left: c.m * 0.6, width: c.w * 0.3, top: barTop + (barH - small * 1.2) / 2, size: small, lh: 1.0 }));
    c.add(c.text(c.part || 'Day 1', { slot: 'part', font: JAKARTA, weight: 700, fill: '#ffffff', left: c.w * 0.7 - c.m * 0.6, width: c.w * 0.3, align: 'right', top: barTop + (barH - small * 1.2) / 2, size: small, lh: 1.0 }));

    const tabW = c.u * 0.36;
    const tabH = c.u * 0.3;
    const tabLeft = (c.w - tabW) / 2;
    const tabTop = barTop + barH - tabH;
    c.add(c.rect({ left: tabLeft, top: tabTop, w: tabW, h: tabH, fill: '#101524', rx: c.u * 0.008 }));
    const logo = await c.logo({ left: tabLeft + tabW * 0.2, top: tabTop + tabH * 0.1, w: tabW * 0.6, h: tabH * 0.36, onDark: true });
    if (logo) c.add(logo);
    const t = c.fitText(c.title || 'Message title', { slot: 'title', font: SANS, weight: 800, fill: '#ffffff', left: tabLeft + tabW * 0.08, width: tabW * 0.84, align: 'center', upper: true, lh: 1.0, size: c.u * 0.05 }, tabH * 0.4);
    c.place(t, tabTop + tabH * (logo ? 0.5 : 0.3));
  },
};

export const TEMPLATES: Template[] = [
  photoPanelQuote,
  blueStatement,
  headlinePhotoLight,
  headlinePhotoBlue,
  eventBar,
  fortuneQuote,
  fortuneTitle,
  heatQuote,
  heatTitle,
  paperQuote,
  paperTitle,
  showersQuote,
  offering,
  notepaper,
  stickerCut,
  frostedGlass,
  annotatedSerif,
  wordCapsule,
  minimalInk,
  editorialSerif,
  midnight,
  aurora,
  peachSoft,
  boldStatement,
  highlightMarker,
  forestCalm,
  giantMark,
  splitPastor,
  frame,
  neonLime,
  numbered,
  takeawaysDark,
  cardStack,
  timeline,
  scriptureSerif,
  glassPoints,
];
