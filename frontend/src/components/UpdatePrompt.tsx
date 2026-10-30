"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, X } from "lucide-react";

const RUNNING = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const CHECK_EVERY_MS = 5 * 60 * 1000;

// The installed app (home-screen app or desktop app) is the live site in a window, so a new version is there as soon as the
// page reloads. Someone who leaves it open for days never reloads, though - so every few minutes, and whenever they come
// back to it, ask the server which version is live and offer a one-tap update when it isn't the one running.
// It never reloads by itself: a service may be running.
export function UpdatePrompt() {
  const pathname = usePathname();
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !RUNNING) return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`/version?t=${Date.now()}`, { cache: "no-store" });
        const { id } = (await res.json()) as { id?: string };
        if (alive && id && id !== RUNNING) setStale(true);
      } catch {
        // offline or the server is restarting: try again later
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void check();
    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  async function update() {
    try {
      await (await navigator.serviceWorker?.getRegistration())?.update();
    } catch {}
    window.location.reload();
  }

  // The projector window and the sign-in page are left alone.
  if (!stale || dismissed || pathname.startsWith("/present/output") || pathname === "/login") return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-[80] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-orange-200 bg-white py-2.5 pl-4 pr-2.5 shadow-xl">
      <RefreshCw size={16} className="shrink-0 text-orange-600" />
      <p className="text-sm text-neutral-800">
        <b>A new version is ready.</b> <span className="text-neutral-500">Update to get the latest.</span>
      </p>
      <button onClick={() => void update()} className="shrink-0 rounded-full bg-orange-600 px-4 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
        Update now
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Later" className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100">
        <X size={15} />
      </button>
    </div>
  );
}
