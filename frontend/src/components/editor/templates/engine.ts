import { Circle, FabricImage, Gradient, Path, Pattern, Point, Rect, Shadow, StaticCanvas, Textbox, filters, type FabricObject } from 'fabric';
import { assetUrl } from '@/lib/api';
import { clearFabricFontCache, loadFont, loadFontList } from '@/lib/fonts';
import type { Brand } from '@/lib/types';

export interface TemplateContent {
  quote: string;
  // The preacher (from the session) - never the brand's pastor.
  author: string;
  // The word/message title ("Weeds of spiritual laziness").
  title: string;
  // Series part, e.g. "Pt. 4A" (title templates).
  part: string;
  // The service/session name ("Day 4 - Word 2").
  service: string;
  points: string[];
  // Scripture reference per point (same order; '' = none), printed as a small line under it.
  pointRefs?: string[];
  // Photo of the preacher (looked up from the Brand ministers by name, or picked in the editor).
  preacherImageUrl?: string;
  // The preacher was picked by hand: a preacher with no photo then hides the photo instead of
  // leaving the previous person's face behind.
  preacherChosen?: boolean;
  brand: Brand | null;
  // Add the church logo + handle footer (and brand accent colours) when a brand profile exists.
  useBrand: boolean;
}

export type TemplateKind = 'quote' | 'excerpt' | 'title' | 'give';

export interface Template {
  id: string;
  name: string;
  kind: TemplateKind;
  blurb: string;
  fonts: string[];
  build: (c: Builder) => Promise<void> | void;
}

export interface BgSpec {
  color?: string;
  gradient?: { from: string; to: string; angle: number };
}

export interface TextOpts {
  font: string;
  size: number;
  fill: string;
  left: number;
  width: number;
  top?: number;
  weight?: number;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  lh?: number;
  spacing?: number;
  upper?: boolean;
  bg?: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  // round stroke joins give cut-out "sticker" outlines
  roundJoin?: boolean;
  // Which piece of content this text shows; lets a saved template take new content later.
  slot?: string;
  // Prefix shown before the slot's value (e.g. an em dash before the author).
  pre?: string;
}

export interface RichRange {
  from: number;
  to: number;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export function gradientCoords(w: number, h: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  return { x1: w / 2 - (dx * len) / 2, y1: h / 2 - (dy * len) / 2, x2: w / 2 + (dx * len) / 2, y2: h / 2 + (dy * len) / 2 };
}

export function makeGradient(w: number, h: number, from: string, to: string, angle: number) {
  return new Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: gradientCoords(w, h, angle),
    colorStops: [
      { offset: 0, color: from },
      { offset: 1, color: to },
    ],
  });
}


// ---------- colour / contrast ----------

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    const short = /^#?([0-9a-f]{3})$/i.exec(hex.trim());
    if (!short) return null;
    const [r, g, b] = short[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Black or white, whichever reads better on `bg`.
export function readableOn(bg: string): string {
  return contrastRatio('#111111', bg) >= contrastRatio('#ffffff', bg) ? '#111111' : '#ffffff';
}

// Nudges `fg` toward black/white until it clears `min` contrast against `bg`.
export function ensureContrast(fg: string, bg: string, min = 3.2): string {
  const rgb = hexToRgb(fg);
  if (!rgb || contrastRatio(fg, bg) >= min) return fg;
  const toward: [number, number, number] = luminance(bg) > 0.4 ? [10, 10, 10] : [255, 255, 255];
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const next = rgbToHex(rgb.map((v, i) => v + (toward[i] - v) * t) as [number, number, number]);
    if (contrastRatio(next, bg) >= min) return next;
  }
  return rgbToHex(toward);
}

export function mixHex(a: string, b: string, t = 0.5) {
  const ra = hexToRgb(a) ?? [0, 0, 0];
  const rb = hexToRgb(b) ?? [0, 0, 0];
  return rgbToHex(ra.map((v, i) => v + (rb[i] - v) * t) as [number, number, number]);
}

