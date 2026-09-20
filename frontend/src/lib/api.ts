import type {
  ChatMessage,
  PublishQueue,
  Quote,
  Service,
  ServiceDetail,
  ServiceQuotes,
  Session,
  SessionDetail,
} from './types';

export interface QuoteWithSession {
  quote: Quote;
  session: Session;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
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
  portraitTemplate?: File | null;
  landscapeTemplate?: File | null;
}): Promise<Service> {
  const form = new FormData();
  form.set('name', input.name);
  if (input.portraitTemplate) form.set('portraitTemplate', input.portraitTemplate);
  if (input.landscapeTemplate) form.set('landscapeTemplate', input.landscapeTemplate);
  return request('/api/services', { method: 'POST', body: form });
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
