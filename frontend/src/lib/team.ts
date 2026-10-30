import { authHeaders, handleUnauthorized, type AuthUser, type TeamRole } from "./auth";
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

export interface TeamUser extends AuthUser {
  defaultRole: TeamRole | "";
  signedIn: boolean;
  lastSeenAt: string | null;
  sessionDevice: string;
  createdAt: string;
}
export interface TeamMember {
  _id: string;
  name: string;
}
export interface Delivery {
  email: { ok: boolean; error?: string };
  sms: { ok: boolean; error?: string };
}

export const listUsers = () => req<TeamUser[]>("/api/users");
export const listTeam = () => req<TeamMember[]>("/api/users/team");
export const createUser = (input: { name: string; email: string; phone?: string; password?: string; isAdmin: boolean }) => req<{ user: TeamUser; password?: string; delivery: Delivery }>("/api/users", { method: "POST", body: JSON.stringify(input) });
export const updateUser = (id: string, patch: Partial<Pick<TeamUser, "name" | "email" | "phone" | "isAdmin" | "active" | "defaultRole">> & { resetPassword?: boolean }) =>
  req<{ user: TeamUser; password?: string }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const signOutUser = (id: string) => req<{ ok: boolean }>(`/api/users/${id}/sign-out`, { method: "POST" });
export const deleteUser = (id: string) => req<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" });

export interface RosterAssignment {
  role: TeamRole;
  notified: boolean;
  user: { _id: string; name: string; email: string };
}
export interface Roster {
  assignments: RosterAssignment[];
  note: string;
  notifiedAt: string | null;
  emailConfigured: boolean;
}
export const getRoster = (serviceId: string) => req<Roster>(`/api/services/${serviceId}/roster`);
export const saveRoster = (serviceId: string, input: { assignments: { role: TeamRole; userId: string }[]; note: string }) => req<Roster>(`/api/services/${serviceId}/roster`, { method: "PUT", body: JSON.stringify(input) });
export const notifyRoster = (serviceId: string, all = false) => req<{ results: { name: string; email: string; ok: boolean; error?: string }[]; notifiedAt: string | null }>(`/api/services/${serviceId}/roster/notify`, { method: "POST", body: JSON.stringify({ all }) });
export type Assignment = { serviceId: string; serviceName: string; date: string | null; roles: TeamRole[]; team?: { role: TeamRole; names: string[] }[] };
export const myAssignments = () => req<Assignment[]>("/api/users/me/assignments");

export interface MemberRosterRow {
  serviceId: string;
  serviceName: string;
  date: string | null;
  roles: TeamRole[];
}
export const memberRoster = (id: string) => req<{ upcoming: MemberRosterRow[]; history: MemberRosterRow[] }>(`/api/users/${id}/roster`);
export const assignMemberToRoster = (id: string, input: { serviceId: string; role: TeamRole }) => req<{ ok: boolean }>(`/api/users/${id}/roster`, { method: "POST", body: JSON.stringify(input) });
