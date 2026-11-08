// Work a non-admin does in Present stays on THEIR device. Every change is recorded here (IndexedDB, per person) and laid
// over what the server returns, so it looks and behaves as if it were saved - but nothing reaches the live data until the
// person sends it for review and an admin accepts it (see lib/review.ts, the /review page and the server's submissions).
import { useSyncExternalStore } from "react";
import { authHeaders, handleUnauthorized, type AuthUser } from "./auth";
import { afterMutation } from "./cache";
import { offlineModeActive } from "./offlineMode";
import { idbGet } from "./offline/idb";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface DraftOp {
  method: "POST" | "PUT" | "DELETE";
  collection: string;
  id: string; // the item it applies to (a live id, or a device-made `local_…` id)
  tempId: string; // set on a create: the id the device gave it
  label: string;
  body: Record<string, unknown> | null;
  at: number;
}

// Changes that carry a picture or video from the device.
const FILE_AREAS = new Set(["media", "uploads"]);

const isTemp = (v: unknown): v is string => typeof v === "string" && v.startsWith("local_");
export const isLocalId = isTemp;
const makeId = () => `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ---- storage ------------------------------------------------------------------------------------

const DB = "fafc-drafts";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return undefined; // private windows etc.: drafts then last only until the page closes
  }
}

interface State {
  userId: string;
  studio: boolean; // Image Studio changes are drafted too (they have no design/manager/social job)
  ops: DraftOp[];
  blobs: Map<string, { blob: Blob; name: string }>;
  urls: Map<string, string>; // tempId -> object URL, so a device-made picture can be shown
}
let state: State | null = null;
let ready: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

const opsKey = (u: string) => `${u}:ops`;
const blobKey = (u: string, id: string) => `${u}:blob:${id}`;

async function persist() {
  if (!state) return;
  await idb("readwrite", (s) => s.put(state!.ops, opsKey(state!.userId)));
}

// Called when the signed-in person is known (or they sign out). Admins don't use drafts: their changes are live.
export function setDraftUser(user: Pick<AuthUser, "_id" | "isAdmin" | "roles"> | null) {
  if (!user || user.isAdmin) {
    if (state) for (const u of state.urls.values()) URL.revokeObjectURL(u);
    state = null;
    emit();
    return;
  }
  const studio = !(user.roles ?? []).some((r) => r === "design" || r === "manager" || r === "social");
  if (state?.userId === user._id) {
    state.studio = studio;
    return;
  }
  const next: State = { userId: user._id, studio, ops: [], blobs: new Map(), urls: new Map() };
  state = next;
  ready = (async () => {
    const ops = (await idb<DraftOp[]>("readonly", (s) => s.get(opsKey(user._id) as IDBValidKey) as IDBRequest<DraftOp[]>)) ?? [];
    next.ops = Array.isArray(ops) ? ops : [];
    for (const op of next.ops) {
      if (FILE_AREAS.has(op.collection) && op.method === "POST") {
        const rec = await idb<{ blob: Blob; name: string }>("readonly", (s) => s.get(blobKey(user._id, op.tempId)) as IDBRequest<{ blob: Blob; name: string }>);
        if (rec) {
          next.blobs.set(op.tempId, rec);
          next.urls.set(op.tempId, URL.createObjectURL(rec.blob));
        }
      }
    }
    emit();
  })();
}

export const draftEnabled = () => state !== null;
export const studioDraftEnabled = () => state?.studio === true;
export const draftsReady = () => ready;
export const draftCount = () => state?.ops.length ?? 0;

export function useDraftCount() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (state?.ops.length ?? 0) * 1_000_000 + (version % 1_000_000),
    () => 0,
  );
}

// A device-made picture/video has the address `local://<id>`; this turns it into something an <img> can show.
export const localUrl = (url: string): string => (url.startsWith("local://") ? (state?.urls.get(url.slice(8)) ?? "") : url);

// ---- recording changes --------------------------------------------------------------------------

