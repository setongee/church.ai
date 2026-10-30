import { Circle, FabricImage, Gradient, Rect, StaticCanvas, Textbox, type FabricObject } from 'fabric';
import QRCode from 'qrcode';
import { assetUrl } from '@/lib/api';
import { clearFabricFontCache, getFontEntry, loadFont, loadFontList } from '@/lib/fonts';
import type { Brand, MessageNotes, NotesDay, NotesScripture, PlanKind } from '@/lib/types';
import { makeGradient } from '../editor/templates/engine';
import { themeById, type NotesTheme } from './themes';

// ---------------------------------------------------------------- formats

export type NotesFormat = 'slides' | 'portrait' | 'book';

interface FormatSpec {
  label: string;
  hint: string;
  w: number;
  h: number;
  cols: number;
  margin: number;
  // Body text size; everything else is a multiple of it.
  base: number;
}

export const FORMATS: Record<NotesFormat, FormatSpec> = {
  slides: { label: 'Slides · 16:9', hint: '1920×1080 for projection (EasyWorship, PowerPoint)', w: 1920, h: 1080, cols: 2, margin: 150, base: 32 },
  portrait: { label: 'Pages · 4:5', hint: '1080×1350 for sharing as images', w: 1080, h: 1350, cols: 1, margin: 112, base: 28 },
  book: { label: 'PDF book · A4', hint: 'A4 portrait, for printing and reading', w: 1240, h: 1754, cols: 1, margin: 150, base: 27 },
};

