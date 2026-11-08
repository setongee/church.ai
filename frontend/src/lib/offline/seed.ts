"use client";

// The seed pack shipped with the site (public/offline-seed/, built by backend/scripts/build-offline-seed.js): public-domain
// Bibles, the hymn book and a few backgrounds. It is loaded into this device the first time the app opens - even on the login
// page, before anyone signs in - so Present works in offline mode from the very first launch. It only fills in what the device
// doesn't have yet; a full sync from the server (lib/offline/offline.ts) later replaces it with the church's own library.
import type { BibleMeta, MediaItem, Song } from "../present";
import { BOOK_LIST, type BibleChapters } from "./bibleLocal";
import { idbGet, idbSet } from "./idb";
import { MEDIA_CACHE, markSeeded } from "./offline";

interface SeedManifest {
  version: string;
  bibles: BibleMeta[];
  backgrounds: string[];
}

const json = async <T>(path: string): Promise<T | null> => {
  const res = await fetch(path, { cache: "no-cache" }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
};

export async function loadSeed(): Promise<void> {
  const m = await json<SeedManifest>("/offline-seed/manifest.json");
  if (!m || (await idbGet<string>("seed-version")) === m.version) return;

  for (const b of m.bibles) {
    if (await idbGet(`bible:${b.id}`)) continue;
    const chapters = await json<BibleChapters>(`/offline-seed/bibles/${b.id}.json`);
    if (!chapters) return; // offline or the file is missing: try again next time
    await idbSet(`bible:${b.id}`, chapters);
    await idbSet(`bible-stamp:${b.id}`, "seed");
  }
  if (!(await idbGet("bibles:meta"))) await idbSet("bibles:meta", { installed: m.bibles, available: [], books: BOOK_LIST });

  if (!(await idbGet("songs"))) {
    const songs = await json<Song[]>("/offline-seed/songs.json");
    if (songs) await idbSet("songs", songs);
  }

  if (!(await idbGet("media"))) {
    const media = await json<MediaItem[]>("/offline-seed/media.json");
    if (media) await idbSet("media", media);
  }
  if (typeof caches !== "undefined") {
    const cache = await caches.open(MEDIA_CACHE);
    for (const path of m.backgrounds) {
      const url = new URL(path, location.origin).href;
      if (await cache.match(url)) continue;
      const res = await fetch(url).catch(() => null);
      if (res?.ok) await cache.put(url, res);
    }
  }
  await idbSet("seed-version", m.version);
  markSeeded();
}

// Opens the Present pages in the background so the browser saves their code (through the service worker). Without this, a page
// that has never been opened on this device - the output window, say - couldn't load with no internet.
export async function warmShell(): Promise<void> {
  if (!navigator.serviceWorker?.controller) return; // production only: the worker is what keeps them
  try {
    if (sessionStorage.getItem("shell-warmed")) return;
    sessionStorage.setItem("shell-warmed", "1");
  } catch {}
  for (const page of ["/present", "/present/output", "/login"]) {
    const html = await fetch(page, { headers: { "x-warm": "1" } }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    const files = new Set([...html.matchAll(/\/_next\/static\/[^"'\\\s)]+\.(?:js|css)/g)].map((m) => m[0]));
    await Promise.all([...files].map((f) => fetch(f).catch(() => {})));
  }
}
