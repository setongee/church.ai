const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache = null; // { fonts, fetchedAt }

const CATEGORY_MAP = {
  'sans serif': 'sans-serif',
  serif: 'serif',
  display: 'display',
  handwriting: 'handwriting',
  monospace: 'monospace',
};

export function normaliseFonts(metadata) {
  const list = metadata?.familyMetadataList;
  if (!Array.isArray(list)) throw new Error('Unexpected Google Fonts metadata shape');
  return list
    .filter((f) => f?.family)
    .map((f) => {
      const keys = Object.keys(f.fonts || {});
      const weights = keys.filter((k) => !k.endsWith('i')).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      const italicWeights = keys
        .filter((k) => k.endsWith('i'))
        .map((k) => Number(k.slice(0, -1)))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      return {
        family: f.family,
        category: CATEGORY_MAP[String(f.category || '').toLowerCase()] || 'sans-serif',
        weights,
        italicWeights,
        popularity: typeof f.popularity === 'number' ? f.popularity : 9999,
      };
    })
    .sort((a, b) => a.popularity - b.popularity);
}

// [family, category]; used only when Google's metadata can't be fetched and nothing is cached.
const FALLBACK = [
  ['Inter', 'sans-serif'], ['Roboto', 'sans-serif'], ['Open Sans', 'sans-serif'], ['Montserrat', 'sans-serif'],
  ['Poppins', 'sans-serif'], ['Lato', 'sans-serif'], ['Playfair Display', 'serif'], ['Merriweather', 'serif'],
  ['Lora', 'serif'], ['Oswald', 'sans-serif'], ['Raleway', 'sans-serif'], ['Bebas Neue', 'display'],
  ['Anton', 'sans-serif'], ['Abril Fatface', 'display'], ['Pacifico', 'handwriting'],
  ['Dancing Script', 'handwriting'], ['Caveat', 'handwriting'], ['Lobster', 'display'],
  ['Archivo Black', 'sans-serif'], ['DM Serif Display', 'serif'], ['Cormorant Garamond', 'serif'],
  ['Libre Baskerville', 'serif'], ['Space Grotesk', 'sans-serif'], ['Work Sans', 'sans-serif'],
  ['Nunito', 'sans-serif'], ['Rubik', 'sans-serif'], ['Barlow', 'sans-serif'], ['Josefin Sans', 'sans-serif'],
  ['Fjalla One', 'sans-serif'], ['Permanent Marker', 'handwriting'], ['Satisfy', 'handwriting'],
  ['Cinzel', 'serif'], ['Great Vibes', 'handwriting'], ['Bangers', 'display'], ['Alfa Slab One', 'display'],
  ['Righteous', 'display'], ['Spectral', 'serif'], ['Crimson Text', 'serif'], ['EB Garamond', 'serif'],
  ['Source Serif 4', 'serif'], ['Fira Sans', 'sans-serif'], ['Quicksand', 'sans-serif'], ['Karla', 'sans-serif'],
  ['Manrope', 'sans-serif'], ['Plus Jakarta Sans', 'sans-serif'], ['Bricolage Grotesque', 'sans-serif'],
  ['Sora', 'sans-serif'], ['Outfit', 'sans-serif'], ['Syne', 'sans-serif'], ['Unbounded', 'display'],
  ['Noto Sans', 'sans-serif'], ['Noto Serif', 'serif'], ['PT Sans', 'sans-serif'], ['PT Serif', 'serif'],
  ['Ubuntu', 'sans-serif'], ['Cabin', 'sans-serif'], ['Bitter', 'serif'], ['Arvo', 'serif'],
  ['Courier Prime', 'monospace'], ['JetBrains Mono', 'monospace'], ['Space Mono', 'monospace'],
  ['Shadows Into Light', 'handwriting'], ['Amatic SC', 'handwriting'], ['Yeseva One', 'display'],
].map(([family, category], i) => ({ family, category, weights: [400, 700], italicWeights: [], popularity: i + 1 }));

export async function getFonts() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.fonts;
  try {
    const res = await fetch(METADATA_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Google Fonts responded ${res.status}`);
    let text = await res.text();
    // Google prefixes the JSON with an XSSI guard (")]}'") on some metadata endpoints.
    text = text.replace(/^\)\]\}'\s*/, '');
    const fonts = normaliseFonts(JSON.parse(text));
    cache = { fonts, fetchedAt: Date.now() };
    return fonts;
  } catch (err) {
    console.error('[fonts] failed to fetch Google Fonts metadata', err.message);
    return cache ? cache.fonts : FALLBACK;
  }
}
