import { withDefaults } from './reelOptions.service.js';

// How much of a long pause survives trimming, so speech doesn't run together.
export const KEPT_PAUSE_SEC = 0.4;

const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
const NATURAL_TAIL_SEC = 0.3;
const MAX_LOOKAHEAD_SEC = 8;
const MAX_LOOKBACK_SEC = 5;

// Moves a range's edges onto sentence boundaries so a clip never stops (or starts) mid-sentence:
//   - if the last word doesn't end a sentence, run on to the end of that sentence (up to 8s);
//     failing that, pull back to the previous sentence end, as long as at least half remains;
//   - if the clip opens mid-sentence, start from the beginning of that sentence (up to 5s back).
// The adjusted range never crosses into a neighbouring clip.
function finishSentences(range, words, bounds) {
  let { startSec, endSec } = range;
  const lastIdx = words.findLastIndex((w) => w.s < endSec);
  if (lastIdx >= 0) {
    if (SENTENCE_END.test(words[lastIdx].w.trim())) {
      endSec = Math.max(endSec, words[lastIdx].e + NATURAL_TAIL_SEC);
    } else {
      let found = -1;
      for (let j = lastIdx + 1; j < words.length && words[j].e - endSec <= MAX_LOOKAHEAD_SEC; j += 1) {
        if (SENTENCE_END.test(words[j].w.trim())) {
          found = j;
          break;
        }
      }
      if (found >= 0) {
        endSec = words[found].e + NATURAL_TAIL_SEC;
      } else {
        const halfway = startSec + (endSec - startSec) * 0.5;
        for (let k = lastIdx; k >= 0 && words[k].s > halfway; k -= 1) {
          if (SENTENCE_END.test(words[k].w.trim())) {
            endSec = words[k].e + NATURAL_TAIL_SEC;
            break;
          }
        }
      }
    }
  }
  const firstIdx = words.findIndex((w) => w.e > startSec);
  if (firstIdx > 0 && !SENTENCE_END.test(words[firstIdx - 1].w.trim())) {
    let k = firstIdx - 1;
    while (k > 0 && !SENTENCE_END.test(words[k - 1].w.trim()) && words[firstIdx].s - words[k - 1].s <= MAX_LOOKBACK_SEC) k -= 1;
    // Only take it if a sentence start was actually found within reach.
    if (k === 0 || SENTENCE_END.test(words[k - 1].w.trim())) {
      if (words[firstIdx].s - words[k].s <= MAX_LOOKBACK_SEC) startSec = Math.max(0, words[k].s - 0.15);
    }
  }
  return {
    startSec: Math.max(startSec, bounds.minStart),
    endSec: Math.min(endSec, bounds.maxEnd),
  };
}

// Lays one or more source ranges of the recording end to end on a single output timeline, after
// applying the "pace" settings:
//   - pauses longer than `maxPause` between words are cut down to ~0.4s (also dead air at the
//     very start/end of a range);
//   - the whole thing is then sped up / slowed down by `speed`.
// Audio, caption timing, point changes and the video length are all driven from this one plan,
// so they can never drift apart.
//
// Returns:
//   pieces    - [{ startSec, endSec, offsetSec }] ranges of the SOURCE audio and where each lands
//               on the un-sped timeline (what the audio builder cuts and joins)
//   speed     - tempo to apply to the joined audio
//   totalSec  - final length of the video's speech, after speed
//   starts    - where each input range begins on the final timeline
//   words     - the caption words on the final timeline ({ text, start, end, brk? }); the last word
//               of each range is flagged `brk` so a caption phrase never spans two ranges
export function planTimeline(ranges, sourceWords, paceInput) {
  const pace = withDefaults({ pace: paceInput }).pace;
  const speed = pace.speed;
  const limit = pace.trimPauses ? pace.maxPause : Infinity;
  const half = KEPT_PAUSE_SEC / 2;

  const pieces = [];
  const starts = [];
  const words = [];
  let out = 0;

  // Sentence-aware edges first (needs the whole transcript for context).
  const clean = sourceWords.filter((w) => w.w && w.w.trim());
  const fitted = ranges.map((range, i) =>
    pace.finishSentence
      ? finishSentences(range, clean, {
          // Neighbours only limit how far an edge may stretch when they sit next to it in the
          // source. A cut put out of order (a hook placed first) has no such neighbour.
          minStart: i > 0 && ranges[i - 1].endSec <= range.startSec ? ranges[i - 1].endSec : 0,
          maxEnd: i < ranges.length - 1 && ranges[i + 1].startSec >= range.endSec ? ranges[i + 1].startSec : Infinity,
        })
      : range
  );

  for (const range of fitted) {
    const inRange = sourceWords.filter((w) => w.w && w.w.trim() && w.e > range.startSec && w.s < range.endSec);
    let cur = range.startSec;
    let end = range.endSec;
    if (inRange.length) {
      // Dead air before the first / after the last word.
      if (inRange[0].s - cur > limit) cur = inRange[0].s - half;
      if (end - inRange.at(-1).e > limit) end = inRange.at(-1).e + half;
    }

    const rangePieces = [];
    for (let i = 0; i < inRange.length - 1; i += 1) {
      const gap = inRange[i + 1].s - inRange[i].e;
      if (gap > limit) {
        rangePieces.push({ startSec: cur, endSec: inRange[i].e + half });
        cur = inRange[i + 1].s - half;
      }
    }
    rangePieces.push({ startSec: cur, endSec: end });

    starts.push(out / speed);
    for (const p of rangePieces) {
      pieces.push({ ...p, offsetSec: out });
      p.offsetSec = out;
      out += p.endSec - p.startSec;
    }

    // Map each caption word into the piece that holds it.
    const mapped = inRange.map((w) => {
      const piece = rangePieces.find((p) => w.s >= p.startSec - 1e-6 && w.s < p.endSec) ?? rangePieces.at(-1);
      const start = (piece.offsetSec + Math.max(0, w.s - piece.startSec)) / speed;
      const stop = (piece.offsetSec + Math.min(piece.endSec, w.e) - piece.startSec) / speed;
      return { text: w.w, start, end: Math.max(stop, start + 0.05) };
    });
    if (mapped.length) mapped[mapped.length - 1].brk = true;
    words.push(...mapped);
  }

  return { pieces, speed, rawSec: out, totalSec: out / speed, starts, words, ranges: fitted, lastWordStart: words.at(-1)?.start ?? 0 };
}
