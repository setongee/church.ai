import { cache } from 'fabric';
import { listGoogleFonts } from './api';
import type { GoogleFontMeta } from './types';

export interface FontEntry {
  family: string;
  category: GoogleFontMeta['category'] | 'system' | 'brand';
  weights: number[];
  italicWeights: number[];
  // system/brand fonts are already available (system install / @font-face in globals.css)
  local: boolean;
}

// Shipped via @font-face in globals.css.
const BRAND_FONTS: FontEntry[] = [
  { family: 'Lufga', category: 'brand', weights: [400, 700], italicWeights: [], local: true },
  { family: 'Plus Jakarta Sans', category: 'brand', weights: [400, 700], italicWeights: [], local: true },
  { family: 'Bricolage Grotesque', category: 'brand', weights: [200, 300, 400, 500, 600, 700, 800], italicWeights: [], local: true },
  { family: 'Bebas Neue', category: 'brand', weights: [400], italicWeights: [], local: true },
];

const SYSTEM_FONTS: FontEntry[] = ['Georgia', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana'].map(
  (family) => ({ family, category: 'system', weights: [400, 700], italicWeights: [400, 700], local: true })
);

let fontListPromise: Promise<FontEntry[]> | null = null;
const byFamily = new Map<string, FontEntry>();

function register(list: FontEntry[]) {
  list.forEach((f) => byFamily.set(f.family, f));
}
register([...BRAND_FONTS, ...SYSTEM_FONTS]);

export function loadFontList(): Promise<FontEntry[]> {
  if (!fontListPromise) {
    fontListPromise = listGoogleFonts()
      .then(({ fonts }) => {
        const localNames = new Set([...BRAND_FONTS, ...SYSTEM_FONTS].map((f) => f.family));
        const google: FontEntry[] = fonts
          .filter((f) => !localNames.has(f.family))
          .map((f) => ({ ...f, local: false }));
        register(google);
        return [...BRAND_FONTS, ...google, ...SYSTEM_FONTS];
      })
      .catch(() => {
        fontListPromise = null;
        return [...BRAND_FONTS, ...SYSTEM_FONTS];
      });
  }
  return fontListPromise;
}

export function getFontEntry(family: string): FontEntry | undefined {
  return byFamily.get(family);
}

function cssFamily(family: string) {
  return encodeURIComponent(family).replace(/%20/g, '+');
}

function ensureLink(id: string, href: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLLinkElement | null;
  if (existing) {
    if (existing.dataset.loaded === '1') return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => resolve());
    });
  }
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => {
      link.dataset.loaded = '1';
      resolve();
    };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

const fullyLoaded = new Set<string>();

// Loads every weight/italic the family offers so toggling bold/italic later never needs another
// round trip. Safe to call repeatedly.
export async function loadFont(family: string): Promise<void> {
  if (typeof document === 'undefined') return;
  // The weights/italics a family offers come from the catalogue. If it isn't loaded yet the
  // stylesheet would be requested with only the regular weight (and cached as "fully loaded"),
  // so bold would silently fall back to the browser's faux bold.
  if (!byFamily.get(family)?.local) await loadFontList();
  const entry = byFamily.get(family);
  if (entry?.local) {
    await Promise.all(
      (entry.weights.length ? entry.weights : [400]).slice(0, 4).map((w) => document.fonts.load(`${w} 16px "${family}"`).catch(() => []))
    );
    return;
  }
  if (!fullyLoaded.has(family)) {
    let spec = '';
    if (entry) {
      const tuples = [
        ...entry.weights.map((w) => [0, w] as const),
        ...entry.italicWeights.map((w) => [1, w] as const),
      ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (tuples.length) spec = `:ital,wght@${tuples.map(([i, w]) => `${i},${w}`).join(';')}`;
    }
    await ensureLink(`gf-${family}`, `https://fonts.googleapis.com/css2?family=${cssFamily(family)}${spec}&display=swap`);
    fullyLoaded.add(family);
  }
  const weights = entry?.weights.length ? entry.weights : [400];
  await Promise.all(
    [...weights.slice(0, 3), 400, 700].map((w) => document.fonts.load(`${w} 16px "${family}"`).catch(() => []))
  );
}

// Tiny subset of the family used only to render its own name in the picker. Skipped for
// families already fully loaded: a `text=` subset face has no unicode-range, so if it were
// defined after the full face it would shadow it and drop glyphs from canvas text.
export function loadFontPreview(family: string) {
  if (typeof document === 'undefined') return;
  const entry = byFamily.get(family);
  if (entry?.local || fullyLoaded.has(family)) return;
  const id = `gfp-${family}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${cssFamily(family)}&text=${encodeURIComponent(family)}&display=swap`;
  document.head.appendChild(link);
}

// Fabric caches measured glyph widths per font; anything measured while the real font was
// still loading is stale and must be dropped before text is re-laid-out.
export function clearFabricFontCache(family: string) {
  cache.clearFontCache(family);
}
