import { useCallback, useEffect, useState } from "react";
import { getSocket } from "./socket";
import { authHeaders, handleUnauthorized } from "./auth";
import { afterMutation } from "./cache";
import { getDeviceId } from "./deviceId";
import { draftEnabled, draftRequest, localUrl, PASS, stageForOutput } from "./draft";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ---- display state (shared with the output screen over the socket) ---------------------------

// A highlighted stretch of a scripture's text (character offsets into `text`).
export interface Highlight {
  start: number;
  end: number;
  color: string;
}

export const HIGHLIGHT_COLORS = ["#fde047", "#fdba74", "#86efac", "#7dd3fc", "#f9a8d4"];

export interface ScripturePart {
  reference: string;
  version: string;
  text: string;
  highlights?: Highlight[];
}

// Key points shown beside the scripture ("split screen"). One page = one slide of points; several pages
// make a slide show you step through. The scripture on the right can change without touching these.
export interface SplitPage {
  heading?: string;
  points: string[];
}
export interface SplitDeck {
  on: boolean;
  title?: string;
  pages: SplitPage[];
  index: number;
}

// Text effects for song slides (modern church-presentation motion). The CSS lives in globals.css (.fx-*).
export type EffectId = "pulse" | "glow" | "neon" | "outline" | "shimmer" | "float" | "rise" | "wave";
export type EffectSpeed = "slow" | "normal" | "fast";
export interface TextEffect {
  id: EffectId;
  speed?: EffectSpeed;
  color?: string; // glow / outline / highlight colour
}
export const TEXT_EFFECTS: { id: EffectId; label: string; hint: string }[] = [
  { id: "pulse", label: "Pulse", hint: "The text gently swells and settles" },
  { id: "glow", label: "Pulse glow", hint: "A soft glow that breathes" },
  { id: "neon", label: "Neon", hint: "Glowing outline, like a neon sign" },
  { id: "outline", label: "Outline grow", hint: "An outline that grows out and back" },
  { id: "shimmer", label: "Shimmer", hint: "A light sweeps across the words" },
  { id: "float", label: "Float", hint: "The text drifts up and down" },
  { id: "rise", label: "Line rise", hint: "Lines rise in one after another" },
  { id: "wave", label: "Wave", hint: "Letters ripple like a wave" },
];
export const EFFECT_SPEEDS: { id: EffectSpeed; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];
export const EFFECT_COLORS = ["#fde68a", "#ffffff", "#7dd3fc", "#f9a8d4", "#86efac", "#fb923c"];

// The looks an announcement can have on screen. Rendered by components/present/AnnouncementView.tsx.
export type AnnouncementTemplateId = "classic" | "bold" | "split" | "glass" | "spotlight" | "poster" | "lower" | "ticket" | "editorial" | "wave";
export const ANNOUNCEMENT_TEMPLATES: { id: AnnouncementTemplateId; label: string; hint: string; accent: string }[] = [
  { id: "classic", label: "Classic", hint: "Plain and clear", accent: "#ea580c" },
  { id: "bold", label: "Bold statement", hint: "Huge uppercase headline", accent: "#f97316" },
  { id: "split", label: "Split photo", hint: "Picture one side, words the other", accent: "#14b8a6" },
  { id: "glass", label: "Glass card", hint: "Frosted card on colour", accent: "#8b5cf6" },
  { id: "spotlight", label: "Spotlight", hint: "Dark stage, glowing title", accent: "#facc15" },
  { id: "poster", label: "Poster", hint: "Editorial, big and airy", accent: "#e11d48" },
  { id: "lower", label: "Lower third", hint: "Picture with a caption bar", accent: "#f59e0b" },
  { id: "ticket", label: "Event ticket", hint: "Looks like an event pass", accent: "#ec4899" },
  { id: "editorial", label: "Editorial", hint: "Elegant serif, lots of space", accent: "#92400e" },
  { id: "wave", label: "Gradient wave", hint: "Vivid gradient with waves", accent: "#ffffff" },
];

export type Slide =
  | ({ kind: "scripture" } & ScripturePart)
  // Two scriptures side by side: the same verse in two versions, or two different passages.
  | { kind: "scripture2"; left: ScripturePart; right: ScripturePart }
  | { kind: "song"; title: string; label?: string; text: string; effect?: TextEffect; tr?: TranslationLook }
  // `variant: "prayer"` shows the words in the scripture style (no title); `scene` is the prayer template's look, applied when it goes live.
  | { kind: "text"; title?: string; text: string; imageUrl?: string; background?: Background; layout?: AnnouncementTemplateId; kicker?: string; accent?: string; variant?: "prayer"; scene?: TemplateScene }
  | { kind: "image"; url: string } // pictures and GIFs
  | { kind: "video"; url: string; loop?: boolean; muted?: boolean }
  | { kind: "quote"; text: string; attribution?: string; background?: Background }
  // The animated "Ministering" speaker promo (logo + the minister's cut-out photo + name).
  // The "Offering and Tithe" livestream overlay (account bar + phone panel).
  // The "Welcome to Church" holding screen (photo carousel + scrolling line). Runs continuously.
  | { kind: "welcome"; script?: string; main?: string; badgeTop?: string; badgeNum?: string; badgeColor?: string; marquee?: string; logoUrl?: string; bgUrl?: string; photos?: string[]; speed?: number; logoGap?: number; marqueeGap?: number; scriptFont?: string; mainFont?: string; badgeFont?: string; marqueeFont?: string }
  | { kind: "giving"; accountNo: string; accountName: string; bankName?: string; heading?: string; logoUrl?: string; c1?: string; c2?: string; c3?: string; hi?: string; loop?: boolean }
  | { kind: "ministering"; template?: string; name: string; logoUrl?: string; photoUrl?: string; word?: string; gap?: number; titleColor?: string; nameColor?: string; pillColor?: string; titleScale?: number; titleSpacing?: number; nameScale?: number; loop?: boolean };

