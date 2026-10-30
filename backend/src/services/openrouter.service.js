import { env } from '../config/env.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Why the last AI call failed, so the UI can say "out of credit" instead of just showing nothing.
let lastFailure = null;
export function aiIssue() {
  if (!lastFailure || Date.now() - lastFailure.at > 15_000) return null;
  // 402/403: out of credit or over the key's limit. 429: the model's provider is rate-limiting right now (try again shortly).
  return lastFailure.status === 402 || lastFailure.status === 403 ? 'credits' : lastFailure.status === 429 ? 'busy' : 'unavailable';
}

// The last top-level {...} object in `text` that is valid JSON (null if none).
function lastJsonObject(text) {
  const spans = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) spans.push(text.slice(start, i + 1));
    }
  }
  for (const s of spans.reverse()) {
    try {
      return JSON.parse(s);
    } catch {
      // keep looking
    }
  }
  return null;
}

async function callOpenRouterJSON({ system, user, maxTokens = 500, temperature = 0.4, model = env.openrouterModel }) {
  if (!env.openrouterApiKey) {
    console.warn('[openrouter] missing OPENROUTER_API_KEY, skipping LLM call');
    return null;
  }

  const res = await fetch(OPENROUTER_URL, {
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
      response_format: { type: 'json_object' },
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[openrouter] request failed ${res.status}: ${body}`);
    lastFailure = { status: res.status, at: Date.now() };
    return null;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch (err) {
    // Some models wrap the JSON in a sentence or correct themselves in text: take the last balanced {...} that parses.
    const found = lastJsonObject(content);
    if (found) return found;
    console.error('[openrouter] failed to parse JSON content:', content);
    return null;
  }
}

const QUOTE_SYSTEM_PROMPT = `You are the social media/graphics lead for a church's media team, working live during a service. You receive a rolling window of live speech-to-text transcript and are watching for the rare line worth cutting into a post right now - the kind that stops someone mid-scroll.

Be ruthlessly selective - most windows will have ZERO quote-worthy lines, and returning an empty array is the expected, normal outcome. A line only clears the bar if ALL of these are true:
- It is a single, grammatically complete thought with a clear subject and point - not a sentence fragment, run-on, or a line that only makes sense with the surrounding context.
- It would land on its own, out of context, on someone's feed - genuinely striking, quotable, or convicting, not a generic transitional phrase, filler, announcement, or restatement of something obvious.
- It has rhetorical weight, not just informational content: a sharp contrast, a reversal, a vivid image, a decisive one-line resolution, or a truth stated with unusual clarity or boldness. A flat statement of fact or a mid-thought observation - even a true or relevant one - does not qualify just because it's on-topic.
- It reads as a complete, self-contained idea when you strip away the preacher's tone/delivery - if it only works because of how it was said (emphasis, pause, crowd reaction), it doesn't work as text.
- It is not substantially the same point as anything in "alreadyUsed", even if worded differently. Preachers often restate the same idea several ways - only the first, best phrasing of an idea should ever be surfaced.
- Speech-to-text transcripts are messy: only lightly clean up filler words/false starts. Never invent, paraphrase, embellish, or complete a thought the speaker did not actually finish - the voice on the graphic has to stay the preacher's, not yours.

You also receive "precedingContext" - the speech just before this window. It is ONLY for understanding: a quote must come from "transcriptWindow", but use the context to judge whether the line is a real conclusion or just a setup, and to avoid quoting a line whose meaning depends on what came before.

Score each candidate 1-10 for how strongly it would perform as a standalone post (10 = unforgettable, would be shared widely; 7 or less = decent but ordinary). Only return a quote you would score 8 or higher.

When in doubt, leave it out. One truly sharp quote per service is worth more than ten mediocre ones.
Return at most ONE quote per call. If nothing meets this bar, return an empty array - do not stretch to find something.
Respond ONLY with JSON: {"quotes": [{"text": string, "score": number, "imagePrompt": string, "caption": string}]}
- "imagePrompt": a short visual prompt describing a background/mood suited to a text-overlay social graphic (e.g. "warm golden sunrise over hills, soft light, inspirational").
- "caption": a ready-to-post social caption to go under the image - NOT a repeat of the quote text. Open with a short hook that gives the quote context or a reason to keep reading, and close with a soft invitation to engage (a reflective question, a gentle call to action, or an "amen if..." line) - never a hard sales pitch. Conversational, warm, true to a real church's voice, no more than 2-3 short sentences, at most 1-2 tasteful emoji, and only add hashtags if they're genuinely relevant (never a generic hashtag block).`;

const QUOTE_MIN_SCORE = 8;
const words = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) ?? []);

// Guards against the model paraphrasing or inventing: most of the quote's words must actually
// appear in the transcript it was cut from.
function isFaithful(quoteText, sourceText) {
  const qw = words(quoteText);
  if (qw.length < 5) return false;
  const src = new Set(words(sourceText));
  return qw.filter((w) => src.has(w)).length / qw.length >= 0.85;
}

export async function extractQuotes({ windowText, alreadyUsed = [], precedingContext = '' }) {
  const result = await callOpenRouterJSON({
    system: QUOTE_SYSTEM_PROMPT,
    user: JSON.stringify({ precedingContext, transcriptWindow: windowText, alreadyUsed }),
    maxTokens: 500,
  });
  return (result?.quotes ?? []).filter(
    (q) =>
      q?.text &&
      (q.score === undefined || Number(q.score) >= QUOTE_MIN_SCORE) &&
      isFaithful(q.text, windowText),
  );
}

const INSIGHT_SYSTEM_PROMPT = `You are an excellent live note-taker for a sermon/service, the kind who produces notes a listener could study from later - not a transcript dump. You receive a rolling window of live speech-to-text transcript.
Extract NEW structured insights only from this window (do not repeat anything in "alreadyCaptured" - that includes list groups already started; see below).
Categories:
- keyPoint: a substantive point or teaching being made. Be selective and synthesize - skip throat-clearing, transitions, and restatements; a good keyPoint is something you'd actually write in your own notes. You may wrap the single most important phrase of a keyPoint in **bold** markdown to highlight it - do this sparingly (at most once per point, only markdown "**", never HTML), and only when there's a genuinely central phrase worth emphasizing, not on every point.
- topic: RARE. Only emit this when the preacher EXPLICITLY announces what the message itself is called or its central topic, in a self-referential, title-like way (e.g. "Today's message is titled...", "Our topic for today is...", "I want to preach to you on the subject of..."). This is NOT for every theme mentioned in passing - most windows should never produce a topic. Set "text" to that stated title/topic, cleaned up, and "explicit": true. Never guess or infer a topic here - that is handled separately.
- scripture: a Bible verse/passage mentioned or clearly alluded to, with "reference" like "John 3:16" if identifiable (else leave reference empty). Never hallucinate a reference that wasn't said.
- declaration: a real, spoken declaration, confession, or prophetic statement the preacher is actually leading people to say or affirm out loud (e.g. "Say it with me: I am blessed", "I decree that...", a call-and-response affirmation). This is NOT every strong or confident sentence - a preacher stating a fact or teaching a truth firmly is a keyPoint, not a declaration. Only tag it as a declaration when the text itself is framed as something to be proclaimed/confessed/decreed, first person or imperative, not descriptive.

Special case - enumerated lists: preachers often teach in explicit numbered/ordered structures ("three ways to walk in blessing: first... second... third...", "1. ... 2. ...", "the first reason is... the next reason is..."). When you detect this pattern IN THIS WINDOW:
- Emit ONE keyPoint insight for the whole list instead of one keyPoint per item.
- Set "text" to a short title naming what the list is about (e.g. "Three ways to walk in blessing").
- Set "items" to an ordered array of the individual points, cleaned up but in the preacher's own words - only include items actually stated in this window (a list can continue across windows; only ever emit the items newly heard here, keep the same "text" title so they can be merged with earlier parts of the same list already in "alreadyCaptured").
- Do not also emit these points individually as separate plain keyPoints.
Most keyPoints are NOT lists - only use "items" when the speaker is explicitly enumerating.

Be conservative: only include things clearly present in the text, do not invent or embellish.
Respond ONLY with JSON: {"insights": [{"type": "keyPoint"|"topic"|"scripture"|"declaration", "text": string, "reference": string, "items": string[], "explicit": boolean}]}
Omit "items" entirely for anything that isn't an enumerated list. Omit "explicit" entirely except for a true topic.`;

export async function extractInsights({ windowText, alreadyCaptured = [] }) {
  const result = await callOpenRouterJSON({
    system: INSIGHT_SYSTEM_PROMPT,
    user: JSON.stringify({ transcriptWindow: windowText, alreadyCaptured }),
    maxTokens: 700,
  });
  return result?.insights ?? [];
}

const SCRIPTURE_REFERENCE_SYSTEM_PROMPT = `You are given a phrase spoken during a sermon and already flagged as a likely Bible quotation, but no reference was captured (the preacher didn't state it, or the transcript didn't catch it). The text may be imperfect: garbled by speech-to-text, or only partially quoted - but it should still closely track a specific verse's actual wording.
Identify the specific Bible verse or short passage this is, and respond with its standard reference (e.g. "Romans 8:28", "1 Corinthians 13:4-7").
Be strict: only answer if the wording closely enough matches one specific, identifiable verse that you're confident of both the book and the verse number. If this reads instead as the preacher's own commentary, teaching, or a paraphrased idea ABOUT a biblical concept - even a very biblical-sounding one - rather than an actual rendering of a verse's wording, return null. When genuinely unsure, always return null rather than your best guess.
Respond ONLY with JSON: {"reference": string | null}`;

export async function identifyScriptureReference({ text }) {
  const result = await callOpenRouterJSON({
    system: SCRIPTURE_REFERENCE_SYSTEM_PROMPT,
    user: text,
    maxTokens: 40,
    temperature: 0.1,
  });
  return result?.reference || null;
}

const MESSAGE_TITLE_SYSTEM_PROMPT = `You are naming a sermon/service in progress, based on a live transcript so far. The preacher has not stated an explicit title, so give your best short, compelling title (3-7 words) capturing the central topic/theme of what's actually being taught - specific to this message, not a generic church phrase.
Respond ONLY with JSON: {"title": string}`;

export async function generateMessageTitle({ transcriptSoFar }) {
  const result = await callOpenRouterJSON({
    system: MESSAGE_TITLE_SYSTEM_PROMPT,
    user: transcriptSoFar.slice(0, 8000),
    maxTokens: 60,
  });
  return result?.title ?? null;
}

const SUMMARY_SYSTEM_PROMPT = `You are an experienced pastoral note-taker turning a full sermon/service transcript into a clean, genuinely useful final report - the kind someone who missed the service could read and actually understand what was taught, not a vague gist.
- "overview": 2-4 sentences that capture the actual argument/arc of the message - what was the core message, what tension or question did it address, where did it land? Be specific to this sermon, not a generic description that could apply to any service.
- "topics": the real themes covered, as short phrases (1-4 words each) - only ones substantively discussed, not every word mentioned in passing.
- "keyPoints": the actual teaching points, synthesized in clear standalone sentences - each one should make sense on its own to someone who wasn't there. Group and consolidate restated ideas into one point rather than listing near-duplicates. If the sermon taught an explicit numbered/enumerated structure (e.g. "three ways to..."), preserve that structure - phrase those keyPoints so their order and connection to the list is clear (e.g. "First, ..." / "Second, ...").
- "scriptures": only verses/passages actually referenced, with their reference where identifiable (e.g. "Genesis 1:28 - dominion over creation"). Never invent a reference that wasn't said.
- "declarations": only genuine spoken declarations/confessions/decrees the preacher led people to say or affirm - not just strong statements of teaching.
Be thorough but disciplined: capture everything substantive, but do not pad with filler, restatements, or generic church-service boilerplate.
Respond ONLY with JSON: {"overview": string, "topics": string[], "keyPoints": string[], "scriptures": string[], "declarations": string[]}`;

export async function generateSummary({ fullText }) {
  const result = await callOpenRouterJSON({
    system: SUMMARY_SYSTEM_PROMPT,
    user: fullText.slice(0, 20000),
    maxTokens: 900,
  });
  return result;
}

const CAROUSEL_SYSTEM_PROMPT = `You are a church media team's content creator, turning a sermon/service summary into a social media carousel post (the kind with multiple swipeable slides) that a real follower would actually swipe through to the end.
Produce 5-8 slides:
- Slide 1 is a hook/title slide - punchy enough to stop the scroll, teases what's inside without giving it all away.
- Middle slides each cover one key point, scripture, or declaration, written in a warm, conversational voice - not a dry recap. Make each one feel like a standalone, quotable takeaway.
- The last slide closes with a short, genuine invitation (a reflective question, an "amen if..." line, or a soft call to action) - never a hard sales pitch.
Keep each slide's "body" short enough to read at a glance (under ~35 words). Stay grounded in what's actually in the summary - do not invent details, statistics, or scripture that isn't there.
Respond ONLY with JSON: {"slides": [{"title": string, "body": string}]}`;

export async function generateCarousel({ summary }) {
  const result = await callOpenRouterJSON({
    system: CAROUSEL_SYSTEM_PROMPT,
    user: JSON.stringify(summary),
    maxTokens: 900,
  });
  return result?.slides ?? [];
}

const INSTAGRAM_CAPTION_SYSTEM_PROMPT = `You are a church media team's Instagram lead, writing the caption that will actually go out under a finished quote graphic - the sermon is over, this is the last step before it posts.
Given the quote text (what's on the image) and the surrounding transcript it was pulled from for context, write ONE caption:
- Open with a short hook - context, a question, or the "why this hit" - never just repeat the quote text verbatim.
- Keep the church's real, warm, conversational voice - not corporate, not preachy, not stiff.
- Close with a genuine invitation to engage: a reflective question, an "amen if..." line, or a soft call to action (e.g. inviting people to share it or come to the next service) - never a hard sales pitch.
- 2-4 short sentences. At most 1-2 tasteful emoji. Add 3-6 relevant hashtags on their own line at the end only if they'd genuinely help reach (mix of broad faith/church tags and specific ones to the topic) - skip hashtags entirely rather than pad with generic ones.
- If "previousCaption" is given, write a genuinely different take (different angle/hook) rather than a light rewording - this is a deliberate regenerate.
Respond ONLY with JSON: {"caption": string}`;

export async function generateInstagramCaption({ quoteText, sourceText = '', previousCaption = '' }) {
  const result = await callOpenRouterJSON({
    system: INSTAGRAM_CAPTION_SYSTEM_PROMPT,
    user: JSON.stringify({ quoteText, sourceText: sourceText.slice(0, 2000), previousCaption }),
    maxTokens: 300,
    // A regenerate request is explicitly asking for a different take - bias away from the
    // near-deterministic output the default temperature would give for the same input.
    temperature: previousCaption ? 0.8 : 0.5,
  });
  return result?.caption ?? null;
}

const IMAGE_PROMPT_SYSTEM = `You are a world-class art director writing prompts for a state-of-the-art image model (think the polish of a premium ChatGPT / Midjourney-grade result). Rewrite the user's brief into ONE rich, specific, production-ready image prompt.
Principles:
- Keep the user's subject, intent and any named elements exactly; never contradict or dilute them. Add craft, not new subjects.
- Be concrete about: subject, composition and framing, camera/lens or illustration medium, lighting (direction, quality, time of day), colour palette (name 2-4 harmonious colours), materials and textures, depth, atmosphere.
- Aim for premium, restrained, editorial taste: refined, uncluttered, intentional, cinematic or gallery-quality - never cheesy stock-photo, clip-art, oversaturated, or busy.
- Always ask for sharp focus, high detail, clean edges, natural believable anatomy/physics, and no watermarks, no logos, no distorted or garbled text.
- Respect the requested mode:
  - "design": a finished poster/graphic. The exact text to typeset is supplied separately - do NOT rewrite, translate or omit it; describe the look, layout, hierarchy, type style (e.g. elegant modern sans or refined serif), colour and background around it. Large, calm negative space, strong contrast, generous margins.
  - "background": artwork with NO text, with calm low-detail space suited to overlaying large text.
  - "free": a standalone image exactly as described.
- If reference images are attached, mention matching their style/composition/subject.
- Output 60-140 words, plain prose, no lists.
Respond ONLY with JSON: {"prompt": string}`;

export async function enhanceImagePrompt({ prompt, mode, text = '', hasReferences = false, aspect = '' }) {
  const result = await callOpenRouterJSON({
    system: IMAGE_PROMPT_SYSTEM,
    user: JSON.stringify({ brief: prompt, mode, textToTypeset: mode === 'design' ? text : undefined, hasReferenceImages: hasReferences, aspectRatio: aspect }),
    maxTokens: 450,
    temperature: 0.7,
  });
  const enhanced = typeof result?.prompt === 'string' ? result.prompt.trim() : '';
  return enhanced || null;
}

const CHAT_SYSTEM_PROMPT = `You are a helpful assistant answering questions about a sermon/service that has just ended.
You are given the full transcript, a structured summary, and the conversation so far. Answer the user's question using only information from the transcript/summary.
If the transcript doesn't contain the answer, say so plainly rather than guessing or inventing details.
Keep answers conversational and concise. Plain text only, aside from two exceptions: you may wrap a genuinely key word or phrase in **bold** markdown (sparingly, never HTML), and if you're walking through multiple distinct points, put each on its own line rather than run them together in one paragraph.`;

export async function answerSessionQuestion({ fullText, summary, history = [], question }) {
  if (!env.openrouterApiKey) {
    console.warn('[openrouter] missing OPENROUTER_API_KEY, skipping LLM call');
    return null;
  }

  const messages = [
    {
      role: 'system',
      content: `${CHAT_SYSTEM_PROMPT}\n\nTranscript:\n${fullText.slice(0, 20000)}\n\nSummary:\n${JSON.stringify(summary ?? {})}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: question },
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.openrouterApiKey}`,
      'HTTP-Referer': env.openrouterSiteUrl,
      'X-Title': env.openrouterAppName,
    },
    body: JSON.stringify({
      model: env.openrouterModel,
      messages,
      temperature: 0.5,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[openrouter] chat request failed ${res.status}: ${body}`);
    return null;
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? null;
}

const REEL_HIGHLIGHTS_SYSTEM_PROMPT = `You are the short-form video editor for a church media team. You receive a timestamped transcript of a full message/service (each line is "[startSec-endSec] text") and must pick the strongest standalone moments to cut into vertical reels - the clips a stranger would stop scrolling for and still understand with zero context.

Pick exactly "count" moments (fewer ONLY if the transcript genuinely lacks that many distinct strong points). For each:
- It is ONE complete idea: a clear claim, story beat, reversal, or truth stated with weight - it starts at the beginning of a thought and ends when the thought lands. Never start mid-sentence or trail off.
- "startSec" and "endSec" must be copied from the line boundaries in the transcript (the start of the first line and the end of the last line you include). Length 12-40 seconds, ideally 15-30.
- "startSec" must be the start of the FIRST sentence that belongs to the idea - never include greetings, "turn to..." instructions, or lead-in sentences before it, and never end on a sentence that begins the next idea.
- Moments must be distinct ideas and must not overlap in time. Skip announcements, greetings, offering appeals, housekeeping, long scripture-reading without commentary, and filler.
- "headline": a punchy on-screen title for the moment, 2-6 words, title case, no trailing punctuation, faithful to what is actually said (no invented claims).
- "takeaway": one short supporting line (max ~14 words) distilling the point in the speaker's own meaning - not a quote you invented.
- Order the array by importance (strongest first).
Respond ONLY with JSON: {"points": [{"headline": string, "takeaway": string, "startSec": number, "endSec": number}]}`;

export async function extractReelHighlights({ transcriptLines, count = 5 }) {
  const result = await callOpenRouterJSON({
    system: REEL_HIGHLIGHTS_SYSTEM_PROMPT,
    user: JSON.stringify({ count, transcript: transcriptLines }),
    maxTokens: 1500,
    temperature: 0.3,
  });
  return Array.isArray(result?.points) ? result.points : [];
}

const SECTIONS_SYSTEM_PROMPT = `You are a church media editor. You receive a timestamped transcript of a whole service (each line is "[startSec-endSec] text") and must divide it into its natural parts, in order, covering the recording without gaps or overlaps.
Typical parts: Welcome / Announcements, Worship, Prayer, Scripture reading, Main message (a long message can be split into its own distinct movements or topics - name them by what is taught), Offering, Altar call / Ministry, Closing. Only use parts that actually occur; do not invent any.
- Between 3 and 10 sections. Each "title" is 1-5 words. Each "summary" is one short sentence on what happens.
- "startSec"/"endSec" are copied from line boundaries; the first starts where the transcript starts, the last ends where it ends, and each section starts where the previous ended.
Respond ONLY with JSON: {"sections": [{"title": string, "summary": string, "startSec": number, "endSec": number}]}`;

export async function detectSections({ transcriptLines }) {
  const result = await callOpenRouterJSON({
    system: SECTIONS_SYSTEM_PROMPT,
    user: transcriptLines,
    maxTokens: 1500,
    temperature: 0.2,
  });
  return Array.isArray(result?.sections) ? result.sections : [];
}

const COMPILATION_SYSTEM_PROMPT = `You are the short-form video editor for a church media team, building ONE merged video out of several clips from a service. You receive a timestamped transcript (each line is "[startSec-endSec] text"), the kind of compilation wanted, an optional instruction from the editor, and the TARGET LENGTH of the finished video in seconds.

Kinds:
- "key-points": the speaker gave an enumerated list or a set of distinct main points ("four things...", "first... second... third..."). Find that list and return ONE clip per item, in the order spoken. If several lists exist, use the most important one. If there is no explicit list, return the main teaching points in the order they were taught.
- "top-moments": the strongest standalone moments of the message, in the order they occur.
- "custom": follow the editor's instruction exactly (e.g. "everything said about forgiveness", "the four prayer points").

Length: choose however many clips are needed so their combined length is close to the target (within about 15%). A short target means fewer / tighter clips; a long target means more clips or fuller ones. For a "key-points" list, keep EVERY item of the list and tighten each clip to fit the target instead of dropping items, unless the target is too short to give each item at least 8 seconds.

Rules for every clip:
- It is ONE complete thought that starts at the first sentence of that point (never a greeting, transition, or the end of the previous point) and ends when the thought lands. Between 6 and 45 seconds.
- "startSec"/"endSec" are copied from line boundaries. Clips must not overlap and must be in the order they occur in the audio.
- "headline": 2-6 words, title case, faithful to what is said - for a list, name the item (e.g. "Pray Without Ceasing"); never invent claims.
- "takeaway": one short line (max ~14 words) distilling that clip.
- "priority": 1 for the most essential clip, 2 for the next, and so on (every clip has a different number). If the video must be shortened, the highest numbers are dropped first.
Also return "title": a short title for the whole merged video (2-7 words, e.g. "4 Keys To Waiting Well"), and "kicker": a tiny label above it (1-3 words, e.g. "Key Points").
Respond ONLY with JSON: {"title": string, "kicker": string, "clips": [{"headline": string, "takeaway": string, "startSec": number, "endSec": number, "priority": number}]}`;

export async function extractCompilation({ transcriptLines, kind, prompt = '', targetSec = 60 }) {
  const result = await callOpenRouterJSON({
    system: COMPILATION_SYSTEM_PROMPT,
    user: JSON.stringify({ kind, instruction: prompt, targetSeconds: targetSec, transcript: transcriptLines }),
    maxTokens: 2200,
    temperature: 0.3,
  });
  return {
    title: typeof result?.title === 'string' ? result.title : '',
    kicker: typeof result?.kicker === 'string' ? result.kicker : '',
    clips: Array.isArray(result?.clips) ? result.clips : [],
  };
}


// ---- message notes (the written study version of a sermon) ----

const NOTES_STRUCTURE_PROMPT = `You are a gifted sermon-notes writer for a church's media team. You turn a full sermon transcript into the study notes people keep, share and revisit: clear, warm, engaging, faithful to what was actually preached.

Produce:
- "title": the message title if the preacher stated one; otherwise a short, compelling title (3-7 words).
- "hook": ONE or two sentences that open the notes and make a reader want to read on (the big question or promise of the message). Not a summary of everything.
- "bigIdea": the single central truth of the message in one sentence.
- "scriptures": EVERY Bible verse or passage that was read, quoted, or clearly cited in the message - with its reference in standard form ("John 3:16", "Romans 8:28-30", "1 Corinthians 14:2"). Set "quoted": true when the preacher read or recited the verse's actual words, false when only the reference was mentioned or alluded to. Include "use": a few words on how it was used. If the preacher quoted words without naming the verse and you are certain which verse it is, include it. Never include a reference you are not sure of.
- "sections": the message body in the order it was preached, broken into topics. For each:
   - "heading": a short bold topic heading in the preacher's own idea (e.g. "Benefits of Praying in the Spirit", "Three Ways to Stay Awake"). When the preacher announces a topic or a list ("the benefits of...", "three reasons..."), that becomes a heading and the list items become its points, in the order spoken.
   - "summary": one sentence introducing the section (optional, may be "").
   - "points": 3-7 points. Each "text" is a clear, complete, standalone sentence or two written for a reader (not a transcript fragment), keeping the preacher's meaning and wording where it is strong. You may wrap the single most important phrase of a point in **bold** (at most once per point). "refs": the scripture references from "scriptures" that this point rests on (array, usually empty).
   - "pullQuote": one memorable line the preacher actually said in this section, as close to verbatim as possible, cleaned of filler words ("" if none).
- "closing": the final takeaway/challenge in 1-2 sentences.

Rules: 4-8 sections. No filler, no repetition, no generic church-speak. Do not invent teaching, stories or scripture that is not in the transcript. Speech-to-text may garble names and words - use the most sensible reading.
Respond ONLY with JSON: {"title": string, "hook": string, "bigIdea": string, "scriptures": [{"ref": string, "quoted": boolean, "use": string}], "sections": [{"heading": string, "summary": string, "points": [{"text": string, "refs": string[]}], "pullQuote": string}], "closing": string}`;

export async function generateNotesStructure({ fullText, titleHint = '', preacher = '' }) {
  return callOpenRouterJSON({
    system: NOTES_STRUCTURE_PROMPT,
    user: JSON.stringify({ titleHint, preacher, transcript: fullText.slice(0, 150000) }),
    maxTokens: 8000,
    temperature: 0.3,
    model: env.openrouterNotesModel,
  });
}

const NOTES_DEVOTIONAL_PROMPT = `You are a pastoral discipleship writer. Given the study notes of a sermon, you write the follow-through that helps people live the message during the week.

Produce:
- "prayerPoints": 8-10 prayer points in line with THIS message (its themes, scriptures and challenges). Each is a short, specific prayer someone can pray aloud, written in first person or addressed to God ("Father, ..."), 1-2 sentences, rooted in the message - never generic.
- "furtherReading": 4-6 Bible passages (standard references) that deepen the message - related to its themes and not only the ones already used. Each has "ref" and "why" (one sentence on what to look for).
- "weeklyTheme": a short name for the week (3-6 words).
- "weeklyTarget": one clear, achievable goal for the week that captures the message's aim.
- "days": EXACTLY six objects for Monday, Tuesday, Wednesday, Thursday, Friday, Saturday (in that order), each with:
   - "day": the weekday name,
   - "title": 2-5 words,
   - "kind": one of "read", "pray", "reflect", "act", "share", "memorize", "review",
   - "action": 1-3 concrete sentences of what to do (10-20 minutes) - specific enough to do today,
   - "scripture": a reference to read/use that day ("" if none).
  Build a journey: Monday revisits the notes; mid-week deepens it with scripture, prayer and reflection; at least two days are practical ACTION or SHARE tasks that put the message to work in real life and in relationships (for an evangelism message: speak to a named person about Jesus on a stated day, pray for someone in need, invite someone; for a prayer message: a set prayer time; for faith: take a step you have been delaying). Saturday reviews the week and gives thanks / records a testimony. Tasks must follow from the message's content.
Respond ONLY with JSON: {"prayerPoints": string[], "furtherReading": [{"ref": string, "why": string}], "weeklyTheme": string, "weeklyTarget": string, "days": [{"day": string, "title": string, "kind": string, "action": string, "scripture": string}]}`;

export async function generateNotesDevotional({ notes }) {
  return callOpenRouterJSON({
    system: NOTES_DEVOTIONAL_PROMPT,
    user: JSON.stringify(notes),
    maxTokens: 4000,
    temperature: 0.5,
    model: env.openrouterNotesModel,
  });
}

const POINT_SCRIPTURE_SYSTEM_PROMPT = `You are matching teaching points from a sermon to the Bible verse each one rests on, so the reference can be printed under the point.
You get "points" (the teaching points) and "candidates" (scriptures the preacher actually referenced in this message, possibly with a short description).
For each point, in order, return the single best reference (standard short form, e.g. "John 3:16", "1 Corinthians 11:23-26", book + chapter + verse only, no description).
Rules:
- Prefer a reference from "candidates" whose passage the point is clearly about.
- You may use a reference that is not in the candidates only when the point plainly quotes or paraphrases one specific, well-known verse you are certain of.
- If no verse clearly fits a point, return an empty string for it. Never guess; an empty string is better than a wrong reference.
Respond ONLY with JSON: {"refs": string[]} - exactly one entry per point, same order.`;

export async function matchPointScriptures({ points, candidates = [] }) {
  const result = await callOpenRouterJSON({
    system: POINT_SCRIPTURE_SYSTEM_PROMPT,
    user: JSON.stringify({ points, candidates }),
    maxTokens: 600,
    temperature: 0.1,
  });
  const refs = Array.isArray(result?.refs) ? result.refs : [];
  return points.map((_, i) => (typeof refs[i] === 'string' ? refs[i].replace(/\s+[-–—].*$/, '').trim() : ''));
}

const SONG_ID_SYSTEM_PROMPT = `You help a church media team find worship songs, including Nigerian and wider African gospel (for example Nathaniel Bassey, Sinach, Mercy Chinwo, Dunsin Oyekan, Frank Edwards, Tope Alabi, Ada Ehi, Prospa Ochimana, Moses Bliss, Chioma Jesus, Judikay) as well as international worship and hymns. Lyrics may be in English, Nigerian Pidgin, Yoruba, Igbo, Hausa, or a mix. The user types a song title (possibly misspelled or partial), an artist, or a line of lyrics they remember. Identify the up to 3 most likely songs, best match first.
Respond ONLY with JSON: {"songs": [{"title": string, "artist": string}]}
- Give the song's real, commonly used title (in its original language, not translated) and the artist/band most associated with it (the well-known recording, not a cover).
- Titles and artists ONLY. Never include any lyrics.
- If you are not reasonably sure, return fewer songs, or an empty array if the text doesn't look like a song at all. Do not guess wildly.`;

// Turns "oceans hillsong", "how grate is our god" or a remembered lyric line into likely
// { title, artist } pairs. Names only - the lyrics themselves come from a lyrics database.
export async function identifySongs({ query }) {
  const result = await callOpenRouterJSON({ system: SONG_ID_SYSTEM_PROMPT, user: String(query).slice(0, 300), maxTokens: 200, temperature: 0.2 });
  if (!Array.isArray(result?.songs)) return null;
  return result.songs
    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
    .slice(0, 3)
    .map((s) => ({ title: s.title.trim().slice(0, 120), artist: String(s.artist || '').trim().slice(0, 120) }));
}

const LYRICS_EXTRACT_SYSTEM_PROMPT = `You receive the text of a web page that may show the lyrics of a song. If the page contains the song's lyrics in full, copy them EXACTLY as written on the page.
Respond ONLY with JSON: {"isLyrics": boolean, "title": string, "artist": string, "lyrics": string}
- Copy, never write: do not correct, translate, complete, reorder, summarise or add any words. Lyrics may be in English, Pidgin, Yoruba, Igbo, Hausa or another language - copy them in the language and spelling (including tone marks and special letters like ẹ, ọ, ṣ) shown on the page. If a page shows an English translation beside the original, keep only the original. If the page does not actually contain the words, set isLyrics to false.
- Keep the page's line breaks, and put one blank line between stanzas/sections. Section labels the page uses (like "[Verse 1]", "Chorus") may stay on their own line.
- Leave out everything that isn't sung: navigation, ads, song facts, annotations, translations, comments, chord charts, "You might also like" lists, and lyrics of other songs.
- isLyrics is false for pages that show only a snippet, are paywalled, are about several songs, or are not a song page.
- "title" and "artist" are the song's own title and performer as shown on the page.`;

// Pulls the lyrics out of a fetched web page's text. Returns { title, artist, lyrics } or null.
export async function extractLyricsFromPage({ pageText }) {
  const result = await callOpenRouterJSON({ system: LYRICS_EXTRACT_SYSTEM_PROMPT, user: pageText, maxTokens: 3000, temperature: 0 });
  if (!result?.isLyrics || typeof result.lyrics !== 'string' || !result.lyrics.trim()) return null;
  return { title: String(result.title || '').trim(), artist: String(result.artist || '').trim(), lyrics: result.lyrics };
}

const SCRIPTURE_SUGGEST_SYSTEM_PROMPT = `You are a Bible reference expert helping a church media operator find scripture fast, mid-service. They type whatever they have: a quote or half-remembered phrase (possibly from any translation, NIV/ESV/NLT/KJV wording, or slightly wrong), a paraphrase, a messy or spoken reference ("first john four eight", "johns three sixteen", "psalm twenty three"), a Bible story ("when Jesus walked on water"), or a topic/theme ("forgiveness", "do not fear").
Return the passages that best answer it, most relevant first, at most 6.
Respond ONLY with JSON: {"passages": [{"book": string, "chapter": number, "verseStart": number, "verseEnd": number, "reason": string}]}
- "book" is the standard English book name (e.g. "1 Corinthians", "Psalms", "Song of Solomon").
- For a quote, paraphrase, or a reference in any wording, the FIRST passage must be the exact verse(s) it points to, and the rest only genuinely related ones (or none).
- For a story or topic, give the most fitting, well-known passages, not obscure ones.
- Keep ranges tight: usually one verse, rarely more than 5 verses. verseEnd equals verseStart for a single verse.
- "reason" is at most 12 words, in your own words, saying why it fits (e.g. "The exact verse you quoted", "Jesus walks on the sea"). Do not copy or paraphrase the verse itself.
- Only give a passage you are confident exists with those exact verse numbers. If you don't know, return fewer, or an empty array.
- References and reasons ONLY. Never write out any scripture text.`;

// Passages (book/chapter/verses only - never text) that answer a quote, paraphrase, story, topic or
// messy reference. The caller looks the words up in the real Bible.
export async function suggestScriptures({ query }) {
  const result = await callOpenRouterJSON({ system: SCRIPTURE_SUGGEST_SYSTEM_PROMPT, user: String(query).slice(0, 400), maxTokens: 500, temperature: 0.2 });
  if (!Array.isArray(result?.passages)) return null;
  return result.passages
    .filter((p) => p && typeof p.book === 'string' && Number.isFinite(Number(p.chapter)))
    .slice(0, 6)
    .map((p) => ({
      book: p.book.trim(),
      chapter: Math.trunc(Number(p.chapter)),
      verseStart: Math.trunc(Number(p.verseStart)) || 1,
      verseEnd: Math.trunc(Number(p.verseEnd)) || Math.trunc(Number(p.verseStart)) || 1,
      reason: String(p.reason || '').slice(0, 120),
    }));
}

// Exposed for the Instagram review and growth-plan writers.
export { callOpenRouterJSON };