function labelOf(body: Record<string, unknown> | null, fallback: string) {
  const b = body ?? {};
  for (const k of ["name", "title", "reference", "text"]) if (typeof b[k] === "string" && (b[k] as string).trim()) return (b[k] as string).trim().slice(0, 80);
  return fallback;
}

// Folding a later edit into an earlier change: plain fields are replaced, but a design's `patch` (the fields saved onto it)
// accumulates.
function mergeBody(a: Record<string, unknown> | null, b: Record<string, unknown> | null) {
  const x = a ?? {};
  const y = b ?? {};
  const patch = x.patch && y.patch ? { patch: { ...(x.patch as object), ...(y.patch as object) } } : {};
  return { ...x, ...y, ...patch };
}

// Adds a change, folding it into earlier ones about the same item so the reviewer sees one tidy change per item.
export async function record(op: Omit<DraftOp, "at">) {
  const s = state!;
  const { collection } = op;
  const mine = (o: DraftOp) => o.collection === collection && (o.id === op.id || o.tempId === op.id);
  if (op.method === "PUT") {
    const create = s.ops.find((o) => o.method === "POST" && o.collection === collection && o.tempId === op.id);
    if (create) {
      create.body = mergeBody(create.body, op.body);
      create.label = op.label || create.label;
    } else {
      const prev = s.ops.find((o) => o.method === "PUT" && o.collection === collection && o.id === op.id);
      if (prev) {
        prev.body = mergeBody(prev.body, op.body);
        prev.label = op.label || prev.label;
      } else s.ops.push({ ...op, at: Date.now() });
    }
  } else if (op.method === "DELETE") {
    const made = isTemp(op.id) && s.ops.some((o) => o.method === "POST" && o.tempId === op.id);
    s.ops = s.ops.filter((o) => !mine(o));
    if (made) {
      s.blobs.delete(op.id);
      const u = s.urls.get(op.id);
      if (u) URL.revokeObjectURL(u);
      s.urls.delete(op.id);
      void idb("readwrite", (st) => st.delete(blobKey(s.userId, op.id)));
    } else s.ops.push({ ...op, at: Date.now() });
  } else s.ops.push({ ...op, at: Date.now() });
  await persist();
  emit();
  afterMutation(); // lists on screen re-read, now with this change laid over them
}

export async function discardDrafts() {
  await ready;
  const s = state;
  if (!s) return;
  for (const id of s.blobs.keys()) await idb("readwrite", (st) => st.delete(blobKey(s.userId, id)));
  for (const u of s.urls.values()) URL.revokeObjectURL(u);
  s.ops = [];
  s.blobs.clear();
  s.urls.clear();
  clearLocalSession();
  await persist();
  emit();
  afterMutation();
}

export function listDraftOps(): DraftOp[] {
  return state ? [...state.ops] : [];
}

// ---- sending for review -------------------------------------------------------------------------

export async function submitDrafts(input: { title: string; note: string }) {
  await ready;
  const s = state;
  if (!s || !s.ops.length) throw new Error("There is nothing to send yet.");
  const form = new FormData();
  form.set("payload", JSON.stringify({ ...input, ops: s.ops }));
  for (const [id, rec] of s.blobs) form.append(id, rec.blob, rec.name);
  const res = await fetch(`${API_URL}/api/submissions`, { method: "POST", headers: authHeaders(), body: form, cache: "no-store" });
  if (res.status === 401) handleUnauthorized();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  // What was sent is now with the reviewer; the device starts clean (what's live shows up once it's approved).
  for (const id of s.blobs.keys()) await idb("readwrite", (st) => st.delete(blobKey(s.userId, id)));
  for (const u of s.urls.values()) URL.revokeObjectURL(u);
  s.ops = [];
  s.blobs.clear();
  s.urls.clear();
  clearLocalSession();
  await persist();
  emit();
  afterMutation();
  return body;
}

// ---- a service running on a device-made schedule ------------------------------------------------