// The longest few words of a text, as character ranges (used for coloured emphasis).
export function emphasisRanges(text: string, count = 3) {
  const words: { from: number; to: number; len: number }[] = [];
  const re = /[A-Za-z][A-Za-z'’-]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (m[0].length >= 5) words.push({ from: m.index, to: m.index + m[0].length, len: m[0].length });
  const picked = [...words].sort((a, b) => b.len - a.len).slice(0, count).sort((a, b) => a.from - b.from);
  // merge words that sit next to each other so a phrase is highlighted as one
  const out: { from: number; to: number }[] = [];
  for (const w of picked) {
    const last = out[out.length - 1];
    if (last && /^\s*$/.test(text.slice(last.to, w.from))) last.to = w.to;
    else out.push({ from: w.from, to: w.to });
  }
  return out;
}

export interface Row {
  objs: FabricObject[];
  h: number;
  y: number;
  cy: number;
}

const h = (o: FabricObject) => (o.height ?? 0) * (o.scaleY ?? 1);

// Hands a template everything it needs to lay itself out for any canvas size: measured text,
// shapes, brand images and a vertical stacking helper. Templates never touch fabric directly for
// text so that sizes can be fitted to the available space.
export class Builder {
  readonly w: number;
  readonly h: number;
  readonly u: number;
  readonly m: number;
  readonly cw: number;
  readonly isWide: boolean;
  readonly isTall: boolean;
  readonly footerH: number;
  readonly content: TemplateContent;
  objects: FabricObject[] = [];
  bg: BgSpec = { color: '#f9f9f9' };

  constructor(size: { w: number; h: number }, content: TemplateContent) {
    this.w = size.w;
    this.h = size.h;
    this.u = Math.min(size.w, size.h);
    this.m = this.u * 0.09;
    this.cw = this.w - this.m * 2;
    this.isWide = this.w / this.h > 1.25;
    this.isTall = this.h / this.w > 1.5;
    this.content = content;
    const b = content.brand;
    const hasFooter = Boolean(content.useBrand && b && (b.logoUrl || b.logoLightUrl || b.socials.instagram || b.website || b.churchName));
    this.footerH = hasFooter ? this.u * 0.09 : 0;
  }

  get q() {
    return this.content.quote.trim();
  }
  get author() {
    return this.content.author.trim();
  }
  get title() {
    return this.content.title.trim();
  }
  get service() {
    return this.content.service.trim();
  }
  get part() {
    return this.content.part.trim();
  }
  get points() {
    return this.content.points.map((p) => p.trim()).filter(Boolean).slice(0, 7);
  }

  bgSolid(color: string) {
    this.bg = { color };
  }
  bgGradient(from: string, to: string, angle: number) {
    this.bg = { gradient: { from, to, angle } };
  }

  // Representative colour of the current background (gradients: the midpoint).
  bgColor(): string {
    if (this.bg.gradient) return mixHex(this.bg.gradient.from, this.bg.gradient.to, 0.5);
    return this.bg.color ?? '#f9f9f9';
  }

  // Readable text colour (black/white) for the current background.
  ink() {
    return readableOn(this.bgColor());
  }

  // Brand accent (or the template's own), always nudged until it reads against the background.
  accent(fallback: string, bg: string = this.bgColor()) {
    const b = this.content.brand;
    const raw = (this.content.useBrand && (b?.accentColor || b?.primaryColor)) || fallback;
    return ensureContrast(raw, bg);
  }

  // Brand accent as a *fill* (not text): returned as-is, with a text colour that reads on it.
  accentFill(fallback: string) {
    const b = this.content.brand;
    const fill = (this.content.useBrand && (b?.accentColor || b?.primaryColor)) || fallback;
    return { fill, on: readableOn(fill) };
  }

  region(top = this.m, bottom = this.h - this.m - this.footerH) {
    return { top, bottom };
  }
  regionH() {
    const r = this.region();
    return r.bottom - r.top;
  }

  // Quote size scales down with length so a long quote still lands as a considered layout.
  quoteSize(mult = 1) {
    const len = this.q.length;
    const f = len < 40 ? 1.25 : len < 80 ? 1.02 : len < 140 ? 0.84 : len < 220 ? 0.68 : len < 320 ? 0.56 : 0.46;
    // Tall canvases (stories) have far more vertical room, so type can run bigger.
    return this.u * 0.1 * f * mult * (this.isTall ? 1.2 : 1);
  }

  add(...objs: (FabricObject | null | undefined)[]) {
    objs.forEach((o) => o && this.objects.push(o));
  }

  text(str: string, o: TextOpts): Textbox {
    const t = new Textbox(o.upper ? str.toUpperCase() : str, {
      left: o.left,
      top: o.top ?? 0,
      originX: 'left',
      originY: 'top',
      width: o.width,
      fontFamily: o.font,
      fontSize: Math.max(8, Math.round(o.size)),
      fontWeight: o.weight ?? 400,
      fontStyle: o.italic ? 'italic' : 'normal',
      fill: o.fill,
      textAlign: o.align ?? 'left',
      lineHeight: o.lh ?? 1.2,
      charSpacing: o.spacing ?? 0,
      textBackgroundColor: o.bg ?? '',
      opacity: o.opacity ?? 1,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth ?? 0,
      paintFirst: 'stroke',
      splitByGrapheme: false,
    });
    if (o.roundJoin) t.set({ strokeLineJoin: 'round', strokeMiterLimit: 2 });
    if (o.slot) Object.assign(t, { slot: o.slot, slotPre: o.pre ?? '', slotUp: o.upper ? 1 : 0 });
    return t;
  }

  // Colours the longest words of a textbox (and remembers the colour so refilled text keeps it).
  emphasize(t: Textbox, color: string) {
    Object.assign(t, { emphColor: color });
    applyEmphasis(t);
    return t;
  }

  // Text with per-range weight/italic/underline (e.g. a bold lead-in, an italic key word).
  rich(str: string, o: TextOpts, ranges: RichRange[]): Textbox {
    const t = this.text(str, o);
    ranges.forEach((r) => {
      const style: Record<string, unknown> = {};
      if (r.weight) style.fontWeight = r.weight;
      if (r.italic) style.fontStyle = 'italic';
      if (r.color) style.fill = r.color;
      if (r.underline) style.underline = true;
      if (r.to > r.from) t.setSelectionStyles(style, r.from, r.to);
    });
    t.initDimensions();
    return t;
  }

  // Soft glow: a circle with a radial gradient that fades to transparent (blurry colour fields).
  blob(cx: number, cy: number, r: number, color: string, alpha = 0.5) {
    const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1] ?? 'ffffff';
    const n = parseInt(hex, 16);
    const rgba = (a: number) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    return new Circle({
      left: cx,
      top: cy,
      originX: 'center',
      originY: 'center',
      radius: r,
      fill: new Gradient({
        type: 'radial',
        gradientUnits: 'pixels',
        coords: { x1: r, y1: r, x2: r, y2: r, r1: 0, r2: r },
        colorStops: [
          { offset: 0, color: rgba(alpha) },
          { offset: 0.55, color: rgba(alpha * 0.45) },
          { offset: 1, color: rgba(0) },
        ],
      }),
    });
  }

  path(d: string, o: { stroke?: string; sw?: number; opacity?: number; fill?: string }) {
    return new Path(d, { fill: o.fill ?? '', stroke: o.stroke ?? (o.fill ? undefined : '#ffffff'), strokeWidth: o.sw ?? 0, strokeLineCap: 'round', strokeLineJoin: 'round', opacity: o.opacity ?? 1, objectCaching: false });
  }

  shadow<T extends FabricObject>(obj: T, o?: { color?: string; blur?: number; y?: number }) {
    obj.set({ shadow: new Shadow({ color: o?.color ?? 'rgba(0,0,0,0.3)', blur: o?.blur ?? this.u * 0.03, offsetX: 0, offsetY: o?.y ?? this.u * 0.012 }) });
    return obj;
  }

  // Pixel box of a word inside a laid-out Textbox (null if fabric hasn't measured it).
  wordBox(t: Textbox, start: number, end: number): { x: number; y: number; w: number; h: number } | null {
    try {
      // Fabric measures per-character positions lazily; this forces every line to be measured.
      t.calcTextWidth();
      const loc = t.get2DCursorLocation(start);
      const endLoc = t.get2DCursorLocation(Math.max(start, end - 1));
      const bounds = (t as unknown as { __charBounds: { left: number; width: number }[][] }).__charBounds?.[loc.lineIndex];
      const endBounds = (t as unknown as { __charBounds: { left: number; width: number }[][] }).__charBounds?.[endLoc.lineIndex];
      if (!bounds?.[loc.charIndex] || !endBounds?.[endLoc.charIndex]) return null;
      const lineLeft = (t as unknown as { _getLineLeftOffset: (i: number) => number })._getLineLeftOffset(loc.lineIndex);
      let y = 0;
      for (let i = 0; i < loc.lineIndex; i += 1) y += t.getHeightOfLine(i);
      const x0 = bounds[loc.charIndex].left;
      const x1 = endBounds[endLoc.charIndex].left + endBounds[endLoc.charIndex].width;
      return { x: (t.left ?? 0) + lineLeft + x0, y: (t.top ?? 0) + y, w: x1 - x0, h: t.getHeightOfLine(loc.lineIndex) };
    } catch {
      return null;
    }
  }

  // Shrinks the font until the text fits in maxH.
  fitText(str: string, o: TextOpts, maxH: number, minSize = this.u * 0.022): Textbox {
    let size = o.size;
    let t = this.text(str, { ...o, size });
    // Also shrink when a single long word is wider than the box (wrapping can't break it).
    const tooWide = (x: Textbox) => x.calcTextWidth() > (o.width ?? 0) + 1;
    for (let i = 0; i < 40 && (h(t) > maxH || tooWide(t)) && size > minSize; i += 1) {
      size = Math.max(minSize, size * 0.93);
      t = this.text(str, { ...o, size });
    }
    return t;
  }

  rect(o: { left?: number; top?: number; w: number; h: number; fill?: string; rx?: number; stroke?: string; sw?: number; opacity?: number }) {
    return new Rect({
      left: o.left ?? 0,
      top: o.top ?? 0,
      originX: 'left',
      originY: 'top',
      width: o.w,
      height: o.h,
      fill: o.fill ?? 'transparent',
      rx: o.rx ?? 0,
      ry: o.rx ?? 0,
      stroke: o.stroke,
      strokeWidth: o.sw ?? 0,
      opacity: o.opacity ?? 1,
    });
  }

  circle(o: { cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number; opacity?: number }) {
    return new Circle({
      left: o.cx,
      top: o.cy,
      originX: 'center',
      originY: 'center',
      radius: o.r,
      fill: o.fill ?? 'transparent',
      stroke: o.stroke,
      strokeWidth: o.sw ?? 0,
      opacity: o.opacity ?? 1,
    });
  }

  // Places items top to bottom, centred as a block inside the region.
  stackV(items: (FabricObject | null | undefined)[], gaps: number | number[], region = this.region(), center = true) {
    const list = items.filter(Boolean) as FabricObject[];
    const gapAt = (i: number) => (Array.isArray(gaps) ? (gaps[i] ?? gaps[gaps.length - 1] ?? 0) : gaps);
    const total = list.reduce((s, o, i) => s + h(o) + (i < list.length - 1 ? gapAt(i) : 0), 0);
    let y = center ? region.top + Math.max(0, (region.bottom - region.top - total) / 2) : region.top;
    list.forEach((o, i) => {
      o.set({ top: y });
      o.setCoords();
      y += h(o) + gapAt(i);
      this.add(o);
    });
    return { top: list[0]?.top ?? region.top, bottom: y - (list.length ? gapAt(list.length - 1) : 0) };
  }

  // Fits a list of rows into availH by shrinking the type size; returns rows positioned from y=0.
  fitRows(makeRow: (i: number, text: string, s: number, y: number) => Omit<Row, 'y'>, availH: number, startSize: number, gap: (s: number) => number): { rows: Row[]; height: number; size: number } {
    let s = startSize * (this.isTall ? 1.18 : 1);
    const min = this.u * 0.018;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rows: Row[] = [];
      let y = 0;
      this.points.forEach((p, i) => {
        const r = makeRow(i, p, s, y);
        rows.push({ ...r, y });
        y += r.h + gap(s);
      });
      const height = Math.max(0, y - gap(s));
      if (height <= availH || s <= min) return { rows, height, size: s };
      s *= 0.94;
    }
    return { rows: [], height: 0, size: s };
  }

  async image(
    url: string,
    o: { left: number; top: number; w: number; h: number; fit?: 'cover' | 'contain'; shape?: 'rect' | 'circle' | 'rounded'; radius?: number }
  ): Promise<FabricImage | null> {
    try {
      const img = await FabricImage.fromURL(assetUrl(url), { crossOrigin: 'anonymous' });
      const iw = img.width || 1;
      const ih = img.height || 1;
      const fit = o.fit ?? 'cover';
      const s = fit === 'contain' ? Math.min(o.w / iw, o.h / ih) : Math.max(o.w / iw, o.h / ih);
      img.set({ scaleX: s, scaleY: s, originX: 'center', originY: 'center', left: o.left + o.w / 2, top: o.top + o.h / 2 });
      if (fit === 'cover') {
        // Crop to the box (coordinates are in unscaled image space, relative to its centre).
        img.clipPath =
          o.shape === 'circle'
            ? new Circle({ radius: Math.min(o.w, o.h) / 2 / s, originX: 'center', originY: 'center' })
            : new Rect({ width: o.w / s, height: o.h / s, rx: (o.radius ?? 0) / s, ry: (o.radius ?? 0) / s, originX: 'center', originY: 'center' });
      }
      return img;
    } catch {
      return null;
    }
  }


  // Pastor photo from the brand profile, shown whole (never cropped) and anchored so it bleeds off
  // the canvas edge it sits against.
  async pastor(o: { anchor: 'bl' | 'br' | 'bc'; maxW: number; maxH: number; box?: { left: number; top: number; w: number; h: number } }): Promise<FabricImage | null> {
    const b = this.content.brand;
    const url = this.content.preacherImageUrl || (this.content.useBrand && b?.pastorImageUrl);
    if (!url) return null;
    try {
      const img = await FabricImage.fromURL(assetUrl(url), { crossOrigin: 'anonymous' });
      const iw = img.width || 1;
      const ih = img.height || 1;
      const s = Math.min(o.maxW / iw, o.maxH / ih);
      const w = iw * s;
      const hh = ih * s;
      const box = o.box ?? { left: 0, top: 0, w: this.w, h: this.h };
      const x = o.anchor === 'bl' ? box.left : o.anchor === 'br' ? box.left + box.w - w : box.left + (box.w - w) / 2;
      img.set({ originX: 'left', originY: 'top', left: x, top: box.top + box.h - hh, scaleX: s, scaleY: s });
      Object.assign(img, { slot: 'preacher', slotUrl: url });
      return img;
    } catch {
      return null;
    }
  }

  // Brand logo that stays visible on this background: picks the light/dark variant, and if only
  // one exists and it would vanish (dark logo on dark bg, white on white) recolours it.
  async logo(o: { left: number; top: number; w: number; h: number; onDark: boolean }): Promise<FabricImage | null> {
    const b = this.content.brand;
    if (!this.content.useBrand || !b) return null;
    const url = o.onDark ? b.logoLightUrl || b.logoUrl : b.logoUrl || b.logoLightUrl;
    if (!url) return null;
    const img = await this.image(url, { left: o.left, top: o.top, w: o.w, h: o.h, fit: 'contain' });
    if (!img) return null;
    try {
      const el = img.getElement() as HTMLImageElement;
      const probe = document.createElement('canvas');
      probe.width = 32;
      probe.height = 32;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(el, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let sum = 0;
        let weight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          if (a < 0.3) continue;
          sum += ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255) * a;
          weight += a;
        }
        const lum = weight ? sum / weight : 0.5;
        const flat = (v: number) => [0, 0, 0, 0, v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0, 0, 0, 1, 0];
        if (o.onDark && lum < 0.3) img.filters = [new filters.ColorMatrix({ matrix: flat(1) })];
        else if (!o.onDark && lum > 0.72) img.filters = [new filters.ColorMatrix({ matrix: flat(0) })];
        if (img.filters.length) img.applyFilters();
      }
    } catch {
      // cross-origin pixels unreadable: leave the logo as uploaded
    }
    Object.assign(img, { slot: 'logo', slotUrl: url });
    return img;
  }

  // Film grain: a tiled noise texture over the whole canvas.
  async grain(opacity = 0.5): Promise<FabricObject | null> {
    try {
      const el = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = '/textures/grain.png';
      });
      const r = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: this.w, height: this.h, fill: new Pattern({ source: el, repeat: 'repeat' }), opacity, selectable: false, evented: false });
      Object.assign(r, { role: 'grain' });
      return r;
    } catch {
      return null;
    }
  }

  // Deterministic scatter of tiny specks (dust) - same result every render.
  specks(n: number, color: string, alpha = 0.5, seed = 11) {
    let x = seed;
    const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    const out: FabricObject[] = [];
    for (let i = 0; i < n; i += 1) {
      out.push(this.circle({ cx: rnd() * this.w, cy: rnd() * this.h, r: this.u * (0.001 + rnd() * 0.0032), fill: color, opacity: alpha * (0.4 + rnd() * 0.6) }));
    }
    return out;
  }

  place(o: FabricObject, top: number) {
    o.set({ top });
    o.setCoords();
    this.add(o);
    return o;
  }

  // Church logo + handle row, only when a brand profile is set and "use brand" is on.
  async footer(o: { dark: boolean; align?: 'left' | 'center' | 'right'; x?: number; width?: number }) {
    const b = this.content.brand;
    if (!this.footerH || !b) return;
    const x0 = o.x ?? this.m;
    const width = o.width ?? this.cw;
    const rowH = this.u * 0.05;
    const top = this.h - this.m * 0.8 - rowH;
    const handle = b.socials.instagram ? `@${b.socials.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}` : b.website || b.churchName;

    const gap = this.u * 0.02;
    const logo = await this.logo({ left: 0, top, w: rowH * 3.2, h: rowH, onDark: o.dark });
    const logoW = logo ? (logo.width ?? 0) * (logo.scaleX ?? 1) : 0;
    const textObj = handle
      ? this.text(handle, { font: 'Plus Jakarta Sans', weight: 700, size: this.u * 0.024, fill: o.dark ? '#ffffff' : '#111111', opacity: 0.75, left: 0, top, width: width, slot: 'handle' })
      : null;
    const textW = textObj ? Math.ceil(textObj.calcTextWidth()) + 4 : 0;
    if (textObj) textObj.set({ width: textW });
    const total = logoW + (logo && textObj ? gap : 0) + textW;
    const start = o.align === 'left' ? x0 : o.align === 'right' ? x0 + width - total : x0 + (width - total) / 2;
    if (logo) {
      logo.set({ left: start + logoW / 2, top: top + rowH / 2 });
      logo.setCoords();
      this.add(logo);
    }
    if (textObj) {
      textObj.set({ left: start + logoW + (logo ? gap : 0), top: top + (rowH - h(textObj)) / 2 });
      textObj.setCoords();
      this.add(textObj);
    }
  }
}