export interface LinkRect {
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

export interface NotesPage {
  toDataURL: (o: { format: 'jpeg' | 'png'; quality?: number; multiplier?: number }) => string;
  links: LinkRect[];
  dispose: () => Promise<void>;
}

// ---------------------------------------------------------------- small helpers

type Obj = FabricObject;
interface Block {
  h: number;
  objs: Obj[];
  gap: number;
  // Positioned relative to the block's own top-left.
  links?: LinkRect[];
}

function rgba(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// "**bold**" markers -> plain text plus the character ranges to embolden.
function parseBold(text: string) {
  const ranges: [number, number][] = [];
  let out = '';
  let last = 0;
  const re = /\*\*(.+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out += text.slice(last, m.index);
    const from = out.length;
    out += m[1];
    ranges.push([from, out.length]);
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { text: out, ranges };
}

interface TxtOpts {
  width: number;
  size: number;
  font: { family: string; weight: number };
  color: string;
  lh?: number;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  upper?: boolean;
  // Letter spacing in thousandths of an em.
  spacing?: number;
  opacity?: number;
}

function txt(text: string, o: TxtOpts): Textbox {
  const { text: plain, ranges } = parseBold(o.upper ? text.toUpperCase() : text);
  const t = new Textbox(plain, {
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    width: o.width,
    fontFamily: o.font.family,
    fontSize: o.size,
    fontWeight: o.font.weight,
    fontStyle: o.italic ? 'italic' : 'normal',
    fill: o.color,
    lineHeight: o.lh ?? 1.55,
    textAlign: o.align ?? 'left',
    charSpacing: o.spacing ?? 0,
    opacity: o.opacity ?? 1,
    objectCaching: false,
    selectable: false,
    evented: false,
  });
  for (const [a, b] of ranges) t.setSelectionStyles({ fontWeight: 700 }, a, b);
  t.initDimensions();
  return t;
}

const move = (o: Obj, dx: number, dy: number) => o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });

function box(x: number, y: number, w: number, h: number, o: { fill?: string; rx?: number; stroke?: string; sw?: number; opacity?: number }) {
  return new Rect({ originX: 'left', originY: 'top', left: x, top: y, width: w, height: h, rx: o.rx ?? 0, ry: o.rx ?? 0, fill: o.fill ?? 'transparent', stroke: o.stroke, strokeWidth: o.stroke ? (o.sw ?? 1) : 0, opacity: o.opacity ?? 1, selectable: false, evented: false, objectCaching: false });
}

function disc(cx: number, cy: number, d: number, o: { fill?: string; stroke?: string; sw?: number; opacity?: number }) {
  return new Circle({ originX: 'left', originY: 'top', left: cx - d / 2, top: cy - d / 2, radius: d / 2, fill: o.fill ?? 'transparent', stroke: o.stroke, strokeWidth: o.stroke ? (o.sw ?? 1) : 0, opacity: o.opacity ?? 1, selectable: false, evented: false, objectCaching: false });
}

// A soft glow: a circle whose fill fades from `color` at the centre to nothing at the edge.
function glow(cx: number, cy: number, r: number, color: string, alpha: number) {
  const c = new Circle({ originX: 'left', originY: 'top', left: cx - r, top: cy - r, radius: r, selectable: false, evented: false, objectCaching: false });
  c.set({
    fill: new Gradient({
      type: 'radial',
      gradientUnits: 'pixels',
      coords: { x1: r, y1: r, r1: 0, x2: r, y2: r, r2: r },
      colorStops: [
        { offset: 0, color: rgba(color, alpha) },
        { offset: 1, color: rgba(color, 0) },
      ],
    }),
  });
  return c;
}

const fmtLong = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const fmtShort = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const KIND_LABEL: Record<PlanKind, string> = { read: 'Read', pray: 'Pray', reflect: 'Reflect', act: 'Act', share: 'Share', memorize: 'Memorise', review: 'Review' };

// ---------------------------------------------------------------- context & pages

interface Ctx {
  t: NotesTheme;
  f: FormatSpec;
  u: number;
  colW: number;
  gap: number;
  left: number;
  top: number;
  bottom: number;
  notes: MessageNotes;
  brand: Brand | null;
}

class Page {
  sc: StaticCanvas;
  links: LinkRect[] = [];
  constructor(public ctx: Ctx, kind: 'cover' | 'page' | 'end', plain = false) {
    const { f, t } = ctx;
    const el = document.createElement('canvas');
    this.sc = new StaticCanvas(el, { width: f.w, height: f.h, enableRetinaScaling: false });
    const bg = new Rect({ originX: 'left', originY: 'top', left: 0, top: 0, width: f.w, height: f.h, selectable: false, evented: false, objectCaching: false });
    bg.set({ fill: makeGradient(f.w, f.h, t.bg.from, t.bg.to, t.bg.angle) });
    this.sc.add(bg);
    if (!plain) this.sc.add(...decor(ctx, kind));
  }
  add(...objs: Obj[]) {
    this.sc.add(...objs);
  }
}

// Page decoration, per theme. Kept in the page's margins and corners so text stays clear of it.
function decor(c: Ctx, kind: 'cover' | 'page' | 'end'): Obj[] {
  const { t, f } = c;
  const big = kind !== 'page';
  const m = f.margin;
  const out: Obj[] = [];
  if (t.decor === 'frame') {
    const i = m * 0.34;
    out.push(box(i, i, f.w - 2 * i, f.h - 2 * i, { stroke: t.accent, sw: big ? 3 : 2, opacity: big ? 0.9 : 0.55 }));
    if (big) out.push(box(i + 16, i + 16, f.w - 2 * (i + 16), f.h - 2 * (i + 16), { stroke: t.accent, sw: 1, opacity: 0.5 }));
    out.push(glow(f.w * 0.92, f.h * 0.08, f.h * 0.4, t.accent, big ? 0.16 : 0.07));
  } else if (t.decor === 'rule') {
    out.push(box(m, m * 0.5, f.w - 2 * m, 2, { fill: t.line }));
    out.push(box(m, m * 0.5 - 2, 90, 6, { fill: t.accent }));
    if (big) out.push(disc(f.w * 0.86, f.h * 0.22, f.h * 0.36, { stroke: t.accent2, sw: 2, opacity: 0.35 }), disc(f.w * 0.86, f.h * 0.22, f.h * 0.28, { stroke: t.accent2, sw: 1, opacity: 0.25 }));
  } else if (t.decor === 'band') {
    out.push(box(0, 0, big ? f.w * 0.035 : f.base * 0.55, f.h, { fill: t.accent }));
    out.push(glow(f.w, 0, f.h * (big ? 0.55 : 0.4), t.accent, big ? 0.2 : 0.1));
    if (big) out.push(glow(f.w * 0.9, f.h, f.h * 0.5, t.accent2, 0.2));
  } else if (t.decor === 'orbs') {
    out.push(glow(f.w * 0.96, f.h * 0.04, f.h * (big ? 0.62 : 0.42), t.accent, big ? 0.34 : 0.2));
    out.push(glow(f.w * 0.03, f.h * 0.98, f.h * (big ? 0.5 : 0.34), t.accent2, big ? 0.3 : 0.2));
  } else {
    const r = f.h * (big ? 0.34 : 0.24);
    out.push(disc(f.w, f.h, r * 2, { stroke: t.accent2, sw: 3, opacity: 0.28 }), disc(f.w, f.h, r * 1.55, { stroke: t.accent2, sw: 2, opacity: 0.2 }), disc(f.w, f.h, r * 1.1, { stroke: t.accent2, sw: 1.5, opacity: 0.14 }));
    out.push(disc(0, 0, r * 1.3, { stroke: t.accent, sw: 2, opacity: 0.2 }));
    if (big) out.push(glow(f.w * 0.85, f.h * 0.2, f.h * 0.4, t.accent2, 0.12));
  }
  return out;
}

// ---------------------------------------------------------------- blocks

const body = (c: Ctx, size = 1) => ({ font: c.t.body, size: c.u * size, color: c.t.ink });

function labelBlock(c: Ctx, text: string, width: number, color?: string): Block {
  const t = txt(text, { width, size: c.u * 0.52, font: c.t.label, color: color ?? c.t.accent, upper: true, spacing: 220, lh: 1.2 });
  return { h: t.height, objs: [t], gap: c.u * 0.3 };
}

// A page's big title: small label, display heading, short accent bar and an optional intro line.
function pageTitle(c: Ctx, kicker: string, title: string, width: number, intro?: string): Block {
  const objs: Obj[] = [];
  let y = 0;
  const k = txt(kicker, { width, size: c.u * 0.55, font: c.t.label, color: c.t.accent, upper: true, spacing: 260, lh: 1.2 });
  objs.push(k);
  y += k.height + c.u * 0.6;
  const h = txt(title, { width, size: c.u * 2.1, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.ink, upper: c.t.head.upper, lh: 1.14, italic: c.t.head.italic });
  move(h, 0, y);
  objs.push(h);
  y += h.height + c.u * 0.6;
  const bar = box(0, y, c.u * 2.6, 5, { fill: c.t.accent });
  objs.push(bar);
  y += 5;
  if (intro) {
    y += c.u * 0.8;
    const i = txt(intro, { ...body(c, 0.9), width, color: c.t.muted, italic: true });
    move(i, 0, y);
    objs.push(i);
    y += i.height;
  }
  return { h: y, objs, gap: c.u * 1.6 };
}

function sectionHeading(c: Ctx, index: number, total: number, heading: string, width: number): Block {
  const objs: Obj[] = [];
  const k = txt(`${String(index + 1).padStart(2, '0')}  /  ${String(total).padStart(2, '0')}`, { width, size: c.u * 0.5, font: c.t.label, color: c.t.accent, spacing: 240, lh: 1.2 });
  objs.push(k);
  let y = k.height + c.u * 0.45;
  const h = txt(heading, { width, size: c.u * 1.5, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.ink, upper: c.t.head.upper, lh: 1.2, italic: c.t.head.italic });
  move(h, 0, y);
  objs.push(h);
  y += h.height + c.u * 0.5;
  objs.push(box(0, y, c.u * 1.8, 4, { fill: c.t.accent }));
  y += 4;
  return { h: y, objs, gap: c.u * 1.1 };
}

function summaryBlock(c: Ctx, text: string, width: number): Block {
  const t = txt(text, { ...body(c, 0.92), width, color: c.t.muted, italic: true });
  return { h: t.height, objs: [t], gap: c.u * 1.1 };
}

function pointBlock(c: Ctx, text: string, refs: string[], width: number): Block {
  const indent = c.u * 1.3;
  const dot = disc(c.u * 0.32, c.u * 0.72, c.u * 0.34, { fill: c.t.accent });
  const t = txt(text, { ...body(c, 1), width: width - indent });
  move(t, indent, 0);
  const objs: Obj[] = [dot, t];
  let h = t.height;
  if (refs.length) {
    const r = txt(refs.join('   ·   '), { width: width - indent, size: c.u * 0.74, font: { family: c.t.body.family, weight: 600 }, color: c.t.accent, italic: true, lh: 1.25 });
    move(r, indent, h + c.u * 0.28);
    objs.push(r);
    h += c.u * 0.28 + r.height;
  }
  return { h, objs, gap: c.u * 1.15 };
}

// The full text of a scripture in a quote card. Shrinks, then trims, if it would not fit a column.
function scriptureCard(c: Ctx, s: NotesScripture, width: number, maxH: number): Block {
  const pad = c.u * 1.1;
  const ref = txt(s.ref, { width: width - pad * 2, size: c.u * 0.72, font: c.t.label, color: c.t.accent, upper: true, spacing: 160, lh: 1.2 });
  let size = 0.92;
  let text = s.text;
  let v = txt(text, { ...body(c, size), width: width - pad * 2, italic: true, lh: 1.58 });
  const fits = () => pad * 2 + v.height + c.u * 0.65 + ref.height <= maxH;
  while (!fits() && size > 0.66) {
    size -= 0.06;
    v = txt(text, { ...body(c, size), width: width - pad * 2, italic: true, lh: 1.58 });
  }
  while (!fits() && text.length > 60) {
    text = `${text.slice(0, Math.floor(text.length * 0.85)).replace(/\s+\S*$/, '')}…`;
    v = txt(text, { ...body(c, size), width: width - pad * 2, italic: true, lh: 1.58 });
  }
  move(v, pad, pad);
  move(ref, pad, pad + v.height + c.u * 0.65);
  const h = pad * 2 + v.height + c.u * 0.65 + ref.height;
  const quoteMark = txt('“', { width: c.u * 2, size: c.u * 3.2, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.accent2, opacity: 0.35, lh: 1 });
  move(quoteMark, width - c.u * 1.6, -c.u * 0.7);
  return {
    h,
    gap: c.u * 1.3,
    objs: [box(0, 0, width, h, { fill: c.t.surface, rx: c.u * 0.45, stroke: c.t.line, sw: 1.5 }), box(0, c.u * 0.45, 6, h - c.u * 0.9, { fill: c.t.accent, rx: 3 }), quoteMark, v, ref],
  };
}

function pullQuote(c: Ctx, text: string, width: number): Block {
  const indent = c.u * 0.9;
  const t = txt(`“${text}”`, { width: width - indent, size: c.u * 1.12, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.ink, italic: true, lh: 1.42, upper: false });
  move(t, indent, 0);
  return { h: t.height, objs: [box(0, 0, 5, t.height, { fill: c.t.accent2, rx: 2 }), t], gap: c.u * 1.7 };
}

function numberedItem(c: Ctx, n: number, text: string, width: number): Block {
  const d = c.u * 1.45;
  const onAccent = c.t.dark ? c.t.bg.from : '#ffffff';
  const num = txt(String(n), { width: d, size: c.u * 0.78, font: c.t.label, color: onAccent, align: 'center', lh: 1 });
  move(num, 0, (d - num.height) / 2 + 1);
  const t = txt(text, { ...body(c, 0.98), width: width - d - c.u * 0.55 });
  move(t, d + c.u * 0.55, 2);
  return { h: Math.max(d, t.height + 2), objs: [disc(d / 2, d / 2, d, { fill: c.t.accent }), num, t], gap: c.u * 1.2 };
}

function readingItem(c: Ctx, ref: string, why: string, width: number): Block {
  const r = txt(ref, { width, size: c.u * 1.05, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.accent, lh: 1.2 });
  const w = txt(why, { ...body(c, 0.88), width, color: c.t.muted });
  move(w, 0, r.height + c.u * 0.25);
  return { h: r.height + c.u * 0.25 + w.height, objs: [r, w], gap: c.u * 1.4 };
}

function dayCard(c: Ctx, d: NotesDay, width: number): Block {
  const compact = c.f.cols === 1;
  const pad = c.u * (compact ? 0.8 : 1);
  const inner = width - pad * 2;
  const objs: Obj[] = [];
  const when = txt(`${d.day}${d.date ? `  ·  ${fmtShort(d.date)}` : ''}`, { width: inner * 0.6, size: c.u * 0.56, font: c.t.label, color: c.t.accent, upper: true, spacing: 180, lh: 1.2 });
  move(when, pad, pad);
  objs.push(when);
  // Tick box for the streak, and the kind of task as a small pill.
  const boxS = c.u * 0.95;
  objs.push(box(width - pad - boxS, pad - c.u * 0.12, boxS, boxS, { stroke: c.t.accent, sw: 2.5, rx: c.u * 0.18 }));
  const kind = txt(KIND_LABEL[d.kind] ?? 'Reflect', { width: c.u * 4, size: c.u * 0.5, font: c.t.label, color: c.t.accent, upper: true, spacing: 140, lh: 1.2, align: 'center' });
  const kw = Math.min(c.u * 4, kind.calcTextWidth() + c.u * 0.9);
  const kx = width - pad - boxS - c.u * 0.5 - kw;
  kind.set({ width: kw });
  kind.initDimensions();
  move(kind, kx, pad + c.u * 0.02);
  objs.push(box(kx, pad - c.u * 0.1, kw, kind.height + c.u * 0.22, { fill: rgba(c.t.accent, 0.16), rx: c.u * 0.4 }), kind);
  let y = pad + boxS + c.u * 0.35;
  const title = txt(d.title, { width: inner, size: c.u * 1.12, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.ink, lh: 1.15 });
  move(title, pad, y);
  objs.push(title);
  y += title.height + c.u * 0.4;
  const action = txt(d.action, { ...body(c, 0.86), width: inner });
  move(action, pad, y);
  objs.push(action);
  y += action.height;
  if (d.scripture) {
    y += c.u * 0.3;
    const s = txt(`Read:  ${d.scripture}`, { width: inner, size: c.u * 0.74, font: { family: c.t.body.family, weight: 600 }, color: c.t.accent, italic: true, lh: 1.2 });
    move(s, pad, y);
    objs.push(s);
    y += s.height;
  }
  const h = y + pad;
  objs.unshift(box(0, 0, width, h, { fill: c.t.surface, rx: c.u * 0.5, stroke: c.t.line, sw: 1.5 }));
  return { h, objs, gap: c.u * (compact ? 0.75 : 1) };
}

// Six circles, Monday to Saturday, to tick off through the week.
function streakStrip(c: Ctx, days: NotesDay[], width: number): Block {
  const objs: Obj[] = [];
  const d = c.u * 2.1;
  const n = Math.max(1, days.length);
  const step = (width - d) / Math.max(1, n - 1);
  days.forEach((day, i) => {
    const cx = d / 2 + i * step;
    objs.push(disc(cx, d / 2, d, { stroke: c.t.accent, sw: 3 }));
    const letter = txt(day.day.slice(0, 1), { width: d, size: c.u * 0.95, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.accent, align: 'center', lh: 1 });
    move(letter, cx - d / 2, d / 2 - letter.height / 2);
    objs.push(letter);
    const when = txt(fmtShort(day.date), { width: d * 1.6, size: c.u * 0.56, font: c.t.label, color: c.t.muted, align: 'center', lh: 1.2 });
    move(when, cx - d * 0.8, d + c.u * 0.25);
    objs.push(when);
  });
  const h = d + c.u * 0.25 + c.u * 0.7;
  return { h, objs, gap: c.u * 1.3 };
}

function targetCard(c: Ctx, theme: string, target: string, width: number): Block {
  const pad = c.u * 0.9;
  const k = txt(theme ? `This week · ${theme}` : "This week's target", { width: width - pad * 2, size: c.u * 0.54, font: c.t.label, color: c.t.accent, upper: true, spacing: 200, lh: 1.2 });
  move(k, pad, pad);
  const t = txt(target, { width: width - pad * 2, size: c.u * 1.1, font: { family: c.t.head.family, weight: c.t.head.weight }, color: c.t.ink, lh: 1.25 });
  move(t, pad, pad + k.height + c.u * 0.3);
  const h = pad * 2 + k.height + c.u * 0.3 + t.height;
  return { h, gap: c.u * 1.3, objs: [box(0, 0, width, h, { fill: rgba(c.t.accent, 0.12), rx: c.u * 0.5, stroke: c.t.accent, sw: 2 }), k, t] };
}

// ---------------------------------------------------------------- flow

class Flow {
  pages: Page[] = [];
  col = 0;
  y = 0;
  colTop = 0;
  constructor(private c: Ctx, private make: () => Page) {}

