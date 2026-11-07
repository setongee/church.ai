const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'via', 'with']);

// "amazing GRACE (my chains are gone)" -> "Amazing Grace (My Chains Are Gone)". Small words stay lower-case unless first,
// last or after a colon/dash. A word with its own mixed capitals (e.g. "iPhone", "McDonald") is left as typed.
export function titleCase(input) {
  const s = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const words = s.split(' ');
  let startOfPart = true;
  return words
    .map((w, i) => {
      const letters = w.replace(/[^\p{L}]/gu, '');
      const mixed = /\p{Ll}/u.test(letters.slice(1)) && /\p{Lu}/u.test(letters.slice(1));
      const bare = letters.toLowerCase();
      const last = i === words.length - 1;
      let out;
      if (mixed) out = w;
      else if (SMALL.has(bare) && !startOfPart && !last) out = w.toLowerCase();
      else out = w.toLowerCase().replace(/(^|[-–—/("“‘])(\p{L})/gu, (_m, pre, ch) => pre + ch.toUpperCase());
      startOfPart = /[:–—-]$/.test(w) || /^[-–—]$/.test(w);
      return out;
    })
    .join(' ');
}
