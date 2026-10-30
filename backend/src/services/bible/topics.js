// A built-in index of well-known Bible stories and topics, so searches like "woman with the issue of blood" still
// find the right passages when the AI search is unavailable (no credit, no network). Each entry lists phrases
// that may appear in a search and the passages that answer it. Only references live here - the words shown are
// always the real text from the installed Bible.
const T = (keys, ...refs) => ({ keys, refs: refs.map(([book, chapter, verseStart, verseEnd]) => ({ book, chapter, verseStart, verseEnd, reason: 'Well-known story / topic' })) });

const TOPICS = [
  T(['issue of blood', 'woman with blood', 'bleeding woman', 'woman who bled', 'hem of his garment', 'touched his garment', 'touched the hem', 'blood issue', 'twelve years'], ['Mark', 5, 25, 34], ['Luke', 8, 43, 48], ['Matthew', 9, 20, 22]),
  T(['feeding of the 5000', '5000', 'five thousand', 'five loaves', 'loaves and fish', 'two fish'], ['John', 6, 1, 14], ['Matthew', 14, 13, 21], ['Mark', 6, 30, 44]),
  T(['prodigal', 'lost son', 'younger son', 'son who left'], ['Luke', 15, 11, 32]),
  T(['good samaritan', 'samaritan', 'who is my neighbour', 'who is my neighbor'], ['Luke', 10, 25, 37]),
  T(['goliath', 'david and goliath', 'five smooth stones'], ['1 Samuel', 17, 32, 51]),
  T(["lions' den", 'lions den', 'den of lions', 'daniel in the'], ['Daniel', 6, 10, 23]),
  T(['fiery furnace', 'shadrach', 'meshach', 'abednego', 'three hebrew'], ['Daniel', 3, 16, 28]),
  T(['noah', 'the ark', 'the flood', 'rainbow'], ['Genesis', 6, 13, 22], ['Genesis', 9, 8, 17]),
  T(['walk on water', 'walking on water', 'peter walked', 'peter walking'], ['Matthew', 14, 22, 33]),
  T(['zacchaeus', 'sycamore'], ['Luke', 19, 1, 10]),
  T(['lazarus', 'raising of lazarus', 'four days dead', 'lazarus come forth'], ['John', 11, 1, 44]),
  T(['creation', 'in the beginning', 'let there be light', 'seven days'], ['Genesis', 1, 1, 31]),
  T(['ten commandments', 'commandments', 'thou shalt not'], ['Exodus', 20, 1, 17]),
  T(["lord's prayer", 'our father which art', 'pray like this', 'how to pray'], ['Matthew', 6, 9, 13]),
  T(['beatitudes', 'blessed are', 'sermon on the mount'], ['Matthew', 5, 3, 12]),
  T(['fruit of the spirit', 'fruits of the spirit'], ['Galatians', 5, 22, 23]),
  T(['armour of god', 'armor of god', 'whole armour', 'whole armor', 'shield of faith', 'sword of the spirit'], ['Ephesians', 6, 10, 18]),
  T(['love is patient', 'love chapter', 'faith hope and love', 'faith, hope, charity', 'charity'], ['1 Corinthians', 13, 1, 13]),
  T(['lord is my shepherd', 'shepherd', 'valley of the shadow', 'still waters'], ['Psalms', 23, 1, 6]),
  T(['born again', 'nicodemus', 'new birth', 'born of the spirit'], ['John', 3, 1, 21]),
  T(['great commission', 'go ye', 'make disciples', 'go into all the world'], ['Matthew', 28, 16, 20], ['Mark', 16, 15, 18]),
  T(['saved by grace', 'grace through faith', 'salvation', 'confess with thy mouth', 'confess with your mouth'], ['Ephesians', 2, 8, 9], ['Romans', 10, 9, 13]),
  T(['what is faith', 'substance of things hoped', 'without faith', 'by faith'], ['Hebrews', 11, 1, 6]),
  T(['jonah', 'big fish', 'whale', 'nineveh'], ['Jonah', 1, 1, 17], ['Jonah', 2, 1, 10]),
  T(['esther', 'for such a time'], ['Esther', 4, 10, 17]),
  T(['ruth', 'naomi', 'whither thou goest', 'where you go i will go'], ['Ruth', 1, 16, 17]),
  T(['joseph', 'coat of many colours', 'coat of many colors', 'sold by his brothers', 'you meant it for evil', 'meant evil'], ['Genesis', 37, 1, 28], ['Genesis', 50, 15, 21]),
  T(['crucifixion', 'crucified', 'calvary', 'golgotha', 'it is finished', 'died on the cross'], ['Luke', 23, 33, 46], ['John', 19, 16, 30]),
  T(['resurrection', 'empty tomb', 'he is risen', 'rose again', 'risen'], ['Matthew', 28, 1, 10], ['Luke', 24, 1, 12], ['1 Corinthians', 15, 3, 8]),
  T(['birth of jesus', 'nativity', 'christmas', 'manger', 'shepherds and angels'], ['Luke', 2, 1, 20]),
  T(['baptism of jesus', 'jesus baptized', 'baptism', 'baptised', 'baptized'], ['Matthew', 3, 13, 17]),
  T(['bartimaeus', 'blind man', 'healing the blind', 'blind beggar', 'born blind'], ['Mark', 10, 46, 52], ['John', 9, 1, 12]),
  T(['paralytic', 'through the roof', 'palsy', 'lowered through', 'four friends'], ['Mark', 2, 1, 12]),
  T(['calming the storm', 'calms the storm', 'peace be still', 'storm on the sea', 'boat in the storm'], ['Mark', 4, 35, 41]),
  T(['water into wine', 'wedding at cana', 'cana of galilee'], ['John', 2, 1, 11]),
  T(['pentecost', 'tongues of fire', 'upper room', 'holy spirit came', 'filled with the holy ghost'], ['Acts', 2, 1, 21]),
  T(['damascus road', 'saul', 'paul conversion', "paul's conversion", 'scales fell'], ['Acts', 9, 1, 19]),
  T(['tower of babel', 'babel'], ['Genesis', 11, 1, 9]),
  T(['abraham and isaac', 'sacrifice his son', 'sacrifice isaac', 'ram in the thicket', 'jehovah jireh'], ['Genesis', 22, 1, 18]),
  T(['red sea', 'parting the sea', 'crossing the red sea', 'sea divided'], ['Exodus', 14, 13, 31]),
  T(['walls of jericho', 'jericho', 'walls fell', 'walls came down'], ['Joshua', 6, 1, 20]),
  T(['samson', 'delilah', 'hair cut'], ['Judges', 16, 4, 30]),
  T(['mount carmel', 'elijah', 'fire from heaven', 'prophets of baal'], ['1 Kings', 18, 20, 39]),
  T(['dry bones', 'valley of bones', 'breath into the bones'], ['Ezekiel', 37, 1, 14]),
  T(['forgive', 'forgiveness', 'forgiving others', 'seventy times seven'], ['Matthew', 6, 14, 15], ['Colossians', 3, 12, 14], ['Matthew', 18, 21, 22]),
  T(['healing', 'sickness', 'by his stripes', 'sick', 'heal me'], ['Isaiah', 53, 4, 5], ['James', 5, 14, 16], ['1 Peter', 2, 24, 24]),
  T(['anxious', 'anxiety', 'worry', 'do not worry', 'peace of god', 'cast your cares'], ['Philippians', 4, 6, 7], ['Matthew', 6, 25, 34], ['1 Peter', 5, 7, 7]),
  T(['tithe', 'tithing', 'giving', 'offering', 'sowing and reaping seed', 'cheerful giver'], ['Malachi', 3, 8, 10], ['2 Corinthians', 9, 6, 8], ['Luke', 6, 38, 38]),
  T(['prayer', 'pray without ceasing', 'ask and it shall be given', 'knock'], ['1 Thessalonians', 5, 16, 18], ['Matthew', 7, 7, 11], ['James', 5, 16, 16]),
  T(['holy spirit', 'comforter', 'helper', 'power from on high'], ['John', 14, 15, 26], ['Acts', 1, 8, 8]),
  T(['god so loved', 'love of god', "god's love", 'god is love'], ['John', 3, 16, 17], ['Romans', 5, 8, 8], ['1 John', 4, 7, 12]),
  T(['strength', 'i can do all things', 'renew their strength', 'wait upon the lord'], ['Philippians', 4, 13, 13], ['Isaiah', 40, 28, 31]),
  T(['trust in the lord', 'lean not', 'acknowledge him', 'direct thy paths'], ['Proverbs', 3, 5, 6]),
  T(['fear not', 'do not fear', 'be not afraid', 'be strong and courageous', 'courage'], ['Isaiah', 41, 10, 10], ['Joshua', 1, 9, 9], ['Psalms', 56, 3, 4]),
  T(['wisdom', 'ask for wisdom', 'if any of you lack wisdom'], ['James', 1, 5, 8], ['Proverbs', 2, 1, 6]),
  T(['marriage', 'husbands love your wives', 'wives submit', 'two shall become one'], ['Ephesians', 5, 22, 33], ['Genesis', 2, 18, 24]),
  T(['faith without works', 'faith and works', 'works without faith'], ['James', 2, 14, 26]),
  T(['mustard seed', 'faith as a grain'], ['Matthew', 17, 20, 20], ['Luke', 13, 18, 19]),
  T(['sower', 'parable of the sower', 'seed on good ground', 'seed fell'], ['Matthew', 13, 1, 23]),
  T(['talents', 'ten virgins', 'wise and foolish virgins', 'faithful servant'], ['Matthew', 25, 1, 30]),
  T(['widow', 'widow mite', "widow's mite", 'widow of zarephath'], ['Luke', 21, 1, 4], ['1 Kings', 17, 8, 16]),
  T(['syrophoenician', 'crumbs from the table', 'canaanite woman'], ['Mark', 7, 24, 30]),
  T(['samaritan woman', 'woman at the well', 'living water', 'well of jacob'], ['John', 4, 1, 42]),
  T(['woman caught in adultery', 'adulterous woman', 'cast the first stone', 'he that is without sin'], ['John', 8, 1, 11]),
  T(['mary and martha', 'martha', 'one thing is needful'], ['Luke', 10, 38, 42]),
  T(['peter denied', 'denial of peter', 'rooster crowed', 'cock crew'], ['Luke', 22, 54, 62]),
  T(['doubting thomas', 'thomas', 'my lord and my god', 'blessed are they that have not seen'], ['John', 20, 24, 29]),
  T(['ascension', 'jesus ascended', 'taken up into heaven'], ['Acts', 1, 6, 11]),
  T(['second coming', 'return of christ', 'rapture', 'last days', 'end times'], ['1 Thessalonians', 4, 13, 18], ['Matthew', 24, 29, 44]),
  T(['heaven', 'new jerusalem', 'many mansions', 'new heaven'], ['John', 14, 1, 6], ['Revelation', 21, 1, 7]),
  T(['hell', 'lake of fire', 'eternal punishment'], ['Matthew', 25, 41, 46], ['Revelation', 20, 11, 15]),
];

// Passages (same shape as the AI's suggestions) for a free-text search, best match first.
export function topicPassages(query, max = 6) {
  const q = ` ${String(query).toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  const hits = [];
  for (const t of TOPICS) {
    const matched = t.keys.filter((k) => q.includes(` ${k.toLowerCase()} `) || q.includes(` ${k.toLowerCase()}s `));
    if (matched.length) hits.push({ t, score: Math.max(...matched.map((k) => k.length)) + matched.length * 3 });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.flatMap((h) => h.t.refs).slice(0, max);
}