export interface BuiltTemplate {
  bg: BgSpec;
  objects: FabricObject[];
}

export async function runTemplate(t: Template, size: { w: number; h: number }, content: TemplateContent): Promise<BuiltTemplate> {
  await loadFontList();
  await Promise.all(t.fonts.map((f) => loadFont(f).then(() => clearFabricFontCache(f))));
  const b = new Builder(size, content);
  await t.build(b);
  return { bg: b.bg, objects: b.objects };
}

export function makeBgRect(bg: BgSpec, w: number, hh: number): Rect {
  const rect = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: w, height: hh, selectable: false, evented: false, objectCaching: false });
  rect.set({ fill: bg.gradient ? makeGradient(w, hh, bg.gradient.from, bg.gradient.to, bg.gradient.angle) : (bg.color ?? '#f9f9f9') });
  return rect;
}

// Renders a template to a small JPEG with the exact code path used when it's applied.
export async function renderThumb(t: Template, size: { w: number; h: number }, content: TemplateContent, targetW: number): Promise<string> {
  const built = await runTemplate(t, size, content);
  const el = document.createElement('canvas');
  const sc = new StaticCanvas(el, { width: size.w, height: size.h, enableRetinaScaling: false });
  sc.add(makeBgRect(built.bg, size.w, size.h), ...built.objects);
  sc.renderAll();
  const url = sc.toDataURL({ format: 'jpeg', quality: 0.82, multiplier: Math.min(1, targetW / size.w) });
  await sc.dispose();
  return url;
}


