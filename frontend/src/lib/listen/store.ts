import { useSyncExternalStore } from "react";
import { authHeaders } from "../auth";
import { bibleChapter, type BibleMeta, type Slide } from "../present";
import { detectScriptures, type SpokenRef } from "../spokenScripture";
import { isElectron, startDeviceEngine, startServerEngine, type EngineId, type RunningEngine } from "./engines";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type { EngineId };
export type ListenMode = "ask" | "auto";
export type ListenStatus = "off" | "starting" | "loading" | "listening" | "error";

export interface Suggestion {
  id: string;
  key: string; // the same verse(s) always have the same key
  label: string; // "John 3:16"
  note: string; // "chapter - starts at verse 1", "quoted words", "verse of the same chapter"...
  source: "reference" | "quote" | "paraphrase" | "verse"; // named reference · exact quoted words · the AI recognised a paraphrase · a bare verse number
  confidence: "high" | "medium" | "low";
  book: number;
  chapter: number;
  from: number | null;
  to: number | null;
  heard: string;
  text: string; // the verse, once fetched
  version: string; // abbreviation, once fetched
  at: number;
  auto?: boolean; // put on screen automatically
}
export interface Recent {
  id: string;
  label: string;
  text: string;
  at: number;
  auto: boolean;
  suggestion: Suggestion;
}

export interface ListenState {
  status: ListenStatus;
  reconnecting: boolean; // the connection dropped and is coming back; listening carries on
  engine: EngineId;
  mode: ListenMode;
  deviceId: string;
  aiParaphrase: boolean; // ask the AI about verses said in the preacher's own words
  aiNote: string; // why the AI help is unavailable, when it is
  transcript: string; // the last few words heard
  progress: number; // 0-100 while the on-device model downloads
  progressLabel: string;
  error: string;
  suggestions: Suggestion[];
  recent: Recent[];
  heardOpen: boolean; // the "Heard" panel is open (it lists the same cards, so the floating ones step aside)
}

// ---- remembered settings (per browser) ------------------------------------------------------------------------------

const KEY = "present-listen";
interface Saved {
  engine: EngineId;
  mode: ListenMode;
  deviceId: string;
  aiParaphrase: boolean;
}
function readSaved(): Saved {
  const base: Saved = { engine: "server", mode: "ask", deviceId: "", aiParaphrase: true };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Saved>;
    return { engine: s.engine === "device" ? "device" : "server", mode: s.mode === "auto" ? "auto" : "ask", deviceId: s.deviceId || "", aiParaphrase: s.aiParaphrase !== false };
  } catch {
    return base;
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ engine: state.engine, mode: state.mode, deviceId: state.deviceId, aiParaphrase: state.aiParaphrase }));
  } catch {}
}

// ---- the store ------------------------------------------------------------------------------------------------------

