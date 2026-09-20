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
