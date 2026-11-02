import { authHeaders, handleUnauthorized, type TeamRole } from "./auth";
import { afterMutation } from "./cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if ((init?.method ?? "GET") !== "GET") afterMutation();
  return body as T;
}

export interface LiveGroup {
  id: string | null; // null = the whole service
  title: string;
  active: boolean; // this session is the one running now
  jobs: { role: TeamRole; label: string; names: string[] }[];
}
export interface LiveService {
  id: string;
  name: string;
  startedAt: string;
  activeSessionId: string | null;
  sessions: { id: string; name: string }[];
  groups: LiveGroup[];
  mine: { role: TeamRole; session: string | null }[];
  limitedForMe: boolean;
  canControl: boolean; // admins and service managers
}

export const liveNow = () => req<LiveService[]>("/live");
export const startService = (id: string) => req<{ ok: boolean }>(`/services/${id}/live/start`, { method: "POST" });
export const endService = (id: string) => req<{ ok: boolean }>(`/services/${id}/live/end`, { method: "POST" });
// Starts a session of the live service (the one running ends), or with null ends the running one.
export const setLiveSession = (id: string, sessionId: string | null) => req<{ ok: boolean }>(`/services/${id}/live/session`, { method: "POST", body: JSON.stringify({ sessionId }) });