const initial = (): ListenState => ({ status: "off", reconnecting: false, engine: "server", mode: "ask", deviceId: "", aiParaphrase: true, aiNote: "", transcript: "", progress: 0, progressLabel: "", error: "", suggestions: [], recent: [], heardOpen: false });
let state: ListenState = initial();
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(p: Partial<ListenState>) {
  state = { ...state, ...p };
  emit();
}
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = { ...state, ...readSaved() };
}
const subscribe = (fn: () => void) => {
  hydrate();
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const server = initial();
export const useListen = (): ListenState => useSyncExternalStore(subscribe, () => (hydrate(), state), () => server);

// What the page gives us: the Bible versions, the one in use, and how to stage / go live.
interface Bridge {
  bibles: BibleMeta[];
  versionId: string;
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
}
let bridge: Bridge | null = null;
export const setListenBridge = (b: Bridge | null) => {
  bridge = b;
};

// ---- turning speech into suggestions --------------------------------------------------------------------------------

const SEEN_MS = 60_000; // the same verse is not offered twice within a minute
const CARD_MS = 25_000; // a card fades away after this
const MAX_CARDS = 3;
const MAX_RECENT = 10;

let engine: RunningEngine | null = null;
let buffer = ""; // recent finished speech
let bufferStart = 0; // where `buffer` begins on the "ever spoken" line, so a reference keeps its position as old speech drops off
let interim = "";
let lastRef: { book: number; chapter: number } | null = null;
const seen = new Map<string, number>(); // verse key -> when it was last offered
const spots = new Map<number, { key: string; book: number; chapter: number; hasVerse: boolean; timer: ReturnType<typeof setTimeout> | null; suggestionId?: string; at: number }>(); // where a reference sat
const cardTimers = new Map<string, ReturnType<typeof setTimeout>>();
let counter = 0;
let quoteTimer: ReturnType<typeof setTimeout> | null = null;
let quoteBusy = false;
let quoteQueued = ""; // newer words that arrived while a quote lookup was running
let quoteQueuedFinal = false;
let lastQuote = "";
let lastQuoteFinal = false;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function addToBuffer(text: string) {
  buffer = `${buffer} ${text}`.trim();
  if (buffer.length > 900) {
    const cut = buffer.length - 900;
    buffer = buffer.slice(cut);
    bufferStart += cut;
  }
}

// Set localStorage "present-listen-debug" to see what it hears and decides in the console.
const dbg = (...a: unknown[]) => {
  try {
    if (localStorage.getItem("present-listen-debug")) console.log("LISTEN", ...a);
  } catch {}
};

function onTranscript(text: string, isFinal: boolean) {
  if (!text.trim()) return;
  if (CUE.test(text)) lastCueAt = Date.now(); // "the Bible says..." may land in a different segment from the quoted words
  dbg(isFinal ? "final" : "interim", JSON.stringify(text));
  if (isFinal) {
    interim = "";
    addToBuffer(text);
  } else interim = text;
  const all = interim ? `${buffer} ${interim}`.trim() : buffer;
  set({ transcript: all.slice(-140) });
  analyse(all, isFinal);
  considerQuote(text, isFinal);
}

function analyse(all: string, isFinal: boolean) {
  for (const ref of detectScriptures(all, { context: lastRef })) {
    const spot = bufferStart + ref.start;
    const have = spots.get(spot);
    if (have?.key === ref.key) continue; // already waiting for / shown
    // Speech comes word by word: "John 3" at the very end may become "John 3:16" a moment later, so wait for it to
    // settle before offering it (instantly once more words follow, or the sentence has ended with a verse).
    // A number can still grow ("twenty" -> "twenty eight"), so those wait a little longer.
    const lastWord = all.trimEnd().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    const open = /^(twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|and|to|through|thru|verse|verses|chapter)$/.test(lastWord);
    // "Psalm 130" (or "one thirty") may still become 136: round Psalm numbers wait a little longer for the last digit.
    const growing = open || (ref.book === 19 && ref.chapter >= 20 && ref.chapter % 10 === 0);
    const wait = ref.atTail ? (ref.hasVerse ? (isFinal ? 150 : open ? 1000 : 500) : growing ? 2200 : 1300) : 0; // "Psalm one thirty" may still become "...thirty six"
    if (have?.timer) clearTimeout(have.timer);
    const timer = setTimeout(() => offer(ref, spot, all), wait);
    spots.set(spot, { key: ref.key, book: ref.book, chapter: ref.chapter, hasVerse: ref.hasVerse, timer, suggestionId: have?.suggestionId, at: Date.now() });
    // The engine may have reworded the speech before the reference (moving it), so a still-waiting bare chapter at
    // another position is the same reference; the version with its verse replaces it.
    if (ref.hasVerse) for (const [other, e] of spots) if (other !== spot && e.timer && !e.hasVerse && e.book === ref.book && e.chapter === ref.chapter) {
      clearTimeout(e.timer);
      e.timer = null;
    }
  }
  // old positions that scrolled off no longer matter
  for (const spot of spots.keys()) if (spot < bufferStart - 50) spots.delete(spot);
}

function offer(ref: SpokenRef, spot: number, heardIn: string) {
  dbg("offer", ref.label, ref.confidence, "spot", spot);
  const entry = spots.get(spot);
  if (entry) entry.timer = null;
  if (state.status === "off") return;
  const source: Suggestion["source"] = ref.contextual ? "verse" : "reference";
  const note = ref.contextual ? "verse of the same chapter" : ref.hasVerse ? "" : "whole chapter - starts at verse 1";
  const sug = makeSuggestion(ref.book, ref.chapter, ref.verseFrom, ref.verseTo, ref.bookName, source, ref.confidence, note, heardIn.slice(Math.max(0, ref.start - 30), ref.end + 10));
  if (ref.contextual) sug.label = `${ref.bookName} ${ref.chapter}:${ref.verseFrom}${ref.verseTo && ref.verseTo !== ref.verseFrom ? `-${ref.verseTo}` : ""}`;
  // A closer reading of something already on screen (the chapter, now with its verse) updates that card in place.
  const existing =
    (entry?.suggestionId ? state.suggestions.find((s) => s.id === entry.suggestionId) : undefined) ??
    // the same chapter, offered a moment ago without its verse (the speech was reworded, so its position moved)
    (sug.from !== null ? state.suggestions.find((s) => s.source === "reference" && s.book === sug.book && s.chapter === sug.chapter && s.from === null && Date.now() - s.at < 8000) : undefined);
  const wouldAuto = state.mode === "auto" && sug.confidence === "high" && sug.from !== null && sug.source !== "verse";
  if (existing && wouldAuto) {
    // The verse arrived after the chapter was already offered: in automatic mode that is the moment to show it.
    dismiss(existing.id);
    set({ recent: state.recent.filter((r) => r.id !== existing.id) });
    deliver(sug, spot);
    return;
  }
  if (existing && recentlyOffered(sug.key)) {
    dismiss(existing.id); // that verse was offered a moment ago: no second copy
    return;
  }
  if (existing) {
    const next = { ...sug, id: existing.id };
    set({ suggestions: state.suggestions.map((s) => (s.id === existing.id ? next : s)) });
    seen.set(sug.key, Date.now());
    fillText(next);
    armCard(next.id);
    return;
  }
  deliver(sug, spot);
}

function makeSuggestion(book: number, chapter: number, from: number | null, to: number | null, bookName: string, source: Suggestion["source"], confidence: Suggestion["confidence"], note: string, heard: string): Suggestion {
  const toV = from ? (to && to >= from ? to : from) : null;
  return {
    id: `s${++counter}-${Date.now()}`,
    key: `${book}:${chapter}:${from ?? 0}-${toV ?? 0}`,
    label: `${bookName} ${chapter}${from ? `:${from}${toV && toV !== from ? `-${toV}` : ""}` : ""}`,
    note,
    source,
    confidence,
    book,
    chapter,
    from,
    to: toV,
    heard: heard.trim(),
    text: "",
    version: "",
    at: Date.now(),
  };
}

const recentlyOffered = (key: string) => Date.now() - (seen.get(key) ?? 0) < SEEN_MS;

function deliver(sug: Suggestion, spot?: number) {
  if (recentlyOffered(sug.key)) return; // no repeats
  // A bare "1 Corinthians 13" right after "1 Corinthians 13:4" was offered is the same reference said again.
  if (sug.from === null) for (const k of seen.keys()) if (k.startsWith(`${sug.book}:${sug.chapter}:`) && !k.endsWith(":0-0") && recentlyOffered(k)) return;
  seen.set(sug.key, Date.now());
  lastRef = { book: sug.book, chapter: sug.chapter };
  const auto = state.mode === "auto" && sug.confidence === "high" && sug.from !== null && sug.source !== "verse" && sug.source !== "paraphrase";
  if (spot !== undefined) {
    const e = spots.get(spot);
    if (e) e.suggestionId = sug.id;
  }
  const card = auto ? { ...sug, auto: true } : sug;
  set({ suggestions: [card, ...state.suggestions].slice(0, MAX_CARDS) });
  armCard(card.id, auto ? 7000 : CARD_MS);
  void fillText(card).then(async (filled) => {
    if (!filled) return;
    addRecent(filled, auto);
    if (auto) {
      const slide = await slideOf(filled);
      if (slide) bridge?.onLive(slide);
    }
  });
}

function armCard(id: string, ms = CARD_MS) {
  const old = cardTimers.get(id);
  if (old) clearTimeout(old);
  cardTimers.set(id, setTimeout(() => dismiss(id), ms));
}

function addRecent(s: Suggestion, auto: boolean) {
  const rest = state.recent.filter((r) => r.suggestion.key !== s.key);
  set({ recent: [{ id: s.id, label: s.label, text: s.text, at: Date.now(), auto, suggestion: s }, ...rest].slice(0, MAX_RECENT) });
}

// The verse(s) in the Bible version the operator is using.
async function versesOf(s: Suggestion): Promise<{ text: string; version: string; reference: string } | null> {
  if (!bridge) return null;
  const meta = bridge.bibles.find((b) => b.id === bridge!.versionId) ?? bridge.bibles[0];
  if (!meta) return null;
  try {
    const p = await bibleChapter(meta.id, s.book, s.chapter);
    const from = s.from ?? 1;
    const to = s.to ?? from;
    const vs = p.verses.filter((v) => v.n >= from && v.n <= to);
    if (!vs.length) return null;
    const label = vs.length > 1 ? `${vs[0].n}-${vs[vs.length - 1].n}` : `${vs[0].n}`;
    return { text: vs.map((v) => v.text).join(" "), version: meta.abbr, reference: `${p.bookName} ${p.chapter}:${label}` };
  } catch {
    return null;
  }
}

async function fillText(s: Suggestion): Promise<Suggestion | null> {
  const v = await versesOf(s);
  if (!v) return null;
  const filled = { ...s, text: v.text, version: v.version };
  set({ suggestions: state.suggestions.map((x) => (x.id === s.id ? filled : x)), recent: state.recent.map((r) => (r.id === s.id ? { ...r, text: v.text, suggestion: filled } : r)) });
  return filled;
}

async function slideOf(s: Suggestion): Promise<Slide | null> {
  const v = await versesOf(s);
  return v ? { kind: "scripture", reference: v.reference, version: v.version, text: v.text } : null;
}

// ---- quotes with no reference ---------------------------------------------------------------------------------------

function considerQuote(text: string, isFinal: boolean) {
  if (detectScriptures(text).length) return; // it named its reference: no need to guess
  const words = norm(text).split(" ").filter(Boolean).length;
  if (quoteTimer) clearTimeout(quoteTimer);
  if (words < (isFinal ? 5 : 6)) return;
  const phrase = norm(isFinal ? text : text); // the sentence being spoken
  // The finished sentence is checked even when its words were already checked as a half sentence (the AI waits for it).
  if (phrase === lastQuote && !(isFinal && !lastQuoteFinal)) return;
  quoteTimer = setTimeout(() => void matchQuote(phrase, isFinal), isFinal ? 0 : 450);
}

// Words that say "now I'm quoting scripture" - worth asking the AI about even when the words don't match a verse exactly.
const CUE = /\b((the (bible|scriptures?|word( of god)?|good book|book|lord)|god\'?s word) (says?|said|tells us|declares|reminds us|teaches|promises)|it is written|it'?s written|god'?s word says|god (says|said|promises)|jesus (said|says)|paul (said|says|wrote)|peter (said|says|wrote)|the apostle|the psalmist|the prophet|according to (the )?(bible|scriptures?|word)|in the book of|scripture (says|tells us))\b/i;
const isOff = () => state.status === "off";
let lastCueAt = 0; // when the preacher last signalled a quote ("the Bible says...")
const aiSeen = new Map<string, number>(); // phrases already put to the AI (not asked twice within a few minutes)

type ExactMatch = { book: number; chapter: number; verse: number; bookName: string; confidence: "high" | "medium" };
type AiJob = { phrase: string; exact: ExactMatch | null; many: boolean };
const aiQueue: AiJob[] = [];
let aiRunning = false;

async function matchQuote(phrase: string, isFinal = false) {
  if (!bridge || state.status === "off") return;
  // A lookup is still running: remember the newest words and look them up the moment it finishes (don't drop them).
  if (quoteBusy) {
    quoteQueued = phrase;
    quoteQueuedFinal = quoteQueuedFinal || isFinal;
    return;
  }
  quoteBusy = true;
  lastQuote = phrase;
  lastQuoteFinal = isFinal;
  try {
    const res = await fetch(`${API_URL}/api/present/bibles/${encodeURIComponent(bridge.versionId)}/match?q=${encodeURIComponent(phrase)}`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    const { matches, hint } = (await res.json()) as { matches: ExactMatch[]; hint?: boolean };
    const m = matches?.[0] ?? null;
    const many = (matches?.length ?? 0) > 1;
    const cued = CUE.test(phrase) || Date.now() - lastCueAt < 9000;
    // The AI is asked once a sentence is finished, when the exact match is missing or only "medium", and the preacher
    // sounded like they were quoting (a cue like "the Bible says", or many of the words belong to one verse).
    const askAi = state.aiParaphrase && isFinal && (!m || m.confidence !== "high") && (cued || Boolean(hint) || Boolean(m));
    dbg("quote", JSON.stringify({ phrase, exact: m ? `${m.bookName} ${m.chapter}:${m.verse} ${m.confidence}` : null, hint, cued, askAi }));
    if (askAi) {
      aiQueue.push({ phrase, exact: m, many });
      if (aiQueue.length > 3) aiQueue.shift();
      void drainAi(); // runs on its own, so a slow AI never holds up the next lookup
      return;
    }
    if (!m) return;
    // With the AI on, a medium exact match waits for the finished sentence (and the AI's say) rather than showing on a half sentence.
    if (state.aiParaphrase && m.confidence !== "high" && !isFinal) return;
    deliverExact(m, many, phrase);
  } catch {
    // a missed quote is not worth an error
  } finally {
    quoteBusy = false;
    const next = quoteQueued;
    const nextFinal = quoteQueuedFinal;
    quoteQueued = "";
    quoteQueuedFinal = false;
    if (next && next !== lastQuote) void matchQuote(next, nextFinal);
  }
}

function deliverExact(m: ExactMatch, many: boolean, phrase: string) {
  const sug = makeSuggestion(m.book, m.chapter, m.verse, m.verse, m.bookName, "quote", m.confidence, many ? "quoted words — similar verses exist, check it" : "quoted words — no reference was given", phrase);
  deliver({ ...sug, confidence: many ? "medium" : m.confidence });
}

// Questions to the AI go one at a time, in order. If it finds nothing, the exact (medium) match - if there was one - is offered.
async function drainAi() {
  if (aiRunning) return;
  aiRunning = true;
  try {
    while (aiQueue.length && bridge && state.status !== "off") {
      const job = aiQueue.shift()!;
      const found = await askParaphrase(job.phrase);
      if (isOff()) break;
      if (found.length) for (const f of found) deliver(makeSuggestion(f.book, f.chapter, f.verse, f.verseEnd, f.bookName, "paraphrase", "medium", f.reason ? `AI: ${f.reason}` : "AI match — said in the preacher’s own words", job.phrase));
      else if (job.exact) deliverExact(job.exact, job.many, job.phrase);
    }
  } finally {
    aiRunning = false;
  }
}

// The AI-assisted fallback: the server finds the closest verses by words, the AI picks the one being paraphrased, and
// the server checks it really exists in this Bible.
async function askParaphrase(phrase: string): Promise<{ book: number; chapter: number; verse: number; verseEnd: number; bookName: string; reason: string }[]> {
  const key = norm(phrase);
  if (!bridge || Date.now() - (aiSeen.get(key) ?? 0) < 5 * 60_000) return [];
  aiSeen.set(key, Date.now());
  try {
    const res = await fetch(`${API_URL}/api/present/bibles/${encodeURIComponent(bridge.versionId)}/paraphrase`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ phrase }), cache: "no-store" });
    if (!res.ok) return [];
    const r = (await res.json()) as { matches?: { book: number; chapter: number; verse: number; verseEnd: number; bookName: string; reason: string }[]; available?: boolean; reason?: string };
    if (r.available === false) {
      const why = r.reason === "credits" ? "The AI is out of credit, so paraphrases aren’t being spotted." : r.reason === "busy" ? "The AI is busy right now." : r.reason === "no-key" ? "The server has no AI key, so paraphrases can’t be spotted." : "The AI couldn’t be reached.";
      if (state.aiNote !== why) set({ aiNote: why });
      return [];
    }
    if (state.aiNote) set({ aiNote: "" });
    dbg("paraphrase", phrase, JSON.stringify(r.matches));
    return r.matches ?? [];
  } catch {
    return [];
  }
}

// ---- controls -------------------------------------------------------------------------------------------------------

export function dismiss(id: string) {
  const t = cardTimers.get(id);
  if (t) clearTimeout(t);
  cardTimers.delete(id);
  if (state.suggestions.some((s) => s.id === id)) set({ suggestions: state.suggestions.filter((s) => s.id !== id) });
}

export async function accept(id: string, how: "live" | "stage") {
  const s = state.suggestions.find((x) => x.id === id) ?? state.recent.find((r) => r.id === id)?.suggestion;
  if (!s) return;
  const slide = await slideOf(s);
  if (slide) (how === "live" ? bridge?.onLive : bridge?.onStage)?.(slide);
  dismiss(id);
}

export function setEngine(engineId: EngineId) {
  if (state.engine === engineId) return;
  const was = state.status !== "off";
  stop();
  set({ engine: engineId, error: "" });
  save();
  if (was) void start();
}
export function setAiParaphrase(aiParaphrase: boolean) {
  set({ aiParaphrase, aiNote: "" });
  save();
}
export function setMode(mode: ListenMode) {
  set({ mode });
  save();
}
export function setDevice(deviceId: string) {
  const was = state.status !== "off";
  set({ deviceId });
  save();
  if (was) {
    stop();
    void start();
  }
}

// ---- carrying on after a refresh ----------------------------------------------------------------------------------------

// While it is on, the time is noted every few seconds. If the page is refreshed (or the app reopened) soon after, listening
// starts again by itself: the microphone is asked for without a click, and if the browser won't allow that the error says so.
const ON_KEY = "present-listen-on";
let beat: ReturnType<typeof setInterval> | null = null;
function remember(on: boolean) {
  if (beat) clearInterval(beat);
  beat = null;
  try {
    if (!on) return localStorage.removeItem(ON_KEY);
    const note = () => localStorage.setItem(ON_KEY, String(Date.now()));
    note();
    beat = setInterval(note, 5000);
  } catch {}
}
let resumed = false;
export function resumeListening() {
  if (resumed || typeof window === "undefined") return;
  resumed = true;
  try {
    const at = Number(localStorage.getItem(ON_KEY));
    if (at && Date.now() - at < 3 * 60_000 && state.status === "off") void start();
    else localStorage.removeItem(ON_KEY);
  } catch {}
}

export async function start() {
  hydrate();
  if (state.status !== "off" && state.status !== "error") return;
  stopEngine();
  buffer = "";
  interim = "";
  bufferStart = 0;
  spots.clear();
  set({ status: "starting", error: "", transcript: "", progress: 0, progressLabel: "" });
  // Build the quote index ahead of time so the first spoken quote isn't the slow one.
  if (bridge) void fetch(`${API_URL}/api/present/bibles/${encodeURIComponent(bridge.versionId)}/warm`, { method: "POST", headers: authHeaders() }).catch(() => {});

  const hooks = {
    onTranscript,
    onReady: () => {
      set({ status: "listening", reconnecting: false, progress: 0, progressLabel: "" });
      remember(true);
    },
    onStatus: (reconnecting: boolean) => state.status !== "off" && set({ reconnecting }),
    onError: (message: string, fatal?: boolean) => {
      if (fatal) {
        stopEngine();
        set({ status: "error", reconnecting: false, error: message, transcript: "" });
        remember(false);
      }
    },
    onProgress: (pct: number, label: string) => set({ status: "loading", progress: pct, progressLabel: label }),
  };

  if (state.engine === "server") engine = startServerEngine({ deviceId: state.deviceId || undefined, ...hooks });
  else engine = startDeviceEngine({ deviceId: state.deviceId || undefined, ...hooks });
}

function stopEngine() {
  engine?.stop();
  engine = null;
  if (quoteTimer) clearTimeout(quoteTimer);
  for (const e of spots.values()) if (e.timer) clearTimeout(e.timer);
}

export function stop() {
  aiQueue.length = 0;
  stopEngine();
  spots.clear();
  set({ status: "off", reconnecting: false, transcript: "", progress: 0, progressLabel: "", error: "" });
  remember(false);
}

export function setHeardOpen(heardOpen: boolean) {
  set({ heardOpen });
}

export function clearRecent() {
  set({ recent: [] });
}

export const engineInfo = (): { id: EngineId; label: string; blurb: string; unavailable: string }[] => [
  { id: "server", label: "Server — most accurate", blurb: "Your audio goes to this app’s server and on to Deepgram, which copes best with accents and noisy rooms. Needs the server’s speech key.", unavailable: "" },
  { id: "device", label: "On this device — private", blurb: "Everything is understood right here, with no audio leaving the computer and no internet needed once it is set up (a one-time download of about 40 MB). A little less accurate on difficult audio.", unavailable: "" },
];
export { isElectron };
