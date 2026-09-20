import { extractQuotes, extractInsights, generateMessageTitle, identifyScriptureReference } from './openrouter.service.js';

const QUOTE_WORD_THRESHOLD = 35;
const QUOTE_MIN_INTERVAL_MS = 8000;
const INSIGHT_WORD_THRESHOLD = 100;
const INSIGHT_MIN_INTERVAL_MS = 30000;
const RECENT_MEMORY_SIZE = 20;

// If the preacher hasn't explicitly announced the message's title/topic by this point, guess one
// from the transcript so far - "after a few mins" per how this was asked for.
const TITLE_AUTO_GENERATE_DELAY_MS = 3 * 60 * 1000;
const TITLE_MIN_WORDS = 150;

// Preachers often restate the same idea several ways across a service. The LLM's own
// "alreadyUsed" check catches some of this, but not reliably - so quotes are also grouped
// here by plain lexical overlap, independent of the model, so near-duplicates cluster together
// in the UI instead of appearing as separate repetitive cards.
const GROUP_SIMILARITY_THRESHOLD = 0.45;
const GROUP_MAX_SIZE = 5;
const QUOTE_HISTORY_LIMIT = 200;

// A keyPoint list ("three ways to...") is usually revealed across several transcript windows -
// each window only hears the items said so far. New items get matched to an in-progress list by
// how similar its title is to one already being tracked, rather than requiring an exact repeat.
const LIST_TITLE_SIMILARITY_THRESHOLD = 0.5;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'for',
  'and', 'or', 'but', 'that', 'this', 'it', 'its', 'you', 'your', 'i', 'we', 'our', 'us',
  'with', 'as', 'at', 'by', 'not', 'no', 'so', 'if', 'my', 'me',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

class SessionAnalysisState {
  constructor(sessionId, { onQuote, onInsight }) {
    this.sessionId = sessionId;
    this.onQuote = onQuote;
    this.onInsight = onInsight;

    this.quoteBuffer = '';
    this.insightBuffer = '';
    this.fullTranscript = '';

    this.lastQuoteCheckAt = 0;
    this.lastInsightCheckAt = 0;
    this.quoteCheckInFlight = false;
    this.insightCheckInFlight = false;

    this.recentQuoteTexts = [];
    this.recentInsightTexts = [];
    this.quoteHistory = []; // { text, groupId }
    this.groupCounter = 0;
    this.keyPointLists = []; // { groupId, title, items }

    this.startedAt = Date.now();
    this.topicGroupId = `${sessionId}-topic`;
    this.hasTopic = false;
    this.topicIsExplicit = false;
    this.titleCheckInFlight = false;
    this.scriptureCounter = 0;
  }

  // Fires a quick, separate lookup for a quoted scripture the preacher didn't cite, and patches
  // the reference into the same insight doc (by groupId) the moment it resolves - the note goes
  // out immediately without the reference, then gets it filled in a beat later.
  lookupScriptureReference(groupId, text) {
    identifyScriptureReference({ text })
      .then((reference) => {
        if (reference) this.onInsight?.({ type: 'scripture', text, reference, groupId });
      })
      .catch((err) => console.error('[analysis] scripture reference lookup failed', err));
  }

  // Finds an in-progress enumerated list whose title is close enough to be a continuation of the
  // same list, appends any genuinely new items to it, and returns the merged { groupId, items }.
  // Falls back to starting a new list when nothing matches closely enough.
  mergeKeyPointList(text, newItems) {
    let best = null;
    let bestScore = 0;
    for (const list of this.keyPointLists) {
      const score = jaccardSimilarity(text, list.title);
      if (score > bestScore) {
        bestScore = score;
        best = list;
      }
    }

    if (bestScore >= LIST_TITLE_SIMILARITY_THRESHOLD && best) {
      for (const item of newItems) {
        if (!best.items.some((existing) => jaccardSimilarity(existing, item) >= GROUP_SIMILARITY_THRESHOLD)) {
          best.items.push(item);
        }
      }
      return { groupId: best.groupId, items: best.items };
    }

    const groupId = `${this.sessionId}-list${this.keyPointLists.length + 1}`;
    const list = { groupId, title: text, items: [...newItems] };
    this.keyPointLists.push(list);
    return { groupId, items: list.items };
  }

  assignGroupId(text) {
    let bestScore = 0;
    let bestGroupId = null;
    for (const entry of this.quoteHistory) {
      const score = jaccardSimilarity(text, entry.text);
      if (score > bestScore) {
        bestScore = score;
        bestGroupId = entry.groupId;
      }
    }

    let groupId =
      bestScore >= GROUP_SIMILARITY_THRESHOLD && bestGroupId
        ? bestGroupId
        : `${this.sessionId}-g${++this.groupCounter}`;

    const groupSize = this.quoteHistory.filter((e) => e.groupId === groupId).length;
    if (groupSize >= GROUP_MAX_SIZE) {
      groupId = `${this.sessionId}-g${++this.groupCounter}`;
    }

    this.quoteHistory.push({ text, groupId });
    if (this.quoteHistory.length > QUOTE_HISTORY_LIMIT) this.quoteHistory.shift();
    return groupId;
  }

