"use client";

// Present works from a copy kept on this device, so a dropped connection never stops a service:
//  - syncAll() saves songs, hymns, Bibles, schedules, wrappers, templates and the background / media files to this device;
//  - checkForUpdates() notices when the server has something new (new songs, a new Bible, new backgrounds) so the app can say so;
//  - offlineGet() answers the same reads from that copy when the network is down (see `req` in lib/present.ts);
//  - the schedule being run is also written here on every edit, and sent to the server when the connection returns.
import { useSyncExternalStore } from "react";
import { authHeaders } from "../auth";
import { getDeviceId } from "../deviceId";
import type { BibleMeta, MediaItem, Schedule, ScheduleSummary, SceneTemplate, Song, Wrapper } from "../present";
import { localBooks, localChapter, localFind, localSmart, BOOK_LIST, type BibleChapters } from "./bibleLocal";
import { parseBible } from "./bibleParse";
import { offlineModeActive } from "../offlineMode";
import { idbDel, idbGet, idbSet } from "./idb";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const MEDIA_CACHE = "fafc-media";
const MAX_FILE = 60 * 1024 * 1024; // bigger files stay online-only
export const MISS = Symbol("not-on-this-device");
// The other lists Present reads; each is kept whole.
const LISTS = ["announcements", "prayers", "quotes", "slideshows", "scripture-box"];

interface Stamp {
  count: number;
  at: string;
}
interface Manifest {
  songs: Stamp;
  media: Stamp;
  schedules: Stamp;
  wrappers: Stamp;
  templates: Stamp;
  bibles: { id: string; name: string; verses: number; installedAt: string }[];
}

// ---- status (for the banner and the chip) ------------------------------------------------------

export interface OfflineStatus {
  offline: boolean; // the browser says there's no network
  syncing: boolean;
  progress: string;
  syncedAt: number; // when this device last saved a full copy (0 = never)
  updates: string[]; // what the server has that this device doesn't: "New songs were added"
  error: string;
  checked: boolean; // has the stored copy been read yet
  seeded: boolean; // the Bibles, hymns and backgrounds that ship with the app are on this device
}
let status: OfflineStatus = { offline: false, syncing: false, progress: "", syncedAt: 0, updates: [], error: "", checked: false, seeded: false };
const listeners = new Set<() => void>();
const setStatus = (p: Partial<OfflineStatus>) => {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useOfflineStatus = () => useSyncExternalStore(subscribe, () => status, () => status);

if (typeof window !== "undefined") {
  status = { ...status, offline: navigator.onLine === false };
  window.addEventListener("online", () => setStatus({ offline: false }));
  window.addEventListener("offline", () => setStatus({ offline: true }));
  void idbGet<number>("syncedAt").then((t) => setStatus({ syncedAt: t ?? 0, checked: true }));
  void idbGet<string>("seed-version").then((v) => v && setStatus({ seeded: true }));
}

// A request that failed because there was no connection (not because the server said no).
export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) || (typeof navigator !== "undefined" && navigator.onLine === false);

// ---- talking to the server ---------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api/present${path}`, { headers: { ...authHeaders(), "X-Device-Id": getDeviceId() }, cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't read ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

const abs = (url: string) => (url.startsWith("http") ? url : `${API}${url}`);
const uploadsIn = (data: unknown) => {
  // Every /uploads/... file a piece of saved data points at (backgrounds, announcement pictures, logos, slides).
  const found = new Set<string>();
  for (const m of JSON.stringify(data ?? "").matchAll(/(?:https?:\/\/[^"\\\s]+)?\/uploads\/[^"\\\s]+/g)) found.add(m[0]);
  return [...found];
};

async function cacheFiles(urls: string[], label: string) {
  if (typeof caches === "undefined") return { saved: 0, skipped: 0 };
  const cache = await caches.open(MEDIA_CACHE);
  let saved = 0;
  let skipped = 0;
  let done = 0;
  const queue = [...new Set(urls.map(abs))];
  const worker = async () => {
    for (let url = queue.pop(); url; url = queue.pop()) {
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: "cors" });
          const size = Number(res.headers.get("content-length") || 0);
          if (!res.ok || size > MAX_FILE) skipped++;
          else {
            await cache.put(url, res);
            saved++;
          }
        }
      } catch {
        skipped++;
      }
      setStatus({ progress: `${label} ${++done}/${done + queue.length}` });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { saved, skipped };
}

