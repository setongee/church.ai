"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Check, Clapperboard, Images, Copy, ExternalLink, ImageIcon, Loader2, RefreshCw, Send, Trash2, UploadCloud } from "lucide-react";
import { addCarouselMedia, assetUrl, createCarouselPost, generateCarouselPostCaption, updateCarouselPost } from "@/lib/api";
import { MusicPicker } from "@/components/MusicPicker";
import { createPostUpload, deletePostUpload, getPostUpload, listPostUploads, publishPostUpload, rewriteCaptions, setPostMusic, updatePostUpload, type PostUpload } from "@/lib/postUpload";
import { useCached } from "@/lib/queries";
import { Modal } from "@/components/present/ui";
import { ScheduleUploadModal } from "@/components/calendar/ScheduleUploadModal";

const TONES = ["Inspiring", "Warm", "Bold", "Playful", "Reflective"];
const LIMIT = 2200;
const STEPS = ["Uploaded", "Converting for Instagram", "Listening to the video", "Writing caption ideas"];

export default function UploadPostPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-6 sm:py-10 lg:px-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Upload &amp; post</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Upload a video or picture, let the AI listen and write captions that get people watching and talking, edit if you like, then post it to Instagram from here.</p>
        </div>
        {id && (
          <button onClick={() => router.push("/upload-post")} className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-orange-300 hover:text-orange-700">
            ← All uploads
          </button>
        )}
      </div>
      {id ? <Editor key={id} id={id} /> : <Start />}
    </main>
  );
}

// ---- step 1: pick the file ------------------------------------------------------------------------