  addFinalText(text) {
    const clean = text.trim();
    if (!clean) return;

    this.quoteBuffer = `${this.quoteBuffer} ${clean}`.trim();
    this.insightBuffer = `${this.insightBuffer} ${clean}`.trim();
    this.fullTranscript = `${this.fullTranscript} ${clean}`.trim();

    this.maybeCheckQuotes();
    this.maybeCheckInsights();
    this.maybeGenerateTitle();
  }

  // Auto-guesses the message title once there's been enough time and content to go on, unless
  // the preacher has already explicitly stated one (which always wins and is never overwritten
  // by a guess - see the "topic" handling in maybeCheckInsights).
  maybeGenerateTitle() {
    if (this.topicIsExplicit || this.hasTopic || this.titleCheckInFlight) return;
    if (Date.now() - this.startedAt < TITLE_AUTO_GENERATE_DELAY_MS) return;
    if (wordCount(this.fullTranscript) < TITLE_MIN_WORDS) return;

    this.titleCheckInFlight = true;
    generateMessageTitle({ transcriptSoFar: this.fullTranscript })
      .then((title) => {
        if (!title || this.topicIsExplicit) return;
        this.hasTopic = true;
        this.onInsight?.({ type: 'topic', text: title, reference: '', groupId: this.topicGroupId });
      })
      .catch((err) => console.error('[analysis] title generation failed', err))
      .finally(() => {
        this.titleCheckInFlight = false;
      });
  }

  maybeCheckQuotes() {
    const now = Date.now();
    if (this.quoteCheckInFlight) return;
    if (wordCount(this.quoteBuffer) < QUOTE_WORD_THRESHOLD) return;
    if (now - this.lastQuoteCheckAt < QUOTE_MIN_INTERVAL_MS) return;

    this.lastQuoteCheckAt = now;
    this.quoteCheckInFlight = true;
    const windowText = this.quoteBuffer;
    this.quoteBuffer = '';

    extractQuotes({ windowText, alreadyUsed: this.recentQuoteTexts })
      .then((quotes) => {
        for (const q of quotes) {
          if (!q?.text) continue;
          this.recentQuoteTexts.push(q.text);
          if (this.recentQuoteTexts.length > RECENT_MEMORY_SIZE) this.recentQuoteTexts.shift();
          const groupId = this.assignGroupId(q.text);
          this.onQuote?.({
            text: q.text,
            imagePrompt: q.imagePrompt || '',
            caption: q.caption || '',
            sourceText: windowText,
            groupId,
          });
        }
      })
      .catch((err) => console.error('[analysis] quote extraction failed', err))
      .finally(() => {
        this.quoteCheckInFlight = false;
      });
  }

  maybeCheckInsights() {
    const now = Date.now();
    if (this.insightCheckInFlight) return;
    if (wordCount(this.insightBuffer) < INSIGHT_WORD_THRESHOLD) return;
    if (now - this.lastInsightCheckAt < INSIGHT_MIN_INTERVAL_MS) return;

    this.lastInsightCheckAt = now;
    this.insightCheckInFlight = true;
    const windowText = this.insightBuffer;
    this.insightBuffer = '';

    extractInsights({ windowText, alreadyCaptured: this.recentInsightTexts })
      .then((insights) => {
        for (const insight of insights) {
          if (!insight?.text || !insight?.type) continue;
          this.recentInsightTexts.push(insight.text);
          if (this.recentInsightTexts.length > RECENT_MEMORY_SIZE) this.recentInsightTexts.shift();

          if (insight.type === 'keyPoint' && Array.isArray(insight.items) && insight.items.length > 0) {
            const { groupId, items } = this.mergeKeyPointList(insight.text, insight.items);
            this.onInsight?.({ type: 'keyPoint', text: insight.text, reference: '', items, groupId });
          } else if (insight.type === 'topic') {
            // The preacher explicitly naming the message's topic always wins, replacing
            // whatever guess (or earlier statement) is already showing - see maybeGenerateTitle.
            if (!insight.explicit) continue;
            this.topicIsExplicit = true;
            this.hasTopic = true;
            this.onInsight?.({ type: 'topic', text: insight.text, reference: '', groupId: this.topicGroupId });
          } else if (insight.type === 'scripture') {
            const groupId = `${this.sessionId}-scripture${++this.scriptureCounter}`;
            this.onInsight?.({ type: 'scripture', text: insight.text, reference: insight.reference || '', groupId });
            if (!insight.reference) this.lookupScriptureReference(groupId, insight.text);
          } else {
            this.onInsight?.({
              type: insight.type,
              text: insight.text,
              reference: insight.reference || '',
            });
          }
        }
      })
      .catch((err) => console.error('[analysis] insight extraction failed', err))
      .finally(() => {
        this.insightCheckInFlight = false;
      });
  }

  getFullTranscript() {
    return this.fullTranscript;
  }
}

const activeSessions = new Map();

export function startAnalysis(sessionId, callbacks) {
  const state = new SessionAnalysisState(sessionId, callbacks);
  activeSessions.set(sessionId, state);
  return state;
}

export function getAnalysis(sessionId) {
  return activeSessions.get(sessionId);
}

export function stopAnalysis(sessionId) {
  activeSessions.delete(sessionId);
}