// ---- keeping the copy ----------------------------------------------------------------------------

const bibles = new Map<string, BibleChapters>(); // parsed Bibles kept in memory once read
async function chaptersOf(id: string) {
  let c = bibles.get(id);
  if (!c) {
    c = await idbGet<BibleChapters>(`bible:${id}`);
    if (c) bibles.set(id, c);
  }
  return c;
}

let running: Promise<void> | null = null;
export function syncAll(): Promise<void> {
  if (running) return running;
  running = (async () => {
    setStatus({ syncing: true, error: "", progress: "Checking what's new…" });
    try {
      const manifest = await get<Manifest>("/offline/manifest");
      const refs: unknown[] = [];

      setStatus({ progress: "Saving songs and hymns…" });
      await idbSet("songs", await get<Song[]>("/offline/songs"));

      setStatus({ progress: "Saving wrappers and templates…" });
      const [wrappers, templates, prayerTemplates, media] = await Promise.all([get<Wrapper[]>("/wrappers"), get<SceneTemplate[]>("/scene-templates"), get<SceneTemplate[]>("/scene-templates?kind=prayer"), get<MediaItem[]>("/media")]);
      await Promise.all([idbSet("wrappers", wrappers), idbSet("templates", templates), idbSet("templates:prayer", prayerTemplates), idbSet("media", media)]);
      refs.push(wrappers, templates, prayerTemplates);
      for (const name of LISTS) {
        try {
          const rows = await get<unknown[]>(`/${name}`);
          await idbSet(`list:${name}`, rows);
          refs.push(rows);
        } catch {}
      }

      setStatus({ progress: "Saving schedules…" });
      const list = await get<ScheduleSummary[]>("/schedules");
      await idbSet("schedules:list", list);
      for (const s of list) {
        const doc = await get<Schedule>(`/schedules/${s._id}`);
        await idbSet(`schedule:${s._id}`, doc);
        refs.push(doc);
      }
      try {
        const sess = await get<{ session: unknown }>("/session");
        await idbSet("session", sess);
      } catch {}

      const meta = await get<{ installed: BibleMeta[]; available: BibleMeta[]; books: unknown }>("/bibles");
      await idbSet("bibles:meta", await withLocalBibles({ installed: meta.installed, available: [], books: BOOK_LIST }));
      for (const [i, b] of manifest.bibles.entries()) {
        const stamp = `${b.verses}|${b.installedAt}`;
        if ((await idbGet<string>(`bible-stamp:${b.id}`)) === stamp && (await idbGet(`bible:${b.id}`))) continue;
        setStatus({ progress: `Saving the Bible: ${b.name} (${i + 1}/${manifest.bibles.length})…` });
        const full = await get<{ chapters: BibleChapters }>(`/bibles/${b.id}/export`);
        await idbSet(`bible:${b.id}`, full.chapters);
        await idbSet(`bible-stamp:${b.id}`, stamp);
        bibles.delete(b.id);
      }

      const files = await cacheFiles([...media.map((m) => m.url).filter((u) => !u.startsWith("local://")), ...refs.flatMap(uploadsIn)], "Saving backgrounds and media");

      await idbSet("manifest", manifest);
      const at = Date.now();
      await idbSet("syncedAt", at);
      setStatus({ syncedAt: at, updates: [], progress: files.skipped ? `Saved. ${files.skipped} large or unreachable file${files.skipped === 1 ? " was" : "s were"} left online-only.` : "" });
    } catch (e) {
      setStatus({ error: isNetworkError(e) ? "Couldn't reach the server, so nothing was saved this time." : e instanceof Error ? e.message : "Couldn't save the offline copy." });
    } finally {
      setStatus({ syncing: false });
      running = null;
    }
  })();
  return running;
}