export type Background =
  | { type: "gradient"; value: string }
  | { type: "color"; value: string }
  | { type: "image"; value: string }
  | { type: "video"; value: string };

// How a picture/video is framed on screen: "fit" shows all of it, "fill" crops to fill, "stretch" distorts
// to the frame, "zoom" fills and slowly pushes in.
export type ImageFit = "contain" | "cover" | "stretch" | "zoom";

// Where the text sits on the 1920x1080 screen. null = the normal full-screen layout.
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FRAME_MIN = { w: 360, h: 140 };
export const FRAME_PRESETS: { id: string; label: string; frame: Frame | null }[] = [
  { id: "full", label: "Full screen", frame: null },
  { id: "lower", label: "Lower third", frame: { x: 0, y: 730, w: 1920, h: 350 } },
  { id: "lower-inset", label: "Lower third (inset)", frame: { x: 120, y: 780, w: 1680, h: 250 } },
  { id: "top", label: "Top bar", frame: { x: 0, y: 0, w: 1920, h: 260 } },
  { id: "left", label: "Left panel", frame: { x: 60, y: 60, w: 900, h: 960 } },
  { id: "right", label: "Right panel", frame: { x: 960, y: 60, w: 900, h: 960 } },
  { id: "center", label: "Centre box", frame: { x: 360, y: 240, w: 1200, h: 600 } },
];

// What the frame itself is filled with (null = see-through).
export const FRAME_FILLS: { name: string; bg: Background | null }[] = [
  { name: "See-through", bg: null },
  { name: "Dark glass", bg: { type: "color", value: "rgba(0,0,0,0.72)" } },
  { name: "Solid dark", bg: { type: "color", value: "#111827" } },
  { name: "Orange", bg: { type: "color", value: "#ea580c" } },
  { name: "Deep blue", bg: { type: "gradient", value: "linear-gradient(90deg,#0c4a6e,#1e3a8a)" } },
  { name: "White", bg: { type: "color", value: "#ffffff" } },
];

export interface PresentStyle {
  align: "left" | "center";
  frame: Frame | null;
  frameBg: Background | null;
  scale: number;
  font: string;
  weight: number;
  imageFit: ImageFit;
  quoteLayout: string; // see QUOTE_LAYOUTS
  // The announcement look used for announcements that don't pick one themselves (set by a wrapper).
  announcementTemplate?: AnnouncementTemplateId | "";
}

export const QUOTE_LAYOUTS = [
  { id: "classic", label: "Classic" },
  { id: "centered", label: "Centered serif" },
  { id: "bold", label: "Bold statement" },
  { id: "bar", label: "Side bar" },
  { id: "card", label: "Glass card" },
  { id: "minimal", label: "Minimal" },
  { id: "bigmark", label: "Big quote mark" },
] as const;

// The three kinds of text the screen can give its own look: scripture, songs and prayers.
export type SectionKey = "scripture" | "song" | "prayer";
export const SECTIONS: { id: SectionKey; label: string }[] = [
  { id: "scripture", label: "Scripture" },
  { id: "song", label: "Song" },
  { id: "prayer", label: "Prayer" },
];
// How one section looks: where its text sits, its fill, alignment, size, and (optionally) its own backdrop.
export interface SectionLook {
  frame: Frame | null;
  frameBg: Background | null;
  align: "left" | "center";
  scale: number;
  background?: Background | null;
}
export type SectionStyles = Partial<Record<SectionKey, SectionLook>>;
// Which section a slide belongs to (null = not one of the three: announcements, quotes, pictures...).
export function sectionOf(slide: Slide | null | undefined): SectionKey | null {
  if (!slide) return null;
  if (slide.kind === "scripture" || slide.kind === "scripture2") return "scripture";
  if (slide.kind === "song") return "song";
  if (slide.kind === "text" && slide.variant === "prayer") return "prayer";
  return null;
}

export const IMAGE_FITS: { id: ImageFit; label: string; hint: string }[] = [
  { id: "contain", label: "Fit", hint: "Show the whole picture" },
  { id: "cover", label: "Fill", hint: "Crop to fill the frame" },
  { id: "stretch", label: "Stretch", hint: "Stretch to the frame" },
  { id: "zoom", label: "Zoom", hint: "Fill, with a slow push-in" },
];

// A slide show that's playing (the server runs the timer).
export interface ShowStatus {
  name: string;
  index: number;
  total: number;
  playing: boolean;
  seconds: number;
  loop: boolean;
}