  get page() {
    return this.pages[this.pages.length - 1];
  }
  newPage() {
    this.pages.push(this.make());
    this.col = 0;
    this.colTop = this.c.top;
    this.y = this.colTop;
  }
  private colX() {
    return this.c.left + this.col * (this.c.colW + this.c.gap);
  }
  private nextColumn() {
    if (this.col + 1 < this.c.f.cols) {
      this.col += 1;
      this.y = this.colTop;
    } else {
      this.newPage();
    }
  }
  private put(b: Block, x: number, y: number) {
    b.objs.forEach((o) => move(o, x, y));
    this.page.add(...b.objs);
    (b.links ?? []).forEach((l) => this.page.links.push({ ...l, x: l.x + x, y: l.y + y }));
  }
  // Places blocks as one unit (so a heading never ends up alone at the foot of a column).
  place(blocks: Block | Block[]) {
    const list = (Array.isArray(blocks) ? blocks : [blocks]).filter(Boolean);
    if (!this.pages.length) this.newPage();
    const need = list.reduce((s, b, i) => s + b.h + (i < list.length - 1 ? b.gap : 0), 0);
    if (this.y + need > this.c.bottom && this.y > this.colTop + 1) this.nextColumn();
    for (const b of list) {
      this.put(b, this.colX(), this.y);
      this.y += b.h + b.gap;
    }
  }
  // A section title that starts a new page in the two-column slides, but in single-column pages
  // simply continues on the current page when there is room for the title and a few items.
  section(title: Block, ...extra: Block[]) {
    if (this.c.f.cols > 1) return this.startSection(title, ...extra);
    const list = [title, ...extra];
    const need = list.reduce((sum, b) => sum + b.h + b.gap, 0) + this.c.u * 7;
    if (!this.pages.length || this.y + need > this.c.bottom) this.newPage();
    for (const b of list) {
      this.put(b, this.c.left, this.y);
      this.y += b.h + b.gap;
    }
    this.colTop = this.y;
  }
  // A full-width row of blocks (e.g. two plan cards side by side); ignores the column layout.
  placeRow(row: Block) {
    if (this.y + row.h > this.c.bottom && this.y > this.c.top + 1) {
      this.newPage();
    }
    this.put(row, this.c.left, this.y);
    this.y += row.h + row.gap;
  }
  // A new page that starts with a full-width title; columns then begin beneath it.
  startSection(title: Block, ...fullWidth: Block[]) {
    this.newPage();
    for (const b of [title, ...fullWidth]) {
      this.put(b, this.c.left, this.y);
      this.y += b.h + b.gap;
    }
    this.colTop = this.y;
  }
}

// ---------------------------------------------------------------- cover & closing pages

function fitText(text: string, o: TxtOpts, maxH: number, minSize: number): Textbox {
  let size = o.size;
  let t = txt(text, { ...o, size });
  while (t.height > maxH && size > minSize) {
    size *= 0.94;
    t = txt(text, { ...o, size });
  }
  return t;
}

async function loadImage(url: string): Promise<FabricImage | null> {
  try {
    return await FabricImage.fromURL(url.startsWith('data:') ? url : assetUrl(url), { crossOrigin: 'anonymous' });
  } catch {
    return null;
  }
}

async function coverPage(c: Ctx): Promise<Page> {
  const { t, f, notes, brand } = c;
  // A picture behind the title: the type turns white over a dark veil so it always reads.
  const photo = notes.coverMode === 'image' && notes.coverImageUrl ? await loadImage(notes.coverImageUrl) : null;
  const p = new Page(c, 'cover', Boolean(photo));
  const ink = photo ? '#ffffff' : t.ink;
  const muted = photo ? 'rgba(255,255,255,0.84)' : t.muted;
  // The theme's accent can vanish on a dark photo, so its lighter twin is used there.
  const accent = photo ? t.accent2 : t.accent;
  if (photo) {
    const s = Math.max(f.w / (photo.width || 1), f.h / (photo.height || 1));
    photo.set({ originX: 'center', originY: 'center', left: f.w / 2, top: f.h / 2, scaleX: s, scaleY: s });
    p.add(photo);
    const veil = new Rect({ originX: 'left', originY: 'top', left: 0, top: 0, width: f.w, height: f.h, selectable: false, evented: false, objectCaching: false });
    const wideCover = f.cols === 2;
    veil.set({
      fill: new Gradient({
        type: 'linear',
        gradientUnits: 'pixels',
        coords: wideCover ? { x1: 0, y1: 0, x2: f.w, y2: 0 } : { x1: 0, y1: f.h, x2: 0, y2: 0 },
        colorStops: [
          { offset: 0, color: 'rgba(0,0,0,0.86)' },
          { offset: 0.55, color: 'rgba(0,0,0,0.58)' },
          { offset: 1, color: 'rgba(0,0,0,0.3)' },
        ],
      }),
    });
    p.add(veil);
  }
  const m = f.margin;
  const wide = f.cols === 2;
  const cw = wide ? (f.w - 2 * m) * 0.62 : f.w - 2 * m;
  const x = m;

  // Top row: logo or church name, and what this is.
  const useLight = t.dark || Boolean(photo);
  const logo = brand?.logoUrl || brand?.logoLightUrl ? await loadImage((useLight ? brand?.logoLightUrl || brand?.logoUrl : brand?.logoUrl || brand?.logoLightUrl) as string) : null;
  let topH = c.u * 0.8;
  if (logo) {
    const s = Math.min((c.u * 3.2) / (logo.height || 1), (c.u * 7) / (logo.width || 1));
    logo.set({ originX: 'left', originY: 'top', left: x, top: m * 0.95, scaleX: s, scaleY: s });
    p.add(logo);
    topH = (logo.height ?? 0) * s;
  } else if (brand?.churchName) {
    const n = txt(brand.churchName, { width: cw, size: c.u * 0.62, font: t.label, color: ink, upper: true, spacing: 200 });
    n.set({ left: x, top: m * 0.95 });
    p.add(n);
    topH = n.height;
  }
  const tag = txt('Message Notes', { width: cw, size: c.u * 0.56, font: t.label, color: accent, upper: true, spacing: 300, align: wide ? 'left' : 'right' });
  tag.set({ left: x, top: m * 0.95 + (wide ? topH + c.u * 0.7 : (topH - tag.height) / 2) });
  p.add(tag);

  // Title, as large as fits.
  const titleTop = f.h * (wide ? 0.3 : 0.3);
  const title = fitText(notes.title, { width: cw, size: c.u * (wide ? 4.4 : 4.1), font: { family: t.head.family, weight: t.head.weight }, color: ink, upper: t.head.upper, lh: 1.08, italic: t.head.italic }, f.h * (wide ? 0.4 : 0.3), c.u * 1.8);
  title.set({ left: x, top: titleTop });
  p.add(title);
  let y = titleTop + title.height + c.u * 0.8;
  p.add(box(x, y, c.u * 3.4, 6, { fill: accent }));
  y += 6 + c.u * 0.9;

  const by = txt('Preached by', { width: cw, size: c.u * 0.52, font: t.label, color: muted, upper: true, spacing: 220 });
  by.set({ left: x, top: y });
  p.add(by);
  y += by.height + c.u * 0.2;
  const who = txt(notes.preacher, { width: cw, size: c.u * 1.35, font: { family: t.head.family, weight: t.head.weight }, color: ink, lh: 1.2 });
  who.set({ left: x, top: y });
  p.add(who);
  y += who.height + c.u * 0.25;
  const date = fmtLong(notes.date);
  if (date) {
    const d = txt(date, { ...body(c, 0.95), width: cw, color: muted });
    d.set({ left: x, top: y });
    p.add(d);
    y += d.height;
  }

  if (notes.hook && !wide) {
    const hook = fitText(notes.hook, { ...body(c, 0.98), width: cw, color: muted, italic: true, lh: 1.55 }, f.h - m * 1.3 - y - c.u, c.u * 0.7);
    hook.set({ left: x, top: f.h - m * 1.15 - hook.height });
    p.add(hook);
  }
  return p;
}

// What the closing page tells people: when and where to meet, and how to get in touch. Anything left
// blank in the notes falls back to the Brand page.
function joinDetails(c: Ctx) {
  const { notes, brand } = c;
  const handle = brand?.socials.instagram ? `@${brand.socials.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}` : '';
  const contact = notes.endInfo?.contact?.trim() || [brand?.phone, brand?.email, brand?.website, handle].filter(Boolean).join('\n');
  return {
    times: notes.endInfo?.serviceTimes?.trim() || brand?.serviceTimes?.trim() || '',
    venue: notes.endInfo?.venue?.trim() || brand?.address?.trim() || '',
    contact,
    note: notes.endInfo?.note?.trim() || '',
  };
}

function infoBlock(c: Ctx, label: string, text: string, width: number): Block {
  const k = txt(label, { width, size: c.u * 0.5, font: c.t.label, color: c.t.accent, upper: true, spacing: 240, lh: 1.2 });
  const v = txt(text, { ...body(c, 0.9), width, lh: 1.6 });
  move(v, 0, k.height + c.u * 0.4);
  return { h: k.height + c.u * 0.4 + v.height, objs: [k, v], gap: c.u * 1.1 };
}

async function endPage(c: Ctx): Promise<Page> {
  const { t, f, notes, brand } = c;
  const p = new Page(c, 'end');
  const m = f.margin;
  const u = c.u;
  const wide = f.cols === 2;
  const contentW = f.w - 2 * m;
  const link = notes.messageLink.trim();
  const info = joinDetails(c);
  const infoBlocks = ([['Service times', info.times], ['Find us', info.venue], ['Connect', info.contact]] as const).filter(([, v]) => v);
  const leftW = link && wide ? contentW * 0.6 : contentW;
  const qrSide = u * (wide ? 6.4 : 6.6);
  let y = f.h * (wide ? (infoBlocks.length ? (link ? 0.1 : 0.15) : 0.24) : 0.11);

  const kicker = txt(link ? 'Listen again' : 'Thank you', { width: leftW, size: u * 0.58, font: t.label, color: t.accent, upper: true, spacing: 280 });
  kicker.set({ left: m, top: y });
  p.add(kicker);
  y += kicker.height + u * 0.6;
  const head = txt(link ? 'Hear the full message' : info.note || 'Keep growing in the Word', { width: leftW, size: u * (wide && link ? 1.9 : 2.3), font: { family: t.head.family, weight: t.head.weight }, color: t.ink, upper: t.head.upper, lh: 1.14, italic: t.head.italic });
  head.set({ left: m, top: y });
  p.add(head);
  y += head.height + u * 0.6;
  p.add(box(m, y, u * 3, 6, { fill: t.accent }));
  y += 6 + u * 0.9;

  if (link) {
    const sub = txt(`${notes.title}  ·  ${notes.preacher}`, { ...body(c, 0.95), width: leftW - (wide ? 0 : qrSide + u * 2), color: t.muted });
    sub.set({ left: m, top: y });
    p.add(sub);
    y += sub.height + u * 1.1;
    const bt = txt('Listen to the full message', { width: leftW, size: u * 0.9, font: t.label, color: t.dark ? t.bg.from : '#ffffff', lh: 1.2 });
    const bw = Math.min(leftW, bt.calcTextWidth() + u * 3);
    const bh = bt.height + u * 1.3;
    bt.set({ left: m + u * 1.2, top: y + u * 0.65, width: bw - u * 1.8 });
    p.add(box(m, y, bw, bh, { fill: t.accent, rx: bh / 2 }), bt);
    p.links.push({ x: m, y, w: bw, h: bh, url: link });
    y += bh + u * 0.8;
    const short = txt(link.replace(/^https?:\/\//, ''), { width: leftW - (wide ? 0 : qrSide + u * 2), size: u * 0.66, font: t.body, color: t.muted, lh: 1.4 });
    short.set({ left: m, top: y });
    p.add(short);
    const textBottom = y + short.height;

    try {
      const qr = await QRCode.toDataURL(link, { margin: 1, width: 520, color: { dark: t.dark ? '#0b1226' : t.ink, light: '#ffffff' } });
      const img = await loadImage(qr);
      if (img) {
        const s = qrSide / (img.width || 1);
        const qx = f.w - m - qrSide - u * 0.8;
        const qy = wide ? f.h * 0.1 + u * 0.8 : f.h * 0.11 + u * 3;
        p.add(box(qx - u * 0.8, qy - u * 0.8, qrSide + u * 1.6, qrSide + u * 1.6, { fill: '#ffffff', rx: u * 0.6 }));
        img.set({ originX: 'left', originY: 'top', left: qx, top: qy, scaleX: s, scaleY: s });
        p.add(img);
        const cap = txt('Scan to listen', { width: qrSide + u * 1.6, size: u * 0.52, font: t.label, color: t.muted, upper: true, spacing: 200, align: 'center' });
        cap.set({ left: qx - u * 0.8, top: qy + qrSide + u * 1.0 });
        p.add(cap);
        p.links.push({ x: qx, y: qy, w: qrSide, h: qrSide, url: link });
        if (!wide) y = Math.max(textBottom, qy + qrSide + u * 2.2);
      } else if (!wide) y = textBottom;
    } catch {
      if (!wide) y = textBottom;
    }
    if (wide) y = Math.max(textBottom, f.h * 0.1 + u * 0.8 + qrSide + u * 2.2);
    y += u * 1.0;
  } else if (info.note && head.text !== info.note) {
    y += 0;
  }

  // Join us: service times, venue and contact details, in columns on slides and stacked on pages.
  if (infoBlocks.length) {
    const label = txt('Join us', { width: contentW, size: u * 1.4, font: { family: t.head.family, weight: t.head.weight }, color: t.ink, upper: t.head.upper, lh: 1.2, italic: t.head.italic });
    if (wide) {
      const n = infoBlocks.length;
      const colGap = m * 0.5;
      const colW = (contentW - colGap * (n - 1)) / n;
      const built = infoBlocks.map(([k, v]) => infoBlock(c, k, v, colW));
      const bandH = label.height + u * 0.7 + Math.max(...built.map((b) => b.h));
      // Sit the band above the footer line with clear air, but never on top of the content above it.
      const footerRoom = m * 0.58 + u * 3.4;
      const top = Math.max(y + u * 0.6, f.h - footerRoom - bandH);
      p.add(box(m, top - u * 1.0, contentW, 1.5, { fill: t.line }));
      label.set({ left: m, top });
      p.add(label);
      const infoTop = top + label.height + u * 0.7;
      built.forEach((b, i) => {
        b.objs.forEach((o) => move(o, m + i * (colW + colGap), infoTop));
        p.add(...b.objs);
      });
    } else {
      label.set({ left: m, top: y });
      p.add(label);
      y += label.height + u * 0.8;
      for (const [k, v] of infoBlocks) {
        const b = infoBlock(c, k, v, contentW);
        b.objs.forEach((o) => move(o, m, y));
        p.add(...b.objs);
        y += b.h + b.gap;
      }
    }
  }

  // Footer: the church.
  const handle = brand?.socials.instagram ? `@${brand.socials.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}` : '';
  const lines = [brand?.churchName, brand?.tagline, handle].filter(Boolean) as string[];
  if (lines.length) {
    const foot = txt(lines.join('   ·   '), { width: contentW, size: u * 0.6, font: t.label, color: t.muted, upper: true, spacing: 140, lh: 1.3 });
    foot.set({ left: m, top: f.h - m * 0.58 - foot.height });
    p.add(foot);
  }
  return p;
}

// ---------------------------------------------------------------- the notes

// The closest weight the chosen family actually has (so a font without a 700 isn't faked).
function nearestWeight(family: string, want: number) {
  const weights = getFontEntry(family)?.weights?.length ? (getFontEntry(family)?.weights as number[]) : [400, 700];
  return weights.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), weights[0]);
}

// The theme with the user's own typefaces swapped in (blank = keep the theme's).
function withFonts(t: NotesTheme, fonts?: { head?: string; body?: string }): NotesTheme {
  const head = fonts?.head ? { ...t.head, family: fonts.head, weight: nearestWeight(fonts.head, t.head.weight) } : t.head;
  const body = fonts?.body ? { ...t.body, family: fonts.body, weight: nearestWeight(fonts.body, 400) } : t.body;
  return { ...t, head, body };
}

function addChrome(c: Ctx, pages: Page[]) {
  const { t, f } = c;
  const total = pages.length;
  pages.forEach((p, i) => {
    if (i === 0 || i === total - 1) return;
    const hy = f.margin * 0.58;
    const left = txt(c.notes.title, { width: (f.w - 2 * f.margin) * 0.62, size: c.u * 0.5, font: t.label, color: t.muted, upper: true, spacing: 160, lh: 1.2 });
    left.set({ left: f.margin, top: hy });
    const right = txt(c.notes.preacher, { width: (f.w - 2 * f.margin) * 0.36, size: c.u * 0.5, font: t.label, color: t.muted, upper: true, spacing: 160, align: 'right', lh: 1.2 });
    right.set({ left: f.w - f.margin - (f.w - 2 * f.margin) * 0.36, top: hy });
    const fy = f.h - f.margin * 0.58 - c.u * 0.7;
    const church = txt(c.brand?.churchName ?? '', { width: (f.w - 2 * f.margin) * 0.7, size: c.u * 0.5, font: t.label, color: t.muted, upper: true, spacing: 160, lh: 1.2 });
    church.set({ left: f.margin, top: fy });
    const num = txt(`${i + 1} / ${total}`, { width: 200, size: c.u * 0.52, font: t.label, color: t.accent, align: 'right', lh: 1.2 });
    num.set({ left: f.w - f.margin - 200, top: fy });
    p.add(left, right, church, num);
  });
}

export async function renderNotes(notes: MessageNotes, brand: Brand | null, themeId: string, format: NotesFormat): Promise<{ pages: NotesPage[]; size: { w: number; h: number } }> {
  const f = FORMATS[format];
  const u = f.base;

  // Fonts first: text is measured as it is laid out, so they must be ready.
  await loadFontList();
  const t = withFonts(themeById(themeId), notes.fonts);
  const families = new Set([t.head.family, t.body.family, t.label.family]);
  await Promise.all(
    [...families].map(async (fam) => {
      await loadFont(fam);
      await Promise.all([400, 600, 700].map((w) => document.fonts.load(`italic ${w} 16px "${fam}"`).catch(() => [])));
      clearFabricFontCache(fam);
    })
  );

  const gap = f.cols > 1 ? f.margin * 0.62 : 0;
  const contentW = f.w - 2 * f.margin;
  const c: Ctx = {
    t,
    f,
    u,
    gap,
    colW: (contentW - gap * (f.cols - 1)) / f.cols,
    left: f.margin,
    top: f.margin * 0.58 + u * 3.4,
    bottom: f.h - f.margin * 0.58 - u * 3.2,
    notes,
    brand,
  };
  const colH = c.bottom - c.top;
  const flow = new Flow(c, () => new Page(c, 'page'));
  const cover = await coverPage(c);
  const pages: Page[] = [cover];
  const W = c.colW;
  const FW = contentW;
  const byRef = new Map(notes.scriptures.map((s) => [s.ref.toLowerCase(), s]));

  // ---- at a glance
  const hasGlance = notes.bigIdea || notes.scriptures.length;
  if (hasGlance) {
    flow.startSection(pageTitle(c, 'Overview', 'The message at a glance', FW, notes.hook || undefined));
    if (notes.bigIdea) {
      const pad = u * 0.9;
      const k = txt('The big idea', { width: W - pad * 2, size: u * 0.54, font: t.label, color: t.accent, upper: true, spacing: 220, lh: 1.2 });
      move(k, pad, pad);
      const big = fitText(notes.bigIdea, { width: W - pad * 2, size: u * 1.4, font: { family: t.head.family, weight: t.head.weight }, color: t.ink, lh: 1.25, italic: t.head.italic }, colH * 0.5, u * 0.9);
      move(big, pad, pad + k.height + u * 0.35);
      const h = pad * 2 + k.height + u * 0.35 + big.height;
      flow.place({ h, gap: u * 1.1, objs: [box(0, 0, W, h, { fill: rgba(t.accent, 0.12), rx: u * 0.55, stroke: t.accent, sw: 2 }), k, big] });
    }
    if (notes.scriptures.length) {
      const items: Block[] = notes.scriptures.map((s) => {
        const r = txt(s.ref, { width: W - u * 1.1, size: u * 0.98, font: { family: t.body.family, weight: 600 }, color: t.ink, lh: 1.25 });
        move(r, u * 1.1, 0);
        const use = s.use ? txt(s.use, { width: W - u * 1.1, size: u * 0.72, font: t.body, color: t.muted, italic: true, lh: 1.25 }) : null;
        if (use) move(use, u * 1.1, r.height + u * 0.05);
        return { h: r.height + (use ? u * 0.05 + use.height : 0), gap: u * 0.5, objs: [disc(u * 0.3, u * 0.6, u * 0.32, { fill: t.accent2 }), r, ...(use ? [use] : [])] };
      });
      flow.place([labelBlock(c, 'Scriptures in this message', W), ...items]);
    }
  }

  // ---- the message
  const shown = new Set<string>();
  notes.sections.forEach((sec, si) => {
    if (si === 0 && !hasGlance) flow.newPage();
    else if (si === 0 && f.cols > 1) flow.newPage();
    else if (si === 0) flow.y += u * 1.2;
    const head = sectionHeading(c, si, notes.sections.length, sec.heading, W);
    const intro = sec.summary ? summaryBlock(c, sec.summary, W) : null;
    sec.points.forEach((p, pi) => {
      const pb = pointBlock(c, p.text, p.refs, W);
      const cards = p.refs
        .map((r) => byRef.get(r.toLowerCase()))
        .filter((s): s is NotesScripture => Boolean(s?.quoted && s.text) && !shown.has(s!.ref.toLowerCase()))
        .map((s) => {
          shown.add(s.ref.toLowerCase());
          return scriptureCard(c, s, W, colH * 0.8);
        });
      if (pi === 0) flow.place([head, ...(intro ? [intro] : []), pb]);
      else flow.place(pb);
      cards.forEach((card) => flow.place(card));
    });
    if (sec.pullQuote) flow.place(pullQuote(c, sec.pullQuote, W));
    flow.y += u * 1.4;
  });

  // ---- take it home
  if (notes.closing) {
    const t2 = fitText(notes.closing, { width: W, size: u * 1.25, font: { family: t.head.family, weight: t.head.weight }, color: t.ink, lh: 1.32, italic: true }, colH * 0.7, u);
    const bar = box(0, 0, 5, t2.height, { fill: t.accent });
    move(t2, u * 0.9, 0);
    flow.place([labelBlock(c, 'Take it home', W), { h: t2.height, objs: [bar, t2], gap: u }]);
  }

  // ---- the scriptures in full
  const withText = notes.scriptures.filter((s) => s.text);
  if (withText.length) {
    flow.startSection(pageTitle(c, 'The Word', 'Scriptures in this message', FW, `${notes.translation.toUpperCase()}. Read them again, slowly.`));
    withText.forEach((s) => flow.place(scriptureCard(c, s, W, colH * 0.9)));
  }

  // ---- prayer
  const prayers = notes.prayerPoints.filter((p) => p.include && p.text.trim());
  if (prayers.length) {
    flow.section(pageTitle(c, 'Pray it through', 'Prayer points', FW, 'Pray these aloud this week, in line with what was preached.'));
    prayers.forEach((p, i) => flow.place(numberedItem(c, i + 1, p.text, W)));
  }

  // ---- further reading
  if (notes.furtherReading.length) {
    flow.section(pageTitle(c, 'Go deeper', 'Further reading', FW, 'Passages that build on this message.'));
    notes.furtherReading.forEach((r) => flow.place(readingItem(c, r.ref, r.why, W)));
  }

  // ---- the week
  const days = notes.plan.days.filter((d) => d.action || d.title);
  if (days.length) {
    const header: Block[] = [];
    if (notes.plan.target) header.push(targetCard(c, notes.plan.theme, notes.plan.target, FW));
    header.push(streakStrip(c, days, FW));
    flow.startSection(pageTitle(c, 'Live it out', 'Your week', FW, 'One step a day, Monday to Saturday. Tick each circle as you go and keep the streak alive.'), ...header);
    // Cards read across: Monday | Tuesday, then Wednesday | Thursday, and so on.
    const per = f.cols;
    for (let i = 0; i < days.length; i += per) {
      const cards = days.slice(i, i + per).map((d) => dayCard(c, d, W));
      const h = Math.max(...cards.map((b) => b.h));
      const objs: Obj[] = [];
      cards.forEach((b, k) => {
        // Cards in a row share a height so their edges line up.
        const bg = b.objs[0] as Rect;
        bg.set({ height: h });
        b.objs.forEach((o) => move(o, k * (W + gap), 0));
        objs.push(...b.objs);
      });
      flow.placeRow({ h, objs, gap: u * (f.cols === 1 ? 0.75 : 1) });
    }
  }

  pages.push(...flow.pages);
  const end = await endPage(c);
  pages.push(end);
  addChrome(c, pages);

  return {
    size: { w: f.w, h: f.h },
    pages: pages.map((p) => {
      p.sc.renderAll();
      return {
        links: p.links,
        toDataURL: ({ format: fm, quality, multiplier }) => p.sc.toDataURL({ format: fm, quality: quality ?? 0.92, multiplier: multiplier ?? 1, enableRetinaScaling: false }),
        dispose: async () => {
          await p.sc.dispose();
        },
      };
    }),
  };
}