export function applyEmphasis(t: Textbox & { emphColor?: string }) {
  if (!t.emphColor) return;
  t.styles = {};
  emphasisRanges(t.text ?? '').forEach((r) => t.setSelectionStyles({ fill: t.emphColor }, r.from, r.to));
  t.initDimensions();
}

// Image slots: which picture each kind of data supplies.
export function imageSlotValues(c: TemplateContent): Record<string, string> {
  const b = c.brand;
  return {
    preacher: c.preacherImageUrl || '',
    pastor: b?.pastorImageUrl || '',
    logo: b?.logoUrl || b?.logoLightUrl || '',
  };
}

type SlotImage = FabricImage & { slot?: string; slotUrl?: string };

// Replaces a picture's source but keeps its frame: same place, same size, same round crop (and a
// photo that stands on the bottom edge keeps standing there).
export async function swapImage(img: SlotImage, url: string) {
  const box = img.getBoundingRect();
  const center = img.getCenterPoint();
  const clip = img.clipPath as (Circle & { radius?: number }) | undefined;
  const circle = clip?.type === 'circle';
  const diameter = circle ? (clip?.radius ?? 0) * 2 * (img.scaleX ?? 1) : 0;
  await img.setSrc(assetUrl(url), { crossOrigin: 'anonymous' });
  img.filters = [];
  const iw = img.width || 1;
  const ih = img.height || 1;
  if (circle) {
    const side = Math.min(iw, ih);
    const s = diameter / side;
    img.set({ scaleX: s, scaleY: s, clipPath: new Circle({ radius: side / 2, originX: 'center', originY: 'center' }) });
    img.setPositionByOrigin(center, 'center', 'center');
  } else {
    const s = Math.min(box.width / iw, box.height / ih);
    img.set({ scaleX: s, scaleY: s });
    const standing = img.slot === 'preacher' || img.slot === 'pastor';
    img.setPositionByOrigin(standing ? new Point(center.x, box.top + box.height) : center, 'center', standing ? 'bottom' : 'center');
  }
  img.setCoords();
}