// The server only knows live schedules, so a service started on a device-made one is remembered here.
interface LocalSession {
  _id: string;
  schedule: string;
  scheduleName: string;
  startedAt: string;
}
const sessionKey = () => (state ? `draftSession:${state.userId}` : "");
const readLocalSession = (): LocalSession | null => {
  try {
    return state ? (JSON.parse(localStorage.getItem(sessionKey()) || "null") as LocalSession | null) : null;
  } catch {
    return null;
  }
};
const writeLocalSession = (s: LocalSession | null) => {
  try {
    if (!state) return;
    if (s) localStorage.setItem(sessionKey(), JSON.stringify(s));
    else localStorage.removeItem(sessionKey());
  } catch {}
};
function clearLocalSession() {
  writeLocalSession(null);
}

// ---- laying drafts over the live data -----------------------------------------------------------

const COLLECTIONS = new Set(["songs", "announcements", "scene-templates", "wrappers", "prayers", "quotes", "slideshows", "scripture-box", "schedules", "media"]);
type Json = Record<string, unknown>;
const dateNow = () => new Date().toISOString();

const patchesFor = (c: string) => new Map(state!.ops.filter((o) => o.collection === c && o.method === "PUT").map((o) => [o.id, o.body ?? {}]));
const goneFor = (c: string) => new Set(state!.ops.filter((o) => o.collection === c && o.method === "DELETE").map((o) => o.id));
const createdFor = (c: string) => state!.ops.filter((o) => o.collection === c && o.method === "POST");

function build(collection: string, id: string, body: Json): Json {
  if (collection === "schedules") return { _id: id, name: String(body.name ?? ""), items: ((body.items as Json[]) ?? []).map((i) => ({ ...i, _id: i._id ?? makeId() })), settings: body.settings ?? {}, createdAt: dateNow() };
  return { ...body, _id: id, createdAt: dateNow() };
}

function mergeOne(collection: string, live: Json): Json | null {
  if (goneFor(collection).has(String(live._id))) return null;
  const patch = patchesFor(collection).get(String(live._id));
  return patch ? { ...live, ...patch, _id: live._id } : live;
}

const matches = (collection: string, item: Json, query: URLSearchParams) => {
  if (collection === "media") {
    const purpose = query.get("purpose");
    return !purpose || item.purpose === purpose;
  }
  if (collection === "scene-templates") return query.get("kind") === "prayer" ? item.kind === "prayer" : item.kind !== "prayer";
  if (collection === "songs") {
    const hymn = query.get("category") === "hymn";
    if ((item.category === "hymn") !== hymn) return false;
    const q = (query.get("q") ?? "").trim().toLowerCase();
    return !q || ["title", "author", "lyrics", "number"].some((f) => String(item[f] ?? "").toLowerCase().includes(q));
  }
  return true;
};

const summary = (s: Json) => ({ _id: s._id, name: s.name, count: ((s.items as unknown[]) ?? []).length });

export const PASS = Symbol("pass");

