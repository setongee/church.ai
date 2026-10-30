import { authHeaders, handleUnauthorized } from "./auth";
import { afterMutation } from "./cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/submissions${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if ((init?.method ?? "GET") !== "GET") afterMutation();
  return body as T;
}

export type SubmissionStatus = "pending" | "approved" | "rejected" | "withdrawn";
export interface SubmissionBrief {
  _id: string;
  title: string;
  note: string;
  status: SubmissionStatus;
  applied: number;
  author: { _id: string; name: string } | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string;
  counts: { total: number; added: number; changed: number; removed: number };
}
export interface SubmissionOp {
  method: "POST" | "PUT" | "DELETE";
  collection: string;
  id: string;
  tempId: string;
  label: string;
  body: Record<string, unknown> | null;
}
export interface Submission extends SubmissionBrief {
  ops: SubmissionOp[];
  files: { tempId: string; name: string; type: string; url: string }[];
}

export const listSubmissions = (status?: SubmissionStatus) => req<SubmissionBrief[]>(`${status ? `?status=${status}` : ""}`);
export const getSubmission = (id: string) => req<Submission>(`/${id}`);
export const approveSubmission = (id: string, note = "") => req<SubmissionBrief>(`/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
export const rejectSubmission = (id: string, note = "") => req<SubmissionBrief>(`/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
export const withdrawSubmission = (id: string) => req<SubmissionBrief>(`/${id}/withdraw`, { method: "POST" });

export const COLLECTION_LABEL: Record<string, string> = {
  songs: "Song",
  announcements: "Announcement",
  "scene-templates": "Template",
  wrappers: "Wrapper",
  prayers: "Prayer",
  quotes: "Quote",
  slideshows: "Slide show",
  "scripture-box": "Scripture",
  schedules: "Schedule",
  media: "Picture / video",
  designs: "Design",
  templates: "Design template",
  uploads: "Picture (Image Studio)",
};
