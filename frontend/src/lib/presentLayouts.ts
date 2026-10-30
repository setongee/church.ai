"use client";

import { useCallback, useSyncExternalStore } from "react";
import { authHeaders } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// How the presenter's screen is arranged. The choice is saved on the person's account (so it follows them to any
// device) and mirrored in this browser so the page never flashes the wrong one while it loads.
export type PresentLayoutId = "classic" | "stage" | "mirror";
export const PRESENT_LAYOUTS: { id: PresentLayoutId; label: string; hint: string }[] = [
  { id: "classic", label: "Classic", hint: "Library on the left, monitors on the right" },
  { id: "stage", label: "Stage on top", hint: "Preview and Live side by side across the top" },
  { id: "mirror", label: "Monitors left", hint: "Monitors on the left, library on the right" },
];
export const isPresentLayout = (v: unknown): v is PresentLayoutId => PRESENT_LAYOUTS.some((l) => l.id === v);

const KEY = "present-layout";
let current: PresentLayoutId = "classic";
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readLocal(): PresentLayoutId {
  try {
    const v = localStorage.getItem(KEY);
    if (isPresentLayout(v)) return v;
  } catch {}
  return "classic";
}

async function loadFromServer() {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch(`${API_URL}/api/auth/prefs`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    const p = (await res.json()) as { presentLayout?: string };
    if (isPresentLayout(p.presentLayout) && p.presentLayout !== current) {
      current = p.presentLayout;
      try {
        localStorage.setItem(KEY, current);
      } catch {}
      emit();
    }
  } catch {}
}

function subscribe(fn: () => void) {
  if (typeof window !== "undefined" && !loaded) {
    current = readLocal();
    void loadFromServer();
  }
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// The person's chosen layout and a way to change it (saved straight away, on their account).
export function usePresentLayout() {
  const layout = useSyncExternalStore(subscribe, () => current, () => "classic" as PresentLayoutId);
  const setLayout = useCallback((id: PresentLayoutId) => {
    if (id === current) return;
    current = id;
    try {
      localStorage.setItem(KEY, id);
    } catch {}
    emit();
    void fetch(`${API_URL}/api/auth/prefs`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ presentLayout: id }) }).catch(() => {});
  }, []);
  return { layout, setLayout };
}

// Forget the in-memory copy when someone signs out, so the next person on this browser gets their own.
export function resetPresentLayout() {
  loaded = false;
  current = "classic";
  try {
    localStorage.removeItem(KEY);
  } catch {}
  emit();
}
