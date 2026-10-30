import { authHeaders, handleUnauthorized } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/analytics${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export type RangeId = "7d" | "30d" | "90d" | "12m" | "all";
export const RANGES: { id: RangeId; label: string; short: string }[] = [
  { id: "7d", label: "Last week", short: "7 days" },
  { id: "30d", label: "Last month", short: "30 days" },
  { id: "90d", label: "Last 3 months", short: "90 days" },
  { id: "12m", label: "Last year", short: "12 months" },
  { id: "all", label: "All time", short: "all time" },
];

// ---- platform analytics ---------------------------------------------------------------------------

export interface Kpi {
  id: string;
  label: string;
  value: number;
  prev: number | null;
}
export interface PlatformOverview {
  range: RangeId;
  kpis: Kpi[];
  mix: { id: string; label: string; count: number; published: number }[];
  timeline: { date: string; created: number; published: number }[];
  bucket: "day" | "week" | "month";
  byService: { id: string; name: string; date: string | null; sessions: number; quotes: number; reels: number; published: number }[];
  totals: { services: number; servicesInRange: number };
}
export const platformOverview = (range: RangeId) => req<PlatformOverview>(`/overview?range=${range}`);

// ---- Instagram ----------------------------------------------------------------------------------

export interface HealthComponent {
  id: string;
  label: string;
  weight: number;
  score: number;
  status: "good" | "ok" | "poor";
  value: string;
  tip: string;
}
export interface Health {
  score: number;
  grade: string;
  components: HealthComponent[];
  priorities: HealthComponent[];
  strengths: string[];
  issues: string[];
  stats: { posts: number; postsPerWeek: number; avgEngagementRate: number; medianReach: number; reachRatio: number; savesSharesRate: number; reelShare: number; avgHashtags: number; bestDay: string | null; bestHour: number | null; maxGapDays: number; formats: { type: string; count: number; er: number }[] };
}
export interface IgProfile {
  username: string;
  name?: string;
  followers: number;
  following: number;
  posts: number;
  picture?: string;
}
export interface PublishedPost {
  kind: string;
  label: string;
  id: string;
  title: string;
  permalink?: string;
  publishedAt: string;
  error?: string;
  type?: string;
  thumbnail?: string;
  caption?: string;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  reach?: number;
  views?: number;
  interactions?: number;
  avgWatchSec?: number | null;
  er?: number;
  score?: number;
  grade?: string;
  limited?: boolean;
}
export interface IgOverview {
  connected: boolean;
  error?: string;
  range?: RangeId;
  profile?: IgProfile;
  account?: { reach?: number; views?: number; profile_views?: number; accounts_engaged?: number; total_interactions?: number; followersGained?: number; followerSeries?: { date: string; gained: number }[] };
  health?: Health;
  totals?: { posts: number; likes: number; comments: number; saves: number; shares: number; reach: number; avgScore: number | null };
  posts?: PublishedPost[];
}
export const igOverview = (range: RangeId, refresh = false) => req<IgOverview>(`/instagram/overview?range=${range}${refresh ? "&refresh=1" : ""}`);

export interface PostReport {
  connected: boolean;
  error?: string;
  post?: { kind: string; label: string; title: string; permalink?: string; publishedAt: string; type: string; thumbnail?: string; caption: string; likes: number; comments: number; saves: number; shares: number; reach: number; views: number; avgWatchSec: number | null };
  score?: number;
  grade?: string;
  er?: number;
  accountEr?: number;
  limited?: boolean;
  components?: { id: string; label: string; weight: number; score: number; status: "good" | "ok" | "poor"; value: string; detail: string }[];
  tips?: { title: string; detail: string }[];
  strengths?: string[];
  review?: { ai: boolean; aiIssue?: string; summary: string; whatWorked: string[]; toImprove: string[]; captionRewrite: string; nextPostIdeas: string[] } | null;
}
export const postReport = (kind: string, id: string, refresh = false) => req<PostReport>(`/instagram/posts/${kind}/${id}/report${refresh ? "?refresh=1" : ""}`);

export interface GrowthPlan {
  ai: boolean;
  aiIssue?: string;
  summary: string;
  priorities: { title: string; detail: string }[];
  contentIdeas: string[];
  captionTips: string[];
  schedule: string;
  sources: { title: string; url: string }[];
}
export const growthPlan = (range: RangeId) => req<{ connected: boolean; error?: string; plan?: GrowthPlan }>("/instagram/growth-plan", { method: "POST", body: JSON.stringify({ range }) });
