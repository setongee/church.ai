// The 66 canonical books: display name, the ids OSIS/USFX use, and the abbreviations people type.
// Index in this list + 1 is the book number every parsed Bible is keyed by.
const BOOKS = [
  ['Genesis', 'Gen', 'GEN', 'ge gn'],
  ['Exodus', 'Exod', 'EXO', 'ex exo exod'],
  ['Leviticus', 'Lev', 'LEV', 'le lv'],
  ['Numbers', 'Num', 'NUM', 'nu nm nb'],
  ['Deuteronomy', 'Deut', 'DEU', 'de dt deut'],
  ['Joshua', 'Josh', 'JOS', 'jos jsh'],
  ['Judges', 'Judg', 'JDG', 'jdg jg jdgs'],
  ['Ruth', 'Ruth', 'RUT', 'ru rth'],
  ['1 Samuel', '1Sam', '1SA', '1sa 1sm 1s'],
  ['2 Samuel', '2Sam', '2SA', '2sa 2sm 2s'],
  ['1 Kings', '1Kgs', '1KI', '1ki 1kgs 1k'],
  ['2 Kings', '2Kgs', '2KI', '2ki 2kgs 2k'],
  ['1 Chronicles', '1Chr', '1CH', '1ch 1chr'],
  ['2 Chronicles', '2Chr', '2CH', '2ch 2chr'],
  ['Ezra', 'Ezra', 'EZR', 'ezr'],
  ['Nehemiah', 'Neh', 'NEH', 'ne neh'],
  ['Esther', 'Esth', 'EST', 'es est esth'],
  ['Job', 'Job', 'JOB', 'jb'],
  ['Psalms', 'Ps', 'PSA', 'ps psa psalm pslm pss'],
  ['Proverbs', 'Prov', 'PRO', 'pr prv prov'],
  ['Ecclesiastes', 'Eccl', 'ECC', 'ec ecc eccl qoh'],
  ['Song of Solomon', 'Song', 'SNG', 'ss song sos songofsongs songofsolomon canticles'],
  ['Isaiah', 'Isa', 'ISA', 'is isa'],
  ['Jeremiah', 'Jer', 'JER', 'je jer'],
  ['Lamentations', 'Lam', 'LAM', 'la lam'],
  ['Ezekiel', 'Ezek', 'EZK', 'eze ezk ezek'],
  ['Daniel', 'Dan', 'DAN', 'da dn dan'],
  ['Hosea', 'Hos', 'HOS', 'ho hos'],
  ['Joel', 'Joel', 'JOL', 'joe jl'],
  ['Amos', 'Amos', 'AMO', 'am amo'],
  ['Obadiah', 'Obad', 'OBA', 'ob oba obad'],
  ['Jonah', 'Jonah', 'JON', 'jnh jon'],
  ['Micah', 'Mic', 'MIC', 'mi mic'],
  ['Nahum', 'Nah', 'NAM', 'na nah'],
  ['Habakkuk', 'Hab', 'HAB', 'hab hb'],
  ['Zephaniah', 'Zeph', 'ZEP', 'zep zph zeph'],
  ['Haggai', 'Hag', 'HAG', 'hag hg'],
  ['Zechariah', 'Zech', 'ZEC', 'zec zch zech'],
  ['Malachi', 'Mal', 'MAL', 'mal ml'],
  ['Matthew', 'Matt', 'MAT', 'mt mat matt'],
  ['Mark', 'Mark', 'MRK', 'mk mr mrk'],
  ['Luke', 'Luke', 'LUK', 'lk lu luk'],
  ['John', 'John', 'JHN', 'jn jhn joh'],
  ['Acts', 'Acts', 'ACT', 'ac act'],
  ['Romans', 'Rom', 'ROM', 'ro rm rom'],
  ['1 Corinthians', '1Cor', '1CO', '1co 1cor'],
  ['2 Corinthians', '2Cor', '2CO', '2co 2cor'],
  ['Galatians', 'Gal', 'GAL', 'ga gal'],
  ['Ephesians', 'Eph', 'EPH', 'ep eph'],
  ['Philippians', 'Phil', 'PHP', 'php phil pp'],
  ['Colossians', 'Col', 'COL', 'col'],
  ['1 Thessalonians', '1Thess', '1TH', '1th 1thess 1thes'],
  ['2 Thessalonians', '2Thess', '2TH', '2th 2thess 2thes'],
  ['1 Timothy', '1Tim', '1TI', '1ti 1tim'],
  ['2 Timothy', '2Tim', '2TI', '2ti 2tim'],
  ['Titus', 'Titus', 'TIT', 'ti tit'],
  ['Philemon', 'Phlm', 'PHM', 'phm phlm philem'],
  ['Hebrews', 'Heb', 'HEB', 'he heb'],
  ['James', 'Jas', 'JAS', 'jm jas jam'],
  ['1 Peter', '1Pet', '1PE', '1pe 1pet 1pt'],
  ['2 Peter', '2Pet', '2PE', '2pe 2pet 2pt'],
  ['1 John', '1John', '1JN', '1jn 1jo 1jhn 1john'],
  ['2 John', '2John', '2JN', '2jn 2jo 2jhn 2john'],
  ['3 John', '3John', '3JN', '3jn 3jo 3jhn 3john'],
  ['Jude', 'Jude', 'JUD', 'jud jd'],
  ['Revelation', 'Rev', 'REV', 're rev rv revelations'],
];

export const BOOK_LIST = BOOKS.map(([name], i) => ({ n: i + 1, name }));

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const byAlias = new Map();
const byId = new Map();
BOOKS.forEach(([name, osis, usfx, aliases], i) => {
  const n = i + 1;
  byAlias.set(norm(name), n);
  aliases.split(' ').forEach((a) => byAlias.set(norm(a), n));
  byId.set(osis.toLowerCase(), n);
  byId.set(usfx.toLowerCase(), n);
});

// OSIS ("Gen") / USFX ("GEN") book ids -> book number, or 0 for anything non-canonical.
export const bookFromId = (id) => byId.get(String(id).toLowerCase()) || 0;
export const bookName = (n) => BOOKS[n - 1]?.[0] || '';

// "Jn 3:16", "1 cor 13:4-7", "Ps 23", "Romans 8:28-30,32" -> { book, chapter, verses } where
// verses is null for a whole chapter. Returns null when the text isn't a reference.
export function parseReference(input) {
  const m = /^\s*((?:[1-3]\s*)?[a-z][a-z .]*?)\s*(\d+)?(?:\s*[:.]\s*([\d,\s\-–—]+))?\s*$/i.exec(String(input || ''));
  if (!m) return null;
  const book = byAlias.get(norm(m[1]));
  if (!book) return null;
  const chapter = m[2] ? parseInt(m[2], 10) : 1;
  let verses = null;
  if (m[3]) {
    verses = [];
    for (const part of m[3].split(',')) {
      const r = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(part);
      if (!r) continue;
      const a = parseInt(r[1], 10);
      const b = r[2] ? parseInt(r[2], 10) : a;
      for (let v = a; v <= Math.min(b, a + 200); v++) verses.push(v);
    }
    if (!verses.length) verses = null;
  }
  return { book, chapter, verses };
}

// A book from its written name or abbreviation ("Genesis", "1 Cor", "Psalm"), or 0 if unknown.
export const bookFromName = (name) => byAlias.get(norm(name)) || 0;
