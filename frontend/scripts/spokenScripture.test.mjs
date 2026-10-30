// Run: node --experimental-strip-types scripts/spokenScripture.test.mjs
import { detectScriptures } from "../src/lib/spokenScripture.ts";

let pass = 0;
const fails = [];
const labels = (text, ctx) => detectScriptures(text, ctx ? { context: ctx } : {}).map((r) => r.label);
function eq(name, text, expected, ctx) {
  const got = labels(text, ctx);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) pass++;
  else fails.push(`${name}: "${text}" -> ${JSON.stringify(got)} (wanted ${JSON.stringify(expected)})`);
}

// digits
eq("digits", "John 3:16", ["John 3:16"]);
eq("digits sp", "John 3 16", ["John 3:16"]);
eq("range", "Romans 8:28-30", ["Romans 8:28-30"]);
eq("range en dash", "Romans 8:28–30", ["Romans 8:28-30"]);
eq("chapter only", "Psalm 23", ["Psalms 23"]);
eq("psalms", "Psalms 91", ["Psalms 91"]);
eq("glued 316", "John 316", ["John 3:16"]);
eq("prefix words", "turn with me to Romans 8 28", ["Romans 8:28"]);
eq("mid sentence", "So let us read Isaiah 53:5 together today", ["Isaiah 53:5"]);
eq("two refs", "Genesis 1:1 and also John 1:1", ["Genesis 1:1", "John 1:1"]);
eq("1 john", "1 John 4:8", ["1 John 4:8"]);
eq("2 timothy", "2 Timothy 3:16", ["2 Timothy 3:16"]);
eq("3 john", "3 John 4", ["3 John 1:4"]);
eq("jude verse", "Jude 5", ["Jude 1:5"]);
eq("philemon", "Philemon 1:6", ["Philemon 1:6"]);
// words
eq("words", "John chapter three verse sixteen", ["John 3:16"]);
eq("words no chapter word", "John three sixteen", ["John 3:16"]);
eq("turn with me", "turn with me to Romans eight twenty eight", ["Romans 8:28"]);
eq("hyphen words", "Romans eight twenty-eight", ["Romans 8:28"]);
eq("verses range words", "Romans 8 verses 28 to 30", ["Romans 8:28-30"]);
eq("through", "Romans chapter eight verse twenty eight through thirty", ["Romans 8:28-30"]);
eq("through verse", "Matthew five verse three through verse twelve", ["Matthew 5:3-12"]);
eq("psalm 119", "Psalm one hundred and nineteen", ["Psalms 119"]);
eq("psalm 119 105", "Psalm one hundred and nineteen verse one hundred and five", ["Psalms 119:105"]);
eq("psalm 23 words", "Psalm twenty three", ["Psalms 23"]);
// Psalms spoken without the "hundred": "one nineteen" = 119 (not Psalm 1:19)
eq("psalm one nineteen", "Psalm one nineteen", ["Psalms 119"]);
eq("psalms one nineteen", "Psalms one nineteen", ["Psalms 119"]);
eq("psalm one thirty six", "Psalm one thirty six", ["Psalms 136"]);
eq("psalm one thirty-six", "Psalm one thirty-six", ["Psalms 136"]);
eq("psalm one fifty", "Psalm one fifty", ["Psalms 150"]);
eq("psalm one twenty three", "Psalm one twenty three", ["Psalms 123"]);
eq("psalm one nineteen verse 105", "Psalm one nineteen verse one hundred and five", ["Psalms 119:105"]);
eq("psalm one thirty six verse 4", "Psalm one thirty six verse four", ["Psalms 136:4"]);
eq("psalm digits split", "Psalm 1 36", ["Psalms 136"]);
eq("psalm digits 136", "psalm 136", ["Psalms 136"]);
eq("psalms digits 119", "psalms 119", ["Psalms 119"]);
eq("psalm one verse six stays", "Psalm one verse six", ["Psalms 1:6"]);
eq("psalm one colon 3 stays", "Psalm 1:3", ["Psalms 1:3"]);
eq("psalm one three stays", "Psalm one three", ["Psalms 1:3"]);
eq("psalm one alone", "Psalm one", ["Psalms 1"]);
eq("psalm 23 verse 1", "Psalm twenty-three verse one", ["Psalms 23:1"]);
eq("genesis chapter 1", "Genesis chapter 1", ["Genesis 1"]);
eq("genesis one one", "Genesis chapter one verse one", ["Genesis 1:1"]);
eq("first john words", "first John chapter four verse eight", ["1 John 4:8"]);
eq("second corinthians", "second Corinthians five seventeen", ["2 Corinthians 5:17"]);
eq("first corinthians 13", "First Corinthians thirteen verses four to seven", ["1 Corinthians 13:4-7"]);
eq("third john", "third John verse four", ["3 John 1:4"]);
eq("song of solomon", "Song of Solomon chapter two verse four", ["Song of Solomon 2:4"]);
eq("song of songs", "Song of songs 8:6", ["Song of Solomon 8:6"]);
eq("revelations", "Revelations twenty-two verse twenty", ["Revelation 22:20"]);
eq("book of revelation", "the book of Revelation chapter three verse twenty", ["Revelation 3:20"]);
eq("colon word", "John three colon sixteen", ["John 3:16"]);
eq("and verse", "John chapter three and verse sixteen", ["John 3:16"]);
// noisy ASR
eq("verse for", "First Corinthians chapter thirteen verse for", ["1 Corinthians 13:4"]);
eq("verse won", "John chapter one verse won", ["John 1:1"]);
eq("for not a number elsewhere", "John 3 for all of us", ["John 3"]);
eq("jon", "Jon 3 16", ["John 3:16"]);
eq("mis-heard book", "Thesalonians chapter five", []); // numbered book without its number: not guessed
eq("mis-heard habakkuk", "Habacuc chapter two verse two", ["Habakkuk 2:2"]);
eq("phillipians", "Phillipians four thirteen", ["Philippians 4:13"]);
eq("mathew", "Mathew 28:19", ["Matthew 28:19"]);
eq("extra words", "so um turn to uh John chapter 3 verse 16 amen", ["John 3:16"]);
eq("comma digits", "John 3, 16", ["John 3:16"]);
// things that must NOT match
eq("no number", "John said that it was good", []);
eq("chapter too big", "John 40:1", []);
eq("plain words", "he went to the market and bought a job", []);
eq("number only", "verse 16 says it all", []);
eq("ruth no number", "Ruth was faithful", []);
// context ("verse 17")
eq("context verse", "now verse 17", ["John 3:17"], { book: 43, chapter: 3 });
eq("context range", "verses 17 to 19", ["John 3:17-19"], { book: 43, chapter: 3 });
eq("context ignored when full ref", "verse 17 of Romans 8:5", ["Romans 8:5"], { book: 43, chapter: 3 });
eq("context off by default", "now verse 17", []);

