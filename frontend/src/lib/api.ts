import { authHeaders, handleUnauthorized, withToken } from './auth';
import { afterMutation } from './cache';
import { PASS, studioDraftEnabled } from './draft';
import { studioDraftRequest } from './studioDraft';
import type {
  AudioMerge,
  AudioMergeStyle,
  MessageNotes,
  CarouselPost,
  PostMusic,
  ImageAsset,
  Brand,
  ChatMessage,
  Design,
  DesignSource,
  GoogleFontMeta,
  SavedTemplate,
  PublishQueue,
  Reel,
  AudioInfo,
  Compilation,
  CompilationKind,
  CompilationSegment,
  MusicTrack,
  CarouselLayoutInfo,
  LowerThird,
  LowerThirdInfo,
  PhotoEnhancement,
  PhotoReel,
  PhotoSlide,
  PhotoTemplate,
  ReelOptions,
  ReelTemplateCatalog,
  ReelTheme,
  ServiceSection,
  TimelineWord,
  Quote,
  Service,
  ServiceDetail,
  ServiceQuotes,
  Session,
  SessionDetail,
} from './types';

// `show` values may be null to clear an override.
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface QuoteWithSession {
  quote: Quote;
  session: Session;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Someone with only the Presenter job keeps their Image Studio work on their own device (see studioDraft.ts).
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (studioDraftEnabled()) {
    const r = await studioDraftRequest<T>(path, init, rawRequest);
    if (r !== PASS) return r;
  }
  return rawRequest<T>(path, init);
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? { ...authHeaders(), ...(init?.headers || {}) }
        : { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (res.status === 401) handleUnauthorized();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Controllers respond with { error: "human-readable message" } - surface that directly
    // instead of the raw "Request failed (400): {...}" wrapper when it parses.
    const parsedMessage = (() => {
      try {
        return JSON.parse(body)?.error;
      } catch {
        return null;
      }
    })();
    throw new Error(parsedMessage || `Request failed (${res.status}): ${body}`);
  }
  // Anything that changed data makes the cached pages stale, so they re-check.
  if ((init?.method ?? 'GET') !== 'GET') afterMutation();
  return res.json() as Promise<T>;
}

