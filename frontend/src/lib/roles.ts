import { authHeaders, handleUnauthorized, type TeamRole } from "./auth";
import { afterMutation } from "./cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/roles${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if ((init?.method ?? "GET") !== "GET") afterMutation();
  return body as T;
}

// An app-level role: a name, and the access it gives.
export interface AppRole {
  _id: string;
  name: string;
  description: string;
  access: TeamRole[];
  members: number;
}
export type AppRoleInput = Pick<AppRole, "name" | "description" | "access">;

export const listRoles = () => req<AppRole[]>("");
export const createRole = (input: AppRoleInput) => req<AppRole>("", { method: "POST", body: JSON.stringify(input) });
export const updateRole = (id: string, input: AppRoleInput) => req<AppRole>(`/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteRole = (id: string) => req<{ ok: boolean; unassigned: number }>(`/${id}`, { method: "DELETE" });