// How an alert banner looks and moves (set in the Alerts tab).
export type AlertEffect = "slide-up" | "slide-down" | "fade" | "pop" | "scroll";
export const ALERT_EFFECTS: { id: AlertEffect; label: string; hint: string }[] = [
  { id: "slide-up", label: "Slide up", hint: "Rises in from below" },
  { id: "slide-down", label: "Slide down", hint: "Drops in from above" },
  { id: "fade", label: "Fade", hint: "Fades in softly" },
  { id: "pop", label: "Pop", hint: "Springs in with a little zoom" },
  { id: "scroll", label: "Scroll", hint: "Runs across like a news ticker" },
];
export interface AlertStyle {
  effect: AlertEffect;
  position: "bottom" | "top" | "middle";
  bg: string;
  color: string;
  font: string; // "" = the app font
  weight: number;
  size: number; // text size in px on the 1920x1080 screen
  height: number; // minimum banner height in px (0 = fit the text)
  align: "left" | "center";
  uppercase: boolean;
  speed: "slow" | "normal" | "fast"; // scroll speed
}
export const DEFAULT_ALERT_STYLE: AlertStyle = { effect: "slide-up", position: "bottom", bg: "#ea580c", color: "#ffffff", font: "", weight: 700, size: 64, height: 0, align: "center", uppercase: false, speed: "normal" };
// An alert on screen: one message, or several that take turns (a slide show) every `seconds`.
export interface PresentAlert {
  id: string;
  text: string;
  texts?: string[];
  seconds?: number;
  startedAt?: number;
  style?: Partial<AlertStyle>;
}

export interface PresentState {
  rev: number;
  mode: "live" | "clear" | "black" | "logo";
  slide: Slide | null;
  background: Background;
  alert: PresentAlert | null;
  show?: ShowStatus | null;
  outputs?: number; // output windows currently open
  split?: SplitDeck | null;
  logoUrl: string;
  // "logo" = the church logo shown small in the middle; "image"/"video" = a picture, GIF or video picked
  // from Media, shown full screen.
  logoKind: "logo" | "image" | "video";
  // An animated template used as the Logo screen / as the background behind every slide.
  logoSlide?: Slide | null;
  bgSlide?: Slide | null;
  // Looks for scripture / song / prayer set by a template or a wrapper (a section without one uses `style`).
  sectionStyles?: SectionStyles | null;
  style: PresentStyle;
}

const INITIAL: PresentState = {
  rev: 0,
  mode: "clear",
  slide: null,
  background: { type: "gradient", value: "linear-gradient(135deg,#0f172a,#1e293b)" },
  alert: null,
  show: null,
  split: null,
  logoUrl: "",
  logoKind: "logo",
  logoSlide: null,
  bgSlide: null,
  sectionStyles: null,
  style: { align: "center", scale: 1, font: "", weight: 500, imageFit: "contain", quoteLayout: "classic", frame: null, frameBg: null },
};

export type PresentPatch = Partial<Omit<PresentState, "rev" | "style" | "outputs">> & { style?: Partial<PresentState["style"]> };

// Joins the shared display state. `patch` updates it for every connected output screen.
export function usePresentState(opts?: { output?: boolean }) {
  const isOutput = Boolean(opts?.output);
  const [state, setState] = useState<PresentState>(INITIAL);
  const [connected, setConnected] = useState(false);
  // Controllers: the public id of THIS device's output screens (to put in the output window's link).
  // Outputs: the one their link names (null when opened without one).
  const [outputId, setOutputId] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const link = isOutput ? new URLSearchParams(window.location.search).get("o") : null;
    if (isOutput && !link) return; // an output with no link isn't paired to any presenter
    const join = () => {
      setConnected(true);
      // A controller drives its own device's presenter; an output screen watches the one its link names.
      socket.emit("present:join", isOutput ? { out: link } : {}, (s: PresentState | null, id?: string) => {
        if (s) setState(s);
        if (id) setOutputId(id);
      });
      if (isOutput) socket.emit("present:output"); // this window is a screen, not a controller
    };
    const onState = (s: PresentState) => setState(s);
    const onDown = () => setConnected(false);
    socket.on("connect", join);
    socket.on("disconnect", onDown);
    socket.on("present:state", onState);
    if (socket.connected) join();
    else socket.connect();
    return () => {
      socket.off("connect", join);
      socket.off("disconnect", onDown);
      socket.off("present:state", onState);
    };
  }, [isOutput]);

  const patch = useCallback((p: PresentPatch) => {
    emitToScreen("present:patch", p);
    // Optimistic, so the live monitor reacts instantly; the server echo reconciles it.
    setState((s) => ({ ...s, ...p, style: { ...s.style, ...(p.style || {}) } }));
  }, []);

  return { state, patch, connected, outputId };
}

// Sends to the screen in order. A picture made on this device is first parked on the server (so a projector on another
// machine can show it) and the screen is given that address; nothing is held up when there are no such pictures.
let screenQueue: Promise<unknown> = Promise.resolve();
function emitToScreen(event: string, payload: unknown) {
  screenQueue = screenQueue
    .then(() => stageForOutput(payload))
    .catch(() => payload) // couldn't park a picture: still send the rest
    .then((p) => void getSocket().emit(event, p));
}

// ---- API --------------------------------------------------------------------------------------

// A non-admin's changes are kept on their own device and laid over what the server says (see draft.ts).
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (draftEnabled()) {
    const r = await draftRequest<T>(path, init, rawReq);
    if (r !== PASS) return r;
  }
  return rawReq<T>(path, init);
}

