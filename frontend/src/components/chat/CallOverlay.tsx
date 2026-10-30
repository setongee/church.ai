"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Mic, MicOff, Minimize2, PhoneOff, Users, Video, VideoOff } from "lucide-react";
import { Avatar } from "@/components/notify/ToastHost";
import { useCall, type CallSession, type Tile } from "./CallProvider";

// The call screen. Colours are fixed (not theme tokens): it's always a dark, calm space, in light mode too.
const clock = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Stream({ stream, muted, show }: { stream: MediaStream | null; muted: boolean; show: boolean }) {
  const el = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream;
  }, [stream]);
  // Always mounted for other people: this element is what plays their voice, even when there's no picture to show.
  return <video ref={el} autoPlay playsInline muted={muted} className={show ? "absolute inset-0 h-full w-full object-cover" : "pointer-events-none absolute h-px w-px opacity-0"} style={show && muted ? { transform: "scaleX(-1)" } : undefined} />;
}

function TileView({ t, solo }: { t: Tile; solo: boolean }) {
  const showVideo = t.video && Boolean(t.stream);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#1c1c24] transition-shadow ${solo ? "aspect-video w-full max-w-3xl" : "aspect-video"} ${t.speaking && !t.muted ? "shadow-[0_0_0_3px_#22c55e]" : "shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"}`}>
      <Stream stream={t.stream} muted={t.you} show={showVideo} />
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <span className={`${t.speaking && !t.muted ? "scale-110" : ""} transition-transform`}>
            <Avatar name={t.name} size={solo ? 112 : 84} />
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

export function CallOverlay({ session, canEnd }: { session: CallSession; canEnd: boolean }) {
  const { leave, endForAll, toggleMic, toggleCam, setMinimized } = useCall();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, (now - new Date(session.startedAt).getTime()) / 1000);
  const n = session.tiles.length;
  const cols = n <= 1 ? "grid-cols-1" : n <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

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

  // Minimised: the call carries on (audio keeps playing from the hidden tiles) behind a small bar.
  if (session.minimized) {
    return (
      <>
        <div className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
          {session.tiles.filter((t) => !t.you).map((t) => (
            <Stream key={t.id} stream={t.stream} muted={false} show={false} />
          ))}
        </div>
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#171717] py-2 pl-4 pr-2 text-[#ffffff] shadow-2xl ring-1 ring-[rgba(255,255,255,0.15)]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
          </span>
          <span className="text-sm font-semibold">{session.roomName}</span>
          <span className="text-xs tabular-nums text-[#a3a3a3]">{clock(elapsed)}</span>
          <button onClick={toggleMic} disabled={!session.hasMic} aria-label={session.micOn ? "Mute" : "Unmute"} className={`${ctl(session.micOn)} !h-9 !w-9 disabled:opacity-40`}>
            {session.micOn ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button onClick={() => setMinimized(false)} aria-label="Open the call" className={`${ctl(true)} !h-9 !w-9`}>
            <Maximize2 size={16} />
          </button>
          <button onClick={leave} aria-label="Leave the call" className={`${ctl(true, true)} !h-9 !w-9`}>
            <PhoneOff size={16} />
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#0b0b0f] text-[#ffffff]" role="dialog" aria-modal="true" aria-label={`Call in ${session.roomName}`}>
      <header className="flex items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{session.roomName}</h2>
          <p className="flex items-center gap-2 text-xs text-[#a3a3a3]">
            <span className="tabular-nums">{clock(elapsed)}</span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {n}
            </span>
            <span>Host: {session.host.name}</span>
            {session.reconnecting && <span className="font-semibold text-[#fbbf24]">Reconnecting…</span>}
          </p>
        </div>
        <button onClick={() => setMinimized(true)} aria-label="Minimise the call" title="Minimise" className="grid h-10 w-10 place-items-center rounded-full text-[#d4d4d4] hover:bg-[rgba(255,255,255,0.1)]">
          <Minimize2 size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
        <div className="mx-auto flex min-h-full items-center justify-center">
        <div className={`grid w-full gap-3 ${n <= 1 ? "max-w-3xl" : n <= 4 ? "max-w-4xl" : "max-w-6xl"} ${cols} ${n === 1 ? "place-items-center" : ""}`}>
          {session.tiles.map((t) => (
            <TileView key={t.id || "me"} t={t} solo={n === 1} />
          ))}
        </div>
        </div>
      </div>

      <footer className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
        {n === 1 && <p className="mb-3 text-center text-sm text-[#a3a3a3]">Waiting for others to join…</p>}
        {!session.hasMic && <p className="mb-3 text-center text-sm text-[#fbbf24]">Your microphone is blocked, so you can listen but not speak. Allow it in your browser’s site settings and rejoin.</p>}
        {error && <p className="mb-3 text-center text-sm text-[#fca5a5]">{error}</p>}
        {controls}
        {canEnd && (
          <div className="mt-4 flex justify-center">
            {confirmEnd ? (
              <span className="inline-flex items-center gap-3 rounded-full bg-[#2a1215] px-4 py-2 text-sm">
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
