// A copy of the server's Bible XML reader (backend/src/services/bible/parse.js), so a Bible file can be read on this device with no
// network: Zefania, OSIS, USFX or OpenSong.
import { bookFromId, bookFromName, type BibleChapters } from "./bibleLocal";

// Normalized shape for every format: { [bookNumber]: { [chapter]: [[verse, text], ...] } }.
// Parsers are tolerant scanners rather than strict XML - these files are big, often hand-made, and
// we only need book/chapter/verse text.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const clean = (s: string) => decode(s).replace(/\s+/g, ' ').trim();

function add(out: BibleChapters, book: number, chapter: number, verse: number, text: string) {
  text = clean(text);
  if (!book || !chapter || !verse || !text) return;
  ((out[book] ||= {})[chapter] ||= []).push([verse, text]);
}

// Tags whose whole content (footnotes, cross references, headings) is not verse text.
const SKIP_TAGS = new Set(['note', 'f', 'fe', 'x', 'fig', 'rf', 'ref', 'xt', 'title', 'h', 'toc', 'ide', 'rem', 'cp', 'd', 'ms', 's', 'r', 'sp']);

export function detectFormat(xml: string): "opensong" | "zefania" | "osis" | "usfx" | null {
  const head = xml.slice(0, 4000).toLowerCase();
  // OpenSong (.xmm): <bible><b n="Genesis"><c n="1"><v n="1">text</v>
  if (/<bible[\s>]/.test(head) && /<b\s[^>]*\bn\s*=/.test(xml.slice(0, 20000).toLowerCase())) return 'opensong';
  if (head.includes('<xmlbible') || head.includes('<biblebook') || /<chapter\s+cnumber/.test(xml.slice(0, 20000).toLowerCase())) return 'zefania';
  if (head.includes('<osis')) return 'osis';
  if (head.includes('<usfx')) return 'usfx';
  return null;
}