// Swaps every slot-bound picture whose data has changed. Pictures with no recorded source (made
// before binding existed) are left alone.
export async function fillImageSlots(objects: FabricObject[], c: TemplateContent) {
  const urls = imageSlotValues(c);
  for (const o of objects) {
    if (o.type !== 'image') continue;
    const im = o as SlotImage;
    const url = im.slot ? urls[im.slot] : '';
    if (im.slot === 'preacher' && im.slotUrl) {
      if (!url && c.preacherChosen) {
        im.set({ visible: false });
        continue;
      }
      if (url && im.visible === false) im.set({ visible: true });
    }
    if (!url || !im.slotUrl || im.slotUrl === url) continue;
    try {
      await swapImage(im, url);
      im.slotUrl = url;
    } catch (err) {
      console.error('[editor] could not swap a bound image', err);
    }
  }
}

// Pours the current content into every slot-tagged text of a saved template.
export function slotTextValue(c: TemplateContent, slot: string): string {
  return textSlotValues(c)[slot] ?? '';
}

function textSlotValues(c: TemplateContent): Record<string, string> {
  const b = c.brand;
  const values: Record<string, string> = {
    quote: c.quote,
    author: c.author,
    title: c.title,
    part: c.part,
    service: c.service,
    org: (c.useBrand && b?.churchName) || '',
    tagline: b?.tagline || '',
    address: b?.address || '',
    website: b?.website || '',
    phone: b?.phone || '',
    handle: b?.socials.instagram ? `@${b.socials.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}` : b?.website || b?.churchName || '',
  };
  c.points.forEach((p, i) => {
    values[`point:${i}`] = p;
  });
  return values;
}