export const markSeeded = () => setStatus({ seeded: true });
export const setUpdates = (updates: string[]) => setStatus({ updates });

// Asks the server what it has and compares it with this device's copy. Returns "first" when nothing was ever saved here.
export async function checkForUpdates(): Promise<"first" | "new" | "same"> {
  const server = await get<Manifest>("/offline/manifest").catch(() => null);
  if (!server) return "same";
  const mine = await idbGet<Manifest>("manifest");
  if (!mine) return "first";
  const updates: string[] = [];
  if (server.songs.count !== mine.songs.count || server.songs.at !== mine.songs.at) updates.push(server.songs.count > mine.songs.count ? "New songs were added" : "Songs were updated");
  const known = new Set(mine.bibles.map((b) => b.id));
  for (const b of server.bibles) if (!known.has(b.id)) updates.push(`The Bible “${b.name}” was added`);
  if (server.media.count !== mine.media.count || server.media.at !== mine.media.at) updates.push(server.media.count > mine.media.count ? "New backgrounds or media were added" : "Backgrounds or media were updated");
  setStatus({ updates });
  return updates.length ? "new" : "same";
}

// ---- Bibles added on this device (an XML file, with no network) ---------------------------------------

type BiblesMeta = { installed: BibleMeta[]; available: BibleMeta[]; books: unknown };
export const isLocalBible = (id: string) => id.startsWith("local-");

// The Bibles the server knows plus the ones added on this device (which the server has never heard of).
export async function withLocalBibles<T extends { installed: BibleMeta[] }>(server: T): Promise<T> {
  const saved = await idbGet<BiblesMeta>("bibles:meta");
  const mine = (saved?.installed ?? []).filter((b) => b.source === "local" && !server.installed.some((s) => s.id === b.id));
  return mine.length ? { ...server, installed: [...server.installed, ...mine] } : server;
}

// Reads a Bible file (Zefania, OSIS, USFX or OpenSong) in this window and keeps it on this device.
export async function importBibleLocal(file: File, name: string, abbr: string): Promise<BibleMeta> {
  const { data, verses } = parseBible(await file.text());
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  const id = `local-${slug(abbr || name) || Date.now()}`;
  const meta: BibleMeta = { id, abbr: String(abbr || name).toUpperCase().slice(0, 12), name: String(name || abbr).slice(0, 80), lang: "en", license: "Added on this device", verses, source: "local" };
  await idbSet(`bible:${id}`, data);
  await idbSet(`bible-stamp:${id}`, "local");
  bibles.delete(id);
  const saved = (await idbGet<BiblesMeta>("bibles:meta")) ?? { installed: [], available: [], books: BOOK_LIST };
  await idbSet("bibles:meta", { ...saved, installed: [...saved.installed.filter((b) => b.id !== id), meta] });
  return meta;
}
export async function removeBibleLocal(id: string) {
  await idbDel(`bible:${id}`);
  await idbDel(`bible-stamp:${id}`);
  bibles.delete(id);
  const saved = await idbGet<BiblesMeta>("bibles:meta");
  if (saved) await idbSet("bibles:meta", { ...saved, installed: saved.installed.filter((b) => b.id !== id) });
}

// ---- the running schedule is kept here as it is edited ---------------------------------------------

export async function saveLocalSchedule(s: Schedule) {
  await idbSet(`schedule:${s._id}`, s);
  const list = (await idbGet<ScheduleSummary[]>("schedules:list")) ?? [];
  const row = { _id: s._id, name: s.name, count: s.items.length, updatedAt: new Date().toISOString() };
  await idbSet("schedules:list", list.some((x) => x._id === s._id) ? list.map((x) => (x._id === s._id ? { ...x, ...row } : x)) : [...list, row]);
}

// ---- reads, answered from the copy ----------------------------------------------------------------

