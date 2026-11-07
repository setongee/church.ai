import { authHeaders, handleUnauthorized } from "./auth";
import { afterMutation } from "./cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if ((init?.method ?? "GET") !== "GET") afterMutation();
  return body as T;
}
const post = <T>(path: string, body?: unknown) => req<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export type ContentFormat = "reel" | "post" | "carousel" | "story" | "video" | "other";
export type ContentPlatform = "instagram" | "facebook" | "youtube" | "tiktok" | "other";
export type ContentStatus = "idea" | "drafting" | "review" | "ready" | "scheduled" | "publishing" | "published" | "failed";

export interface Person {
  _id: string;
  name: string;
}
export interface LinkedTask {
  _id: string;
  title: string;
  status: "todo" | "in_progress" | "review" | "done";
  sprint: string | null;
  assignees: Person[];
}
export interface LinkedUpload {
  _id: string;
  title: string;
  kind: "video" | "image";
  posterUrl: string;
  mediaUrl: string;
  status: string;
  caption: string;
  posted: boolean;
  durationSec: number;
}
export interface ContentItem {
  _id: string;
  title: string;
  caption: string;
  format: ContentFormat;
  platform: ContentPlatform;
  status: ContentStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  campaign: string;
  notes: string;
  owners: Person[];
  task: LinkedTask | null;
  upload: LinkedUpload | null;
  instagramPermalink: string;
  error: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface UploadChoice {
  _id: string;
  title: string;
  kind: "video" | "image";
  posterUrl: string;
  mediaUrl: string;
  caption: string;
  durationSec: number;
  createdAt: string;
}

export type ContentInput = Partial<{
  title: string;
  caption: string;
  format: ContentFormat;
  platform: ContentPlatform;
  status: ContentStatus;
  scheduledAt: string | null;
  campaign: string;
  notes: string;
  owners: string[];
  upload: string | null;
  task: string | null;
}>;

export const listContent = () => req<ContentItem[]>("/api/content");
export const getContent = (id: string) => req<ContentItem>(`/api/content/${id}`);
export const createContent = (input: ContentInput) => post<ContentItem>("/api/content", input);
export const updateContent = (id: string, patch: ContentInput) => req<ContentItem>(`/api/content/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const removeContent = (id: string) => req<{ ok: boolean }>(`/api/content/${id}`, { method: "DELETE" });
export const scheduleContent = (id: string, input: { scheduledAt?: string; caption?: string }) => post<ContentItem>(`/api/content/${id}/schedule`, input);
export const unscheduleContent = (id: string) => post<ContentItem>(`/api/content/${id}/unschedule`);
export const publishContentNow = (id: string, caption?: string) => post<ContentItem>(`/api/content/${id}/publish-now`, { caption });
export const linkContentTask = (id: string, taskId: string) => post<ContentItem>(`/api/content/${id}/task`, { taskId });
export const unlinkContentTask = (id: string) => req<ContentItem>(`/api/content/${id}/task`, { method: "DELETE" });
export const listCampaigns = () => req<string[]>("/api/content/campaigns");

// Campaigns as things you manage: a name, what it is for, optional dates, and how many posts are in it.
export interface CampaignInfo {
  _id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  archived: boolean;
  posts: number;
  published: number;
  scheduled: number;
  next: string | null;
}
export interface CampaignInput {
  name?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  archived?: boolean;
}
export const listCampaignsFull = () => req<CampaignInfo[]>("/api/content/campaigns/full");
export const createCampaign = (input: CampaignInput) => post<CampaignInfo>("/api/content/campaigns", input);
export const updateCampaign = (id: string, input: CampaignInput) => req<{ ok: boolean; name: string }>(`/api/content/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(input) });
// Its posts stay (without a campaign), unless `withPosts` also deletes the ones that haven't been posted.
export const deleteCampaign = (id: string, withPosts = false) => req<{ ok: boolean; deleted?: number; kept?: number }>(`/api/content/campaigns/${id}${withPosts ? "?posts=delete" : ""}`, { method: "DELETE" });
export const draftCampaignWithAi = (input: { idea: string; name?: string }) => post<{ name: string; goal: string; angles: string[] }>("/api/content/campaigns/ai", input);
export const listAvailableUploads = (except?: string) => req<UploadChoice[]>(`/api/content/uploads${except ? `?except=${except}` : ""}`);
export const contentByUpload = (uploadId: string) => req<ContentItem | null>(`/api/content/by-upload/${uploadId}`);

// The task board is built separately and may not be there yet, so these never throw.
export interface BoardSprint {
  _id: string;
  name: string;
  status: "planned" | "active" | "completed";
  startDate?: string;
  endDate?: string;
}
export interface BoardTaskLite {
  _id: string;
  title: string;
  status: string;
  contentItem?: string | null;
}
// The board names things `id` (and a linked item is an object); this keeps the calendar's own `_id` style.
export const listSprints = () =>
  req<{ id: string; name: string; status: BoardSprint["status"]; startDate?: string; endDate?: string }[]>("/api/board/sprints")
    .then((l) => l.map((s) => ({ _id: s.id, name: s.name, status: s.status, startDate: s.startDate, endDate: s.endDate })))
    .catch(() => [] as BoardSprint[]);
