import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { env } from '../config/env.js';
import { CLIPS_DIR, ensureLocalAudio, localUrl, utterancesOf } from './audioPipeline.service.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const MAX_SEGMENTS = 12;
const MIN_SEG_SEC = 3;
const MAX_SEG_SEC = 75;
// Silence left between two pieces so they don't run into each other, plus a tiny fade on every
// edge so a cut never clicks.
const GAP_SEC = 0.35;
const FADE_SEC = 0.06;
const FILLERS = new Set(['um', 'uh', 'umm', 'uhh', 'erm', 'er', 'ah', 'hmm']);

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${m}:${ss}` : `${m}:${ss}`;
};

// ---------------------------------------------------------------- the model

// Calls the strongest model with a longer leash than the rest of the app (it reads a whole
// message). Falls back to a second model, and drops sampling params if a model rejects them.
async function askModel({ system, user, maxTokens = 6000, temperature = 0.4, models: preferred }) {
  if (!env.openrouterApiKey) {
    const err = new Error('OPENROUTER_API_KEY is not set, so Audio Lab cannot plan a cut.');
    err.status = 500;
    throw err;
  }
  const models = [...(preferred ?? []), env.audioLabModel, env.audioLabFallbackModel, env.openrouterModel].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastError = '';
  for (const model of models) {
    for (const withTemp of [true, false]) {
      let res;
      try {
        res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.openrouterApiKey}`,
            'HTTP-Referer': env.openrouterSiteUrl,
            'X-Title': env.openrouterAppName,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            max_tokens: maxTokens,
            ...(withTemp && { temperature }),
          }),
          signal: AbortSignal.timeout(240000),
        });
      } catch (err) {
        lastError = `${model}: ${err.message}`;
        break;
      }
      if (!res.ok) {
        lastError = `${model}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`;
        if (res.status === 400 && withTemp) continue; // some models refuse sampling params
        break;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = parseJson(typeof content === 'string' ? content : '');
      if (parsed) return parsed;
      lastError = `${model}: unreadable reply`;
      break;
    }
    console.warn(`[audioLab] ${lastError}; trying the next model`);
  }
  const err = new Error(`The AI could not plan this cut (${lastError}). Try again in a moment.`);
  err.status = 502;
  throw err;
}

// Models sometimes wrap JSON in prose or code fences; take the outermost object.
function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------- planning

const STYLES = {
  viral: `STYLE: VIRAL SHORT-FORM AUDIO. This will be posted as a reel/short, so the first 3 seconds decide everything.
- Open with the single strongest hook: a bold claim, a surprising reversal, a vivid image or a question the rest answers. You may take it from ANYWHERE in the message, even if it was said late, and play it first.
- Then build: setup, the turn, proof (a story, scripture or example), and finish on a payoff/closing line that lands as a complete, quotable thought. End on a high, never mid-explanation.
- Reordering pieces is allowed and encouraged when it makes a tighter story, but the listener must never feel lost.`,
  story: `STYLE: COHERENT STORY OF THE TOPIC. Gather everything the preacher said about the topic and tell it as one clear arc (usually in the order it was spoken, unless a different order is clearly clearer). Prioritise understanding and flow over punch, but still open strongly and end on a clean conclusion.`,
  highlights: `STYLE: BEST MOMENTS, IN ORDER. Pick the strongest self-contained moments and keep them in the order they were spoken. Each piece must work on its own; a short natural pause between pieces is expected.`,
};

