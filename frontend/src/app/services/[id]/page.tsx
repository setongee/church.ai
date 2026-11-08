"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createSessionForService,
  deleteService,
  deleteSession,
  getService,
  importAudioSession,
  updateSessionInfo,
  updateService,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { useCached } from "@/lib/queries";
import type { ServiceDetail } from "@/lib/types";
import { RosterCard } from "@/components/RosterCard";
import { StartServiceButton } from "@/components/LiveServiceCard";
import { Modal } from "@/components/present/ui";
import { Pencil, Plus } from "lucide-react";

const SESSION_TYPE_SUGGESTIONS = [
  "Prayer Session",
  "Message Session",
  "Fresh Fire Session",
];

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const admin = Boolean(user?.isAdmin);
  const [tab, setTab] = useState<"sessions" | "import" | "roster">("sessions");
  const [title, setTitle] = useState("");
  const [preacher, setPreacher] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false); // the new-session modal
  const [confirmDelete, setConfirmDelete] = useState(false); // the delete-service modal
  const [deleting, setDeleting] = useState(false);
  // Rename dialogs: the service (name + date, admins) or a session (name).
  const [editService, setEditService] = useState<{ name: string; date: string } | null>(null);
  const [editSession, setEditSession] = useState<{ id: string; title: string; preacher: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const canRename = Boolean(user?.isAdmin || user?.roles.includes("manager"));
  const [deleteError, setDeleteError] = useState("");

  // Cached per service: opens instantly from what was fetched before and re-checks in the background.
  const { data: detailData, set: setDetailData } = useCached<ServiceDetail>(["service", id], () => getService(id));
  const detail = detailData ?? null;
  const setDetail = (update: (d: ServiceDetail | null) => ServiceDetail | null) => setDetailData((prev) => update(prev ?? null) ?? undefined);

  const [importTitle, setImportTitle] = useState("");
  const [importPreacher, setImportPreacher] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setImportError("");
    if (!importTitle.trim() || !importPreacher.trim() || !importFile) {
      setImportError("Title, preacher and an audio file are all required.");
      return;
    }
    setImporting(true);
    try {
      const session = await importAudioSession(id, {
        title: importTitle.trim(),
        preacher: importPreacher.trim(),
        audio: importFile,
      });
      router.push(`/sessions/${session._id}?tab=reels`);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import audio",
      );
      setImporting(false);
    }
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim() || !preacher.trim()) {
      setError("Title and preacher are both required.");
      return;
    }
    setLoading(true);
    try {
      const session = await createSessionForService(id, {
        title: title.trim(),
        preacher: preacher.trim(),
      });
      router.push(`/sessions/${session._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setLoading(false);
    }
  }

  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-8xl px-4 py-10 text-sm text-neutral-400 sm:px-20">
        Loading...
      </main>
    );
  }

  const { service, sessions } = detail;

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-20 sm:py-10">
      <Link
        href="/services"
        className="text-xs text-neutral-400 hover:text-neutral-600"
      >
        &larr; All services
      </Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900">
          {service.name}
          {admin && (
            <button
              type="button"
              aria-label="Edit service name and date"
              title="Edit name and date"
              onClick={() => {
                setEditError("");
                setEditService({ name: service.name, date: service.date ? service.date.slice(0, 10) : "" });
              }}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-orange-600"
            >
              <Pencil size={16} />
            </button>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
        {canRename && <StartServiceButton serviceId={id} serviceName={service.name} />}
        {admin && (
          <button
            type="button"
            onClick={() => {
              setDeleteError("");
              setConfirmDelete(true);
            }}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            Delete service
          </button>
        )}
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        {service.date
          ? new Date(service.date).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })
          : `Created ${new Date(service.createdAt).toLocaleDateString()}`}
      </p>

      <div
        role="tablist"
        className="mt-6 inline-flex gap-1 rounded-full bg-neutral-100 p-1"
      >
        {(
          [
            ["sessions", "Sessions"],
            ["import", "Import Audio"],
            ["roster", "Roster"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "roster" && <RosterCard serviceId={id} />}

      {tab === "sessions" && (
        <div className="mt-6 flex justify-between">
          <p className="text-sm text-neutral-500">
            Sessions are automatically created when you start a live stream.
          </p>
          <button
            onClick={() => {
              setTitle("");
              setPreacher("");
              setError("");
              setStarting(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700"
          >
            <Plus size={16} /> Start a new session
          </button>
        </div>
      )}

      {tab === "import" && (
        <form onSubmit={handleImport} className="mt-6 rounded-lg bg-white p-6">
          <h2 className="text-base font-medium text-neutral-900">
            Or import a recording
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Upload an existing audio file (mp3, wav, m4a). It&apos;s transcribed
            and summarised like a live session, and you can turn its best
            moments into reels.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <input
              value={importTitle}
              onChange={(e) => setImportTitle(e.target.value)}
              placeholder="Session title *"
              disabled={importing}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <input
              value={importPreacher}
              onChange={(e) => setImportPreacher(e.target.value)}
              placeholder="Preacher *"
              disabled={importing}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.mp4"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            disabled={importing}
            className="mt-4 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
          />
          {importError && (
            <p className="mt-3 text-sm text-red-600">{importError}</p>
          )}
          {importing && (
            <p className="mt-3 text-sm text-neutral-500">
              Uploading and transcribing — this can take a minute or two for a
              long recording. Keep this page open.
            </p>
          )}
          <button
            type="submit"
            disabled={importing}
            className="mt-5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import audio"}
          </button>
        </form>
      )}

      {tab === "sessions" && error && !starting && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {tab === "sessions" && (
        <ul className="mt-2 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {sessions.length === 0 && (
            <li className="col-span-full rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-400">
              No sessions yet. Use “Start a new session” to begin one.
            </li>
          )}
          {sessions.map((s) => (
            <li key={s._id} className="group relative">
              {canRename && (
                <button
                  type="button"
                  aria-label={`Edit ${s.title}`}
                  onClick={() => {
                    setEditError("");
                    setEditSession({ id: s._id, title: s.title, preacher: s.preacher });
                  }}
                  className={`absolute top-2 z-10 rounded-md px-1.5 py-0.5 text-xs text-neutral-300 opacity-0 hover:bg-neutral-100 hover:text-orange-600 focus:opacity-100 group-hover:opacity-100 ${admin ? "right-16" : "right-2"}`}
                >
                  Edit
                </button>
              )}
              {admin && (
                <button
                  type="button"
                  aria-label={`Delete ${s.title}`}
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete the session "${s.title}" with its transcript, quotes, reels and videos? This cannot be undone.`,
                      )
                    )
                      return;
                    try {
                      await deleteSession(s._id);
                      setDetail((d) =>
                        d
                          ? {
                              ...d,
                              sessions: d.sessions.filter(
                                (x) => x._id !== s._id,
                              ),
                            }
                          : d,
                      );
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Failed to delete",
                      );
                    }
                  }}
                  className="absolute right-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-xs text-neutral-300 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => router.push(`/sessions/${s._id}`)}
                className="cursor-pointer flex h-full w-full flex-col items-start gap-1 rounded-xl bg-white p-6 text-left hover:border-neutral-300"
              >
                <span className="text-md font-medium text-neutral-900">
                  {s.title}
                </span>
                <span className="text-sm text-neutral-500">{s.preacher}</span>
                <span
                  className={`mt-5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.status === "live" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                >
                  {s.status === "live" ? "LIVE" : "Ended"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {starting && (
        <Modal
          title="Start a new session"
          guard
          onClose={() => !loading && setStarting(false)}
        >
          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Session title *
              </label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Prayer Session"
                list="session-type-suggestions"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
              <datalist id="session-type-suggestions">
                {SESSION_TYPE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Preacher *
              </label>
              <input
                value={preacher}
                onChange={(e) => setPreacher(e.target.value)}
                placeholder="Pastor Jane Doe"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStarting(false)}
                disabled={loading}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !title.trim() || !preacher.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Starting…" : "Start streaming"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editService && (
        <Modal title="Edit service" guard onClose={() => !saving && setEditService(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setEditError("");
              try {
                const updated = await updateService(id, { name: editService.name.trim(), date: editService.date || null });
                setDetail((d) => (d ? { ...d, service: { ...d.service, name: updated.name, date: updated.date } } : d));
                setEditService(null);
              } catch (err) {
                setEditError(err instanceof Error ? err.message : "Couldn’t save");
              }
              setSaving(false);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-neutral-700">Service name *</label>
              <input autoFocus value={editService.name} onChange={(e) => setEditService({ ...editService, name: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Service date</label>
              <input type="date" value={editService.date} onChange={(e) => setEditService({ ...editService, date: e.target.value })} className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none" />
              <p className="mt-1 text-xs text-neutral-400">Moves it on the team&apos;s calendars. Clear it to leave the service undated.</p>
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditService(null)} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button type="submit" disabled={saving || !editService.name.trim()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editSession && (
        <Modal title="Edit session" guard onClose={() => !saving && setEditSession(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              setEditError("");
              try {
                const updated = await updateSessionInfo(editSession.id, { title: editSession.title.trim(), preacher: editSession.preacher.trim() });
                setDetail((d) => (d ? { ...d, sessions: d.sessions.map((x) => (x._id === updated._id ? { ...x, title: updated.title, preacher: updated.preacher } : x)) } : d));
                setEditSession(null);
              } catch (err) {
                setEditError(err instanceof Error ? err.message : "Couldn’t save");
              }
              setSaving(false);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-neutral-700">Session name *</label>
              <input autoFocus value={editSession.title} onChange={(e) => setEditSession({ ...editSession, title: e.target.value })} list="session-type-suggestions" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Preacher *</label>
              <input value={editSession.preacher} onChange={(e) => setEditSession({ ...editSession, preacher: e.target.value })} placeholder="Pastor Jane Doe" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none" />
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditSession(null)} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button type="submit" disabled={saving || !editSession.title.trim() || !editSession.preacher.trim()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete this service?"
          onClose={() => !deleting && setConfirmDelete(false)}
        >
          <p className="text-sm leading-relaxed text-neutral-600">
            <b className="text-neutral-900">{service.name}</b> and{" "}
            {sessions.length === 0 ? (
              "everything in it"
            ) : (
              <>
                all {sessions.length} of its{" "}
                {sessions.length === 1 ? "session" : "sessions"}
              </>
            )}{" "}
            — transcripts, quotes, reels and videos — will be deleted for good.
            This can&apos;t be undone.
          </p>
          {deleteError && (
            <p className="mt-3 text-sm text-red-600">{deleteError}</p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              autoFocus
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setDeleting(true);
                setDeleteError("");
                try {
                  await deleteService(service._id);
                  router.push("/services");
                } catch (err) {
                  setDeleteError(
                    err instanceof Error ? err.message : "Failed to delete",
                  );
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete service"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