async function rawReq<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/present${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? { ...authHeaders(), "X-Device-Id": getDeviceId(), ...(init?.headers || {}) } : { "Content-Type": "application/json", ...authHeaders(), "X-Device-Id": getDeviceId(), ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg: string | undefined;
    try {
      msg = JSON.parse(body)?.error;
    } catch {}
    throw new Error(msg || `Request failed (${res.status})`);
  }
  if ((init?.method ?? "GET") !== "GET") afterMutation();
  return res.json() as Promise<T>;
}

export interface BibleMeta {
  id: string;
  abbr: string;
  name: string;
  lang: string;
  license: string;
  verses?: number;
  source?: string;
}
export interface BookInfo {
  n: number;
  name: string;
  chapters?: number;
}
export interface BibleVerse {
  n: number;
  text: string;
}
export interface Passage {
  book: number;
  chapter: number;
  bookName: string;
  verses: BibleVerse[];
}
export type FindResult =
  | { type: "empty" }
  | { type: "passage"; passage: Passage }
  | { type: "search"; total: number; results: { book: number; chapter: number; bookName: string; verse: number; text: string }[] };

export const listBibles = () => req<{ installed: BibleMeta[]; available: BibleMeta[]; books: BookInfo[] }>("/bibles");
export const downloadBible = (id: string) => req<BibleMeta>("/bibles/download", { method: "POST", body: JSON.stringify({ id }) });
export const removeBible = (id: string) => {
  for (const k of [...bibleCache.keys()]) if (k.includes(`:${id}`)) bibleCache.delete(k);
  return req<{ ok: boolean }>(`/bibles/${id}`, { method: "DELETE" });
};
export function importBible(file: File, name: string, abbr: string) {
  const form = new FormData();
  form.set("file", file);
  form.set("name", name);
  form.set("abbr", abbr);
  return req<BibleMeta>("/bibles/import", { method: "POST", body: form });
}
// Scripture text never changes, so chapters and book lists are kept in memory once fetched: going back to a chapter (or
// switching version and back) is instant instead of another trip to the server.
const bibleCache = new Map<string, Promise<unknown>>();
function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = bibleCache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().catch((e) => {
      bibleCache.delete(key); // a failed load must be retried next time
      throw e;
    });
    bibleCache.set(key, p);
  }
  return p;
}
export const bibleBooks = (id: string) => remember(`books:${id}`, () => req<BookInfo[]>(`/bibles/${id}/books`));
export const bibleChapter = (id: string, book: number, chapter: number) => remember(`ch:${id}:${book}:${chapter}`, () => req<Passage>(`/bibles/${id}/chapter?book=${book}&chapter=${chapter}`));
// The smart search: a plain reference opens that passage; anything else (a quote, topic, story, spoken
// reference) comes back as AI-suggested passages (with the real text) plus plain word matches.
export interface ScriptureSuggestion {
  book: number;
  chapter: number;
  bookName: string;
  from: number;
  to: number;
  reference: string;
  reason: string;
  verses: BibleVerse[];
}
export type SmartResult =
  | { type: "empty" }
  | { type: "passage"; passage: Passage }
  | {
      type: "smart";
      suggestions: ScriptureSuggestion[];
      ai: boolean;
      aiIssue?: "credits" | "unavailable" | null; // why the AI part was skipped
      keyword: { total: number; results: { book: number; chapter: number; bookName: string; verse: number; text: string }[] };
    };
export const bibleSmart = (id: string, q: string) => req<SmartResult>(`/bibles/${id}/smart?q=${encodeURIComponent(q)}`);
export const bibleFind = (id: string, q: string) => req<FindResult>(`/bibles/${id}/find?q=${encodeURIComponent(q)}`);

// A line wrapped in round brackets - "(My God)" - is a translation: it is shown smaller, under its lyric line, in its own
// look (size as a share of the lyric size, an optional colour - none = the lyrics' colour, a little dimmer - and italic).
export interface TranslationLook {
  scale: number;
  color: string;
  italic: boolean;
}
export const DEFAULT_TRANSLATION_LOOK: TranslationLook = { scale: 0.6, color: "", italic: true };
export const isTranslationLine = (line: string) => /^\(.+\)$/.test(line.trim());
export const toggleTranslationLines = (lines: string[]) => {
  const filled = lines.filter((l) => l.trim());
  const allTranslations = filled.length > 0 && filled.every(isTranslationLine);
  return lines.map((l) => (!l.trim() ? l : allTranslations ? l.trim().replace(/^\(\s*/, "").replace(/\s*\)$/, "") : isTranslationLine(l) ? l : `(${l.trim()})`));
};

