"use client";

import { useSyncExternalStore } from "react";
import { useInstall } from "./pwa";

// The desktop installers live in Vercel Blob; "?download=1" makes the browser save the file instead of opening it.
const BASE = "https://pbrpt8bikhptw7wn.public.blob.vercel-storage.com";
export type Platform = "mac" | "windows" | "ios" | "android" | "other";

export const INSTALLERS = {
  macArm: { url: `${BASE}/FAFC-Media-Engine-mac-apple-silicon.dmg?download=1`, label: "Mac (Apple Silicon)", detail: "M1, M2, M3 and newer", size: "106 MB" },
  macIntel: { url: `${BASE}/FAFC-Media-Engine-mac-intel.dmg?download=1`, label: "Mac (Intel)", detail: "Older Macs with an Intel chip", size: "112 MB" },
  windows: { url: `${BASE}/FAFC-Media-Engine-windows.exe?download=1`, label: "Windows", detail: "Windows 10 and 11, 64-bit", size: "97 MB" },
};

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  if (/windows/i.test(ua)) return "windows";
  return "other";
}

const noop = () => () => {};
const usePlatform = () => useSyncExternalStore(noop, detectPlatform, () => "other" as Platform);
const useElectron = () => useSyncExternalStore(noop, () => /Electron\//.test(navigator.userAgent), () => false);

// True when this is already the installed app (desktop app, or the site installed from the browser).
export function useIsApp() {
  const { installed } = useInstall();
  const electron = useElectron();
  return installed || electron;
}
export { usePlatform };
