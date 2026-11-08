"use client";

import { useEffect, useState } from "react";
import { Stage } from "@/components/present/Stage";
import { usePresentState } from "@/lib/present";
import { getSocket } from "@/lib/socket";

// The clean full-screen output for the projector / stream. Open it in its own window, drag it to
// the second display, press F for full screen, and click for full screen. The controller's "Go offline" button closes it.
export default function PresentOutputPage() {
  const { state, connected } = usePresentState({ output: true });
  const [hint, setHint] = useState(true);
  // An output belongs to the presenter that opened it (its link names that device's output id). Opened any other way it has nothing to show.
  const [linked, setLinked] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the link is only readable in the browser
    setLinked(Boolean(new URLSearchParams(window.location.search).get("o")));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 5000);
    // The controller's "Go offline" button.
    const socket = getSocket();
    const onClose = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      window.close();
    };
    socket.on("present:close", onClose);
    // Play / pause / restart / mute from the controller's video buttons (over the server, or the local link when offline).
    const onVideo = ({ action }: { action: string }) => {
      const v = document.querySelector<HTMLVideoElement>("video[data-slide-video]");
      if (!v) return;
      if (action === "toggle") (v.paused ? v.play() : Promise.resolve(v.pause())).catch(() => {});
      else if (action === "restart") {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else if (action === "mute") v.muted = true;
      else if (action === "unmute") {
        v.muted = false;
        v.play().catch(() => {});
      }
    };
    socket.on("present:video", onVideo);
    const onLocalVideo = (e: Event) => onVideo({ action: String((e as CustomEvent).detail) });
    window.addEventListener("present-local-video", onLocalVideo);
    window.addEventListener("present-local-close", onClose);
    // Try full screen straight away; browsers refuse unless the page was just opened by a click.
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f") return;
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      socket.off("present:close", onClose);
      socket.off("present:video", onVideo);
      window.removeEventListener("present-local-video", onLocalVideo);
      window.removeEventListener("present-local-close", onClose);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  if (linked === false) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black p-8 text-center text-white">
        <p className="max-w-md text-lg">This screen isn’t linked to a presenter. Open it from the Present page with <b>Go Online</b> (or copy the link from there), so it shows that presenter’s screen.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex cursor-none items-center justify-center bg-black" onClick={toggleFullscreen}>
      <div className="w-full" style={{ maxWidth: "calc(100vh * 16 / 9)" }}>
        <Stage state={state} />
      </div>
      {(hint || !connected) && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-neutral-900/80 px-4 py-2 text-xs font-medium text-white backdrop-blur">
          {connected ? "Click or press F for full screen" : "Connecting to controller…"}
        </div>
      )}
    </div>
  );
}