const PLAN_SYSTEM = `You are a world-class audio editor and sermon producer. You cut long recordings of a preacher into short audio pieces that sound like they were always one continuous, intentional message.

You receive the full transcript as numbered lines: [id | time] text. You choose pieces by LINE NUMBER ranges (from..to, inclusive), never by raw time, so every cut lands on a real sentence boundary.

HOW TO THINK
1. Understand the whole message first: its arc, its main ideas, where each idea starts and ends, the stories and scriptures used.
2. Interpret the request by MEANING, not keywords. If asked for "the goodness of God", include every place the preacher actually teaches, illustrates or testifies about God's goodness (stories, scriptures, synonyms such as kindness, mercy, provision, faithfulness), and leave out lines that merely contain the word in passing. Never pick a line only because it contains the keyword.
3. Choose pieces that are self-contained. A piece must make sense heard cold: it must not start with a dangling reference ("and so he said", "like I said", "that one", "this thing", a pronoun with no antecedent) or end mid-thought. Prefer starting at the sentence that introduces the idea and ending at the sentence that completes it.
4. Include enough lines for a thought to be complete, and no more. Cut throat-clearing, filler, crowd management, announcements, "turn to your neighbour", repeated restatements and tangents.
5. The pieces must flow when played back to back: a coherent order, no repeated points, no contradictions, no gaps in logic. If two pieces only make sense together, they must be adjacent and in the right order.
6. Honour the target length: the total of all pieces should land within about 10% of it (a little under is better than over). Each piece should be 4-60 seconds. Use at most ${MAX_SEGMENTS} pieces; fewer, stronger pieces beat many fragments.
7. If the message does not really contain what was asked for, say so honestly in "summary" and return the closest genuinely relevant pieces; never invent or stretch.

ROLES: hook, setup, build, proof, payoff, close.
Respond ONLY with JSON:
{"title": "a short, compelling title (max 8 words)", "summary": "2-3 sentences: what this cut is and how it flows from first piece to last", "segments": [{"from": <line id>, "to": <line id>, "role": "hook|setup|build|proof|payoff|close", "headline": "max 8 words, what this piece says", "why": "one sentence: why it is here"}]}
The segments array is in PLAY order.`;

const REVIEW_SYSTEM = `You are a ruthless, experienced audio producer reviewing a rough cut BEFORE it is rendered. You hear it exactly as a first-time listener would: cold, with no access to the rest of the message.

You get the full transcript (numbered lines: [id | time] text), the request, the target length, and the proposed cut: pieces in play order with their text.

Listen for and fix:
- Dangling references at a start ("and so", "because of that", "this one", "he said" with no antecedent) or an incomplete thought at an end.
- A weak or slow opening (the first piece must earn the next 5 seconds), or an ending that trails off instead of landing.
- Pieces that do not really answer the request, or only contain the keyword in passing.
- Repetition (the same point twice), contradictions, jumps in logic, pieces in the wrong order.
- Total length far from the target.
You may fix by adjusting a piece's from/to (extend to complete a thought, trim a weak lead-in), removing it, replacing it with a better range from the transcript, or reordering. Do not change what is already good.

Respond ONLY with JSON:
{"verdict": "good" | "fixed", "review": "2-4 sentences: what you checked and what you changed (or why it stands)", "segments": [same shape as the proposal: {"from","to","role","headline","why"}] }
Always return the FINAL full segments array in play order (unchanged if verdict is good).`;

function transcriptLines(utterances) {
  return utterances.map((u, i) => `[${i} | ${fmt(u.s)}] ${u.text}`).join('\n').slice(0, 400000);
}

function describeRequest({ prompt, style, targetSec }) {
  return `REQUEST: ${prompt ? `"${prompt}"` : 'No specific topic - find the most powerful, shareable material in the message.'}\nTARGET LENGTH: about ${targetSec} seconds (the pieces' total speaking time).\n${STYLES[style] ?? STYLES.viral}`;
}

