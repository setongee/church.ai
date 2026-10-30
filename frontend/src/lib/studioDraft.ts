// Image Studio for someone with only the Presenter job: their designs, templates and uploaded pictures are kept on their own
// device (see draft.ts) and laid over what the server returns, until they send them for review.
import { draftOps, keepLocalUrls, newLocalId, PASS, record, showLocalUrls, stashFile, studioDraftEnabled } from "./draft";

type Json = Record<string, unknown>;
type Raw = (path: string, init?: RequestInit) => Promise<unknown>;

const isLocal = (id: string) => id.startsWith("local_");
const now = () => new Date().toISOString();
const clamp = (n: unknown, fallback: number) => (Number.isFinite(Number(n)) ? Math.min(4000, Math.max(100, Math.round(Number(n)))) : fallback);

const created = (area: string, id?: string) => draftOps().filter((o) => o.collection === area && o.method === "POST" && (!id || o.tempId === id));
const patched = (area: string, id: string) => draftOps().find((o) => o.collection === area && o.method === "PUT" && o.id === id)?.body as Json | undefined;
const gone = (area: string) => new Set(draftOps().filter((o) => o.collection === area && o.method === "DELETE").map((o) => o.id));

// A design as the app expects it, built from what was recorded.
function designOf(id: string, body: Json, at?: number): Json {
  const c = (body.create ?? {}) as Json;
  const p = (body.patch ?? {}) as Json;
  const exp = body.export as { dataUrl?: string } | undefined;
  return {
    _id: id,
    session: c.sessionId || undefined,
    source: c.source ?? "blank",
    sourceId: c.sourceId,
    text: c.text ?? "",
    title: c.title,
    width: c.width,
    height: c.height,
    presentation: Boolean(c.presentation),
    generatedImages: [],
    ...p,
    ...(exp?.dataUrl ? { exportedImageUrl: exp.dataUrl } : {}),
    createdAt: at ? new Date(at).toISOString() : now(),
    updatedAt: now(),
  };
}

// What the server holds for a live design, with this device's edits on top. The first read is remembered, so the editor's
// frequent saves don't each go back to the server.
const liveBase = new Map<string, Json>();
async function liveDesign(id: string, raw: Raw): Promise<{ design: Json; session: unknown }> {
  const hit = liveBase.get(id);
  if (hit) return { design: hit, session: null };
  const res = (await raw(`/api/designs/${id}`)) as { design: Json; session: unknown };
  liveBase.set(id, res.design);
  return res;
}
function withEdits(id: string, design: Json): Json {
  const op = patched("designs", id);
  const exp = (op?.export as { dataUrl?: string } | undefined)?.dataUrl;
  return { ...design, ...((op?.patch as Json) ?? {}), ...(exp ? { exportedImageUrl: exp } : {}) };
}

