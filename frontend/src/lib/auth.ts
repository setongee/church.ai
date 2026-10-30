// Sign-in state. The token lives in localStorage (so a refresh keeps you signed in) and is sent with every
// API call and socket connection. Only one device per user can hold a live session - the server enforces it.
import { clearCache } from "./cache";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const KEY = "authToken";

export type TeamRole = "presenter" | "design" | "audio" | "manager" | "social";
export const TEAM_ROLES: { id: TeamRole; label: string; hint: string }[] = [
  { id: "presenter", label: "Presenter", hint: "Runs the screen" },
  { id: "design", label: "Design", hint: "Graphics & visuals" },
  { id: "audio", label: "Audio", hint: "Sound & recording" },
  { id: "manager", label: "Service Manager", hint: "Services, Audio Lab & Studio" },
  { id: "social", label: "Social Media Manager", hint: "Posts, Studio & performance" },
];
// What each kind of access opens. An app role is a named set of these, and an assignment gives one of them for a service.
// (Present, Image Studio, the calendar and tasks to look at, and chat are open to everyone, so they aren't listed.)
export const ACCESS_INFO: Record<Exclude<TeamRole, "presenter">, { label: string; opens: string }> = {
  design: { label: "Design", opens: "Image Studio saved live, Presentation, Carousels, Reel Studio, Published posts, Analytics" },
  social: { label: "Social media", opens: "Everything in Design, plus planning the content calendar, Upload & post, Quotes and Sessions" },
  audio: { label: "Audio", opens: "Audio Lab" },
  manager: { label: "Services", opens: "Services, Sessions, Quotes, Audio Lab, Activity, Analytics and the studio tools" },
};

export const roleLabel = (r: TeamRole) => TEAM_ROLES.find((t) => t.id === r)?.label ?? r;

// Which pages each rostered job opens. Everyone gets the dashboard ("/"); admins get everything. A person's
// roles come from the services they're currently rostered on, so no assignment means the dashboard only.
const STUDIO_PATHS = ["/studio", "/presentation", "/carousels", "/reel-studio", "/design", "/editor"];
// Published posts (Instagram performance) belong with the people who make and publish content.
const PUBLISHED_PATHS = ["/published", "/upload-post"];
export const ROLE_PATHS: Record<TeamRole, string[]> = {
  // A Presenter runs the screen and uses Image Studio; the content calendar, tasks and chat are open to everyone (view only for them).
  presenter: ["/present", "/studio", "/editor"],
  design: [...STUDIO_PATHS, ...PUBLISHED_PATHS, "/analytics"],
  audio: ["/audio-lab"],
  social: [...STUDIO_PATHS, ...PUBLISHED_PATHS, "/analytics", "/quotes", "/sessions"],
  manager: ["/services", "/sessions", "/quotes", "/audio-lab", "/activity", "/analytics", ...STUDIO_PATHS, ...PUBLISHED_PATHS],
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function canOpen(user: Pick<AuthUser, "isAdmin" | "roles">, path: string): boolean {
  // Everyone signed in has the dashboard and the team chat.
  if (user.isAdmin || path === "/" || path === "/login" || under(path, "/dashboard") || under(path, "/chat") || under(path, "/download") || under(path, "/settings") || under(path, "/profile") || under(path, "/board") || under(path, "/calendar") || under(path, "/review")) return true;
  return user.roles.some((r) => ROLE_PATHS[r]?.some((p) => under(path, p)));
}

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  isAdmin: boolean;
  roles: TeamRole[]; // everything they can currently open: their role's access plus current service assignments
  appRole?: { _id: string; name: string } | null; // their app-level role (admins have none; they can open everything)
  active: boolean;
}

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}
export function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {}
}
export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// `ngrok-skip-browser-warning` stops ngrok's "visit site" interstitial from answering API calls when the backend is
// reached through an ngrok tunnel (harmless anywhere else).
export const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, "ngrok-skip-browser-warning": "1" } : { "ngrok-skip-browser-warning": "1" };
};

// For plain links (downloads) that can't carry a header.
export function withToken(url: string): string {
  const t = getToken();
  return t ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}` : url;
}

// The server said we're not signed in (logged out elsewhere, signed out by an admin, or idle too long).
export function handleUnauthorized() {
  clearToken();
  clearCache(); // nothing cached may outlive the session
  if (typeof window === "undefined") return;
  const p = window.location.pathname;
  if (p === "/login" || p.startsWith("/present/output")) return;
  window.location.assign(`/login?next=${encodeURIComponent(p + window.location.search)}`);
}

async function call<T>(path: string, init?: RequestInit, authed = false): Promise<T> {
  const res = await fetch(`${API_URL}/api/auth${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1", ...(authed ? authHeaders() : {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (authed && res.status === 401) handleUnauthorized();
    throw Object.assign(new Error(body?.error || `Request failed (${res.status})`), { code: body?.code as string | undefined });
  }
  return body as T;
}

export const authStatus = () => call<{ needsSetup: boolean }>("/status");
export const setupAdmin = (input: { name: string; email: string; password: string }) => call<{ token: string; user: AuthUser }>("/setup", { method: "POST", body: JSON.stringify(input) });
export const login = (email: string, password: string) => call<{ token: string; user: AuthUser }>("/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const fetchMe = () => call<{ user: AuthUser }>("/me", undefined, true);
export const logoutRequest = () => call<{ ok: boolean }>("/logout", { method: "POST" }, true);
export const changePassword = (currentPassword: string, newPassword: string) => call<{ ok: boolean }>("/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }, true);