// metadata
{
  const r = detectScriptures("turn to John 3")[0];
  const ok = r && r.confidence === "high" && !r.hasVerse && r.atTail && r.chapter === 3 && r.book === 43;
  ok ? pass++ : fails.push(`meta atTail: ${JSON.stringify(r)}`);
}
{
  const r = detectScriptures("turn to John 3:16 and then")[0];
  const ok = r && r.hasVerse && !r.atTail && r.verseFrom === 16 && r.verseTo === 16 && r.key === "43:3:16-16";
  ok ? pass++ : fails.push(`meta key: ${JSON.stringify(r)}`);
}
{
  const text = "see Mark 4";
  const r = detectScriptures(text)[0];
  const ok = r && r.confidence === "medium" && text.slice(r.start, r.end) === "Mark 4";
  ok ? pass++ : fails.push(`meta everyday word medium: ${JSON.stringify(r)}`);
}
{
  const r = detectScriptures("Mark chapter four verse thirty five")[0];
  r && r.confidence === "high" && r.label === "Mark 4:35" ? pass++ : fails.push(`meta Mark high: ${JSON.stringify(r)}`);
}
{
  const r = detectScriptures("now verse 17", { context: { book: 43, chapter: 3 } })[0];
  r && r.confidence === "low" && r.contextual ? pass++ : fails.push(`meta contextual: ${JSON.stringify(r)}`);
}
{
  const text = "turn to first John four eight";
  const r = detectScriptures(text)[0];
  r && text.slice(r.start, r.end) === "first John four eight" ? pass++ : fails.push(`span numbered: ${JSON.stringify(r)}`);
}
{
  const r = detectScriptures("Jon 3 16")[0];
  r && r.confidence === "medium" ? pass++ : fails.push(`jon medium: ${JSON.stringify(r)}`);
}
// speed
{
  const text = "so as we turn with me to the book of Romans chapter eight verse twenty eight and we also read Psalm twenty three ".repeat(20);
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) detectScriptures(text);
  const ms = (performance.now() - t0) / 200;
  console.log(`speed: ${ms.toFixed(2)} ms per ${text.length}-char transcript`);
  ms < 20 ? pass++ : fails.push(`too slow: ${ms}`);
}

console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log("  FAIL " + f);
process.exit(fails.length ? 1 : 0);
