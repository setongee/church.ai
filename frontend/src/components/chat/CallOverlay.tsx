"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Maximize2, Mic, MicOff, Minimize2, PhoneOff, PictureInPicture2, Users, Video, VideoOff } from "lucide-react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { pingCall } from "@/lib/chat";
import { Avatar } from "@/components/notify/ToastHost";
import { useCall, type CallSession, type Tile } from "./CallProvider";

// The call screen. Colours are fixed (not theme tokens): it's always a dark, calm space, in light mode too.
const clock = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// The picture. It never makes sound: voices come from RemoteAudio, so a person's voice doesn't depend on whether
// their picture is on screen.
function Stream({ stream, show, mirror }: { stream: MediaStream | null; show: boolean; mirror?: boolean }) {
  const el = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream;
  }, [stream]);
  return <video ref={el} autoPlay playsInline muted className={show ? "absolute inset-0 h-full w-full object-cover" : "hidden"} style={show && mirror ? { transform: "scaleX(-1)" } : undefined} />;
}

// Plays one other person's voice. A real <audio> element that is always on the page: phones pause a video element that
// is hidden or 1px (which is why someone's voice only came through once their camera was on, and kept going after).
// If the browser refuses to start sound until the person touches the page, it tries again on the first touch.
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const el = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = el.current;
    if (!a) return;
    if (a.srcObject !== stream) a.srcObject = stream;
    const start = () => void a.play().catch(() => {});
    a.play().catch(() => {
      document.addEventListener("pointerdown", start, { once: true });
      document.addEventListener("keydown", start, { once: true });
    });
    const resume = () => document.visibilityState === "visible" && a.paused && start();
    document.addEventListener("visibilitychange", resume);
    return () => {
      document.removeEventListener("pointerdown", start);
      document.removeEventListener("keydown", start);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [stream]);
  return <audio ref={el} autoPlay />;
}