export async function studioDraftRequest<T>(path: string, init: RequestInit | undefined, raw: Raw): Promise<T | typeof PASS> {
  if (!studioDraftEnabled()) return PASS;
  const method = (init?.method ?? "GET").toUpperCase();
  const [pathOnly, qs = ""] = path.split("?");
  const query = new URLSearchParams(qs);
  const json = () => JSON.parse(String(init?.body ?? "{}")) as Json;

  // ---- designs ----
  if (pathOnly === "/api/designs") {
    if (method === "GET") {
      const live = ((await raw(path)) as Json[]).filter((d) => !gone("designs").has(String(d._id))).map((d) => {
        const { editorState, ...rest } = withEdits(String(d._id), d);
        void editorState;
        return rest;
      });
      const made = created("designs")
        .map((o): Json => ({ ...designOf(o.tempId, o.body ?? {}, o.at), editorState: undefined }))
        .filter((d) => (query.get("session") ? d.session === query.get("session") : query.get("scope") === "standalone" ? !d.session : true))
        .filter((d) => query.get("presentation") !== "1" || d.presentation);
      return [...made, ...live] as T;
    }
    if (method === "POST") {
      const b = json();
      const src = (["blank", "quote", "post"] as const).find((s) => s === b.source) ?? "blank";
      const text = String(b.text ?? "");
      const presentation = b.presentation === true;
      const createInput: Json = {
        ...(b.sessionId ? { sessionId: b.sessionId } : {}),
        source: src,
        ...(b.sourceId ? { sourceId: b.sourceId } : {}),
        text,
        title: String(b.title ?? "").trim() || (text.replace(/\s+/g, " ").trim().slice(0, 40) || "Untitled design"),
        width: presentation ? 1920 : clamp(b.width, 1080),
        height: presentation ? 1080 : clamp(b.height, 1350),
        presentation,
      };
      let patch: Json = {};
      // A copy is worked out here, from the original, so what's on screen is what will be published.
      if (typeof b.copyFrom === "string" && b.copyFrom) {
        const from = isLocal(b.copyFrom) ? designOf(b.copyFrom, (created("designs", b.copyFrom)[0]?.body ?? {}) as Json) : withEdits(b.copyFrom, (await liveDesign(b.copyFrom, raw)).design);
        const { editorState, backgroundUrl, caption, imagePrompt } = from as Json;
        createInput.text = from.text ?? "";
        createInput.width = from.width;
        createInput.height = from.height;
        createInput.presentation = Boolean(from.presentation);
        createInput.title = `${from.title} (copy)`;
        patch = keepLocalUrls({ ...(editorState ? { editorState } : {}), ...(backgroundUrl ? { backgroundUrl } : {}), ...(caption ? { caption } : {}), ...(imagePrompt ? { imagePrompt } : {}) });
      }
      const tempId = newLocalId();
      const body = { create: createInput, patch };
      await record({ method: "POST", collection: "designs", id: "", tempId, label: String(createInput.title), body });
      return { design: showLocalUrls(designOf(tempId, body)), existing: false } as T;
    }
  }

  const d = pathOnly.match(/^\/api\/designs\/([^/]+)(\/export)?$/);
  if (d && d[1] !== "animation-effects" && d[1] !== "animations") {
    const id = d[1];
    const local = isLocal(id);
    const mine = created("designs", id)[0];
    if (local && !mine) throw new Error("That design isn’t on this device any more.");

    if (!d[2] && method === "GET") {
      if (mine) return { design: showLocalUrls(designOf(id, mine.body ?? {}, mine.at)), session: null } as T;
      const live = await liveDesign(id, raw);
      if (gone("designs").has(id)) throw new Error("design not found");
      return { design: showLocalUrls(withEdits(id, live.design)), session: live.session } as T;
    }
    if (!d[2] && method === "PATCH") {
      const patch = keepLocalUrls(json());
      await record({ method: "PUT", collection: "designs", id, tempId: "", label: String(patch.title ?? "Design"), body: { patch } });
      const base = mine ? designOf(id, mine.body ?? {}, mine.at) : withEdits(id, (await liveDesign(id, raw)).design);
      return showLocalUrls({ ...base, ...patch }) as T;
    }
    if (!d[2] && method === "DELETE") {
      await record({ method: "DELETE", collection: "designs", id, tempId: "", label: "Remove design", body: null });
      return { ok: true } as T;
    }
    if (d[2] && method === "POST") {
      const b = json();
      const dataUrl = String(b.dataUrl ?? "");
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) throw new Error("dataUrl must be a base64 png/jpeg/webp image");
      const patch = b.editorState !== undefined ? { editorState: keepLocalUrls(b.editorState) } : {};
      await record({ method: "PUT", collection: "designs", id, tempId: "", label: "Exported picture", body: { patch, export: { dataUrl } } });
      const base = mine ? designOf(id, mine.body ?? {}, mine.at) : withEdits(id, (await liveDesign(id, raw)).design);
      return showLocalUrls({ ...base, ...patch, exportedImageUrl: dataUrl }) as T;
    }
  }
  // Captions, Instagram posts and animations act on the saved design on the server.
  const act = pathOnly.match(/^\/api\/designs\/(local_[^/]+)\/(caption|publish|animate)/);
  if (act) throw new Error("Do that once the design has been published. It only exists on this device for now.");

  // ---- templates ----
  if (pathOnly === "/api/templates") {
    if (method === "GET") {
      const live = ((await raw(path)) as Json[]).filter((t) => !gone("templates").has(String(t._id))).map((t) => ({ ...t, ...(patched("templates", String(t._id)) ?? {}) }));
      const made = created("templates").map((o) => ({ ...(o.body ?? {}), _id: o.tempId, createdAt: new Date(o.at).toISOString(), updatedAt: now() }));
      return [...made, ...live] as T;
    }
    if (method === "POST") {
      const body = keepLocalUrls(json());
      const tempId = newLocalId();
      await record({ method: "POST", collection: "templates", id: "", tempId, label: String(body.name ?? "Template"), body });
      return { ...body, _id: tempId, createdAt: now(), updatedAt: now() } as T;
    }
  }
  const t = pathOnly.match(/^\/api\/templates\/([^/]+)$/);
  if (t && t[1] !== "override") {
    const id = t[1];
    if (method === "PUT") {
      const body = keepLocalUrls(json());
      await record({ method: "PUT", collection: "templates", id, tempId: "", label: String(body.name ?? "Template"), body });
      const base = created("templates", id)[0]?.body ?? {};
      return { ...base, ...body, _id: id, updatedAt: now() } as T;
    }
    if (method === "DELETE") {
      await record({ method: "DELETE", collection: "templates", id, tempId: "", label: "Remove template", body: null });
      return { ok: true } as T;
    }
  }

  if (pathOnly === "/api/editor/generate-image") throw new Error("AI pictures aren’t available while your work is kept on this device. Upload a picture instead, or ask an admin.");

  // ---- pictures uploaded into the editor ----
  if (pathOnly === "/api/editor/upload" && method === "POST") {
    const form = init?.body as FormData;
    const file = form.get("image") as File | null;
    if (!file) throw new Error("image file is required");
    const kind = form.get("kind") === "lower-third" ? "lower-third" : form.get("kind") === "upload" ? "upload" : "";
    const { id, url } = await stashFile(file);
    await record({ method: "POST", collection: "uploads", id: "", tempId: id, label: file.name, body: { kind } });
    return { url, asset: kind ? { _id: id, url, kind, name: file.name.replace(/\.[^.]+$/, ""), createdAt: now() } : null } as T;
  }
  if (pathOnly === "/api/editor/images" && method === "GET") {
    const want = query.get("kind") === "lower-third" ? "lower-third" : "upload";
    const live = (await raw(path)) as Json[];
    const made = created("uploads")
      .filter((o) => (o.body?.kind as string) === want)
      .map((o) => showLocalUrls({ _id: o.tempId, url: `local://${o.tempId}`, kind: want, name: o.label.replace(/\.[^.]+$/, ""), createdAt: new Date(o.at).toISOString() }));
    return [...made, ...live] as T;
  }
  const img = pathOnly.match(/^\/api\/editor\/images\/(local_[^/]+)$/);
  if (img && method === "DELETE") {
    await record({ method: "DELETE", collection: "uploads", id: img[1], tempId: "", label: "Remove picture", body: null });
    return { ok: true } as T;
  }
  return PASS;
}