function Start() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const file = files.length === 1 ? files[0] : null;
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const { data: recent, set: setRecent } = useCached<PostUpload[]>(["post-uploads"], listPostUploads);

  async function go() {
    if (!files.length) return;
    setError("");
    setPct(0);
    try {
      if (files.length > 1) {
        // Several files make a carousel: one slide each, in the order picked.
        const picked = files.slice(0, 10);
        const post = await createCarouselPost({ title: notes.trim().split("\n")[0].slice(0, 80) || "Untitled carousel" });
        for (const [i, f] of picked.entries()) {
          await addCarouselMedia(post._id, f);
          setPct(Math.round(((i + 1) / picked.length) * 100));
        }
        if (notes.trim()) {
          await updateCarouselPost(post._id, { notes });
          await generateCarouselPostCaption(post._id).catch(() => {});
        }
        router.push(`/carousels/${post._id}`);
        return;
      }
      const doc = await createPostUpload(files[0], { notes, tone }, setPct);
      router.push(`/upload-post?id=${doc._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPct(null);
    }
  }
  const kindOf = (f: File) => (f.type.startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(f.name) ? "video" : f.type.startsWith("image") || /\.(png|jpe?g|webp|heic)$/i.test(f.name) ? "image" : "");
  const pick = (list?: FileList | File[] | null) => {
    const all = Array.from(list ?? []);
    if (!all.length) return;
    const ok = all.filter(kindOf);
    if (!ok.length) return setError("Choose a video or a picture.");
    setFiles(ok.slice(0, 10));
    setError(ok.length < all.length ? "Some files weren’t pictures or videos and were left out." : all.length > 10 ? "A carousel holds up to 10, so the first 10 were kept." : "");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-5 rounded-2xl bg-white p-5 sm:p-6">
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => (e.preventDefault(), setOver(false), pick(e.dataTransfer.files))}
          className={`grid min-h-52 cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition ${over ? "border-orange-500 bg-orange-50" : files.length ? "border-orange-300 bg-orange-50/40" : "border-neutral-300 hover:border-orange-300"}`}
        >
          <input ref={input} type="file" accept="video/*,image/*,.mp4,.mov,.m4v,.webm,.png,.jpg,.jpeg,.webp,.heic" hidden multiple onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          {files.length > 1 ? (
            <div>
              <Images size={30} className="mx-auto text-orange-600" />
              <p className="mt-3 text-sm font-semibold text-neutral-900">{files.length} files → one swipeable carousel</p>
              <p className="mx-auto mt-1 max-w-sm truncate text-xs text-neutral-500">{files.map((f) => f.name).join(", ")}</p>
              <p className="mt-1 text-xs text-neutral-500">Click to choose different files. You’ll arrange them and add music next.</p>
            </div>
          ) : file ? (
            <div>
              {file.type.startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(file.name) ? <Clapperboard size={30} className="mx-auto text-orange-600" /> : <ImageIcon size={30} className="mx-auto text-orange-600" />}
              <p className="mt-3 text-sm font-semibold text-neutral-900">{file.name}</p>
              <p className="text-xs text-neutral-500">{(file.size / 1048576).toFixed(1)} MB · click to choose another</p>
            </div>
          ) : (
            <div>
              <UploadCloud size={32} className="mx-auto text-neutral-400" />
              <p className="mt-3 text-sm font-semibold text-neutral-900">Drop a video or picture here, or click to browse</p>
              <p className="mt-1 text-xs text-neutral-500">Vertical video (9:16) works best for Reels. Choose several pictures or videos to make a carousel. MP4 or MOV up to 800 MB.</p>
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">What’s it about? (optional — makes the caption sharper)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1500} placeholder="e.g. Highlights from Friday’s youth night — Pastor Ada on starting again after a setback" className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900" />
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Tone</span>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button key={t} onClick={() => setTone(tone === t ? "" : t)} aria-pressed={tone === t} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tone === t ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {pct !== null && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">{pct < 100 ? `Uploading… ${pct}%` : "Upload done — getting it ready…"}</p>
          </div>
        )}
        <button onClick={go} disabled={!files.length || pct !== null} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
          {pct !== null ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} {files.length > 1 ? `Make a carousel from ${files.length} files` : "Upload & write captions"}
        </button>
      </section>

      <aside className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">Recent uploads</h2>
        {!recent?.length && <p className="rounded-2xl bg-white p-5 text-sm text-neutral-400">Nothing uploaded yet.</p>}
        {recent?.map((u) => (
          <div key={u._id} className="group flex items-center gap-3 rounded-2xl bg-white p-3">
            <Link href={`/upload-post?id=${u._id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                {u.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(u.posterUrl)} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-neutral-900">{u.title || u.originalName}</span>
                <span className="block text-xs text-neutral-500">
                  {u.instagramMediaId ? <span className="font-semibold text-green-700">Posted</span> : u.status === "processing" ? "Getting ready…" : u.status === "error" ? <span className="text-red-600">Failed</span> : "Draft"} · {new Date(u.createdAt).toLocaleDateString()}
                </span>
              </span>
            </Link>
            <button
              onClick={async () => {
                if (!window.confirm(`Delete “${u.title || u.originalName}”?${u.instagramMediaId ? " (It stays on Instagram.)" : ""}`)) return;
                await deletePostUpload(u._id).catch(() => {});
                setRecent((l) => l?.filter((x) => x._id !== u._id));
              }}
              aria-label="Delete"
              className="rounded-md p-1.5 text-neutral-300 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </aside>
    </div>
  );
}

// ---- step 2: captions, then post --------------------------------------------------------------------

function Editor({ id }: { id: string }) {
  const [doc, setDoc] = useState<PostUpload | null>(null);
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const seeded = useRef(false);

  // Poll while it's being prepared; once ready, seed the editor from what the server wrote.
  const apply = useCallback((d: PostUpload) => {
    setDoc(d);
    if (d.status === "ready" && !seeded.current) {
      seeded.current = true;
      setCaption(d.caption);
      setNotes(d.notes);
      setTone(d.tone);
    }
  }, []);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const d = await getPostUpload(id);
        if (stop) return;
        apply(d);
        if (d.status === "processing") setTimeout(tick, 1500);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Couldn’t load this");
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [id, apply]);

  if (error && !doc) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!doc) return <p className="text-sm text-neutral-400">Loading…</p>;

  const posted = Boolean(doc.instagramMediaId);
  const stepIndex = doc.status === "ready" ? 4 : /convert|prepar/i.test(doc.stage) ? 1 : /listen/i.test(doc.stage) ? 2 : /writing|caption/i.test(doc.stage) ? 3 : 1;
  const hook = caption.split("\n")[0] ?? "";

  async function rewrite() {
    setBusy("rewrite");
    setError("");
    try {
      const d = await rewriteCaptions(id, { notes, tone });
      setDoc(d);
      setCaption(d.caption);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t rewrite");
    }
    setBusy("");
  }
  async function chooseMusic(music: { trackId: string; level: number } | null) {
    setBusy("music");
    setError("");
    try {
      setDoc(await setPostMusic(id, { trackId: music?.trackId ?? "", level: music?.level }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add the music");
    }
    setBusy("");
  }
  async function publish() {
    setBusy("publish");
    setError("");
    try {
      const d = await publishPostUpload(id, caption);
      setDoc(d);
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t post it");
    }
    setBusy("");
  }

  // Preparing…
  if (doc.status === "processing") {
    return (
      <section className="mx-auto max-w-lg rounded-2xl bg-white p-8">
        <h2 className="text-lg font-semibold text-neutral-900">Getting “{doc.title || doc.originalName}” ready</h2>
        <ol className="mt-5 space-y-3">
          {(doc.kind === "image" ? [STEPS[0], "Preparing the picture", STEPS[3]] : STEPS).map((s, i) => {
            const done = i < stepIndex;
            const now = i === stepIndex;
            return (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className={`grid h-6 w-6 place-items-center rounded-full ${done ? "bg-green-500 text-[#ffffff]" : now ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-400"}`}>{done ? <Check size={14} /> : now ? <Loader2 size={14} className="animate-spin" /> : i + 1}</span>
                <span className={done ? "text-neutral-500" : now ? "font-semibold text-neutral-900" : "text-neutral-400"}>{s}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-xs text-neutral-400">This takes a moment — a few seconds for a short clip, longer for a long one. You can leave this page; it will be in Recent uploads.</p>
      </section>
    );
  }
  if (doc.status === "error") {
    return (
      <section className="mx-auto max-w-lg rounded-2xl bg-red-50 p-6">
        <h2 className="text-base font-semibold text-red-800">That didn’t work</h2>
        <p className="mt-1 text-sm text-red-700">{doc.error}</p>
        <Link href="/upload-post" className="mt-4 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-[#ffffff]">
          Try another file
        </Link>
      </section>
    );
  }

  const aiNote =
    doc.aiWritten ? null : doc.aiIssue === "credits" ? "The AI writer is paused (the OpenRouter key is out of credit), so these captions were built from the video’s own words." : doc.aiIssue === "busy" ? "The AI is busy for a moment, so these captions were built from the video’s own words. Press “Rewrite” in a little while for AI-written ones." : doc.aiIssue === "nothing-to-go-on" ? "There’s no speech in this to go on. Tell the AI what it’s about below and press “Rewrite”." : "The AI writer isn’t reachable right now, so these were built from the video’s own words.";

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      {/* The upload */}
      <aside className="space-y-4">
        <div className="overflow-hidden rounded-2xl bg-white">
          {doc.kind === "video" || doc.musicUrl ? (
            <video key={doc.musicUrl || doc.mediaUrl} src={assetUrl(doc.musicUrl || doc.mediaUrl)} poster={doc.posterUrl ? assetUrl(doc.posterUrl) : undefined} controls playsInline className="max-h-[28rem] w-full bg-black object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(doc.mediaUrl)} alt="" className="max-h-[28rem] w-full bg-neutral-100 object-contain" />
          )}
          <div className="p-4">
            <p className="truncate text-sm font-semibold text-neutral-900">{doc.title || doc.originalName}</p>
            <p className="text-xs text-neutral-500">
              {doc.kind === "video" ? `${Math.round(doc.durationSec)}s · ` : ""}
              {doc.width}×{doc.height}
            </p>
            {doc.kind === "video" && doc.durationSec > 180 && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">Reels over 3 minutes may be refused by Instagram.</p>}
            {doc.kind === "video" && doc.width > 0 && doc.height / doc.width < 1.5 && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">This isn’t vertical (9:16), so it may show with bars as a Reel.</p>}
          </div>
        </div>

        {!posted && (
          <div className="rounded-2xl bg-white p-4">
            <p className="text-sm font-semibold text-neutral-900">Music</p>
            <p className="mb-3 mt-0.5 text-xs text-neutral-500">
              {doc.kind === "video" ? "Mixed in under the video’s own sound." : "A picture can’t carry sound, so with music it’s posted as a 10-second Reel."} Instagram’s own song library can’t be attached from outside the app, so pick from ours or add your own.
            </p>
            <MusicPicker
              value={doc.music ?? null}
              disabled={!!busy}
              onChange={(m) => void chooseMusic(m)}
              onAddCredit={(line) => {
                const next = caption.trim() ? `${caption.trim()}\n\n${line}` : line;
                setCaption(next);
                void updatePostUpload(id, { caption: next }).catch(() => {});
              }}
            />
            {busy === "music" && (
              <p className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 size={13} className="animate-spin" /> Mixing the music in… a long video can take a minute.
              </p>
            )}
          </div>
        )}

        {doc.transcript && (
          <div className="rounded-2xl bg-white p-4">
            <button onClick={() => setShowText((s) => !s)} className="flex w-full items-center justify-between text-sm font-semibold text-neutral-900">
              What the AI heard <span className="text-xs font-medium text-orange-600">{showText ? "Hide" : "Show"}</span>
            </button>
            {doc.summary && <p className="mt-1 text-xs text-neutral-500">{doc.summary}</p>}
            {showText && <p className="mt-3 max-h-60 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-neutral-700">{doc.transcript}</p>}
          </div>
        )}
      </aside>

      {/* Captions + posting */}
      <section className="space-y-5">
        {posted ? (
          <div className="rounded-2xl bg-green-50 p-6">
            <p className="flex items-center gap-2 text-base font-semibold text-green-800">
              <Check size={18} /> Posted to Instagram
            </p>
            <p className="mt-1 text-sm text-green-700">{doc.instagramPublishedAt ? new Date(doc.instagramPublishedAt).toLocaleString() : ""}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {doc.instagramPermalink && (
                <a href={doc.instagramPermalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-[#ffffff]">
                  <ExternalLink size={14} /> View on Instagram
                </a>
              )}
              <Link href="/published" className="rounded-lg border border-green-300 px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-100">
                See how it’s doing
              </Link>
            </div>
          </div>
        ) : (
          <>
            {aiNote && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{aiNote}</p>}
            <div className="rounded-2xl bg-white p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-neutral-900">Caption ideas</h2>
              <p className="mb-4 text-xs text-neutral-500">Pick one to start from, then change anything you like.</p>
              <div className="grid gap-3 md:grid-cols-3">
                {doc.options.map((o) => {
                  const on = caption === o.caption;
                  return (
                    <button key={o.label} onClick={() => setCaption(o.caption)} aria-pressed={on} className={`flex flex-col rounded-xl p-4 text-left transition ${on ? "bg-orange-50 ring-2 ring-orange-400" : "bg-neutral-50 hover:bg-neutral-100"}`}>
                      <span className="text-xs font-bold uppercase tracking-wider text-orange-700">{o.label}</span>
                      <span className="mt-1.5 line-clamp-6 whitespace-pre-line text-[13px] leading-snug text-neutral-800">{o.caption}</span>
                      {o.why && <span className="mt-2 text-[11px] text-neutral-500">{o.why}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 sm:p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">Your caption</h2>
                <span className={`text-xs tabular-nums ${caption.length > LIMIT ? "font-semibold text-red-600" : "text-neutral-400"}`}>
                  {caption.length} / {LIMIT}
                </span>
              </div>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => void updatePostUpload(id, { caption }).catch(() => {})} rows={9} className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-neutral-900" />
              <p className="mt-2 text-xs text-neutral-500">
                {hook.length > 125 ? <span className="text-amber-700">The first line is {hook.length} characters — Instagram cuts it at about 125, so make the hook shorter. </span> : <>First line (what shows before “more”): <b className="text-neutral-700">{hook.length}</b> characters. </>}
                {(caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length} hashtags.
              </p>

              <div className="mt-5 grid gap-4 border-t border-neutral-100 pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-3">
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tell the AI more (what it’s about, who it’s for, what you want people to do)…" className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900" />
                  <div className="flex flex-wrap gap-1.5">
                    {TONES.map((t) => (
                      <button key={t} onClick={() => setTone(tone === t ? "" : t)} aria-pressed={tone === t} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tone === t ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={rewrite} disabled={!!busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50">
                  <RefreshCw size={15} className={busy === "rewrite" ? "animate-spin" : ""} /> Rewrite captions
                </button>
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(caption);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy caption"}
              </button>
              <button onClick={() => setScheduling(true)} disabled={caption.length > LIMIT} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50">
                <CalendarPlus size={15} /> Add to calendar
              </button>
              <button onClick={() => (setError(""), setConfirm(true))} disabled={!caption.trim() || caption.length > LIMIT} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
                <Send size={15} /> Post to Instagram…
              </button>
            </div>
          </>
        )}
      </section>

      {scheduling && <ScheduleUploadModal upload={doc} caption={caption} onClose={() => setScheduling(false)} />}
      {confirm && (
        <Modal title="Post to Instagram?" onClose={() => busy !== "publish" && setConfirm(false)} wide>
          <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
            <span className="block aspect-[9/16] max-h-64 overflow-hidden rounded-xl bg-neutral-100">
              {doc.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(doc.posterUrl)} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <div>
              <p className="text-sm text-neutral-600">
                This goes live on your <b className="text-neutral-900">real Instagram account</b> right now{doc.kind === "video" || doc.musicUrl ? ", as a Reel" : ""}. Posting a video can take a minute or two.
              </p>
              <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-[13px] leading-relaxed text-neutral-800">{caption}</p>
              {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setConfirm(false)} disabled={busy === "publish"} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  Cancel
                </button>
                <button onClick={publish} disabled={busy === "publish"} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-60">
                  {busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {busy === "publish" ? "Posting… don’t close this" : "Post now"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