// Keeps what a successful read returned (the things needed to run a service) so the copy is never staler than the last visit.
export function offlineRemember(path: string, data: unknown) {
  const [p, qs = ""] = path.split("?");
  const kind = new URLSearchParams(qs).get("kind");
  if (p === "/schedules") void idbSet("schedules:list", data);
  else if (/^\/schedules\/[0-9a-f]{24}$/.test(p)) void idbSet(`schedule:${p.split("/")[2]}`, data);
  else if (LISTS.includes(p.slice(1))) void idbSet(`list:${p.slice(1)}`, data);
  else if (p === "/wrappers") void idbSet("wrappers", data);
  else if (p === "/scene-templates") void idbSet(kind === "prayer" ? "templates:prayer" : "templates", data);
  else if (p === "/media" && !qs) void idbSet("media", data);
  else if (p === "/session") void idbSet("session", data);
  else if (p === "/bibles") void withLocalBibles(data as BiblesMeta).then((m) => idbSet("bibles:meta", { ...m, available: [] }));
}

const norm = (v: unknown) => String(v ?? "").toLowerCase();
export async function offlineGet<T>(path: string): Promise<T | typeof MISS> {
  const [p, qs = ""] = path.split("?");
  const q = new URLSearchParams(qs);
  const done = (v: unknown) => v as T;

  if (p === "/songs") {
    const all = await idbGet<Song[]>("songs");
    if (!all) return MISS;
    const hymns = q.get("category") === "hymn";
    const text = norm(q.get("q")).trim();
    const rows = all.filter((s) => (hymns ? s.category === "hymn" : s.category !== "hymn") && (!text || [s.title, s.author, s.lyrics, s.number].some((f) => norm(f).includes(text))));
    return done(hymns ? rows.sort((a, b) => String(a.number ?? "").localeCompare(String(b.number ?? ""), undefined, { numeric: true }) || a.title.localeCompare(b.title)).slice(0, 1000) : rows.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 300));
  }
  // In offline mode a list that was never saved is just empty (a fresh device), not an error.
  const empty = () => (offlineModeActive() ? done([]) : MISS);
  if (LISTS.includes(p.slice(1))) {
    const v = await idbGet(`list:${p.slice(1)}`);
    return v ? done(v) : empty();
  }
  if (p === "/schedules") {
    const list = await idbGet<ScheduleSummary[]>("schedules:list");
    return list ? done(list) : empty();
  }
  if (/^\/schedules\/[0-9a-f]{24}$/.test(p)) {
    const s = await idbGet<Schedule>(`schedule:${p.split("/")[2]}`);
    return s ? done(s) : MISS;
  }
  if (p === "/wrappers") {
    const v = await idbGet("wrappers");
    return v ? done(v) : empty();
  }
  if (p === "/session") {
    const v = await idbGet("session");
    return v ? done(v) : offlineModeActive() ? done({ session: null }) : MISS;
  }
  if (p === "/scene-templates") {
    const v = await idbGet(q.get("kind") === "prayer" ? "templates:prayer" : "templates");
    return v ? done(v) : empty();
  }
  if (p === "/media") {
    const all = await idbGet<MediaItem[]>("media");
    if (!all) return MISS;
    const purpose = q.get("purpose");
    return done(purpose ? all.filter((m) => m.purpose === purpose) : all);
  }
  if (p === "/bibles") {
    const v = await idbGet("bibles:meta");
    return v ? done(v) : MISS;
  }
  const bible = /^\/bibles\/([^/]+)\/(books|chapter|find|smart)$/.exec(p);
  if (bible) {
    const chapters = await chaptersOf(bible[1]);
    if (!chapters) return MISS;
    if (bible[2] === "books") return done(localBooks(chapters));
    if (bible[2] === "chapter") return done(localChapter(chapters, Number(q.get("book")), Number(q.get("chapter"))));
    if (bible[2] === "find") return done(localFind(bible[1], chapters, q.get("q") ?? ""));
    return done(localSmart(bible[1], chapters, q.get("q") ?? ""));
  }
  return MISS;
}