function TileView({ t, solo, many }: { t: Tile; solo: boolean; many: boolean }) {
  const showVideo = t.video && Boolean(t.stream);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#1c1c24] transition-shadow ${solo ? "aspect-video w-full max-w-3xl" : "aspect-video"} ${t.speaking && !t.muted ? "shadow-[0_0_0_3px_#22c55e]" : "shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"}`}>
      <Stream stream={t.stream} show={showVideo} mirror={t.you} />
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <span className={`${t.speaking && !t.muted ? "scale-110" : ""} transition-transform`}>
            <Avatar name={t.name} size={solo ? 112 : many ? 52 : 84} />
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-[rgba(0,0,0,0.65)] to-transparent px-3 pb-2.5 pt-8 text-[#ffffff]">
        <span className="truncate text-sm font-semibold">{t.you ? "You" : t.name}</span>
        {t.muted && (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[#dc2626]" title="Muted">
            <MicOff size={11} />
          </span>
        )}
        {!t.you && t.state !== "connected" && <span className="ml-auto text-[11px] text-[#d4d4d4]">{t.state === "failed" ? "Can’t connect" : "Connecting…"}</span>}
      </div>
    </div>
  );
}

const ctl = (on: boolean, danger?: boolean) => `grid h-12 w-12 place-items-center rounded-full transition ${danger ? "bg-[#dc2626] text-[#ffffff] hover:bg-[#b91c1c]" : on ? "bg-[#2e2e38] text-[#ffffff] hover:bg-[#3a3a46]" : "bg-[#ffffff] text-[#171717] hover:bg-[#e5e5e5]"}`;

// ---- a small always-on-top call window --------------------------------------------------------------------------------
// Chrome and Edge on a computer can float a small window above every other app (Document Picture-in-Picture). It shows the
// call and its controls while you work elsewhere. The voices keep playing from the page itself.
type DocPip = { requestWindow: (o?: { width?: number; height?: number }) => Promise<Window> };
const pipApi = (): DocPip | null => (typeof window !== "undefined" && "documentPictureInPicture" in window ? (window as unknown as { documentPictureInPicture: DocPip }).documentPictureInPicture : null);

// The floating window starts empty, so the page's styles are copied across.
function copyStyles(to: Window) {
  for (const sheet of [...document.styleSheets]) {
    try {
      if (sheet.href) throw new Error("linked"); // linked sheets are linked again (their addresses are absolute)
      const style = to.document.createElement("style");
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join("");
      to.document.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = to.document.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      to.document.head.appendChild(link);
    }
  }
  to.document.body.style.margin = "0";
  to.document.body.style.background = "#0b0b0f";
}

function useCallPip() {
  const [win, setWin] = useState<Window | null>(null);
  const current = useRef<Window | null>(null);
  const supported = pipApi() !== null;
  const open = useCallback(async () => {
    const api = pipApi();
    if (!api || current.current) return;
    try {
      const w = await api.requestWindow({ width: 360, height: 260 });
      copyStyles(w);
      current.current = w;
      setWin(w);
      w.addEventListener("pagehide", () => {
        current.current = null;
        setWin(null);
      });
    } catch {
      // refused (it needs a click, or the browser is busy with another floating window)
    }
  }, []);
  // The call ending takes the window with it.
  useEffect(() => () => current.current?.close(), []);
  return { supported, win, open };
}

function MiniCall({ session, elapsed, onMic, onCam, onLeave }: { session: CallSession; elapsed: number; onMic: () => void; onCam: () => void; onLeave: () => void }) {
  const n = session.tiles.length;
  return (
    <div className="flex h-dvh flex-col bg-[#0b0b0f] text-[#ffffff]">
      <div className="flex items-center gap-2 px-3 pt-2.5 text-xs">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{session.title || session.roomName}</span>
        <span className="tabular-nums text-[#a3a3a3]">{clock(elapsed)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className={`grid gap-2 ${n <= 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {session.tiles.map((t) => (
            <TileView key={t.id || "me"} t={t} solo={false} many />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center gap-2.5 pb-3 pt-1">
        <button onClick={onMic} disabled={!session.hasMic} aria-label={session.micOn ? "Mute" : "Unmute"} className={`${ctl(session.micOn)} !h-10 !w-10 disabled:opacity-40`}>
          {session.micOn ? <Mic size={17} /> : <MicOff size={17} />}
        </button>
        <button onClick={onCam} aria-label={session.camOn ? "Camera off" : "Camera on"} className={`${ctl(session.camOn)} !h-10 !w-10`}>
          {session.camOn ? <Video size={17} /> : <VideoOff size={17} />}
        </button>
        <button onClick={onLeave} aria-label="Leave the call" className={`${ctl(true, true)} !h-10 !w-10`}>
          <PhoneOff size={17} />
        </button>
      </div>
    </div>
  );
}

// Makes the call feel like part of the phone or computer rather than a web page, as far as a web app can:
// - the system's media controls (notification shade, lock screen, headset buttons) show the call with Mute and Hang up
// - the screen stays awake while you're on it
// - the tab / window title shows the timer and whether you're muted, so you can see it from another window
// (Dynamic Island, the phone's own call screen and showing in the call list need a native app; a web page can't do those.)
function useNativeCallPresence(session: CallSession, elapsed: number, actions: { leave: () => void; toggleMic: () => void; toggleCam: () => Promise<string | null> }) {
  const live = useRef(actions);
  useEffect(() => {
    live.current = actions;
  });
  const people = session.tiles.length;
  const label = session.title || session.roomName;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: label,
        artist: `Group call · ${people} ${people === 1 ? "person" : "people"}`,
        album: "FAFC Media Engine",
        artwork: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
      ms.playbackState = "playing";
    } catch {}
    // Call controls are newer than the rest of Media Session: browsers that don't know them throw, so each is tried alone.
    const set = (action: string, fn: (() => void) | null) => {
      try {
        ms.setActionHandler(action as MediaSessionAction, fn);
      } catch {}
    };
    set("hangup", () => live.current.leave());
    set("togglemicrophone", () => live.current.toggleMic());
    set("togglecamera", () => void live.current.toggleCam());
    return () => {
      ["hangup", "togglemicrophone", "togglecamera"].forEach((a) => set(a, null));
      try {
        ms.metadata = null;
        ms.playbackState = "none";
      } catch {}
    };
  }, [label, people]);

  // Tells the system whether the mic and camera are on (it shows this in its own controls).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession as unknown as { setMicrophoneActive?: (on: boolean) => void; setCameraActive?: (on: boolean) => void };
    try {
      ms.setMicrophoneActive?.(session.micOn);
      ms.setCameraActive?.(session.camOn);
    } catch {}
  }, [session.micOn, session.camOn]);

  // Screen awake. The browser drops the lock whenever the page is hidden, so it is taken again on return.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const take = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {}
    };
    void take();
    const onVisible = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  // The window title, restored when the call ends.
  const original = useRef("");
  useEffect(() => {
    original.current = document.title;
    return () => {
      document.title = original.current;
    };
  }, []);
  useEffect(() => {
    document.title = `${session.micOn ? "🎙" : "🔇"} ${clock(elapsed)} · ${label}`;
  }, [elapsed, session.micOn, label]);
}

export function CallOverlay({ session, canEnd }: { session: CallSession; canEnd: boolean }) {
  const { leave, endForAll, toggleMic, toggleCam, setMinimized } = useCall();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { user } = useAuth();
  const [pinged, setPinged] = useState(""); // what happened the last time an admin re-pinged the room
  async function ping() {
    setPinged("Pinging…");
    try {
      const { pinged: n } = await pingCall(session.roomId);
      setPinged(n ? `Pinged ${n} ${n === 1 ? "person" : "people"} who aren’t on the call` : "Everyone in the room is already on the call");
    } catch (e) {
      setPinged(e instanceof Error ? e.message : "Couldn’t ping");
    }
    setTimeout(() => setPinged(""), 6000);
  }
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, (now - new Date(session.startedAt).getTime()) / 1000);
  useNativeCallPresence(session, Math.floor(elapsed), { leave, toggleMic, toggleCam });
  const pip = useCallPip();
  // Float the call: from the button, or by itself when you switch to another tab or app (browsers that support it ask the
  // page for a picture-in-picture window then).
  const floatCall = useCallback(async () => {
    await pip.open();
    setMinimized(true);
  }, [pip, setMinimized]);
  const floatRef = useRef(floatCall);
  useEffect(() => {
    floatRef.current = floatCall;
  });
  useEffect(() => {
    if (!pip.supported || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => void floatRef.current());
    } catch {}
    return () => {
      try {
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {}
    };
  }, [pip.supported]);
  const floating = pip.win ? createPortal(<MiniCall session={session} elapsed={Math.floor(elapsed)} onMic={toggleMic} onCam={() => void toggleCam()} onLeave={leave} />, pip.win.document.body) : null;
  // Everyone else's voice. Always on the page (in both the full screen and the small bar).
  const voices = (
    <div className="sr-only" aria-hidden>
      {session.tiles.filter((t) => !t.you).map((t) => (
        <RemoteAudio key={t.id} stream={t.stream} />
      ))}
    </div>
  );
  const n = session.tiles.length;
  // One or two people: big tiles stacked on a phone. Three or more: two columns so everyone fits on screen.
  const cols = n <= 1 ? "grid-cols-1" : n === 2 ? "grid-cols-1 sm:grid-cols-2" : n <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  const controls = (
    <div className="flex items-center justify-center gap-3">
      <button onClick={toggleMic} disabled={!session.hasMic} aria-label={session.micOn ? "Mute your microphone" : "Unmute your microphone"} title={!session.hasMic ? "Microphone blocked" : session.micOn ? "Mute" : "Unmute"} className={`${ctl(session.micOn)} disabled:opacity-40`}>
        {session.micOn ? <Mic size={20} /> : <MicOff size={20} />}
      </button>
      <button onClick={async () => setError((await toggleCam()) ?? "")} aria-label={session.camOn ? "Turn your camera off" : "Turn your camera on"} title={session.camOn ? "Camera off" : "Camera on"} className={ctl(session.camOn)}>
        {session.camOn ? <Video size={20} /> : <VideoOff size={20} />}
      </button>
      <button onClick={leave} aria-label="Leave the call" title="Leave" className={ctl(true, true)}>
        <PhoneOff size={20} />
      </button>
    </div>
  );

  // Minimised: the call carries on behind a small bar. On a phone it spans the width (it used to be squeezed into half).
  if (session.minimized) {
    return (
      <>
        {voices}
        {floating}
        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[110] mx-auto flex max-w-md items-center gap-2.5 rounded-full bg-[#171717] py-1.5 pl-4 pr-1.5 text-[#ffffff] shadow-2xl ring-1 ring-[rgba(255,255,255,0.15)]">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
          </span>
          <button onClick={() => setMinimized(false)} aria-label="Open the call" className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-semibold leading-tight">{session.title || session.roomName}</span>
            <span className="block text-xs tabular-nums leading-tight text-[#a3a3a3]">{clock(elapsed)}{session.reconnecting ? " · Reconnecting…" : ""}</span>
          </button>
          <button onClick={toggleMic} disabled={!session.hasMic} aria-label={session.micOn ? "Mute" : "Unmute"} className={`${ctl(session.micOn)} !h-10 !w-10 shrink-0 disabled:opacity-40`}>
            {session.micOn ? <Mic size={17} /> : <MicOff size={17} />}
          </button>
          {pip.supported && !pip.win && (
            <button onClick={() => void pip.open()} aria-label="Float the call above other windows" title="Float above other windows" className={`${ctl(true)} !h-10 !w-10 shrink-0`}>
              <PictureInPicture2 size={17} />
            </button>
          )}
          <button onClick={() => setMinimized(false)} aria-label="Open the call" className={`${ctl(true)} !h-10 !w-10 shrink-0`}>
            <Maximize2 size={17} />
          </button>
          <button onClick={leave} aria-label="Leave the call" className={`${ctl(true, true)} !h-10 !w-10 shrink-0`}>
            <PhoneOff size={17} />
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[110] flex h-dvh flex-col bg-[#0b0b0f] text-[#ffffff]" role="dialog" aria-modal="true" aria-label={`Call in ${session.roomName}`}>
      {voices}
      {floating}
      <header className="flex items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{session.title || session.roomName}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#a3a3a3]">
            <span className="tabular-nums">{clock(elapsed)}</span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {n}
            </span>
            {session.title && <span>{session.roomName}</span>}
            <span className="truncate">Host: {session.host.name}</span>
            {session.reconnecting && <span className="font-semibold text-[#fbbf24]">Reconnecting…</span>}
          </p>
        </div>
        {pip.supported && (
          <button onClick={() => void floatCall()} aria-label="Float the call above other windows" title="Float above other windows" className="grid h-10 w-10 place-items-center rounded-full text-[#d4d4d4] hover:bg-[rgba(255,255,255,0.1)]">
            <PictureInPicture2 size={18} />
          </button>
        )}
        <button onClick={() => setMinimized(true)} aria-label="Minimise the call" title="Minimise" className="grid h-10 w-10 place-items-center rounded-full text-[#d4d4d4] hover:bg-[rgba(255,255,255,0.1)]">
          <Minimize2 size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
        <div className="mx-auto flex min-h-full items-center justify-center">
        <div className={`grid w-full gap-3 ${n <= 1 ? "max-w-3xl" : n <= 4 ? "max-w-4xl" : "max-w-6xl"} ${cols} ${n === 1 ? "place-items-center" : ""}`}>
          {session.tiles.map((t) => (
            <TileView key={t.id || "me"} t={t} solo={n === 1} many={n > 2} />
          ))}
        </div>
        </div>
      </div>

      <footer className="shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        {n === 1 && <p className="mb-3 text-center text-sm text-[#a3a3a3]">Waiting for others to join…</p>}
        {!session.hasMic && <p className="mb-3 text-center text-sm text-[#fbbf24]">Your microphone is blocked, so you can listen but not speak. Allow it in your browser’s site settings and rejoin.</p>}
        {error && <p className="mb-3 text-center text-sm text-[#fca5a5]">{error}</p>}
        {controls}
        {user?.isAdmin && (
          <div className="mt-4 flex flex-col items-center gap-1.5">
            <button onClick={() => void ping()} disabled={pinged === "Pinging…"} className="inline-flex items-center gap-2 rounded-full bg-[rgba(255,255,255,0.1)] px-4 py-2 text-sm font-medium text-[#ffffff] hover:bg-[rgba(255,255,255,0.18)] disabled:opacity-50">
              <BellRing size={15} /> Ping people not on the call
            </button>
            {pinged && <span role="status" className="text-xs text-[#a3a3a3]">{pinged}</span>}
          </div>
        )}
        {canEnd && (
          <div className="mt-4 flex justify-center">
            {confirmEnd ? (
              <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl bg-[#2a1215] px-4 py-2.5 text-center text-sm">
                End the call for everyone?
                <button onClick={endForAll} className="rounded-full bg-[#dc2626] px-3 py-1 text-xs font-semibold text-[#ffffff] hover:bg-[#b91c1c]">
                  End for all
                </button>
                <button onClick={() => setConfirmEnd(false)} className="text-xs text-[#d4d4d4] underline">
                  Keep going
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmEnd(true)} className="text-xs font-medium text-[#a3a3a3] underline hover:text-[#ffffff]">
                End call for everyone
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
