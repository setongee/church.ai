export type SessionStatus = 'live' | 'ended';

export interface SessionSummary {
  overview: string;
  topics: string[];
  keyPoints: string[];
  scriptures: string[];
  declarations: string[];
}

export interface CarouselSlide {
  title: string;
  body: string;
}

export interface Service {
  _id: string;
  name: string;
  date?: string | null; // the day of the service, shown on the team's calendar
  sessionCount?: number; // sessions in this service (set by the list endpoint)
  portraitTemplateUrl?: string;
  landscapeTemplateUrl?: string;
  createdAt: string;
}

export interface Session {
  _id: string;
  service: string | Service;
  title: string;
  preacher: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  audioUrl?: string;
  summary?: SessionSummary;
  carousel?: CarouselSlide[];
  createdAt: string;
}

export interface TranscriptSegment {
  _id: string;
  session: string;
  text: string;
  isFinal: boolean;
  // Position in the recording (uploaded audio); live segments only have createdAt.
  startMs?: number;
  endMs?: number;
  createdAt: string;
}

export interface Quote {
  _id: string;
  session: string;
  text: string;
  sourceText?: string;
  imagePrompt?: string;
  caption?: string;
  groupId?: string;
  customImageUrl?: string;
  exportedImageUrl?: string;
  editorState?: unknown;
  instagramMediaId?: string;
  instagramPermalink?: string;
  instagramPublishedAt?: string;
  createdAt: string;
  sessionTitle?: string;
  sessionPreacher?: string;
}

export interface PublishQueue {
  session: Session;
  quotes: Quote[];
}

export type InsightType = 'keyPoint' | 'topic' | 'scripture' | 'declaration';

export interface Insight {
  _id: string;
  session: string;
  type: InsightType;
  text: string;
  reference?: string;
  // Only set for a keyPoint that's a detected enumerated list - `text` is the list's title and
  // `items` are its ordered points.
  items?: string[];
  groupId?: string;
  createdAt: string;
}

