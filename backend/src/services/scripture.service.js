// Real scripture text, looked up rather than written by the model (which can misquote). Uses the
// free bible-api.com, which serves public-domain translations. NKJV/NIV/ESV are copyrighted and
// are not available this way.

export const TRANSLATIONS = { kjv: 'KJV', web: 'WEB' };
const cache = new Map();

// "Rom 8:28–30" / " john 3 : 16 " -> something the API accepts.
export function cleanRef(ref) {
  return String(ref || '')
    .replace(/[‒-―]/g, '-')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns { ref (canonical), text } or null when the reference can't be resolved.
export async function lookupScripture(ref, translation = 'kjv') {
  const cleaned = cleanRef(ref);
  if (!cleaned || cleaned.length > 60) return null;
  const key = `${translation}|${cleaned.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  let result = null;
  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(cleaned)}?translation=${translation}`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const text = (data.verses?.length ? data.verses.map((v) => v.text) : [data.text])
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) result = { ref: data.reference || cleaned, text };
    }
  } catch (err) {
    console.error('[scripture] lookup failed for', cleaned, err.message);
  }
  if (result) cache.set(key, result);
  return result;
}

// Looks up several references (a few at a time, politely).
export async function lookupMany(refs, translation) {
  const out = new Map();
  const queue = [...new Set(refs.map(cleanRef).filter(Boolean))].slice(0, 60);
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const ref = queue.shift();
      out.set(ref, await lookupScripture(ref, translation));
    }
  });
  await Promise.all(workers);
  return out;
}
