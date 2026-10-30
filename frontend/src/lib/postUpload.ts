import { authHeaders, handleUnauthorized } from "./auth";
import { afterMutation } from "./cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/post-uploads${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if ((init?.method ?? "GET") !== "GET") afterMutation();
  return body as T;
}

export interface CaptionOption {
  label: string;
  caption: string;
  why: string;
}
export interface PostUpload {
  _id: string;
  kind: "video" | "image";
  title: string;
  originalName: string;
  mediaUrl: string;
  posterUrl: string;
  durationSec: number;
  width: number;
  height: number;
  transcript: string;
  summary: string;
  notes: string;
  tone: string;
  options: CaptionOption[];
  caption: string;
  aiWritten: boolean;
  aiIssue: string;
  status: "processing" | "ready" | "error";
  stage: string;
  error: string;
  instagramMediaId?: string;
  instagramPermalink?: string;
  instagramPublishedAt?: string;
  createdAt: string;
}

export const listPostUploads = () => req<PostUpload[]>("");
export const getPostUpload = (id: string) => req<PostUpload>(`/${id}`);
export const updatePostUpload = (id: string, patch: Partial<Pick<PostUpload, "caption" | "notes" | "tone" | "title">>) => req<PostUpload>(`/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const rewriteCaptions = (id: string, input: { notes?: string; tone?: string }) => req<PostUpload>(`/${id}/captions`, { method: "POST", body: JSON.stringify(input) });
export const publishPostUpload = (id: string, caption: string) => req<PostUpload>(`/${id}/publish`, { method: "POST", body: JSON.stringify({ caption }) });
export const deletePostUpload = (id: string) => req<{ ok: boolean }>(`/${id}`, { method: "DELETE" });

// Uploads can be hundreds of MB, so this reports progress (fetch can't).
export function createPostUpload(file: File, extra: { notes?: string; tone?: string }, onProgress: (pct: number) => void): Promise<PostUpload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/post-uploads`);
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { error?: string } & Partial<PostUpload> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 401) handleUnauthorized();
      if (xhr.status >= 200 && xhr.status < 300) {
        afterMutation();
        resolve(body as PostUpload);
      } else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    const form = new FormData();
    form.set("file", file);
    if (extra.notes) form.set("notes", extra.notes);
    if (extra.tone) form.set("tone", extra.tone);
    xhr.send(form);
  });
}