function parseZefania(xml: string) {
  const out: BibleChapters = {};
  const bookRe = /<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi;
  let b: RegExpExecArray | null;
  let order = 0;
  while ((b = bookRe.exec(xml))) {
    order++;
    const num = /bnumber\s*=\s*["'](\d+)["']/i.exec(b[1]);
    const bookNo = num ? parseInt(num[1], 10) : order;
    if (bookNo < 1 || bookNo > 66) continue;
    const chRe = /<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi;
    let c: RegExpExecArray | null;
    let chOrder = 0;
    while ((c = chRe.exec(b[2]))) {
      chOrder++;
      const cn = /cnumber\s*=\s*["'](\d+)["']/i.exec(c[1]);
      const chapter = cn ? parseInt(cn[1], 10) : chOrder;
      const vRe = /<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi;
      let v: RegExpExecArray | null;
      let vOrder = 0;
      while ((v = vRe.exec(c[2]))) {
        vOrder++;
        const vn = /vnumber\s*=\s*["'](\d+)["']/i.exec(v[1]);
        // Drop <NOTE>/<gram>/<STYLE> markup but keep the words inside <STYLE>.
        const body = v[2].replace(/<NOTE\b[\s\S]*?<\/NOTE>/gi, '').replace(/<[^>]+>/g, '');
        add(out, bookNo, chapter, vn ? parseInt(vn[1], 10) : vOrder, body);
      }
    }
  }
  return out;
}

function parseOpenSong(xml: string) {
  const out: BibleChapters = {};
  const bookRe = /<b\b([^>]*)>([\s\S]*?)<\/b>/gi;
  let b: RegExpExecArray | null;
  let order = 0;
  while ((b = bookRe.exec(xml))) {
    order++;
    const n = /\bn\s*=\s*["']([^"']*)["']/i.exec(b[1]);
    // Books are normally named; fall back to file order (which is canonical order) or a number.
    const bookNo = (n && (bookFromName(decode(n[1])) || (/^\d+$/.test(n[1]) ? +n[1] : 0))) || order;
    if (bookNo < 1 || bookNo > 66) continue;
    const chRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let c: RegExpExecArray | null;
    let chOrder = 0;
    while ((c = chRe.exec(b[2]))) {
      chOrder++;
      const cn = /\bn\s*=\s*["'](\d+)["']/i.exec(c[1]);
      const chapter = cn ? parseInt(cn[1], 10) : chOrder;
      const vRe = /<v\b([^>]*)>([\s\S]*?)<\/v>/gi;
      let v: RegExpExecArray | null;
      let vOrder = 0;
      while ((v = vRe.exec(c[2]))) {
        vOrder++;
        const vn = /\bn\s*=\s*["'](\d+)["']/i.exec(v[1]);
        add(out, bookNo, chapter, vn ? parseInt(vn[1], 10) : vOrder, v[2].replace(/<[^>]+>/g, ''));
      }
    }
  }
  return out;
}

// OSIS and USFX both mark verses with milestones or wrappers; one tag scanner handles both.
function parseMarkup(xml: string, format: string) {
  const out: BibleChapters = {};
  const tagRe = /<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let book = 0;
  let chapter = 0;
  let verse = 0;
  let buf = '';
  let skipDepth = 0;
  const skipStack: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  const flush = () => {
    if (verse) add(out, book, chapter, verse, buf);
    buf = '';
  };
  const attr = (s: string, name: string) => {
    const r = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(s);
    return r ? r[1] : null;
  };

  while ((m = tagRe.exec(xml))) {
    if (!skipDepth && m.index > last) buf += xml.slice(last, m.index);
    last = tagRe.lastIndex;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const attrs = m[3];
    const selfClosing = m[4] === '/';

    if (skipDepth) {
      if (closing && name === skipStack[skipStack.length - 1]) {
        skipStack.pop();
        skipDepth--;
      } else if (!closing && !selfClosing && name === skipStack[skipStack.length - 1]) {
        skipStack.push(name);
        skipDepth++;
      }
      continue;
    }
    if (!closing && !selfClosing && SKIP_TAGS.has(name) && !(format === 'usfx' && name === 'd')) {
      skipStack.push(name);
      skipDepth = 1;
      continue;
    }

    if (format === 'usfx') {
      if (name === 'book' && !closing) {
        flush();
        verse = 0;
        book = bookFromId(attr(attrs, 'id') || '');
        chapter = 0;
      } else if (name === 'c' && !closing) {
        flush();
        verse = 0;
        chapter = parseInt(attr(attrs, 'id') || '0', 10);
      } else if (name === 'v' && !closing) {
        flush();
        verse = parseInt(attr(attrs, 'id') || '0', 10);
      } else if (name === 've') {
        flush();
        verse = 0;
      }
    } else {
      // OSIS. Milestone form: <verse sID=.../> text <verse eID=.../>. Wrapper form: <verse osisID>..</verse>.
      if (name === 'div' && !closing && /book/i.test(attr(attrs, 'type') || '')) {
        const id = attr(attrs, 'osisID');
        if (id && !selfClosing) {
          flush();
          verse = 0;
          book = bookFromId(id.split('.')[0]);
        }
      } else if (name === 'chapter' && !closing) {
        const id = attr(attrs, 'osisID') || attr(attrs, 'sID');
        if (id) {
          const parts = id.split('.');
          flush();
          verse = 0;
          book = bookFromId(parts[0]) || book;
          chapter = parseInt(parts[1], 10) || chapter;
        }
      } else if (name === 'verse') {
        const sid = attr(attrs, 'sID');
        const eid = attr(attrs, 'eID');
        const oid = attr(attrs, 'osisID');
        if (closing || eid) {
          flush();
          verse = 0;
        } else {
          const id = sid || oid;
          if (id) {
            flush();
            const parts = id.split(' ')[0].split('.');
            book = bookFromId(parts[0]) || book;
            chapter = parseInt(parts[1], 10) || chapter;
            verse = parseInt(parts[2], 10) || 0;
          }
        }
      }
    }
  }
  flush();
  return out;
}

export function parseBible(xml: string) {
  const format = detectFormat(xml);
  if (!format) throw new Error("Unrecognised file. Use a Zefania, OSIS, USFX or OpenSong (.xmm) Bible.");
  const data = format === 'zefania' ? parseZefania(xml) : format === 'opensong' ? parseOpenSong(xml) : parseMarkup(xml, format);
  let verses = 0;
  for (const ch of Object.values(data)) for (const vs of Object.values(ch)) verses += vs.length;
  if (verses < 500) throw new Error("That file did not contain a readable Bible (found too few verses).");
  return { format, data, verses };
}