export function assetUrl(path: string): string {
  if (!path) return path;
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

// Services

export function listServices(): Promise<Service[]> {
  return request('/api/services');
}

export function getService(id: string): Promise<ServiceDetail> {
  return request(`/api/services/${id}`);
}

export function getServiceQuotes(id: string): Promise<ServiceQuotes> {
  return request(`/api/services/${id}/quotes`);
}

export function createService(input: {
  name: string;
  date?: string;
  portraitTemplate?: File | null;
  landscapeTemplate?: File | null;
}): Promise<Service> {
  const form = new FormData();
  form.set('name', input.name);
  if (input.date) form.set('date', input.date);
  if (input.portraitTemplate) form.set('portraitTemplate', input.portraitTemplate);
  if (input.landscapeTemplate) form.set('landscapeTemplate', input.landscapeTemplate);
  return request('/api/services', { method: 'POST', body: form });
}

export function updateService(id: string, input: { name?: string; date?: string | null }): Promise<Service> {
  const form = new FormData();
  if (input.name !== undefined) form.set('name', input.name);
  if (input.date !== undefined) form.set('date', input.date ?? '');
  return request(`/api/services/${id}`, { method: 'PATCH', body: form });
}

// Sessions

export function createSessionForService(
  serviceId: string,
  input: { title: string; preacher: string }
): Promise<Session> {
  return request(`/api/services/${serviceId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSession(id: string): Promise<SessionDetail> {
  return request(`/api/sessions/${id}`);
}

export function getPointScriptures(sessionId: string, points: string[]): Promise<{ refs: string[] }> {
  return request(`/api/sessions/${sessionId}/point-scriptures`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points }) });
}

export function endSession(id: string): Promise<Session> {
  return request(`/api/sessions/${id}/end`, { method: 'POST' });
}

export function postChatMessage(
  sessionId: string,
  text: string
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  return request(`/api/sessions/${sessionId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// Quotes

export function getQuote(quoteId: string): Promise<QuoteWithSession> {
  return request(`/api/quotes/${quoteId}`);
}

export function setQuoteCustomImage(quoteId: string, file: File): Promise<Quote> {
  const form = new FormData();
  form.set('image', file);
  return request(`/api/quotes/${quoteId}/custom-image`, { method: 'POST', body: form });
}

export function saveQuoteEditorExport(
  quoteId: string,
  input: { dataUrl?: string; editorState?: unknown }
): Promise<Quote> {
  return request(`/api/quotes/${quoteId}/export`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getPublishQueue(sessionId: string): Promise<PublishQueue> {
  return request(`/api/sessions/${sessionId}/publish-queue`);
}

export function updateQuoteCaption(quoteId: string, caption: string): Promise<Quote> {
  return request(`/api/quotes/${quoteId}/caption`, {
    method: 'PATCH',
    body: JSON.stringify({ caption }),
  });
}

export function regenerateQuoteCaption(quoteId: string): Promise<Quote> {
  return request(`/api/quotes/${quoteId}/caption/regenerate`, { method: 'POST' });
}

export function publishQuoteToInstagram(quoteId: string): Promise<Quote> {
  return request(`/api/quotes/${quoteId}/publish/instagram`, { method: 'POST' });
}

// Designs (image editor)

export interface DesignWithSession {
  design: Design;
  session: Session | null;
}

export function listDesigns(sessionId: string): Promise<Design[]> {
  return request(`/api/designs?session=${sessionId}`);
}

export function createDesign(input: {
  sessionId?: string;
  source?: DesignSource;
  sourceId?: string;
  text?: string;
  title?: string;
  width?: number;
  height?: number;
  copyFrom?: string;
  presentation?: boolean;
}): Promise<{ design: Design; existing: boolean }> {
  return request('/api/designs', { method: 'POST', body: JSON.stringify(input) });
}

export function getDesign(id: string): Promise<DesignWithSession> {
  return request(`/api/designs/${id}`);
}

export function patchDesign(
  id: string,
  patch: Partial<Pick<Design, 'title' | 'editorState' | 'width' | 'height' | 'caption' | 'imagePrompt' | 'backgroundUrl' | 'text' | 'presentation'>>
): Promise<Design> {
  return request(`/api/designs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteDesign(id: string): Promise<{ ok: boolean }> {
  return request(`/api/designs/${id}`, { method: 'DELETE' });
}

export function exportDesign(id: string, input: { dataUrl: string; editorState?: unknown }): Promise<Design> {
  return request(`/api/designs/${id}/export`, { method: 'POST', body: JSON.stringify(input) });
}

export function generateDesignCaption(id: string): Promise<Design> {
  return request(`/api/designs/${id}/caption/generate`, { method: 'POST' });
}

export function publishDesignToInstagram(id: string): Promise<Design> {
  return request(`/api/designs/${id}/publish/instagram`, { method: 'POST' });
}

export function uploadEditorImage(file: File, kind?: 'upload' | 'lower-third'): Promise<{ url: string; asset: ImageAsset | null }> {
  const form = new FormData();
  if (kind) form.set('kind', kind);
  form.set('image', file);
  return request('/api/editor/upload', { method: 'POST', body: form });
}

export function generateEditorImage(
  input: {
    prompt: string;
    width: number;
    height: number;
    referenceImages?: string[];
    mode?: 'background' | 'design' | 'free';
    text?: string;
    enhance?: boolean;
    quality?: 'low' | 'medium' | 'high';
    designId?: string;
  },
  signal?: AbortSignal
): Promise<{ url: string; asset: ImageAsset | null }> {
  return request('/api/editor/generate-image', { method: 'POST', body: JSON.stringify(input), signal });
}

export function listGoogleFonts(): Promise<{ fonts: GoogleFontMeta[] }> {
  return request('/api/editor/fonts');
}

export function listAllDesigns(presentationOnly = false): Promise<Design[]> {
  return request(`/api/designs?scope=all${presentationOnly ? '&presentation=1' : ''}`);
}

// Brand profile

export function getBrand(): Promise<Brand> {
  return request('/api/brand');
}

export function updateBrand(
  patch: Partial<Omit<Brand, '_id' | 'socials' | 'hiddenTemplates' | 'ministers'>> & { hiddenTemplates?: string[]; socials?: Partial<Brand['socials']>; clear?: string[] }
): Promise<Brand> {
  return request('/api/brand', { method: 'PUT', body: JSON.stringify(patch) });
}

export function uploadBrandImage(slot: 'logo' | 'logoLight' | 'pastor', file: File): Promise<Brand> {
  const form = new FormData();
  form.set('image', file);
  return request(`/api/brand/image/${slot}`, { method: 'POST', body: form });
}

export function addMinister(input: { name: string; title?: string; image?: File | null }): Promise<Brand> {
  const form = new FormData();
  form.set('name', input.name);
  if (input.title) form.set('title', input.title);
  if (input.image) form.set('image', input.image);
  return request('/api/brand/ministers', { method: 'POST', body: form });
}

export function updateMinister(id: string, input: { name?: string; title?: string; image?: File | null; clearImage?: boolean }): Promise<Brand> {
  const form = new FormData();
  if (input.name !== undefined) form.set('name', input.name);
  if (input.title !== undefined) form.set('title', input.title);
  if (input.clearImage) form.set('clearImage', 'true');
  if (input.image) form.set('image', input.image);
  return request(`/api/brand/ministers/${id}`, { method: 'PUT', body: form });
}

export function deleteMinister(id: string): Promise<Brand> {
  return request(`/api/brand/ministers/${id}`, { method: 'DELETE' });
}

// Saved templates

export type TemplatePayload = Pick<SavedTemplate, 'width' | 'height' | 'editorState'> & Partial<Pick<SavedTemplate, 'name' | 'kind' | 'thumb'>>;

export function listSavedTemplates(): Promise<SavedTemplate[]> {
  return request('/api/templates');
}

export function createSavedTemplate(input: TemplatePayload): Promise<SavedTemplate> {
  return request('/api/templates', { method: 'POST', body: JSON.stringify(input) });
}

export function updateSavedTemplate(id: string, input: Partial<TemplatePayload>): Promise<SavedTemplate> {
  return request(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteSavedTemplate(id: string): Promise<{ ok: boolean }> {
  return request(`/api/templates/${id}`, { method: 'DELETE' });
}

export function saveTemplateOverride(baseId: string, input: TemplatePayload): Promise<SavedTemplate> {
  return request(`/api/templates/override/${encodeURIComponent(baseId)}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteTemplateOverride(baseId: string): Promise<{ ok: boolean }> {
  return request(`/api/templates/override/${encodeURIComponent(baseId)}`, { method: 'DELETE' });
}

// Reels (audio highlights rendered as vertical videos)

export function importAudioSession(
  serviceId: string,
  input: { title: string; preacher: string; audio: File; mode?: 'full' | 'moments' }
): Promise<Session & { reelId?: string }> {
  const form = new FormData();
  form.set('title', input.title);
  form.set('preacher', input.preacher);
  form.set('audio', input.audio);
  if (input.mode === 'full') form.set('mode', 'full');
  return request(`/api/services/${serviceId}/import-audio`, { method: 'POST', body: form });
}

// One reel from the whole recording (no moment-picking, no cutting).
export function createFullReel(sessionId: string, input: { headline?: string; template?: string; sectionId?: string; startSec?: number; endSec?: number } = {}): Promise<Reel> {
  return request(`/api/sessions/${sessionId}/reels/full`, { method: 'POST', body: JSON.stringify(input) });
}

export function listReels(sessionId: string): Promise<Reel[]> {
  return request(`/api/sessions/${sessionId}/reels`);
}

export function generateReels(
  sessionId: string,
  input: { count: number; startSec?: number; endSec?: number; template?: string }
): Promise<Reel[]> {
  return request(`/api/sessions/${sessionId}/reels/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function renderAllReels(sessionId: string): Promise<Reel[]> {
  return request(`/api/sessions/${sessionId}/reels/render-all`, { method: 'POST' });
}

export function updateReel(
  id: string,
  patch: Partial<Pick<Reel, 'headline' | 'takeaway' | 'startSec' | 'endSec' | 'template'>> & { options?: DeepPartial<ReelOptions> }
): Promise<Reel> {
  return request(`/api/reels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function renderReel(id: string): Promise<Reel> {
  return request(`/api/reels/${id}/render`, { method: 'POST' });
}

export function deleteReel(id: string): Promise<{ ok: true }> {
  return request(`/api/reels/${id}`, { method: 'DELETE' });
}

export function applyTemplateToAllReels(sessionId: string, template: string): Promise<Reel[]> {
  return request(`/api/sessions/${sessionId}/reels/apply-template`, {
    method: 'POST',
    body: JSON.stringify({ template }),
  });
}

// Timeline: word-level transcript editing

export function getAudioInfo(sessionId: string): Promise<AudioInfo> {
  return request(`/api/sessions/${sessionId}/audio-info`);
}

export function getTimelineWords(
  sessionId: string,
  start: number,
  end: number
): Promise<{ durationSec: number; words: TimelineWord[] }> {
  return request(`/api/sessions/${sessionId}/transcript-words?start=${start}&end=${end}`);
}

export function editTimelineWords(
  sessionId: string,
  edits: { i: number; w?: string; s?: number; e?: number }[]
): Promise<{ ok: true }> {
  return request(`/api/sessions/${sessionId}/transcript-words`, {
    method: 'PATCH',
    body: JSON.stringify({ edits }),
  });
}

export function replaceTimelineWords(
  sessionId: string,
  from: string,
  to: string
): Promise<{ replaced: number }> {
  return request(`/api/sessions/${sessionId}/transcript-words/replace`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  });
}

export function getPeaks(
  sessionId: string,
  start: number,
  end: number,
  n: number
): Promise<{ peaks: number[] }> {
  return request(`/api/sessions/${sessionId}/peaks?start=${start}&end=${end}&n=${n}`);
}

export function detectSections(sessionId: string): Promise<ServiceSection[]> {
  return request(`/api/sessions/${sessionId}/sections/detect`, { method: 'POST' });
}

export function saveSections(sessionId: string, sections: ServiceSection[]): Promise<ServiceSection[]> {
  return request(`/api/sessions/${sessionId}/sections`, {
    method: 'PUT',
    body: JSON.stringify({ sections }),
  });
}

// Reel templates

export function getReelTemplates(): Promise<ReelTemplateCatalog> {
  return request('/api/reel-templates');
}

export interface TemplateInput {
  name: string;
  theme: Partial<ReelTheme>;
  // data: URI of a newly picked background image
  backgroundImage?: string;
  clearBackgroundImage?: boolean;
}

export function createReelTemplate(input: TemplateInput): Promise<{ _id: string }> {
  return request('/api/reel-templates', { method: 'POST', body: JSON.stringify(input) });
}

export function updateReelTemplate(id: string, input: TemplateInput): Promise<{ _id: string }> {
  return request(`/api/reel-templates/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteReelTemplate(id: string): Promise<{ ok: true }> {
  return request(`/api/reel-templates/${id}`, { method: 'DELETE' });
}

export function previewReelTemplate(input: {
  templateId?: string;
  theme?: Partial<ReelTheme>;
  backgroundImage?: string;
  reelId?: string;
  compilationId?: string;
  options?: DeepPartial<ReelOptions>;
  atSec?: number;
}): Promise<{ url: string; backgroundImageUrl: string }> {
  return request('/api/reel-templates/preview', { method: 'POST', body: JSON.stringify(input) });
}

// Merged reels

export function listCompilations(sessionId: string): Promise<Compilation[]> {
  return request(`/api/sessions/${sessionId}/compilations`);
}

export function generateCompilation(
  sessionId: string,
  input: {
    kind: CompilationKind;
    // Desired length of the finished video, in seconds.
    targetSec: number;
    prompt?: string;
    startSec?: number;
    endSec?: number;
    template?: string;
  }
): Promise<Compilation> {
  return request(`/api/sessions/${sessionId}/compilations/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCompilation(
  id: string,
  patch: { title?: string; template?: string; segments?: CompilationSegment[]; options?: DeepPartial<ReelOptions> }
): Promise<Compilation> {
  return request(`/api/compilations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function renderCompilation(id: string): Promise<Compilation> {
  return request(`/api/compilations/${id}/render`, { method: 'POST' });
}

export function deleteCompilation(id: string): Promise<{ ok: true }> {
  return request(`/api/compilations/${id}`, { method: 'DELETE' });
}

// Background music

export function getMusicTracks(): Promise<MusicTrack[]> {
  return request('/api/music');
}

export function uploadMusicTrack(name: string, audio: File): Promise<MusicTrack> {
  const form = new FormData();
  form.set('name', name);
  form.set('audio', audio);
  return request('/api/music', { method: 'POST', body: form });
}

export function deleteMusicTrack(id: string): Promise<{ ok: true }> {
  return request(`/api/music/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// A short real mix (voice + chosen music) from the options on screen, to judge the music by ear.
export function previewAudioMix(input: {
  reelId?: string;
  compilationId?: string;
  options: DeepPartial<ReelOptions>;
}): Promise<{ url: string }> {
  return request('/api/audio-preview', { method: 'POST', body: JSON.stringify(input) });
}

// Posts a finished video to Instagram as a Reel (publishes to the connected account).
export function publishReelToInstagram(id: string, caption: string): Promise<Reel> {
  return request(`/api/reels/${id}/publish-instagram`, { method: 'POST', body: JSON.stringify({ caption }) });
}

export function publishCompilationToInstagram(id: string, caption: string): Promise<Compilation> {
  return request(`/api/compilations/${id}/publish-instagram`, { method: 'POST', body: JSON.stringify({ caption }) });
}

// Photo reels & carousels

export function getPhotoTemplates(): Promise<{ templates: PhotoTemplate[]; layouts: CarouselLayoutInfo[]; enhancements: PhotoEnhancement[]; lowerThirds: LowerThirdInfo[] }> {
  return request('/api/photo-templates');
}

export function listPhotoReels(): Promise<PhotoReel[]> {
  return request('/api/photo-reels');
}

export function createPhotoReel(title: string): Promise<PhotoReel> {
  return request('/api/photo-reels', { method: 'POST', body: JSON.stringify({ title }) });
}

export type PhotoReelPatch = {
  title?: string;
  template?: string;
  intro?: Partial<PhotoReel['intro']>;
  lengthSec?: number;
  colors?: Partial<PhotoReel['colors']>;
  lowerThird?: Partial<LowerThird>;
  options?: DeepPartial<ReelOptions>;
  imageOrder?: string[];
};

export function updatePhotoReel(id: string, patch: PhotoReelPatch): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deletePhotoReel(id: string): Promise<{ ok: true }> {
  return request(`/api/photo-reels/${id}`, { method: 'DELETE' });
}

export function addPhotoReelPhotos(id: string, files: File[]): Promise<PhotoReel> {
  const form = new FormData();
  files.forEach((f) => form.append('photos', f));
  return request(`/api/photo-reels/${id}/photos`, { method: 'POST', body: form });
}

export function removePhotoReelPhoto(id: string, imageId: string): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/photos/${imageId}`, { method: 'DELETE' });
}

export function renderPhotoReel(id: string): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/render`, { method: 'POST' });
}

export function previewPhotoReel(id: string, draft: PhotoReelPatch, atSec: number): Promise<{ url: string }> {
  return request(`/api/photo-reels/${id}/preview`, { method: 'POST', body: JSON.stringify({ draft, atSec }) });
}

export function photoTemplatePreviews(id: string, draft: PhotoReelPatch, cachedOnly = false): Promise<{ id: string; url: string }[]> {
  return request(`/api/photo-reels/${id}/template-previews`, { method: 'POST', body: JSON.stringify({ draft, cachedOnly }) });
}

export function publishPhotoReelToInstagram(id: string, caption: string): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/publish-instagram`, { method: 'POST', body: JSON.stringify({ caption }) });
}

export function generatePhotoCarousel(id: string, slides: number): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/carousel/generate`, { method: 'POST', body: JSON.stringify({ slides }) });
}

export function savePhotoCarousel(id: string, slides: PhotoSlide[]): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/carousel`, { method: 'PUT', body: JSON.stringify({ slides }) });
}

export function renderPhotoCarousel(id: string): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/carousel/render`, { method: 'POST' });
}

// AI photo editing. The original is kept so any edit can be reverted.
export function enhancePhotoReelPhoto(id: string, imageId: string, preset: string, extra?: string): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/photos/${imageId}/enhance`, { method: 'POST', body: JSON.stringify({ preset, extra }) });
}

export function revertPhotoReelPhoto(id: string, imageId: string): Promise<PhotoReel> {
  return request(`/api/photo-reels/${id}/photos/${imageId}/revert`, { method: 'POST' });
}

export function previewOutros(input: { templateId?: string; options?: DeepPartial<ReelOptions> }): Promise<{ previews: { id: string; label: string; url: string }[] }> {
  return request('/api/outro-previews', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteService(id: string): Promise<{ ok: true; sessions: number }> {
  return request(`/api/services/${id}`, { method: 'DELETE' });
}

export function renameSession(id: string, title: string): Promise<Session> {
  return request(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
}

export function updateSessionInfo(id: string, info: { title: string; preacher: string }): Promise<Session> {
  return request(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(info) });
}

export function deleteSession(id: string): Promise<{ ok: true }> {
  return request(`/api/sessions/${id}`, { method: 'DELETE' });
}

export function uploadOutroMedia(file: File): Promise<{ url: string; type: 'image' | 'video'; sec: number }> {
  const form = new FormData();
  form.set('media', file);
  return request('/api/outro-media', { method: 'POST', body: form });
}

export type LibraryItem = {
  kind: 'reel' | 'merged' | 'photo' | 'custom';
  id: string;
  title: string;
  status: 'draft' | 'queued' | 'rendering' | 'done' | 'error';
  progress: number;
  error: string;
  videoUrl: string;
  durationSec: number | null;
  sessionId: string;
  sessionTitle: string;
  serviceName: string;
  full: boolean;
  photoCount?: number;
  thumb?: string;
  createdAt: string;
};

// Custom templates (Recap Reel...) render in the browser; the finished video is uploaded to join the library.
export function saveCustomReel(input: { title: string; template: string; video: Blob; ext: string; durationSec: number; settings: Record<string, unknown> }): Promise<{ _id: string }> {
  const form = new FormData();
  form.set('title', input.title);
  form.set('template', input.template);
  form.set('durationSec', String(input.durationSec));
  form.set('settings', JSON.stringify(input.settings));
  form.set('video', input.video, `reel.${input.ext}`);
  return request('/api/custom-reels', { method: 'POST', body: form });
}

export function deleteCustomReel(id: string): Promise<{ ok: true }> {
  return request(`/api/custom-reels/${id}`, { method: 'DELETE' });
}

export function getReelLibrary(): Promise<{ items: LibraryItem[] }> {
  return request('/api/reel-library');
}

export interface DesignEffect {
  id: string;
  label: string;
  hint: string;
}

export interface DesignAnimation {
  _id: string;
  design: string;
  effect: string;
  lengthSec: number;
  status: 'draft' | 'queued' | 'rendering' | 'done' | 'error';
  progress: number;
  error?: string;
  videoUrl?: string;
  createdAt: string;
}

export function getDesignEffects(): Promise<{ effects: DesignEffect[]; maxSec: number }> {
  return request('/api/designs/animation-effects');
}

export function listDesignAnimations(designId: string): Promise<DesignAnimation[]> {
  return request(`/api/designs/${designId}/animations`);
}

export function getDesignAnimation(id: string): Promise<DesignAnimation> {
  return request(`/api/designs/animations/${id}`);
}

export function deleteDesignAnimation(id: string): Promise<{ ok: true }> {
  return request(`/api/designs/animations/${id}`, { method: 'DELETE' });
}

export async function createDesignAnimation(
  designId: string,
  input: { effect: string; lengthSec: number; speed: number; stagger: number; loop: boolean; bgMotion: boolean },
  parts: { width: number; height: number; background: Blob; layers: { blob: Blob; x: number; y: number; w: number; h: number; kind: string; label: string }[] }
): Promise<DesignAnimation> {
  const form = new FormData();
  form.set('meta', JSON.stringify({ ...input, width: parts.width, height: parts.height, layers: parts.layers.map(({ blob: _b, ...m }) => m) }));
  form.set('background', parts.background, 'bg.png');
  parts.layers.forEach((l, i) => form.set(`layer${i}`, l.blob, `l${i}.png`));
  return request(`/api/designs/${designId}/animate`, { method: 'POST', body: form });
}

// Image bank (uploaded + AI-generated pictures, and lower-third overlays)
export function listEditorImages(kind: 'gallery' | 'lower-third'): Promise<ImageAsset[]> {
  return request(`/api/editor/images?kind=${kind}`);
}

export function deleteEditorImage(id: string): Promise<{ ok: true }> {
  return request(`/api/editor/images/${id}`, { method: 'DELETE' });
}

// Carousel posts (Instagram carousels built from designs, images and videos)

type SlideInput = { kind: 'design' | 'image' | 'video'; design?: string; owned?: boolean; imageUrl?: string; videoUrl?: string; label?: string; _id?: string };

export function listCarouselPosts(opts?: { session?: string; recipes?: boolean }): Promise<CarouselPost[]> {
  const q = new URLSearchParams();
  if (opts?.session) q.set('session', opts.session);
  if (opts?.recipes) q.set('recipes', '1');
  return request(`/api/carousels?${q.toString()}`);
}

export function createCarouselPost(input: { sessionId?: string; title?: string; width?: number; height?: number; slides?: SlideInput[]; recipe?: CarouselPost['recipe'] }): Promise<CarouselPost> {
  return request('/api/carousels', { method: 'POST', body: JSON.stringify(input) });
}

export function getCarouselPost(id: string): Promise<CarouselPost> {
  return request(`/api/carousels/${id}`);
}

export function updateCarouselPost(
  id: string,
  patch: { title?: string; caption?: string; notes?: string; music?: PostMusic | null; postAs?: 'carousel' | 'reel'; slideSeconds?: number; width?: number; height?: number; slides?: SlideInput[]; savedAsRecipe?: boolean; recipe?: CarouselPost['recipe'] }
): Promise<CarouselPost> {
  return request(`/api/carousels/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteCarouselPost(id: string): Promise<{ ok: true }> {
  return request(`/api/carousels/${id}`, { method: 'DELETE' });
}

export function addCarouselMedia(id: string, file: File): Promise<CarouselPost> {
  const form = new FormData();
  form.set('file', file);
  return request(`/api/carousels/${id}/media`, { method: 'POST', body: form });
}

export function generateCarouselPostCaption(id: string): Promise<CarouselPost> {
  return request(`/api/carousels/${id}/caption/generate`, { method: 'POST' });
}

export function publishCarouselPost(id: string): Promise<CarouselPost> {
  return request(`/api/carousels/${id}/publish/instagram`, { method: 'POST' });
}

export interface FinishedAnimation {
  _id: string;
  design: { _id: string; title: string };
  effect: string;
  lengthSec: number;
  width: number;
  height: number;
  videoUrl: string;
  createdAt: string;
}

export function listFinishedAnimations(presentationOnly = false): Promise<FinishedAnimation[]> {
  return request(`/api/designs/animations${presentationOnly ? '?presentation=1' : ''}`);
}

export function addCarouselAnimation(id: string, input: { animationId: string; index?: number; replace?: boolean }): Promise<CarouselPost> {
  return request(`/api/carousels/${id}/animation-slide`, { method: 'POST', body: JSON.stringify(input) });
}

// Message notes (study notes, prayer points and weekly plan made from a message)

export function getMessageNotes(sessionId: string): Promise<MessageNotes | null> {
  return request(`/api/sessions/${sessionId}/message-notes`);
}

export function generateMessageNotes(sessionId: string, input: { translation?: 'kjv' | 'web'; messageLink?: string }): Promise<MessageNotes> {
  return request(`/api/sessions/${sessionId}/message-notes/generate`, { method: 'POST', body: JSON.stringify(input) });
}

export function saveMessageNotes(sessionId: string, patch: Partial<Omit<MessageNotes, '_id' | 'session' | 'updatedAt'>>): Promise<MessageNotes> {
  return request(`/api/sessions/${sessionId}/message-notes`, { method: 'PUT', body: JSON.stringify(patch) });
}

export function regenerateNotesPart(sessionId: string, part: 'prayer' | 'reading' | 'plan' | 'all'): Promise<MessageNotes> {
  return request(`/api/sessions/${sessionId}/message-notes/regenerate`, { method: 'POST', body: JSON.stringify({ part }) });
}

export function lookupScripture(ref: string, translation: 'kjv' | 'web'): Promise<{ ref: string; text: string }> {
  return request(`/api/sessions/scripture/lookup?ref=${encodeURIComponent(ref)}&translation=${translation}`);
}

// Audio Lab

export function listAudioMerges(sessionId?: string): Promise<AudioMerge[]> {
  return request(`/api/audio-lab${sessionId ? `?session=${sessionId}` : ''}`);
}

export function getAudioMerge(id: string): Promise<AudioMerge> {
  return request(`/api/audio-lab/${id}`);
}

export function generateAudioMerge(sessionId: string, input: { prompt: string; style: AudioMergeStyle; targetSec: number }): Promise<AudioMerge> {
  return request(`/api/audio-lab/sessions/${sessionId}/generate`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateAudioMerge(id: string, input: { title?: string; segments?: { _id?: string; startSec?: number; endSec?: number; headline?: string }[] }): Promise<AudioMerge> {
  return request(`/api/audio-lab/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

// The transcript of a finished cut: what is said in the new audio, with times counted from the start of the cut.
export interface MergeTranscript {
  title: string;
  durationSec: number;
  precise: boolean; // false when the session had no word timings (times are then per piece)
  pieces: { index: number; headline: string; start: number; end: number; text: string }[];
  lines: { start: number; end: number; text: string; piece: number }[];
  text: string;
}
export function getAudioMergeTranscript(id: string): Promise<MergeTranscript> {
  return request(`/api/audio-lab/${id}/transcript`);
}
export function audioMergeTranscriptUrl(id: string, format: 'txt' | 'timestamped' | 'srt' | 'vtt'): string {
  return withToken(`${API_URL}/api/audio-lab/${id}/transcript?format=${format}&download=1`);
}

export function audioMergeDownloadUrl(id: string): string {
  return withToken(`${API_URL}/api/audio-lab/${id}/download`);
}

export function createReelFromAudioMerge(id: string): Promise<{ compilation: Compilation; sessionId: string }> {
  return request(`/api/audio-lab/${id}/reel`, { method: 'POST' });
}

export function deleteAudioMerge(id: string): Promise<{ ok: true }> {
  return request(`/api/audio-lab/${id}`, { method: 'DELETE' });
}

export interface LabTopic {
  label: string;
  prompt: string;
  kind: 'topic' | 'moment' | 'story' | 'scripture' | 'declaration';
}

// Hot topics and moments the AI spotted in this session's message.
export function getAudioLabSuggestions(sessionId: string, refresh = false): Promise<{ topics: LabTopic[] }> {
  return request(`/api/audio-lab/sessions/${sessionId}/suggestions${refresh ? '?refresh=1' : ''}`);
}
