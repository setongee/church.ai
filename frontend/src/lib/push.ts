"use client";

import { authHeaders } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type PushStatus = "on" | "off" | "denied" | "ios-install" | "unsupported";

const isElectron = () => /Electron\//.test(navigator.userAgent);
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// The desktop app can't do web push (it keeps itself running and raises its own alerts instead).
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !isElectron();

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/push${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const keyBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// The service worker may not be registered (e.g. in development); never wait on it forever.
const readyWorker = () => Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, no) => setTimeout(() => no(new Error("no service worker")), 5000))]);

async function currentSubscription() {
  const reg = await readyWorker();
  return reg.pushManager.getSubscription();
}

export async function pushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-install"; // iPhone only allows push for an app added to the Home Screen
  if (!canPush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription().catch(() => null)) ? "on" : "off";
}

async function subscribeAndSave(): Promise<boolean> {
  const { enabled, key } = await api<{ enabled: boolean; key: string }>("/key");
  if (!enabled) return false;
  const reg = await readyWorker();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
  await api("/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  return true;
}

// Asks permission (must come from a click), then signs this device up.
export async function enablePush(): Promise<PushStatus> {
  if (!canPush()) return pushStatus();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  try {
    await subscribeAndSave();
  } catch {
    return "off";
  }
  return pushStatus();
}

// Signed in on a device that already allowed notifications: make sure the server has it under *this* person.
export async function syncPush() {
  if (!canPush() || Notification.permission !== "granted") return;
  try {
    await subscribeAndSave();
  } catch {
    // push is a bonus; never get in the way
  }
}

// Off for this device (also run on sign-out, so the next person on a shared device doesn't get this person's alerts).
export async function disablePush() {
  if (!canPush()) return;
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await api("/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  } catch {}
}