export interface Song {
  _id: string;
  title: string;
  author: string;
  lyrics: string;
  category?: "song" | "hymn";
  number?: string;
  translationLook?: TranslationLook;
}
export type SongInput = Pick<Song, "title" | "author" | "lyrics" | "category" | "number" | "translationLook">;
export const listSongs = (q = "", category: "song" | "hymn" = "song") => req<Song[]>(`/songs?q=${encodeURIComponent(q)}&category=${category}`);
export const saveSong = (input: SongInput, id?: string) => req<Song>(id ? `/songs/${id}` : "/songs", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export interface SongImportResult {
  created: Song[];
  skipped: { name: string; reason: string }[];
  failed: { name: string; error: string }[];
}
export function importSongs(file: File, title: string, author: string) {
  const form = new FormData();
  form.append("files", file);
  form.append("title", title);
  form.append("author", author);
  return req<SongImportResult>("/songs/import", { method: "POST", body: form });
}
export interface LyricsResult {
  id: string;
  title: string;
  artist: string;
  source: string; // site the lyrics were read from, e.g. "genius.com"
  url: string;
  lyrics: string;
}
export interface SongFindResponse {
  guesses: { title: string; artist: string }[];
  busy: boolean;
  results: LyricsResult[];
}
export const findSongs = (q: string) => req<SongFindResponse>("/songs/find", { method: "POST", body: JSON.stringify({ q }) });
export const translateLyrics = (lyrics: string) => req<{ lyrics: string; added: number }>("/songs/translate", { method: "POST", body: JSON.stringify({ lyrics }) });
export const applyTranslationLookToAll = (look: TranslationLook) => req<{ updated: number }>("/songs/translation-look", { method: "POST", body: JSON.stringify({ look }) });
export const deleteSong = (id: string) => req<{ ok: boolean }>(`/songs/${id}`, { method: "DELETE" });

export interface Announcement {
  _id: string;
  title: string;
  body: string;
  imageUrl: string;
  template?: AnnouncementTemplateId;
  kicker?: string;
  accent?: string;
}
export type AnnouncementInput = Pick<Announcement, "title" | "body" | "imageUrl" | "template" | "kicker" | "accent">;
export const listAnnouncements = () => req<Announcement[]>("/announcements");
export const saveAnnouncement = (input: AnnouncementInput, id?: string) =>
  req<Announcement>(id ? `/announcements/${id}` : "/announcements", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export const deleteAnnouncement = (id: string) => req<{ ok: boolean }>(`/announcements/${id}`, { method: "DELETE" });

export interface MediaItem {
  _id: string;
  url: string;
  name: string;
  type: "image" | "gif" | "video";
  purpose: "media" | "background";
  createdAt?: string;
}
export const listMedia = (purpose?: MediaItem["purpose"]) => req<MediaItem[]>(`/media${purpose ? `?purpose=${purpose}` : ""}`);
export function uploadMedia(file: File, purpose: MediaItem["purpose"]) {
  const form = new FormData();
  form.set("file", file);
  form.set("purpose", purpose);
  return req<MediaItem>("/media", { method: "POST", body: form });
}
export const deleteMedia = (id: string) => req<{ ok: boolean }>(`/media/${id}`, { method: "DELETE" });

// ---- custom templates (scenes) ------------------------------------------------------------------

export interface SceneTemplate {
  _id: string;
  name: string;
  kind?: "general" | "prayer";
  sections?: SectionStyles | null;
  background: Background | null;
  frame: Frame | null;
  frameBg: Background | null;
  align: "left" | "center";
  scale: number;
}
export type SceneTemplateInput = Omit<SceneTemplate, "_id">;
export const listSceneTemplates = (kind: "general" | "prayer" = "general") => req<SceneTemplate[]>(`/scene-templates${kind === "prayer" ? "?kind=prayer" : ""}`);
export const saveSceneTemplate = (input: SceneTemplateInput, id?: string) => req<SceneTemplate>(id ? `/scene-templates/${id}` : "/scene-templates", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export const deleteSceneTemplate = (id: string) => req<{ ok: boolean }>(`/scene-templates/${id}`, { method: "DELETE" });
export const sceneOf = (t: SceneTemplate): TemplateScene => ({ layer: "background", background: t.background, style: { frame: t.frame, frameBg: t.frameBg, align: t.align, scale: t.scale }, ...(t.sections ? { sections: t.sections } : {}) });
// The look a template gives one section: its own for that section if it has one, else its default look.
export function lookFor(t: SceneTemplate, section: SectionKey): SectionLook {
  const own = t.sections?.[section];
  if (own) return { ...own, background: own.background ?? t.background ?? null };
  return { frame: t.frame, frameBg: t.frameBg, align: t.align, scale: t.scale, background: t.background ?? null };
}
// A scene's style as a look (used to give one section, e.g. a prayer, a template's look).
export const lookOfScene = (s: TemplateScene): SectionLook => ({ frame: s.style.frame ?? null, frameBg: s.style.frameBg ?? null, align: s.style.align, scale: s.style.scale, background: s.background ?? null });

// ---- service wrappers ----------------------------------------------------------------------------

// One named bundle of how a service looks and feels; applying it sets all of these at once.
export interface Wrapper {
  _id: string;
  name: string;
  scripture: string | null; // template ids (their section look for scripture / prayer / song)
  prayer: string | null;
  song: string | null;
  background: Background | null;
  font: string;
  weight: number | null;
  announcementTemplate: AnnouncementTemplateId | "";
  quoteLayout: string;
  chatSkin: string;
  layout: "classic" | "stage" | "mirror" | "";
}
export type WrapperInput = Omit<Wrapper, "_id">;
export const BLANK_WRAPPER: WrapperInput = { name: "", scripture: null, prayer: null, song: null, background: null, font: "", weight: null, announcementTemplate: "", quoteLayout: "", chatSkin: "", layout: "" };
export const listWrappers = () => req<Wrapper[]>("/wrappers");
export const saveWrapper = (input: WrapperInput, id?: string) => req<Wrapper>(id ? `/wrappers/${id}` : "/wrappers", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export const deleteWrapper = (id: string) => req<{ ok: boolean }>(`/wrappers/${id}`, { method: "DELETE" });

// What a wrapper does to the screen: its fonts, backdrop and quote/announcement looks, and a look per section built from its templates.
export function wrapperPatch(w: Wrapper, templates: SceneTemplate[]): { style: Partial<PresentStyle>; background?: Background; sectionStyles: SectionStyles | null } {
  const sectionStyles: SectionStyles = {};
  for (const s of SECTIONS) {
    const t = templates.find((x) => x._id === w[s.id]);
    if (t) sectionStyles[s.id] = lookFor(t, s.id);
  }
  return {
    style: { font: w.font || "", ...(w.weight ? { weight: w.weight } : {}), ...(w.quoteLayout ? { quoteLayout: w.quoteLayout } : {}), announcementTemplate: w.announcementTemplate || "" },
    ...(w.background ? { background: w.background } : {}),
    sectionStyles: Object.keys(sectionStyles).length ? sectionStyles : null,
  };
}

// ---- scripture box ------------------------------------------------------------------------------

export interface SavedScripture {
  _id: string;
  reference: string;
  version: string;
  text: string;
}
export const listScriptureBox = () => req<SavedScripture[]>("/scripture-box");
export const addScriptureBox = (part: Pick<ScripturePart, "reference" | "version" | "text">) => req<{ item: SavedScripture; added: boolean }>("/scripture-box", { method: "POST", body: JSON.stringify(part) });
export const deleteScriptureBox = (id: string) => req<{ ok: boolean }>(`/scripture-box/${id}`, { method: "DELETE" });

// A run of verses picked in the Scripture tab, one slide per verse, stepped through from the Batch card.
export interface ScriptureBatch {
  label: string; // "John 3:16-20"
  version: string;
  slides: Extract<Slide, { kind: "scripture" }>[];
}

// ---- slide shows -----------------------------------------------------------------------------------

export interface SlideshowQuote {
  text: string;
  attribution: string;
  background?: Background | null;
}
export interface Slideshow {
  _id: string;
  name: string;
  quotes: SlideshowQuote[];
  seconds: number;
  loop: boolean;
  closing: { enabled: boolean; text: string; subtext: string; background?: Background | null };
  background?: Background | null;
}
export type SlideshowInput = Omit<Slideshow, "_id">;
export const listSlideshows = () => req<Slideshow[]>("/slideshows");
export const saveSlideshow = (input: SlideshowInput, id?: string) => req<Slideshow>(id ? `/slideshows/${id}` : "/slideshows", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export const deleteSlideshow = (id: string) => req<{ ok: boolean }>(`/slideshows/${id}`, { method: "DELETE" });

// The slides of a show: each quote (on its own background, or the show's), then the closing slide.
export function showSlides(show: Pick<Slideshow, "quotes" | "closing" | "background">): Slide[] {
  const slides: Slide[] = show.quotes.map((q) => ({ kind: "quote", text: q.text, attribution: q.attribution || undefined, background: q.background ?? show.background ?? undefined }));
  if (show.closing.enabled && (show.closing.text.trim() || show.closing.subtext.trim())) {
    slides.push({ kind: "text", title: show.closing.text.trim() || undefined, text: show.closing.subtext.trim(), background: show.closing.background ?? show.background ?? undefined });
  }
  return slides;
}

// Slide show controls (the server plays the show, so it keeps going whatever the controller tab is doing).
export const playShow = (slides: Slide[], opts: { seconds: number; loop: boolean; name: string }) => emitToScreen("present:show", { action: "start", slides, ...opts });
export const showCommand = (action: "pause" | "resume" | "next" | "prev" | "stop") => getSocket().emit("present:show", { action });

// ---- prayers, quotes ----------------------------------------------------------------------------

export interface Prayer {
  _id: string;
  title: string;
  body: string;
  background?: Background | null;
  template?: string | null; // the prayer template whose look it uses
}
export type PrayerInput = Pick<Prayer, "title" | "body" | "background"> & { template?: string | null };
export const listPrayers = () => req<Prayer[]>("/prayers");
export const savePrayer = (input: PrayerInput, id?: string) => req<Prayer>(id ? `/prayers/${id}` : "/prayers", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export const deletePrayer = (id: string) => req<{ ok: boolean }>(`/prayers/${id}`, { method: "DELETE" });

export interface PresentQuote {
  _id: string;
  text: string;
  attribution: string;
  background?: Background | null;
}
export type PresentQuoteInput = Pick<PresentQuote, "text" | "attribution" | "background">;
export const listQuotes = () => req<PresentQuote[]>("/quotes");
export const saveQuote = (input: PresentQuoteInput, id?: string) => req<PresentQuote>(id ? `/quotes/${id}` : "/quotes", { method: id ? "PUT" : "POST", body: JSON.stringify(input) });
export const deleteQuote = (id: string) => req<{ ok: boolean }>(`/quotes/${id}`, { method: "DELETE" });

// ---- content the rest of the app has generated -----------------------------------------------------

export interface AppMediaItem {
  id: string;
  source: string;
  label: string; // "Quote graphic", "Design", "Reel", ...
  type: "image" | "video";
  url: string;
  title: string;
  createdAt?: string;
}
export interface AppTextItem {
  id: string;
  kind: string;
  label: string; // "Quote", "Key point", "Pull quote", "Prayer point", ...
  text: string;
  attribution?: string;
  context: string; // the message/session it came from
  createdAt?: string;
}
// Which message to pull sermon text from: one session, or every session of a service.
export interface AppScope {
  service: string;
  session: string; // "" = all sessions of the service
}
const qs = (q: string, scope?: AppScope) => {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (scope?.session) p.set("session", scope.session);
  else if (scope?.service) p.set("service", scope.service);
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const appMedia = (q = "") => req<AppMediaItem[]>(`/app/media${qs(q)}`);
export const appQuotes = (q = "", scope?: AppScope) => req<AppTextItem[]>(`/app/quotes${qs(q, scope)}`);
export const appPrayers = (q = "", scope?: AppScope) => req<AppTextItem[]>(`/app/prayers${qs(q, scope)}`);

export const mediaSrc = (url: string) => (url.startsWith("local://") ? localUrl(url) : url.startsWith("http") || url.startsWith("data:") ? url : `${API_URL}${url}`);

// ---- helpers ----------------------------------------------------------------------------------

// "amazing GRACE" -> "Amazing Grace" (small words stay lower-case; words with their own capitals are left alone).
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "up", "via", "with"]);
export function titleCase(input: string): string {
  const words = String(input ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let start = true;
  return words
    .map((w, i) => {
      const letters = w.replace(/[^\p{L}]/gu, "");
      const mixed = /\p{Ll}/u.test(letters.slice(1)) && /\p{Lu}/u.test(letters.slice(1));
      let out: string;
      if (mixed) out = w;
      else if (SMALL_WORDS.has(letters.toLowerCase()) && !start && i !== words.length - 1) out = w.toLowerCase();
      else out = w.toLowerCase().replace(/(^|[-–—/("“‘])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
      start = /[:–—-]$/.test(w);
      return out;
    })
    .join(" ");
}

// Blank lines split slides; a "[Chorus]" / "Verse 2:" line on its own labels the slide after it.
export function songSlides(song: Pick<Song, "title" | "lyrics"> & { translationLook?: TranslationLook }): Slide[] {
  const out: Slide[] = [];
  for (const block of song.lyrics.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l.trim() || i < a.length);
    let label: string | undefined;
    const m = /^\s*(?:\[([^\]]+)\]|([A-Za-z][A-Za-z ]{0,20}\d?)\s*:)\s*$/.exec(lines[0] || "");
    if (m) {
      label = (m[1] || m[2]).trim();
      lines.shift();
    }
    const text = lines.join("\n").trim();
    if (text) out.push({ kind: "song", title: titleCase(song.title), label, text, ...(text.split("\n").some(isTranslationLine) ? { tr: { ...DEFAULT_TRANSLATION_LOOK, ...song.translationLook } } : {}) });
  }
  return out;
}

// A prayer's blank-line-separated paragraphs are its slides. They show like scripture (just the words, no title),
// wearing the prayer template's look when it has one. The title is only for finding the prayer in the list.
export function prayerSlides(prayer: Pick<Prayer, "body" | "background">, template?: SceneTemplate | null): Slide[] {
  const blocks = prayer.body.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const scene = template ? sceneOf(template) : undefined;
  return (blocks.length ? blocks : [""]).map((text) => ({ kind: "text", text, variant: "prayer", background: template?.background ?? prayer.background ?? undefined, scene }));
}
// Prayers saved to a schedule before prayers had their own look carried a title: show them the new way too.
export function asPrayerSlide(s: Slide): Slide {
  return s.kind === "text" && !s.variant && !s.imageUrl && !s.layout ? { ...s, title: undefined, variant: "prayer" } : s;
}

export const BACKGROUND_PRESETS: { name: string; bg: Background }[] = [
  { name: "Midnight", bg: { type: "gradient", value: "linear-gradient(135deg,#0f172a,#1e293b)" } },
  { name: "Ocean", bg: { type: "gradient", value: "linear-gradient(135deg,#0c4a6e,#0e7490)" } },
  { name: "Royal", bg: { type: "gradient", value: "linear-gradient(135deg,#312e81,#6d28d9)" } },
  { name: "Ember", bg: { type: "gradient", value: "linear-gradient(135deg,#7c2d12,#ea580c)" } },
  { name: "Dusk", bg: { type: "gradient", value: "linear-gradient(135deg,#4c1d95,#be185d)" } },
  { name: "Forest", bg: { type: "gradient", value: "linear-gradient(135deg,#052e16,#166534)" } },
  { name: "Charcoal", bg: { type: "color", value: "#18181b" } },
  { name: "Black", bg: { type: "color", value: "#000000" } },
  { name: "Ivory", bg: { type: "color", value: "#f5f1e8" } },
  { name: "Green screen", bg: { type: "color", value: "#00b140" } },
];

// Text sizes are fixed, in pixels on the 1920x1080 screen, and never depend on how much text a slide has (text only steps
// down when it would overflow). A look stores
// them as a multiplier of this base (so 1 = 72 px); the controls show and set pixels.
export const BODY_PX = 72;
export const MIN_PX = 24;
export const MAX_PX = 240;
export const pxOf = (scale: number) => Math.round(scale * BODY_PX);
export const scaleOfPx = (px: number) => Math.min(MAX_PX, Math.max(MIN_PX, Math.round(px))) / BODY_PX;

// ---- schedules --------------------------------------------------------------------------------

export type ScheduleItemType = "scripture" | "song" | "announcement" | "image" | "prayer" | "quote" | "media" | "slideshow" | "template";

// A template item's scene: the template plays as the background and the text style (placement, fill,
// alignment, size) below is applied to the screen when the item is triggered.
export interface TemplateScene {
  layer: "background";
  background?: Background | null; // a custom template's own backdrop (an animated template uses the slide instead)
  style: Pick<PresentStyle, "frame" | "frameBg" | "align" | "scale">;
  sections?: SectionStyles; // looks of its own for scripture / song / prayer
}

export interface ScheduleItem {
  _id: string;
  type: ScheduleItemType;
  title: string;
  subtitle: string;
  slides: Slide[];
  // A slide show item: how it plays.
  show?: { seconds: number; loop: boolean };
  // A template item with a scene set up (see TemplateScene).
  scene?: TemplateScene;
  // The session (a named group inside the schedule) this item sits in; empty = not in one.
  session?: string;
}
// A session: a sub-schedule, e.g. "Praise" holding all the praise songs.
export interface ScheduleSession {
  _id: string;
  name: string;
  description?: string;
  color?: string; // #rrggbb; none = the next colour from SESSION_COLORS
}
// Sessions are colour-coded: each takes the next colour in turn unless it has one of its own.
export const SESSION_COLORS = ["#ea580c", "#2563eb", "#059669", "#9333ea", "#db2777", "#ca8a04", "#0891b2", "#dc2626"];
export const sessionColor = (sessions: ScheduleSession[] | undefined, id: string | undefined) => {
  const i = (sessions ?? []).findIndex((x) => x._id === id);
  return i < 0 ? "" : (sessions![i].color || SESSION_COLORS[i % SESSION_COLORS.length]);
};
export type ScheduleItemInput = Omit<ScheduleItem, "_id">;

// How the screen looks while a schedule is active.
export interface ScheduleSettings {
  wrapperId?: string; // the service wrapper applied to this schedule
  wrapperBefore?: { background?: Background; style?: PresentStyle }; // the look from before it was applied
  background?: Background;
  style?: PresentState["style"];
  logoUrl?: string;
  logoKind?: PresentState["logoKind"];
  logoSlide?: Slide | null;
  bgSlide?: Slide | null;
}

export interface ScheduleSummary {
  _id: string;
  name: string;
  count: number;
  lastUsedAt?: string | null;
  updatedAt?: string;
}
// The trigger map: "when this is clicked / goes live, do that". A source is an item or a whole session; a target is another
// item (a template item applies its scene, anything else goes live) or an action node (a background change, or a screen).
export type TriggerEvent = "stage" | "live"; // stage = when it is clicked, live = when it goes live
export type TriggerNode = { id: string; kind: "background"; background: Background } | { id: string; kind: "screen"; mode: "black" | "clear" | "logo" };
export interface TriggerLink {
  id: string;
  from: string;
  to: string;
  on: TriggerEvent;
  delay: number; // seconds
}
export interface TriggerMap {
  nodes: TriggerNode[];
  links: TriggerLink[];
  pos: Record<string, { x: number; y: number }>;
}
export const EMPTY_TRIGGER_MAP: TriggerMap = { nodes: [], links: [], pos: {} };

export interface Schedule {
  _id: string;
  name: string;
  items: ScheduleItem[];
  sessions?: ScheduleSession[];
  triggerMap?: TriggerMap;
  settings: ScheduleSettings;
}

// A service in progress: started by picking or creating a schedule, finished with "End Service".
export interface PresentSession {
  _id: string;
  schedule: string;
  scheduleName: string;
  startedAt: string;
}
export const getPresentSession = () => req<{ session: PresentSession | null }>("/session");
export const startPresentSession = (scheduleId: string) => req<{ session: PresentSession }>("/session", { method: "POST", body: JSON.stringify({ scheduleId }) });
export const switchPresentSession = (scheduleId: string) => req<{ session: PresentSession | null }>("/session", { method: "PUT", body: JSON.stringify({ scheduleId }) });
export const endPresentSession = () => req<{ session: null }>("/session", { method: "DELETE" });

export const listSchedules = () => req<ScheduleSummary[]>("/schedules");
export const getSchedule = (id: string) => req<Schedule>(`/schedules/${id}`).then((s) => ({ ...s, items: s.items.map((it) => (it.type === "prayer" ? { ...it, slides: it.slides.map(asPrayerSlide) } : it)) }));
export const createSchedule = (input: { name: string; items?: ScheduleItem[] | ScheduleItemInput[]; sessions?: ScheduleSession[]; triggerMap?: TriggerMap; settings?: ScheduleSettings }) =>
  req<Schedule>("/schedules", { method: "POST", body: JSON.stringify(input) });
export const updateSchedule = (id: string, input: Partial<Pick<Schedule, "name" | "items" | "sessions" | "triggerMap" | "settings">>) =>
  req<Schedule>(`/schedules/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteSchedule = (id: string) => req<{ ok: boolean }>(`/schedules/${id}`, { method: "DELETE" });

// Mongo-shaped ids made on the client, so a newly added item has a stable key before it's saved.
export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