const REF_SCALE = 0.72;
type RefBox = Textbox & { refFrom?: number };

// Styles the scripture line at the end of a point's text (small, bold, italic) and remembers
// where it starts so it can be re-sized when the point text is scaled.
export function styleRefLine(t: RefBox, from: number) {
  t.refFrom = from;
  const len = (t.text ?? '').length;
  if (len > from) t.setSelectionStyles({ fontSize: Math.round((t.fontSize ?? 24) * REF_SCALE), fontWeight: 700, fontStyle: 'italic' }, from, len);
  t.initDimensions();
}

type PointBox = Textbox & { slot?: string };
const pointIndex = (o: FabricObject) => {
  const m = /^point:(\d+)$/.exec((o as PointBox).slot ?? '');
  return o.type === 'textbox' && m ? Number(m[1]) : -1;
};

// What a saved template's points list looked like before new text went in: each point's bullet,
// the gap between points and the card behind them, so the list can be re-flowed afterwards.
function measurePoints(objects: FabricObject[]) {
  const pts = objects
    .map((o, idx) => ({ o: o as PointBox, idx, n: pointIndex(o) }))
    .filter((p) => p.n >= 0)
    .sort((a, b) => a.n - b.n);
  if (pts.length === 0) return null;
  const items = pts.map((p) => {
    const prev = objects[p.idx - 1] as (Textbox & { slot?: string }) | undefined;
    const bullet = prev && prev.type === 'textbox' && !prev.slot && prev.text.trim().length <= 2 ? prev : null;
    return { tb: p.o, bullet, top: p.o.top, h: p.o.getScaledHeight(), bulletDy: bullet ? bullet.top - p.o.top : 0 };
  });
  const first = items[0];
  const gaps = items.slice(1).map((it, i) => it.top - (items[i].top + items[i].h)).filter((g) => g >= 0);
  const gap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : first.h * 0.4;
  // The card: the unlinked rectangle that holds the first point.
  const card = objects
    .filter((o) => o.type === 'rect' && !(o as { slot?: string }).slot && (o as { role?: string }).role !== 'bg-fill')
    .filter((o) => o.left <= first.tb.left && o.top <= first.top && o.left + o.getScaledWidth() >= first.tb.left + first.tb.getScaledWidth() && o.top + o.getScaledHeight() >= first.top)
    .sort((a, b) => a.getScaledWidth() * a.getScaledHeight() - b.getScaledWidth() * b.getScaledHeight())[0];
  const last = items[items.length - 1];
  const bottomPad = card ? Math.max(20, card.top + card.getScaledHeight() - (last.top + last.h)) : 0;
  return { items, gap: Math.max(8, gap), card, bottomPad, cardBottom: card ? card.top + card.getScaledHeight() : 0, canvasLimit: 0 };
}