// Turns the model's line ranges into validated time ranges on the real audio: clamps ids, snaps
// to the words (trimming leading "um"s), keeps pieces in range and apart, and drops anything too
// short or long.
export function buildSegments(raw, utterances, words, durationSec) {
  const out = [];
  const clean = words.filter((w) => w.w && w.w.trim());
  for (const r of Array.isArray(raw) ? raw : []) {
    let from = Math.round(Number(r?.from));
    let to = Math.round(Number(r?.to));
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    from = Math.max(0, Math.min(utterances.length - 1, from));
    to = Math.max(0, Math.min(utterances.length - 1, to));
    if (to < from) [from, to] = [to, from];
    let startSec = utterances[from].s;
    let endSec = utterances[to].e;
    const inside = clean.filter((w) => w.e > startSec - 0.01 && w.s < endSec + 0.01);
    let lead = 0;
    while (lead < inside.length - 3 && FILLERS.has(inside[lead].w.toLowerCase().replace(/[^a-z]/g, ''))) lead += 1;
    if (inside.length) {
      startSec = Math.max(0, inside[lead].s - 0.08);
      endSec = Math.min(durationSec || Infinity, inside[inside.length - 1].e + 0.18);
    }
    if (endSec - startSec > MAX_SEG_SEC) {
      // Too long for one piece: keep the opening and end at the last full sentence that fits.
      let cut = to;
      while (cut > from && utterances[cut].e - startSec > MAX_SEG_SEC) cut -= 1;
      endSec = utterances[cut].e;
    }
    if (endSec - startSec < MIN_SEG_SEC) continue;
    // The same stretch of audio can't be used twice.
    if (out.some((q) => startSec < q.endSec - 0.2 && endSec > q.startSec + 0.2)) continue;
    const text = utterances
      .slice(from, to + 1)
      .map((u) => u.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
      role: ['hook', 'setup', 'build', 'proof', 'payoff', 'close'].includes(r?.role) ? r.role : 'build',
      headline: String(r?.headline || '').trim().slice(0, 80),
      why: String(r?.why || '').trim().slice(0, 220),
      text: text.slice(0, 1500),
    });
    if (out.length >= MAX_SEGMENTS) break;
  }
  return out;
}

const totalOf = (segs) => segs.reduce((s, x) => s + (x.endSec - x.startSec), 0);

// Plans the cut in two passes: a plan, then an independent "first-time listener" review that
// can repair what a single pass tends to get wrong (dangling references, weak endings, length).
export async function planMerge({ audioTranscript, prompt, style, targetSec, onStage }) {
  const utterances = utterancesOf(audioTranscript);
  if (utterances.length === 0) {
    const err = new Error('There is no transcript for this audio yet.');
    err.status = 422;
    throw err;
  }
  const lines = transcriptLines(utterances);
  const request = describeRequest({ prompt, style, targetSec });
  const words = audioTranscript.words ?? [];

  onStage?.('planning', 'Reading the whole message and choosing the pieces…');
  const plan = await askModel({ system: PLAN_SYSTEM, user: `${request}\n\nTRANSCRIPT\n${lines}`, temperature: 0.5 });
  let segments = buildSegments(plan?.segments, utterances, words, audioTranscript.durationSec);
  if (segments.length === 0) {
    const err = new Error("Couldn't find parts of this message that match that. Try describing it differently.");
    err.status = 422;
    throw err;
  }
  let title = String(plan?.title || '').trim();
  let summary = String(plan?.summary || '').trim();

  onStage?.('reviewing', 'Listening back to the cut and smoothing the joins…');
  let review = '';
  try {
    const proposal = segments.map((s, i) => `${i + 1}. [${fmt(s.startSec)}-${fmt(s.endSec)}] (${s.role}) "${s.headline}"\n   ${s.text}`).join('\n');
    const pieceIds = (s) => {
      const from = utterances.findIndex((u) => u.e > s.startSec);
      const to = utterances.findLastIndex((u) => u.s < s.endSec);
      return { from: Math.max(0, from), to: Math.max(from, to) };
    };
    const asJson = JSON.stringify(segments.map((s) => ({ ...pieceIds(s), role: s.role, headline: s.headline, why: s.why })));
    const reply = await askModel({
      system: REVIEW_SYSTEM,
      user: `${request}\n\nPROPOSED CUT (total ${Math.round(totalOf(segments))}s)\n${proposal}\n\nPROPOSAL AS LINE RANGES\n${asJson}\n\nTRANSCRIPT\n${lines}`,
      temperature: 0.2,
    });
    review = String(reply?.review || '').trim();
    if (reply?.verdict === 'fixed') {
      const revised = buildSegments(reply.segments, utterances, words, audioTranscript.durationSec);
      // Only accept a revision that is still a usable cut.
      if (revised.length >= 1 && totalOf(revised) >= 5) segments = revised;
    }
  } catch (err) {
    // The review is a refinement; a failed one must not lose the plan.
    console.warn('[audioLab] review pass failed, keeping the first plan:', err.message);
    review = 'Review pass skipped.';
  }
  return { title: title.slice(0, 80) || 'Audio cut', summary: summary.slice(0, 500), review: review.slice(0, 600), segments };
}

