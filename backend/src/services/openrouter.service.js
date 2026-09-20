import { env } from '../config/env.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenRouterJSON({ system, user, maxTokens = 500, temperature = 0.4 }) {
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
      model: env.openrouterModel,
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
    return null;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch (err) {
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

When in doubt, leave it out. One truly sharp quote per service is worth more than ten mediocre ones.
Return at most ONE quote per call. If nothing meets this bar, return an empty array - do not stretch to find something.
Respond ONLY with JSON: {"quotes": [{"text": string, "imagePrompt": string, "caption": string}]}
- "imagePrompt": a short visual prompt describing a background/mood suited to a text-overlay social graphic (e.g. "warm golden sunrise over hills, soft light, inspirational").
- "caption": a ready-to-post social caption to go under the image - NOT a repeat of the quote text. Open with a short hook that gives the quote context or a reason to keep reading, and close with a soft invitation to engage (a reflective question, a gentle call to action, or an "amen if..." line) - never a hard sales pitch. Conversational, warm, true to a real church's voice, no more than 2-3 short sentences, at most 1-2 tasteful emoji, and only add hashtags if they're genuinely relevant (never a generic hashtag block).`;

export async function extractQuotes({ windowText, alreadyUsed = [] }) {
  const result = await callOpenRouterJSON({
    system: QUOTE_SYSTEM_PROMPT,
    user: JSON.stringify({ transcriptWindow: windowText, alreadyUsed }),
    maxTokens: 500,
  });
  return result?.quotes ?? [];
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

const CHAT_SYSTEM_PROMPT = `You are a helpful assistant answering questions about a sermon/service that has just ended.
You are given the full transcript, a structured summary, and the conversation so far. Answer the user's question using only information from the transcript/summary.
If the transcript doesn't contain the answer, say so plainly rather than guessing or inventing details.
Keep answers conversational and concise.`;

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