export const listSprintTasks = (sprintId: string) =>
  req<{ id: string; title: string; status: string; contentItem?: { id: string } | null }[]>(`/api/board/sprints/${sprintId}/tasks`)
    .then((l) => l.map((t) => ({ _id: t.id, title: t.title, status: t.status, contentItem: t.contentItem?.id ?? null })))
    .catch(() => [] as BoardTaskLite[]);
// dueDate is a plain day, "YYYY-MM-DD".
export const createBoardTask = (input: { sprint: string; title: string; assignees: string[]; dueDate: string | null; contentItem: string; description?: string }) => post<{ id: string }>("/api/board/tasks", input).then((t) => ({ _id: t.id }));

// ---- what each format / platform / status looks like ----------------------------------------------------------------

export const FORMAT_LABEL: Record<ContentFormat, string> = { reel: "Reel", post: "Post", carousel: "Carousel", story: "Story", video: "Video", other: "Other" };
export const PLATFORM_LABEL: Record<ContentPlatform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", other: "Other" };
export const PLATFORM_SHORT: Record<ContentPlatform, string> = { instagram: "IG", facebook: "FB", youtube: "YT", tiktok: "TT", other: "··" };

export const STATUSES: { id: ContentStatus; label: string; color: string }[] = [
  { id: "idea", label: "Idea", color: "#64748b" },
  { id: "drafting", label: "Drafting", color: "#2563eb" },
  { id: "review", label: "In review", color: "#d97706" },
  { id: "ready", label: "Ready", color: "#0d9488" },
  { id: "scheduled", label: "Scheduled", color: "#7c3aed" },
  { id: "publishing", label: "Posting…", color: "#0ea5e9" },
  { id: "published", label: "Posted", color: "#16a34a" },
  { id: "failed", label: "Needs attention", color: "#dc2626" },
];
export const statusMeta = (s: ContentStatus) => STATUSES.find((x) => x.id === s) ?? STATUSES[0];
export const FLOW: ContentStatus[] = ["idea", "drafting", "review", "ready", "scheduled", "published"];

// A campaign always gets the same colour; no campaign is a calm slate.
export function campaignColor(name: string): string {
  if (!name.trim()) return "#94a3b8";
  let h = 0;
  for (const c of name.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360} 62% 50%)`;
}

// ---- dates (everything on screen is in the viewer's own time zone) ---------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeKey = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
// Weeks start on Monday, like the dashboard calendar.
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
export const fromParts = (date: string, time: string) => new Date(`${date}T${time || "09:00"}`);
export const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtDay = (d: Date, long = false) => d.toLocaleDateString(undefined, long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${fmtDay(d)} · ${fmtTime(d)}`;
};
export const tzLabel = () => new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";

export const DEFAULT_POST_TIME = "18:00";

// Moving an item to another day keeps its time of day (or uses the default for ideas that had no time yet).
export function moveToDay(item: ContentItem, day: Date, hour?: number): Date {
  const old = item.scheduledAt ? new Date(item.scheduledAt) : null;
  const [dh, dm] = DEFAULT_POST_TIME.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour ?? old?.getHours() ?? dh, hour !== undefined ? 0 : (old?.getMinutes() ?? dm));
}

// Does an Instagram item that's in the queue (or ready to be) lack what it needs?
export const needsMedia = (i: ContentItem) => i.platform === "instagram" && !i.upload && (i.status === "scheduled" || i.status === "ready");
export const isLocked = (i: ContentItem) => i.status === "published" || i.status === "publishing";
export const isOverdue = (i: ContentItem) => Boolean(i.scheduledAt) && new Date(i.scheduledAt as string).getTime() < Date.now() && !["published", "publishing", "scheduled", "failed"].includes(i.status);
export const needsAttention = (i: ContentItem) => i.status === "failed" || needsMedia(i) || isOverdue(i);

// ---- AI planning ----------------------------------------------------------------------------------------------------
// A planned post as the AI writes it: a calendar day and a clock time in the person's own time zone, not yet saved.
export interface PlanItem {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  title: string;
  format: ContentFormat;
  platform: ContentPlatform;
  theme: string;
  caption: string;
  notes: string;
}
export type ServiceFocus = "recap" | "growth" | "context";
export interface PlanInput {
  brief: string;
  serviceExcerpt?: string; // what was preached or said at a service (pasted or typed)
  serviceFocus?: ServiceFocus[]; // which kinds of post to make from it
  startDate: string;
  endDate: string;
  postsPerWeek: number;
  formats: ContentFormat[];
  platforms: ContentPlatform[];
  tone?: string;
  campaign?: string;
}
export const aiPlanContent = (input: PlanInput) => post<{ summary: string; items: PlanItem[] }>("/api/content/ai-plan", input);
export const aiPlanOne = (input: { brief: string; serviceExcerpt?: string; serviceFocus?: ServiceFocus[]; campaign?: string; date: string; format: ContentFormat; platform: ContentPlatform; tone?: string; avoid: string[] }) => post<{ item: PlanItem }>("/api/content/ai-plan/item", input);
export const bulkCreateContent = (input: {
  campaign: string;
  items: { title: string; caption: string; notes: string; theme: string; format: ContentFormat; platform: ContentPlatform; scheduledAt: string; owners: string[] }[];
  tasks?: { name: string; startDate: string; endDate: string; goal?: string; dueDaysBefore: number; sprintId?: string };
}) => post<{ created: number; firstItemId: string; sprint: { id: string; name: string } | null; tasks: number }>("/api/content/bulk", input);