// ---------------------------------------------------------------- rendering

// Stitches the segments (in the given order) from the master audio into one mp3: each piece gets
// a short fade, a small gap separates pieces, and the result is loudness-normalised so it plays
// at a consistent level wherever it is posted.
export async function renderMergedAudio({ session, mergeId, segments }) {
  const source = await ensureLocalAudio(session);
  const outputPath = path.join(CLIPS_DIR, `${mergeId}-merge.mp3`);
  let offset = 0;
  const parts = segments.map((s, i) => {
    const dur = Math.max(0.2, s.endSec - s.startSec);
    const fade = Math.min(FADE_SEC, dur / 4);
    const chain =
      `[0:a]atrim=start=${s.startSec}:end=${s.endSec},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono,` +
      `afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, dur - fade)}:d=${fade},adelay=${Math.round(offset * 1000)}[a${i}]`;
    offset += dur + GAP_SEC;
    return chain;
  });
  const durationSec = Math.max(0.5, offset - GAP_SEC);
  const filters = [
    ...parts,
    `${segments.map((_, i) => `[a${i}]`).join('')}amix=inputs=${segments.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]`,
  ];
  await new Promise((resolve, reject) => {
    ffmpeg(source)
      .complexFilter(filters, ['out'])
      .audioCodec('libmp3lame')
      .audioBitrate('160k')
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
  return { audioUrl: `${localUrl('clips', `${mergeId}-merge.mp3`)}?v=${Date.now()}`, durationSec: Math.round(durationSec * 10) / 10, outputPath };
}

// ---------------------------------------------------------------- transcript of a finished cut

// Where each piece sits in the stitched audio (same arithmetic as renderMergedAudio: pieces back to back with a small gap).
export function mergeTimeline(segments) {
  let offset = 0;
  return segments.map((s) => {
    const dur = Math.max(0.2, s.endSec - s.startSec);
    const row = { seg: s, offset, dur };
    offset += dur + GAP_SEC;
    return row;
  });
}

const stamp = (sec, sep = ':') => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { h, m, s, ms: ms % 1000, sep };
};
export const clock = (sec) => {
  const t = stamp(sec);
  return t.h ? `${t.h}:${String(t.m).padStart(2, '0')}:${String(t.s).padStart(2, '0')}` : `${String(t.m).padStart(2, '0')}:${String(t.s).padStart(2, '0')}`;
};
const srtTime = (sec, dot = false) => {
  const t = stamp(sec);
  return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}:${String(t.s).padStart(2, '0')}${dot ? '.' : ','}${String(t.ms).padStart(3, '0')}`;
};

// The words of the NEW audio with their NEW times. `words` are the session transcript's word timings (against the
// original recording); each is moved to where its piece landed in the cut. Without word timings it falls back to
// one line per piece, using the piece's own text.
export function buildMergeTranscript(merge, words) {
  const timeline = mergeTimeline(merge.segments);
  const lines = [];
  const pieces = [];
  timeline.forEach(({ seg, offset, dur }, index) => {
    const inPiece = (words ?? []).filter((w) => w.w && w.e > seg.startSec && w.s < seg.endSec);
    const text = inPiece.length ? inPiece.map((w) => w.w).join(' ').replace(/\s+([,.!?;:])/g, '$1') : String(seg.text || '').trim();
    pieces.push({ index, headline: seg.headline || '', start: offset, end: offset + dur, text });
    if (!inPiece.length) {
      if (text) lines.push({ start: offset, end: offset + dur, text, piece: index });
      return;
    }
    // Caption-sized lines: break at the end of a sentence, a pause, or around ten words / five seconds.
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      const start = offset + Math.max(0, cur[0].s - seg.startSec);
      const end = offset + Math.min(dur, Math.max(cur[cur.length - 1].e - seg.startSec, 0));
      lines.push({ start, end: Math.max(end, start + 0.2), text: cur.map((w) => w.w).join(' ').replace(/\s+([,.!?;:])/g, '$1'), piece: index });
      cur = [];
    };
    inPiece.forEach((w, i) => {
      cur.push(w);
      const next = inPiece[i + 1];
      const span = w.e - cur[0].s;
      if (!next || /[.!?]["')\]]?$/.test(w.w) || cur.length >= 10 || span >= 5 || next.s - w.e > 0.8) flush();
    });
  });
  const durationSec = timeline.length ? timeline[timeline.length - 1].offset + timeline[timeline.length - 1].dur : 0;
  return { title: merge.title || 'Audio cut', durationSec, precise: Boolean(words?.length), pieces, lines, text: pieces.map((p) => p.text).filter(Boolean).join('\n\n') };
}

// Renders the transcript as a file: plain text, text with [mm:ss] stamps, SRT or WebVTT.
export function formatMergeTranscript(t, format) {
  if (format === 'srt') return t.lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.text}\n`).join('\n');
  if (format === 'vtt') return `WEBVTT\n\n${t.lines.map((l) => `${srtTime(l.start, true)} --> ${srtTime(l.end, true)}\n${l.text}\n`).join('\n')}`;
  if (format === 'timestamped') {
    const out = [`${t.title}`, `Length ${clock(t.durationSec)}${t.precise ? '' : ' (times are per piece - no word timings for this session)'}`, ''];
    let piece = -1;
    for (const l of t.lines) {
      if (l.piece !== piece) {
        if (piece !== -1) out.push('');
        piece = l.piece;
        const p = t.pieces[piece];
        if (p?.headline) out.push(`— ${p.headline}`);
      }
      out.push(`[${clock(l.start)}] ${l.text}`);
    }
    return out.join('\n') + '\n';
  }
  return `${t.title}\n\n${t.text}\n`;
}