export interface ChatMessage {
  _id: string;
  session: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface SessionDetail {
  session: Session;
  transcript: TranscriptSegment[];
  quotes: Quote[];
  insights: Insight[];
  chatMessages: ChatMessage[];
}

export interface ServiceDetail {
  service: Service;
  sessions: Session[];
}

export interface ServiceQuotes {
  service: Service;
  quotes: Quote[];
}

export type DesignSource = 'blank' | 'quote' | 'post';

export interface Design {
  _id: string;
  // Standalone studio designs have no session; list responses populate it as { _id, title }.
  session?: string | { _id: string; title: string } | null;
  title: string;
  source: DesignSource;
  sourceId?: string;
  text: string;
  width: number;
  height: number;
  editorState?: Record<string, unknown>;
  backgroundUrl?: string;
  exportedImageUrl?: string;
  // Tagged for the Present screen (16:9 slides + their animations show up in Present > Media).
  presentation?: boolean;
  imagePrompt?: string;
  caption?: string;
  generatedImages?: string[];
  instagramMediaId?: string;
  instagramPermalink?: string;
  instagramPublishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleFontMeta {
  family: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
  weights: number[];
  italicWeights: number[];
  popularity: number;
}

export interface Minister {
  _id: string;
  name: string;
  title: string;
  imageUrl: string;
}

export interface Brand {
  hiddenTemplates?: string[];
  _id: string;
  churchName: string;
  tagline: string;
  logoUrl: string;
  logoLightUrl: string;
  pastorName: string;
  pastorTitle: string;
  pastorImageUrl: string;
  ministers?: Minister[];
  address: string;
  serviceTimes: string;
  outroCta: string;
  website: string;
  phone: string;
  email: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  socials: { instagram: string; facebook: string; youtube: string; x: string; tiktok: string };
  primaryColor: string;
  accentColor: string;
}

export interface SavedTemplate {
  _id: string;
  // set when this is an edited version of a built-in template
  baseId?: string;
  name: string;
  kind: 'quote' | 'excerpt' | 'title' | 'give';
  width: number;
  height: number;
  editorState: Record<string, unknown>;
  thumb?: string;
  // The same template tuned for other canvas sizes (the fields above are its primary size).
  variants?: { width: number; height: number; editorState: Record<string, unknown>; thumb?: string }[];
  updatedAt: string;
}

export type ReelStatus = 'draft' | 'queued' | 'rendering' | 'done' | 'error';

export interface Reel {
  _id: string;
  full?: boolean;
  session: string;
  order: number;
  headline: string;
  takeaway: string;
  startSec: number;
  endSec: number;
  status: ReelStatus;
  progress: number;
  error?: string;
  videoUrl?: string;
  clipUrl?: string;
  template?: string;
  options?: Partial<ReelOptions>;
  // Length once speed and pause-cutting are applied (server-calculated), and of the last render.
  plannedSec?: number;
  // Whole video: speech + echo tail + closing card.
  videoSec?: number;
  durationSec?: number;
  instagramPermalink?: string;
  instagramPublishedAt?: string;
  renderedAt?: string;
}

export interface ReelTheme {
  layout: string;
  bg: string;
  bg2: string;
  text: string;
  accent: string;
  accentText: string;
  font: string;
  backgroundImageUrl: string;
  overlay: number;
  showLogo: boolean;
  showChurch: boolean;
  showHeadline: boolean;
  showSpeaker: boolean;
  showSessionTitle: boolean;
  showWaveform: boolean;
  showProgress: boolean;
  footerText: string;
}

export interface ReelTemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  theme: ReelTheme;
}

export interface ReelTemplateCatalog {
  templates: ReelTemplateInfo[];
  layouts: { id: string; label: string }[];
  fonts: { id: string; label: string }[];
}

export interface TimelineWord {
  i: number;
  w: string;
  s: number;
  e: number;
}

export interface ServiceSection {
  _id?: string;
  title: string;
  summary?: string;
  startSec: number;
  endSec: number;
}

export interface AudioInfo {
  hasTranscript: boolean;
  durationSec: number;
  sections: ServiceSection[];
}

export interface CompilationSegment {
  _id?: string;
  headline: string;
  takeaway: string;
  startSec: number;
  endSec: number;
}

export type CompilationKind = 'key-points' | 'top-moments' | 'custom';

export interface Compilation {
  _id: string;
  session: string;
  title: string;
  kicker: string;
  kind: CompilationKind;
  prompt: string;
  template: string;
  options?: Partial<ReelOptions>;
  targetSec?: number;
  plannedSec?: number;
  videoSec?: number;
  durationSec?: number;
  instagramPermalink?: string;
  instagramPublishedAt?: string;
  segments: CompilationSegment[];
  status: ReelStatus;
  progress: number;
  error?: string;
  videoUrl?: string;
  renderedAt?: string;
}

export type ShowKey =
  | 'showLogo'
  | 'showChurch'
  | 'showHeadline'
  | 'showSpeaker'
  | 'showSessionTitle'
  | 'showWaveform'
  | 'showProgress';

export type OutroStyleId = 'thanks' | 'script' | 'bold' | 'glass' | 'info' | 'media';

// Per-reel / per-merged-video customisation (text overrides, sizes, switches, sound).
export interface ReelOptions {
  texts: { churchName: string; serviceTitle: string; speaker: string; footerText: string };
  sizes: { headline: number; captions: number; info: number };
  show: Partial<Record<ShowKey, boolean>>;
  pace: { speed: number; trimPauses: boolean; maxPause: number; finishSentence: boolean; echo: boolean };
  outro: { enabled: boolean; seconds: number; style: OutroStyleId; thanks: string; linkText: string; bg: string; accent: string; mediaUrl: string; mediaType: 'image' | 'video'; mediaSec: number; mediaOverlay: boolean; cta: string; serviceTimes: string; address: string; follow: string };
  writing: { enabled: boolean; volume: number };
  music: { trackId: string; volume: number; fadeIn: number; fadeOut: number; startSec: number; duck: boolean; build: boolean };
}

export interface MusicTrack {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  url: string;
  // Where in the track playback starts by default (skips a quiet intro).
  startSec: number;
  // Attribution text required by the track's licence; empty for uploads.
  credit: string;
}

export interface PhotoTemplate {
  id: string;
  name: string;
  description: string;
  palette: { bg: string; bg2: string; text: string; accent: string; accentText: string; font: string; tintA: string; tintB: string };
}

export interface CarouselLayoutInfo {
  id: string;
  label: string;
  photos: number;
}

export interface LowerThirdInfo {
  id: string;
  label: string;
  hint: string;
}

export interface LowerThird {
  style: string;
  title: string;
  subtitle: string;
  left: string;
  right: string;
}

export interface PhotoEnhancement {
  id: string;
  label: string;
  hint: string;
}

export interface PhotoSlide {
  _id?: string;
  layout: string;
  images: string[];
  title: string;
  subtitle: string;
  // Length of this slide's video in seconds.
  lengthSec: number;
}

export interface PhotoReel {
  _id: string;
  title: string;
  template: string;
  images: { _id: string; url: string; originalUrl?: string; enhancedWith?: string }[];
  intro: { enabled: boolean; title: string; subtitle: string };
  lengthSec: number;
  // Seconds each photo is on screen (length divided by the number of photos).
  photoSec?: number;
  colors: { accent: string; tintA: string; tintB: string };
  lowerThird?: LowerThird;
  options?: Partial<ReelOptions>;
  status: ReelStatus;
  progress: number;
  error?: string;
  videoUrl?: string;
  durationSec?: number;
  videoSec?: number;
  instagramPermalink?: string;
  instagramPublishedAt?: string;
  carousel: { slides: PhotoSlide[]; renderedUrls: string[]; renderedAt?: string; status?: ReelStatus | 'idle'; progress?: number; error?: string };
  warnings?: string[];
}

export interface ImageAsset {
  _id: string;
  url: string;
  kind: 'upload' | 'ai' | 'lower-third';
  name: string;
  prompt: string;
  createdAt: string;
}

export interface CarouselPostSlide {
  _id: string;
  kind: 'design' | 'image' | 'video';
  design?: string;
  owned?: boolean;
  imageUrl?: string;
  videoUrl?: string;
  label: string;
  // The design's current state (design slides only), attached by the server.
  designInfo?: { _id: string; title: string; width: number; height: number; exportedImageUrl?: string; updatedAt: string; text?: string; editorState?: Record<string, unknown> } | null;
}

export interface CarouselPost {
  _id: string;
  title: string;
  session?: string;
  width: number;
  height: number;
  caption: string;
  slides: CarouselPostSlide[];
  savedAsRecipe: boolean;
  recipe?: { source: string; count: number; templateId: string; coverTemplateId?: string; cover: boolean; closing: boolean };
  coverUrl?: string;
  instagramPermalink?: string;
  instagramPublishedAt?: string;
  updatedAt: string;
}

export interface NotesScripture {
  ref: string;
  text: string;
  quoted: boolean;
  use?: string;
  verified?: boolean;
}

export interface NotesPoint {
  text: string;
  refs: string[];
}

export interface NotesSection {
  heading: string;
  summary: string;
  points: NotesPoint[];
  pullQuote: string;
}

export type PlanKind = 'read' | 'pray' | 'reflect' | 'act' | 'share' | 'memorize' | 'review';

export interface NotesDay {
  day: string;
  date: string;
  title: string;
  kind: PlanKind;
  action: string;
  scripture: string;
}

// The written study version of a message (see the backend's MessageNotes model).
export interface MessageNotes {
  _id: string;
  session: string;
  title: string;
  preacher: string;
  date: string;
  translation: 'kjv' | 'web';
  hook: string;
  bigIdea: string;
  scriptures: NotesScripture[];
  sections: NotesSection[];
  closing: string;
  prayerPoints: { text: string; include: boolean }[];
  furtherReading: { ref: string; why: string }[];
  plan: { theme: string; target: string; days: NotesDay[] };
  messageLink: string;
  coverMode: 'text' | 'image';
  coverImageUrl: string;
  coverPrompt: string;
  fonts: { head: string; body: string };
  endInfo: { serviceTimes: string; venue: string; contact: string; note: string };
  updatedAt: string;
}

// Audio Lab: pieces of a message stitched into one audio.
export type AudioMergeStyle = 'viral' | 'story' | 'highlights';
export type AudioMergeStatus = 'planning' | 'reviewing' | 'rendering' | 'done' | 'error';

export interface AudioMergeSegment {
  _id: string;
  startSec: number;
  endSec: number;
  role: string;
  headline: string;
  why: string;
  text: string;
}

export interface AudioMerge {
  _id: string;
  // Populated with title/preacher in listings.
  session: string | { _id: string; title: string; preacher: string; service?: string };
  title: string;
  prompt: string;
  style: AudioMergeStyle;
  targetSec: number;
  summary: string;
  review: string;
  segments: AudioMergeSegment[];
  status: AudioMergeStatus;
  stage: string;
  error?: string;
  audioUrl?: string;
  durationSec?: number;
  createdAt: string;
}