// Stacks the filled points one under the other so long ones never overlap the next, hides the
// bullets of unused slots, and grows or shrinks the card to hug the list. If the list would run
// into whatever sits below the card (the name, the footer) the text is scaled down to fit.
function reflowPoints(objects: FabricObject[], m: NonNullable<ReturnType<typeof measurePoints>>, canvasH: number) {
  const { items, gap, card, bottomPad } = m;
  const start = items[0].top;
  // Anything below the card that the card must not run over.
  const floor = card
    ? Math.min(canvasH - bottomPad * 0.5, ...objects.filter((o) => o.type === 'textbox' && o !== card && o.visible !== false && o.top >= card.top + card.getScaledHeight() * 0.6 && o.left < card.left + card.getScaledWidth() && o.left + o.getScaledWidth() > card.left).map((o) => o.top - 12))
    : canvasH;
  const baseSizes = items.map((it) => it.tb.fontSize);
  const place = (scale: number) => {
    let y = start;
    let lastBottom = start;
    for (const [i, it] of items.entries()) {
      if (!it.tb.visible) {
        if (it.bullet) it.bullet.set({ visible: false });
        continue;
      }
      it.tb.set({ fontSize: baseSizes[i] * scale, top: y });
      const refFrom = (it.tb as RefBox).refFrom;
      if (refFrom !== undefined) styleRefLine(it.tb as RefBox, refFrom);
      else it.tb.initDimensions();
      if (it.bullet) {
        it.bullet.set({ visible: true, fontSize: it.bullet.fontSize, top: y + it.bulletDy });
        it.bullet.setCoords();
      }
      it.tb.setCoords();
      lastBottom = y + it.tb.getScaledHeight();
      y = lastBottom + gap * scale;
    }
    return lastBottom;
  };
  let scale = 1;
  let bottom = place(scale);
  while (card && bottom + bottomPad > floor && scale > 0.6) {
    scale *= 0.95;
    bottom = place(scale);
  }
  if (card) {
    card.set({ scaleY: 1, height: Math.max(20, bottom + bottomPad - card.top) });
    card.setCoords();
  }
}