export function removeMergedFile(mergeId) {
  return fs.promises.unlink(path.join(CLIPS_DIR, `${mergeId}-merge.mp3`)).catch(() => {});
}

export const mergeFilePath = (mergeId) => path.join(CLIPS_DIR, `${mergeId}-merge.mp3`);

// ---------------------------------------------------------------- suggestions

const SUGGEST_SYSTEM = `You are a sermon producer scanning a message for the best material to cut into short audio clips. You receive the transcript as numbered lines: [id | time] text.

Find the 6-8 strongest things to build a clip around, drawn ONLY from what the preacher actually said:
- themes or topics he spent real time on (more than a passing mention)
- the most quotable, scroll-stopping moments
- strong stories or testimonies
- scriptures he unpacked
- declarations or prayers he led

For each, write:
- "label": a chip label, 2-5 words, specific to this message (never generic like "Faith" alone - say what he said about it).
- "prompt": a ready-to-use request in natural language that an editor could type, e.g. "The parts where the preacher spoke on the goodness of God" or "The story about the first class ticket and how it connects to grace". Specific enough to find the right material.
- "kind": "topic" | "moment" | "story" | "scripture" | "declaration".
Order them by how strong a clip they would make. No duplicates or near-duplicates. Do not suggest anything the transcript does not support.
Respond ONLY with JSON: {"topics": [{"label": string, "prompt": string, "kind": string}]}`;

export async function suggestTopics(audioTranscript) {
  const utterances = utterancesOf(audioTranscript);
  if (utterances.length === 0) return [];
  const reply = await askModel({
    system: SUGGEST_SYSTEM,
    user: `TRANSCRIPT\n${transcriptLines(utterances)}`,
    maxTokens: 1500,
    temperature: 0.4,
    // A fast, strong model: suggestions should appear in seconds, not after a full planning pass.
    models: [env.audioLabSuggestModel],
  });
  const kinds = ['topic', 'moment', 'story', 'scripture', 'declaration'];
  return (Array.isArray(reply?.topics) ? reply.topics : [])
    .filter((t) => typeof t?.label === 'string' && typeof t?.prompt === 'string' && t.label.trim() && t.prompt.trim())
    .slice(0, 8)
    .map((t) => ({ label: t.label.trim().slice(0, 40), prompt: t.prompt.trim().slice(0, 300), kind: kinds.includes(t.kind) ? t.kind : 'topic' }));
}
