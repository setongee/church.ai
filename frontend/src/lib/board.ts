import { authHeaders, handleUnauthorized } from "./auth";
import { afterMutation } from "./cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/board${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if ((init?.method ?? "GET") !== "GET") afterMutation();
  return body as T;
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";
export type SprintStatus = "planned" | "active" | "completed";

export interface Person {
  id: string;
  name: string;
}
export interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  completedAt: string | null;
  counts: { todo: number; in_progress: number; review: number; done: number; total: number };
  progress: number;
}
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
export interface TaskComment {
  id: string;
  user: Person | null;
  text: string;
  at: string;
}
export interface HistoryEntry {
  user: Person | null;
  type: "created" | "moved" | "assigned" | "unassigned" | "edited" | "comment" | "checklist";
  from: string;
  to: string;
  at: string;
}
export interface Task {
  id: string;
  sprintId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignees: Person[];
  dueDate: string | null;
  labels: string[];
  checklist: ChecklistItem[];
  commentCount: number;
  order: number;
  contentItem: { id: string; title: string; status: string; scheduledAt: string | null } | null;
  completedAt: string | null;
  createdBy: Person | null;
  createdAt: string;
  updatedAt: string;
  // only on the detail view:
  comments?: TaskComment[];
  history?: HistoryEntry[];
}

export interface SprintInput {
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status?: SprintStatus;
}
export interface TaskInput {
  sprint: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assignees?: string[];
  dueDate?: string | null;
  labels?: string[];
  checklist?: { text: string; done?: boolean }[];
  contentItem?: string | null;
}

export const listSprints = () => req<Sprint[]>("/sprints");
export const createSprint = (input: SprintInput) => req<Sprint>("/sprints", { method: "POST", body: JSON.stringify(input) });
export const updateSprint = (id: string, patch: Partial<SprintInput>) => req<Sprint>(`/sprints/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const completeSprint = (id: string, carryTo?: string) => req<{ sprint: Sprint; carried: number }>(`/sprints/${id}/complete`, { method: "POST", body: JSON.stringify({ carryTo }) });
export const deleteSprint = (id: string) => req<{ ok: boolean }>(`/sprints/${id}`, { method: "DELETE" });

export const listTasks = (sprintId: string) => req<Task[]>(`/sprints/${sprintId}/tasks`);
export const getTask = (id: string) => req<Task>(`/tasks/${id}`);
export const createTask = (input: TaskInput) => req<Task>("/tasks", { method: "POST", body: JSON.stringify(input) });
export const updateTask = (id: string, patch: Partial<Omit<TaskInput, "checklist">> & { checklist?: { id?: string; text: string; done: boolean }[] }) => req<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const moveTask = (id: string, status: TaskStatus, order: number) => req<Task>(`/tasks/${id}/move`, { method: "POST", body: JSON.stringify({ status, order }) });
export const commentOnTask = (id: string, text: string) => req<Task>(`/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ text }) });
export const deleteTask = (id: string) => req<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" });

// Content-calendar items a task can be linked to. The calendar API is built separately, so read it defensively.
export async function listLinkableContent(): Promise<{ id: string; title: string }[]> {
  try {
    const res = await fetch(`${API_URL}/api/content`, { headers: { ...authHeaders() }, cache: "no-store" });
    if (!res.ok) return [];
    const body = await res.json();
    const list = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [];
    return list.map((c: { id?: string; _id?: string; title?: string }) => ({ id: String(c.id ?? c._id ?? ""), title: String(c.title ?? "Untitled") })).filter((c: { id: string }) => c.id);
  } catch {
    return [];
  }
}

// ---- display helpers ------------------------------------------------------------------------------------------------

export const STATUSES: { id: TaskStatus; label: string; dot: string; tint: string }[] = [
  { id: "todo", label: "To do", dot: "bg-slate-400", tint: "text-slate-600" },
  { id: "in_progress", label: "In progress", dot: "bg-blue-500", tint: "text-blue-600" },
  { id: "review", label: "In review", dot: "bg-violet-500", tint: "text-violet-600" },
  { id: "done", label: "Done", dot: "bg-emerald-500", tint: "text-emerald-600" },
];
export const statusLabel = (s: TaskStatus) => STATUSES.find((x) => x.id === s)?.label ?? s;

export const PRIORITIES: { id: Priority; label: string; chip: string; bar: string }[] = [
  { id: "low", label: "Low", chip: "bg-slate-500/15 text-slate-600", bar: "bg-slate-400" },
  { id: "medium", label: "Medium", chip: "bg-blue-500/15 text-blue-600", bar: "bg-blue-500" },
  { id: "high", label: "High", chip: "bg-orange-500/15 text-orange-600", bar: "bg-orange-500" },
  { id: "urgent", label: "Urgent", chip: "bg-red-500/15 text-red-600", bar: "bg-red-500" },
];
export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.id === p) ?? PRIORITIES[1];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const isOverdue = (t: Pick<Task, "dueDate" | "status">) => Boolean(t.dueDate) && t.status !== "done" && startOfDay(new Date(t.dueDate!)) < startOfDay(new Date());
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
export const fmtFull = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const daysLeft = (endIso: string) => Math.round((startOfDay(new Date(endIso)) - startOfDay(new Date())) / 86400000);
// <input type="date"> speaks yyyy-mm-dd
export const toInputDate = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return fmtDay(iso);
}