// Handles one Present API call for a non-admin. Returns PASS when the call isn't something drafts cover (it then goes
// to the server as usual); otherwise the answer the server would have given.
export async function draftRequest<T>(path: string, init: RequestInit | undefined, raw: (path: string, init?: RequestInit) => Promise<unknown>): Promise<T | typeof PASS> {
  if (!state) return PASS;
  const live = () => raw(path, init) as Promise<T>;
  await ready;
  const method = (init?.method ?? "GET").toUpperCase();
  const [pathOnly, qs = ""] = path.split("?");
  const query = new URLSearchParams(qs);

  if (pathOnly === "/session") return sessionRequest<T>(method, init, raw);

  // A song file import is read on the server without saving; what it found becomes songs on this device.
  if (pathOnly === "/songs/import" && method === "POST") {
    const found = (await raw("/songs/import?preview=1", init)) as { created: Json[]; skipped: unknown[]; failed: unknown[] };
    const created: Json[] = [];
    for (const song of found.created) {
      const { _id, ...body } = song;
      void _id;
      const tempId = makeId();
      await record({ method: "POST", collection: "songs", id: "", tempId, label: labelOf(body, "Song"), body });
      created.push(build("songs", tempId, body));
    }
    return { ...found, created } as T;
  }

  const m = pathOnly.match(/^\/([a-z-]+)(?:\/([^/]+))?$/);
  if (!m || !COLLECTIONS.has(m[1])) return PASS;
  const [, collection, id] = m;
  if (id === "find" || id === "import") return PASS;

  // Reads: what's live, with the drafts laid over it.
  if (method === "GET") {
    if (id) {
      const local = createdFor(collection).find((o) => o.tempId === id);
      if (local) return build(collection, id, local.body ?? {}) as T;
      const item = mergeOne(collection, (await live()) as Json);
      if (!item) throw new Error("Not found.");
      return item as T;
    }
    const liveList = ((await live()) as Json[]).map((i) => mergeOne(collection, i)).filter(Boolean) as Json[];
    const made = createdFor(collection).map((o) => build(collection, o.tempId, o.body ?? {})).map((i) => {
      if (collection === "media") return { ...i, url: `local://${i._id}`, type: mediaTypeOf(state!.blobs.get(String(i._id))?.blob), name: i.name ?? "" };
      return i;
    });
    const list = (collection === "media" ? [...made, ...liveList] : [...liveList, ...made]).filter((i) => matches(collection, i, query));
    return (collection === "schedules" ? list.map(summary) : list) as T;
  }

  // Writes: recorded here, answered as the server would.
  if (method === "POST") {
    const tempId = makeId();
    if (collection === "media") {
      const form = init?.body as FormData;
      const file = form.get("file") as File | null;
      if (!file) throw new Error("Choose a picture, GIF or video.");
      const purpose = form.get("purpose") === "background" ? "background" : "media";
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
      state!.blobs.set(tempId, { blob: file, name: file.name });
      state!.urls.set(tempId, URL.createObjectURL(file));
      await idb("readwrite", (s) => s.put({ blob: file, name: file.name }, blobKey(state!.userId, tempId)));
      await record({ method: "POST", collection, id: "", tempId, label: name || "Picture", body: { purpose } });
      return { _id: tempId, url: `local://${tempId}`, name, type: mediaTypeOf(file), purpose, createdAt: dateNow() } as T;
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    await record({ method: "POST", collection, id: "", tempId, label: labelOf(body, collection), body });
    const made = build(collection, tempId, body);
    return (collection === "scripture-box" ? { item: made, added: true } : made) as T;
  }

  if (method === "PUT" && id) {
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    await record({ method: "PUT", collection, id, tempId: "", label: labelOf(body, collection), body });
    return build(collection, id, body) as T;
  }

  if (method === "DELETE" && id) {
    await record({ method: "DELETE", collection, id, tempId: "", label: `Remove ${collection.replace(/s$/, "").replace("-", " ")}`, body: null });
    return { ok: true } as T;
  }
  return PASS;
}

const mediaTypeOf = (b?: Blob) => (!b ? "image" : b.type === "image/gif" ? "gif" : b.type.startsWith("video/") ? "video" : "image");

async function sessionRequest<T>(method: string, init: RequestInit | undefined, raw: (path: string, init?: RequestInit) => Promise<unknown>): Promise<T | typeof PASS> {
  const local = readLocalSession();
  const scheduleId = method === "POST" || method === "PUT" ? (JSON.parse(String(init?.body ?? "{}")) as { scheduleId?: string }).scheduleId : undefined;
  // Offline mode has no server session: the service is whatever was started on this device.
  if (method === "GET") return local ? ({ session: local } as T) : offlineModeActive() ? ({ session: null } as T) : PASS;
  if (method === "DELETE") {
    writeLocalSession(null);
    return PASS;
  }
  if (scheduleId && isTemp(scheduleId)) {
    const op = createdFor("schedules").find((o) => o.tempId === scheduleId);
    const session: LocalSession = { _id: local?._id ?? makeId(), schedule: scheduleId, scheduleName: String(op?.body?.name ?? "Schedule"), startedAt: local?.startedAt ?? dateNow() };
    writeLocalSession(session);
    return { session } as T;
  }
  if (offlineModeActive() && scheduleId && !isTemp(scheduleId)) {
    const doc = await idbGet<{ name?: string }>(`schedule:${scheduleId}`);
    const session: LocalSession = { _id: local?._id ?? makeId(), schedule: scheduleId, scheduleName: String(doc?.name ?? "Schedule"), startedAt: local?.startedAt ?? dateNow() };
    writeLocalSession(session);
    return { session } as T;
  }
  // Moving from a device-made schedule to a live one: there is no live service to switch, so start one.
  if (method === "PUT" && local) {
    writeLocalSession(null);
    return (await raw("/session", { method: "POST", body: JSON.stringify({ scheduleId }) })) as T;
  }
  if (method === "POST") writeLocalSession(null);
  return PASS;
}

// ---- helpers for the Image Studio layer (studioDraft.ts) -----------------------------------------

export const draftOps = (): DraftOp[] => state?.ops ?? [];
export const newLocalId = makeId;

// Keeps a picture made on the device; returns its id and an address the page can show right now.
export async function stashFile(file: File): Promise<{ id: string; url: string }> {
  await ready;
  const id = makeId();
  state!.blobs.set(id, { blob: file, name: file.name });
  const url = URL.createObjectURL(file);
  state!.urls.set(id, url);
  await idb("readwrite", (s) => s.put({ blob: file, name: file.name }, blobKey(state!.userId, id)));
  return { id, url };
}

// A saved design holds `local://<id>` for pictures made on the device; the editor needs real addresses, and what it saves
// back has to go in as `local://` again.
export function showLocalUrls<T>(value: T): T {
  if (!state?.urls.size) return value;
  let json = JSON.stringify(value);
  if (!json || !json.includes("local://")) return value;
  for (const [id, url] of state.urls) json = json.split(`local://${id}`).join(url);
  return JSON.parse(json) as T;
}
export function keepLocalUrls<T>(value: T): T {
  if (!state?.urls.size) return value;
  let json = JSON.stringify(value);
  if (!json) return value;
  let hit = false;
  for (const [id, url] of state.urls) {
    if (json.includes(url)) {
      json = json.split(url).join(`local://${id}`);
      hit = true;
    }
  }
  return hit ? (JSON.parse(json) as T) : value;
}

// ---- a picture on its way to the screen ----------------------------------------------------------

// A projector on another machine can't see this device's pictures, so each one that goes to the screen is parked on the
// server for a day or two and the screen is given that address instead.
const staged = new Map<string, Promise<string>>();
function stageOne(id: string): Promise<string> {
  let p = staged.get(id);
  if (!p) {
    const rec = state?.blobs.get(id);
    if (!rec) return Promise.resolve("");
    p = (async () => {
      const form = new FormData();
      form.append("file", rec.blob, rec.name);
      const res = await fetch(`${API_URL}/api/present/stage`, { method: "POST", headers: authHeaders(), body: form, cache: "no-store" });
      if (res.status === 401) handleUnauthorized();
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body?.error || "Couldn’t send that picture to the screen.");
      return `${API_URL}${body.url}`;
    })().catch((e) => {
      staged.delete(id);
      throw e;
    });
    staged.set(id, p);
  }
  return p;
}

export async function stageForOutput<T>(value: T): Promise<T> {
  if (!state) return value;
  let json = JSON.stringify(value);
  if (!json || !json.includes("local://")) return value;
  for (const m of new Set(json.match(/local:\/\/local_[a-z0-9]+/g) ?? [])) {
    const url = await stageOne(m.slice(8));
    if (url) json = json.split(m).join(url);
  }
  return JSON.parse(json) as T;
}
