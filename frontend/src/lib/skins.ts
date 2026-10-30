"use client";

import { useCallback, useSyncExternalStore } from "react";
import { authHeaders } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// A skin restyles the whole app for one person: an accent colour (one of the colour themes in globals.css) on a
// surface tone (the neutral palette: plain, warm sand or cool slate). It is saved on their account, so it follows
// them to any device. Skins are the app's only theme control. "" = nobody chose one yet: the default (Ember) look.
export interface Skin {
  id: string;
  name: string;
  blurb: string;
  accent: "ember" | "ocean" | "forest" | "royal" | "rose";
  surface: "default" | "sand" | "slate";
  swatch: [string, string, string]; // page, card, accent
}
export const SKINS: Skin[] = [
  { id: "ember", name: "Ember", blurb: "Warm orange on clean white", accent: "ember", surface: "default", swatch: ["#f4f4f5", "#ffffff", "#ea580c"] },
  { id: "sunrise", name: "Sunrise", blurb: "Orange on warm sand", accent: "ember", surface: "sand", swatch: ["#f3efe7", "#fffdf9", "#ea580c"] },
  { id: "ocean", name: "Ocean", blurb: "Calm blue on cool slate", accent: "ocean", surface: "slate", swatch: ["#e9eef6", "#ffffff", "#2563eb"] },
  { id: "forest", name: "Forest", blurb: "Fresh green on warm sand", accent: "forest", surface: "sand", swatch: ["#f3efe7", "#fffdf9", "#059669"] },
  { id: "royal", name: "Royal", blurb: "Violet on cool slate", accent: "royal", surface: "slate", swatch: ["#e9eef6", "#ffffff", "#7c3aed"] },
  { id: "rose", name: "Rose", blurb: "Crimson-rose on warm sand", accent: "rose", surface: "sand", swatch: ["#f3efe7", "#fffdf9", "#e11d48"] },
];
const find = (id: string) => SKINS.find((s) => s.id === id);

let current = ""; // "" = the team's theme
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Puts the skin on the page (and remembers it here, so the next page load paints it before anything renders).
function apply(id: string) {
  const root = document.documentElement;
  const s = find(id);
  try {
    if (s) {
      localStorage.setItem("skin", s.id);
      localStorage.setItem("skinAccent", s.accent);
      localStorage.setItem("skinSurface", s.surface);
    } else ["skin", "skinAccent", "skinSurface"].forEach((k) => localStorage.removeItem(k));
  } catch {}
  if (s) {
    root.dataset.theme = s.accent;
    if (s.surface === "default") delete root.dataset.surface;
    else root.dataset.surface = s.surface;
  } else {
    delete root.dataset.theme; // the default look (Ember) lives on :root
    delete root.dataset.surface;
  }
}

async function loadFromServer() {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch(`${API_URL}/api/auth/prefs`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return;
    const p = (await res.json()) as { skin?: string };
    const next = find(p.skin ?? "") ? (p.skin as string) : "";
    if (next !== current) {
      current = next;
      apply(current);
      emit();
    }
  } catch {}
}

function subscribe(fn: () => void) {
  if (typeof window !== "undefined" && !loaded) {
    try {
      const saved = localStorage.getItem("skin") ?? "";
      current = find(saved) ? saved : "";
    } catch {}
    void loadFromServer();
  }
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// The person's own skin ("" = the default Ember look) and a way to change it (saved straight away).
export function useSkin() {
  const skin = useSyncExternalStore(subscribe, () => current, () => "");
  const setSkin = useCallback((id: string) => {
    const next = find(id) ? id : "";
    if (next === current) return;
    current = next;
    apply(next);
    emit();
    void fetch(`${API_URL}/api/auth/prefs`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ skin: next }) }).catch(() => {});
  }, []);
  return { skin, setSkin };
}

// On sign-out: forget this person's skin so the next person on this browser starts from the default look.
export function resetSkin() {
  loaded = false;
  current = "";
  apply("");
  emit();
}