export function fillSlots(objects: FabricObject[], c: TemplateContent) {
  const values = textSlotValues(c);
  const measured = objects.length > 1 ? measurePoints(objects) : null;
  const bgFill = objects.find((o) => (o as { role?: string }).role === 'bg-fill');
  const canvasH = bgFill ? bgFill.getScaledHeight() : Math.max(...objects.map((o) => o.top + o.getScaledHeight()));
  for (const o of objects) {
    const t = o as Textbox & { slot?: string; slotPre?: string; slotUp?: number; emphColor?: string };
    if (o.type !== 'textbox' || !t.slot) continue;
    if (!(t.slot in values)) {
      if (t.slot.startsWith('point:')) o.set({ visible: false });
      continue;
    }
    const raw = values[t.slot].trim();
    if (!raw) {
      o.set({ visible: false });
      continue;
    }
    const pi = pointIndex(o);
    const ref = pi >= 0 ? (c.pointRefs?.[pi] ?? '').trim() : '';
    const body = `${t.slotPre ?? ''}${t.slotUp ? raw.toUpperCase() : raw}`;
    const text = ref ? `${body}\n${ref}` : body;
    t.styles = {};
    t.set({ text, visible: true });
    applyEmphasis(t);
    t.initDimensions();
    if (ref) styleRefLine(t, body.length + 1);
    t.setCoords();
  }
  if (measured) reflowPoints(objects, measured, canvasH);
}
