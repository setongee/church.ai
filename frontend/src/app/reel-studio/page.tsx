"use client";

import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteCompilation,
  deleteCustomReel,
  deletePhotoReel,
  deleteReel,
  getReelLibrary,
  getService,
  importAudioSession,
  listServices,
  type LibraryItem,
} from "@/lib/api";
import { PhotoStudio } from "@/components/PhotoStudio";
import { RecapReelStudio } from "@/components/RecapReelStudio";
import { useCached } from "@/lib/queries";
import type { Service, ServiceDetail } from "@/lib/types";

type Mode = "full" | "moments";
type Tab = "library" | "create";
type Source = "photos" | "upload" | "session" | "custom";

const KIND_LABEL: Record<LibraryItem["kind"], string> = {
  reel: "Audio reel",
  merged: "Merged video",
  photo: "Photo reel",
  custom: "Custom template",
};
const STATUS_STYLE: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-800",
  draft: "bg-neutral-100 text-neutral-600",
  queued: "bg-amber-100 text-amber-800",
  rendering: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-700",
};

export default function ReelStudioPage() {
  const [tab, setTab] = useState<Tab>("library");
  const [source, setSource] = useState<Source | null>(null);
  const [focusPhoto, setFocusPhoto] = useState<string | undefined>();

  function openPhoto(id: string) {
    setFocusPhoto(id);
    setSource("photos");
    setTab("create");
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Reel Studio
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            All your reels in one place - edit, download or delete them, or make
            a new one from photos or audio.
          </p>
        </div>
        <button
          onClick={() => {
            setTab("create");
            setSource(null);
            setFocusPhoto(undefined);
          }}
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Create new reel
        </button>
      </div>

      <div className="mt-6 flex gap-1 border-b border-neutral-200">
        {(
          [
            ["library", "My reels"],
            ["create", "Create new"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative px-4 py-2.5 text-sm font-medium ${tab === id ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-800"}`}
          >
            {label}
            {tab === id && (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-neutral-900" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "library" ? (
          <Library onOpenPhoto={openPhoto} onCreate={() => setTab("create")} />
        ) : (
          <CreateNew
            source={source}
            onSource={setSource}
            focusPhoto={focusPhoto}
            onSaved={() => setTab("library")}
          />
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- library

function Library({
  onOpenPhoto,
  onCreate,
}: {
  onOpenPhoto: (id: string) => void;
  onCreate: () => void;
}) {
  const router = useRouter();
  // Cached: the library opens instantly from the last fetch. While any video is still rendering it re-checks every
  // couple of seconds, so progress stays live.
  const {
    data: itemsData,
    set: setItems,
    error: loadError,
  } = useCached<LibraryItem[]>(
    ["reel-library"],
    () => getReelLibrary().then((r) => r.items),
    {
      refetchInterval: (q) =>
        q.state.data?.some(
          (i) => i.status === "queued" || i.status === "rendering",
        )
          ? 2500
          : false,
    },
  );
  const items = itemsData ?? (loadError ? [] : null);
  const [filter, setFilter] = useState<"all" | LibraryItem["kind"]>("all");
  const [actionError, setError] = useState("");
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const error =
    actionError || (loadError && !itemsData ? loadError.message : "");

  function edit(i: LibraryItem) {
    if (i.kind === "custom") return;
    if (i.kind === "photo") return onOpenPhoto(i.id);
    router.push(
      `/sessions/${i.sessionId}?tab=${i.kind === "reel" ? "reels" : "merged"}&open=${i.id}`,
    );
  }

  async function remove(i: LibraryItem) {
    if (!confirm(`Delete "${i.title}"? Its video file is removed too.`)) return;
    try {
      await (i.kind === "reel"
        ? deleteReel(i.id)
        : i.kind === "merged"
          ? deleteCompilation(i.id)
          : i.kind === "custom"
            ? deleteCustomReel(i.id)
            : deletePhotoReel(i.id));
      setItems(
        (prev) =>
          prev?.filter((x) => !(x.id === i.id && x.kind === i.kind)) ?? prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (items === null)
    return <p className="text-sm text-neutral-400">Loading…</p>;
  const shown = items.filter((i) => filter === "all" || i.kind === filter);
  const count = (k: LibraryItem["kind"]) =>
    items.filter((i) => i.kind === k).length;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", `All (${items.length})`],
            ["reel", `Audio reels (${count("reel")})`],
            ["merged", `Merged (${count("merged")})`],
            ["photo", `Photo reels (${count("photo")})`],
            ["custom", `Custom (${count("custom")})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
          <p className="text-sm text-neutral-500">
            {items.length === 0 ? "No reels yet." : "Nothing in this view."}
          </p>
          <button
            onClick={onCreate}
            className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create your first reel
          </button>
        </div>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {shown.map((i) => (
            <li
              key={`${i.kind}-${i.id}`}
              className="overflow-hidden rounded-2xl bg-white"
            >
              <div className="relative aspect-[9/12] bg-neutral-900">
                {i.videoUrl ? (
                  // A still of the reel (its first frames) - not playable here; the Preview button opens it.
                  <button
                    onClick={() => setPreview(i)}
                    aria-label={`Preview ${i.title}`}
                    className="group relative block h-full w-full"
                  >
                    <video
                      src={`${i.videoUrl}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      tabIndex={-1}
                      className="pointer-events-none h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-[#ffffff] opacity-0 transition group-hover:opacity-100">
                        <Play size={20} fill="currentColor" className="translate-x-px" />
                      </span>
                    </span>
                  </button>
                ) : i.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={i.thumb}
                    alt={i.title}
                    className="h-full w-full object-cover opacity-70"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-6 text-center text-sm text-neutral-400">
                    Not rendered yet
                  </div>
                )}
                <span
                  className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[i.status] ?? STATUS_STYLE.draft}`}
                >
                  {i.status === "rendering" || i.status === "queued"
                    ? `${i.status === "queued" ? "Queued" : "Rendering"} ${i.progress}%`
                    : i.status === "done"
                      ? "Ready"
                      : i.status === "error"
                        ? "Failed"
                        : "Draft"}
                </span>
              </div>
              <div className="p-4">
                <p
                  className="truncate text-sm font-semibold text-neutral-900"
                  title={i.title}
                >
                  {i.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {KIND_LABEL[i.kind]}
                  {i.full ? " · full message" : ""}
                  {i.kind === "photo" && i.photoCount
                    ? ` · ${i.photoCount} photos`
                    : ""}
                  {i.durationSec ? ` · ${Math.round(i.durationSec)}s` : ""}
                </p>
                {(i.serviceName || i.sessionTitle) && (
                  <p className="mt-0.5 truncate text-xs text-neutral-400">
                    {[i.serviceName, i.sessionTitle]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {i.status === "error" && i.error && (
                  <p className="mt-1 line-clamp-2 text-xs text-red-600">
                    {i.error}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {i.kind !== "custom" && (
                    <button
                      onClick={() => edit(i)}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                    >
                      Edit
                    </button>
                  )}
                  {i.videoUrl && (
                    <a
                      href={i.videoUrl}
                      download
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100"
                    >
                      Download
                    </a>
                  )}
                  <button
                    onClick={() => remove(i)}
                    className="ml-auto rounded-md px-2 py-1.5 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {preview && <ReelPreviewModal item={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ReelPreviewModal({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="truncate text-sm font-semibold text-neutral-100" title={item.title}>
            {item.title}
          </p>
          <button onClick={onClose} aria-label="Close preview" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800">
            <X size={18} />
          </button>
        </div>
        <video src={item.videoUrl} controls autoPlay playsInline className="max-h-[78vh] w-full bg-black object-contain" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- create new

function CreateNew({
  source,
  onSource,
  focusPhoto,
  onSaved,
}: {
  source: Source | null;
  onSource: (s: Source | null) => void;
  focusPhoto?: string;
  onSaved: () => void;
}) {
  if (!source) {
    return (
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          What do you want to make the reel from?
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [
                "photos",
                "Photos",
                "Upload photos from a service or event - animated templates, lower thirds, music and a carousel.",
              ],
              [
                "upload",
                "A new audio recording",
                "Upload an mp3 / voice note. Captions are timed to the words. Use it whole or find the best moments.",
              ],
              [
                "session",
                "A recorded service",
                "Pick a session you already have - highlights, a full message (up to 5 minutes) or merged videos.",
              ],
              [
                "custom",
                "Custom templates",
                "Ready-made reel generators with their own inputs - like the Recap Reel from clips, photos, a message and music.",
              ],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              onClick={() => onSource(id)}
              className="rounded-2xl bg-white p-5 text-left transition hover:border-neutral-900 hover:shadow-md"
            >
              <span className="block text-sm font-semibold text-neutral-900">
                {label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-neutral-500">
                {hint}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      {source !== "custom" && (
        <button
          onClick={() => onSource(null)}
          className="mb-5 text-xs text-neutral-400 hover:text-neutral-700"
        >
          &larr; Choose a different source
        </button>
      )}
      {source === "photos" ? (
        <PhotoStudio focusId={focusPhoto} />
      ) : source === "custom" ? (
        <CustomTemplates onSaved={onSaved} />
      ) : source === "upload" ? (
        <AudioReelForm />
      ) : (
        <SessionPicker />
      )}
    </div>
  );
}

// Custom templates: self-contained reel generators. Each one lists the inputs it needs, then renders in the browser.
const CUSTOM_TEMPLATES = [
  {
    id: "recap-reel",
    name: "Recap Reel",
    hint: "Beat-synced 9:16 service recap: hero shot, clip and photo montage, the word (message audio over slow-mo), a SEE YOU NEXT WEEK outro and a closing card. Needs clips/photos, a message clip and optional music.",
  },
] as const;

function CustomTemplates({ onSaved }: { onSaved: () => void }) {
  const [active, setActive] = useState<(typeof CUSTOM_TEMPLATES)[number]["id"] | null>(null);
  const template = CUSTOM_TEMPLATES.find((t) => t.id === active);

  if (!template) {
    return (
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Choose a custom template</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CUSTOM_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className="rounded-2xl bg-white p-5 text-left transition hover:border-neutral-900 hover:shadow-md"
            >
              <span className="block text-sm font-semibold text-neutral-900">{t.name}</span>
              <span className="mt-1 block text-xs leading-relaxed text-neutral-500">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <button onClick={() => setActive(null)} className="mb-4 text-xs text-neutral-400 hover:text-neutral-700">
        &larr; Choose a different template
      </button>
      <h2 className="mb-4 text-base font-semibold text-neutral-900">{template.name}</h2>
      <RecapReelStudio onSaved={onSaved} />
    </div>
  );
}

// Choose an existing service + session, then continue in that session's Reels tab.
function SessionPicker() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [detail, setDetail] = useState<ServiceDetail | null>(null);

  useEffect(() => {
    listServices()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Pick a recorded service
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Reels are made from a session&apos;s audio, so choose one that has
          finished.
        </p>
      </div>
      <label className="block text-sm font-medium text-neutral-700">
        Service
        <select
          defaultValue=""
          onChange={(e) => {
            setDetail(null);
            if (e.target.value)
              getService(e.target.value)
                .then(setDetail)
                .catch(() => {});
          }}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
        >
          <option value="">
            {services === null ? "Loading…" : "Choose a service"}
          </option>
          {services?.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {detail && (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {detail.sessions.filter((s) => s.status === "ended").length === 0 && (
            <li className="px-4 py-4 text-sm text-neutral-400">
              No finished sessions in this service yet.
            </li>
          )}
          {detail.sessions
            .filter((s) => s.status === "ended")
            .map((s) => (
              <li
                key={s._id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-medium text-neutral-900">
                    {s.title}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {s.preacher}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Link
                    href={`/sessions/${s._id}?tab=reels`}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100"
                  >
                    Highlights
                  </Link>
                  <Link
                    href={`/sessions/${s._id}?tab=reels&full=1`}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100"
                  >
                    Full message
                  </Link>
                  <Link
                    href={`/sessions/${s._id}?tab=merged`}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                  >
                    Merged video
                  </Link>
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// Upload any recording - an announcement, a confession, a short message - and get a reel from it.
function AudioReelForm() {
  const router = useRouter();
  const [services, setServices] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [title, setTitle] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [mode, setMode] = useState<Mode>("full");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listServices()
      .then((list) => {
        setServices(list);
        setServiceId(list[0]?._id ?? "");
      })
      .catch(() => setServices([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!serviceId || !title.trim() || !speaker.trim() || !file) {
      setError(
        "Pick a service, add a title and speaker, and choose an audio file.",
      );
      return;
    }
    setBusy(true);
    try {
      const session = await importAudioSession(serviceId, {
        title: title.trim(),
        preacher: speaker.trim(),
        audio: file,
        mode,
      });
      router.push(`/sessions/${session._id}?tab=reels`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Make a reel from an audio file
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          The audio is transcribed with word timings so the captions land
          exactly on the words.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-800">
          What should the reel use?
        </legend>
        {(
          [
            [
              "full",
              "The whole recording",
              "One reel from the entire audio, uncut. Best for announcements, confessions and short messages.",
            ],
            [
              "moments",
              "The best moments",
              "Finds the strongest points in a longer recording and makes a reel for each.",
            ],
          ] as const
        ).map(([id, label, hint]) => (
          <label
            key={id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${mode === id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}
          >
            <input
              type="radio"
              name="mode"
              checked={mode === id}
              onChange={() => setMode(id)}
              className="mt-1 accent-neutral-900"
            />
            <span>
              <span className="block text-sm font-medium text-neutral-900">
                {label}
              </span>
              <span className="block text-xs text-neutral-500">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
          Service
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
          >
            {services === null && <option>Loading…</option>}
            {services?.length === 0 && (
              <option value="">
                No services yet - create one on the Services page
              </option>
            )}
            {services?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunday Announcements"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Speaker
          <input
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            placeholder="Pastor Jane Doe"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-neutral-700">
        Audio file
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.mp4"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {busy && (
        <p className="text-sm text-neutral-500">
          Uploading and transcribing — this can take a minute or two for a long
          recording. Keep this page open.
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? "Working…" : "Create reel"}
      </button>
    </form>
  );
}
