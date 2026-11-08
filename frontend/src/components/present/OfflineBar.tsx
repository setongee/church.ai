"use client";

import { useEffect, useState } from "react";
import { CloudOff, HardDriveDownload, Loader2, RefreshCw } from "lucide-react";
import { checkForUpdates, setUpdates, syncAll, useOfflineStatus } from "@/lib/offline/offline";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

// Keeps this device's offline copy fresh: the first time it saves everything on its own; after that it checks for new songs,
// Bibles and backgrounds when Present opens, when the window comes back into focus and every few minutes, and asks first.
function useOfflineWatcher() {
  useEffect(() => {
    const run = async () => {
      if (!navigator.onLine) return;
      const r = await checkForUpdates().catch(() => "same" as const);
      if (r !== "first") return;
      // The first copy can be a few hundred MB (Bibles and backgrounds): on mobile data or data saver, ask first.
      const conn = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
      if (conn?.saveData || conn?.type === "cellular") setUpdates(["Nothing is saved on this device yet"]);
      else void syncAll();
    };
    void run();
    const t = setInterval(run, 5 * 60_000);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
    };
  }, []);
}

// Small status in the header: is there a copy on this device, and how fresh is it. Click to save a fresh one.
export function OfflineChip() {
  useOfflineWatcher();
  const s = useOfflineStatus();
  const saved = s.syncedAt > 0;
  return (
    <button
      onClick={() => void syncAll()}
      disabled={s.syncing || s.offline}
      title={saved ? "Songs, Bibles, schedules and backgrounds are saved on this device. Click to refresh the copy." : "Save songs, Bibles and backgrounds on this device so Present works with no internet."}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-default ${s.syncing ? "bg-blue-50 text-blue-700" : saved ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
    >
      {s.syncing ? <Loader2 size={13} className="animate-spin" /> : <HardDriveDownload size={13} />}
      {s.syncing ? "Saving…" : saved ? `Offline copy · ${ago(s.syncedAt)}` : "Not saved offline"}
    </button>
  );
}

export function OfflineBanner() {
  const s = useOfflineStatus();
  const [hidden, setHidden] = useState("");
  const key = s.updates.join("|");
  if (s.syncing) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-800" role="status">
        <Loader2 size={15} className="shrink-0 animate-spin" />
        <span className="min-w-0 truncate">Saving to this device so Present works offline · {s.progress}</span>
      </div>
    );
  }
  if (s.offline) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
        <CloudOff size={16} className="mt-0.5 shrink-0" />
        <span>
          <b>You’re offline.</b> Present keeps running from the copy on this device{s.syncedAt ? ` (saved ${ago(s.syncedAt)})` : s.seeded ? " (the built-in Bibles, hymns and backgrounds)" : " — but nothing has been saved here yet, so songs and Bibles may not load"}. Changes to the schedule are kept and sent when you’re back.
        </span>
      </div>
    );
  }
  if (s.updates.length && hidden !== key) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-900" role="status">
        <RefreshCw size={15} className="shrink-0" />
        <span className="min-w-0 flex-1">{s.updates.join(" · ")}. Save them to this device so they work offline.</span>
        <button onClick={() => void syncAll()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-blue-700">
          Sync offline
        </button>
        <button onClick={() => setHidden(key)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
          Later
        </button>
      </div>
    );
  }
  if (s.error && hidden !== s.error) {
    return (
      <button onClick={() => setHidden(s.error)} className="rounded-xl bg-red-50 px-4 py-2.5 text-left text-sm text-red-700">
        {s.error} <span className="text-red-400">(dismiss)</span>
      </button>
    );
  }
  return null;
}
