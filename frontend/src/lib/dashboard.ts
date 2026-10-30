import { authHeaders, handleUnauthorized } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface DashTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  sprint: string;
}
export interface DashPost {
  id: string;
  title: string;
  format: string;
  platform: string;
  status: string;
  scheduledAt: string | null;
  error: string;
  owners: string[];
  why?: string;
}
export interface DashService {
  id: string;
  name: string;
  date: string | null;
}
export interface Dashboard {
  me: { open: number; overdue: number; dueSoon: number; doneRecently: number; tasks: DashTask[] };
  sprint: { id: string; name: string; startDate: string; endDate: string; daysLeft: number; counts: { todo: number; in_progress: number; review: number; done: number }; total: number; mine: number } | null;
  content: { upcoming: DashPost[]; attention: DashPost[]; attentionCount: number; scheduledThisWeek: number; inProgress: number; ready: number; publishedLast30: number };
  services: { total: number; upcoming: number; next: DashService | null; top: DashService[]; calendar: DashService[] } | null;
  calendar: { tasks: { id: string; title: string; date: string }[]; posts: { id: string; title: string; date: string }[] };
}

export async function getDashboard(): Promise<Dashboard> {
  const res = await fetch(`${API_URL}/api/dashboard`, { headers: authHeaders(), cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as Dashboard;
}
