import { authHeaders, handleUnauthorized } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/notifications${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

// Only present inside the desktop app.
declare global {
  interface Window {
    fafcDesktop?: { show: () => void; badge: (n: number) => void };
  }
}

export interface AppNotification {
  id: string;
  type: "roster" | "roster-removed" | "account" | "info" | "task" | "task-moved" | "content" | "call" | "call-request";
  title: string;
  body: string;
  href: string;
  data?: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export const listNotifications = () => req<{ items: AppNotification[]; unread: number }>("");
export const readNotification = (id: string) => req<{ ok: boolean }>(`/${id}/read`, { method: "POST" });
export const readAllNotifications = () => req<{ ok: boolean }>("/read-all", { method: "POST" });
export interface EmailPrefs {
  tasks: boolean;
  reminders: boolean;
  chat: boolean;
  calls: boolean;
}
export const getEmailPrefs = () => req<EmailPrefs>("/prefs");
export const setEmailPrefs = (patch: Partial<EmailPrefs>) => req<EmailPrefs>("/prefs", { method: "PUT", body: JSON.stringify(patch) });
export const clearNotifications = () => req<{ ok: boolean }>("", { method: "DELETE" });

export function timeAgo(iso: string | number): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// ---- the little extras: a soft ping, and alerts from the operating system when the app is in the background -----

const SOUND_KEY = "notify-sound";
export const soundOn = (): boolean => {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
};
export const setSoundOn = (on: boolean) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
};

let audio: AudioContext | null = null;
export function ping() {
  if (!soundOn()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime;
    // Two quick soft notes, a rising pair.
    [660, 880].forEach((freq, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.22);
      o.connect(g).connect(audio!.destination);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 0.25);
    });
  } catch {
    // browsers refuse sound until the page has been clicked once; that's fine
  }
}

export const desktopAlertsSupported = () => typeof Notification !== "undefined";
export const desktopAlertState = (): NotificationPermission | "unsupported" => (desktopAlertsSupported() ? Notification.permission : "unsupported");
export const askDesktopAlerts = async () => (desktopAlertsSupported() ? Notification.requestPermission() : "denied");

// Only when the app isn't on screen - otherwise the in-app toast is enough.
export function desktopAlert(opts: { title: string; body: string; tag: string; onClick?: () => void }) {
  if (!desktopAlertsSupported() || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  // (In the desktop app, permission is granted automatically; in browsers it comes from the bell panel.)
  try {
    const n = new Notification(opts.title, { body: opts.body, tag: opts.tag, icon: "/icons/icon-192.png", badge: "/icons/favicon-64.png" });
    n.onclick = () => {
      window.focus();
      window.fafcDesktop?.show(); // the desktop app may be tucked away in the tray
      opts.onClick?.();
      n.close();
    };
  } catch {
    // some platforms only allow notifications through a service worker; skip quietly
  }
}
