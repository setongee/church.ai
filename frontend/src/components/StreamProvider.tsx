"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Mic, Radio, Square, TriangleAlert } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { getSocket } from "@/lib/socket";
import { getSession } from "@/lib/api";

// Live streaming of a session's audio, for the whole app (not for one page).
//
// The microphone, the recorder and the link to the server live here, above every page, so going to another page doesn't
// stop the stream, and a banner under the top bar shows it's on wherever you are. It also looks after itself:
//  - the server connection dropped -> the stream says "reconnecting" and picks itself up again when it's back
//  - the server's link to the speech service dropped -> the server reconnects it and tells us to restart the recorder
//  - the microphone was unplugged or taken -> it is asked for again, a few times
//  - the page was refreshed or the app reopened -> it carries on from where it was (if the browser still lets this site
//    use the microphone; otherwise the banner asks for one tap)
// It stops when you press Stop, or when the session ends.

export type StreamStatus = "idle" | "starting" | "streaming" | "reconnecting" | "paused";
interface Active {
  sessionId: string;
  title: string;
  startedAt: number;
}
interface Saved extends Active {
  userId: string;
  beat: number;
}

interface Ctx {
  active: Active | null;
  status: StreamStatus;
  error: string;
  micStream: MediaStream | null;
  devices: MediaDeviceInfo[];
  deviceId: string;
  setDeviceId: (id: string) => void;
  start: (sessionId: string, title: string, startedAt?: number) => Promise<void>;
  stop: () => void;
}

const Stream = createContext<Ctx>({ active: null, status: "idle", error: "", micStream: null, devices: [], deviceId: "", setDeviceId: () => {}, start: async () => {}, stop: () => {} });
export const useStream = () => useContext(Stream);

const KEY = "fafc-stream";
const RESUME_WITHIN_MS = 3 * 60_000; // a stream left this long ago isn't picked up again by itself
const MIC_RETRIES = 6;
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return `${h ? `${h}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const readSaved = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null") as Saved | null;
  } catch {
    return null;
  }
};
const writeSaved = (s: Saved | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
};

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [active, setActiveState] = useState<Active | null>(null);
  const [status, setStatusState] = useState<StreamStatus>("idle");
  const [error, setError] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");

  // The live values, readable from socket handlers without going stale.
  const activeRef = useRef<Active | null>(null);
  const statusRef = useRef<StreamStatus>("idle");
  const deviceRef = useRef("");
  const micRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const downRef = useRef(false); // the server connection dropped and hasn't been picked up again yet
  const micTriesRef = useRef(0);
  const micTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const lostMicRef = useRef<() => void>(() => {}); // (the handler refers to itself while retrying, so it is called through here)

  const setActive = useCallback((a: Active | null) => {
    activeRef.current = a;
    setActiveState(a);
  }, []);
  const setStatus = useCallback((s: StreamStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);
  useEffect(() => {
    deviceRef.current = deviceId;
  }, [deviceId]);

  // ---- microphones ----
  const refreshDevices = useCallback(async () => {
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      setDevices(list);
      setDeviceId((prev) => (prev && list.some((m) => m.deviceId === prev) ? prev : (list[0]?.deviceId ?? "")));
    } catch {
      // blank until the microphone has been allowed once
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the device list is "syncing with an external system"
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const stopRecorder = useCallback(() => {
    const r = recorderRef.current;
    recorderRef.current = null;
    if (r) {
      r.ondataavailable = null;
      r.onerror = null;
      try {
        if (r.state !== "inactive") r.stop();
      } catch {}
    }
  }, []);
  const releaseMic = useCallback(() => {
    stopRecorder();
    if (micTimerRef.current) clearTimeout(micTimerRef.current);
    micRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    micRef.current = null;
    setMicStream(null);
  }, [stopRecorder]);

  // Asks for the microphone (the chosen one, else any).
  const openMic = useCallback(async () => {
    const want = deviceRef.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: want ? { deviceId: { exact: want } } : true });
    } catch (err) {
      if ((err as { name?: string })?.name === "OverconstrainedError" || (err as { name?: string })?.name === "NotFoundError") stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      else throw err;
    }
    micRef.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    micRef.current = stream;
    setMicStream(stream);
    void refreshDevices();
    return stream;
  }, [refreshDevices]);

  // ---- the link to the server ----
  const emitStart = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const socket = getSocket();
    if (socket.connected) socket.emit("stream:start", { sessionId: a.sessionId });
    else {
      downRef.current = true; // the "connect" handler asks for the stream as soon as it's back
      socket.connect();
    }
  }, []);

  // Starts (or restarts) the recorder. A recorder only produces the audio header once, at its start, and the speech service
  // needs it, so after any reconnect the old recorder is thrown away and a new one is made.
  const startRecorder = useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    stopRecorder();
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(mic, { mimeType });
    recorder.ondataavailable = async (e) => {
      if (e.data.size === 0 || recorderRef.current !== recorder) return;
      const socket = getSocket();
      if (!socket.connected) return; // dropped: the audio of an outage isn't queued up and sent in a burst later
      socket.emit("stream:audio", await e.data.arrayBuffer());
    };
    // A recorder that errors is replaced by asking the server to start the link again (which restarts it).
    recorder.onerror = () => {
      if (recorderRef.current === recorder && activeRef.current) emitStart();
    };
    recorderRef.current = recorder;
    recorder.start(250);
  }, [stopRecorder, emitStart]);

  // The microphone stopped by itself (unplugged, taken by another app, permission pulled). Ask for it again a few times.
  const lostMic = useCallback(() => {
    if (!activeRef.current) return;
    stopRecorder();
    setStatus("reconnecting");
    const attempt = async () => {
      if (!activeRef.current) return;
      micTriesRef.current += 1;
      try {
        const mic = await openMic();
        mic.getAudioTracks().forEach((t) => (t.onended = () => lostMicRef.current()));
        micTriesRef.current = 0;
        emitStart(); // the server starts a new link; its "ready" restarts the recorder
      } catch {
        if (micTriesRef.current >= MIC_RETRIES) {
          setStatus("paused");
          setError("The microphone isn’t available. Check it’s plugged in and allowed, then press Resume.");
        } else micTimerRef.current = setTimeout(attempt, 2000);
      }
    };
    micTimerRef.current = setTimeout(attempt, 800);
  }, [stopRecorder, setStatus, openMic, emitStart]);
  useEffect(() => {
    lostMicRef.current = lostMic;
  }, [lostMic]);

  const teardown = useCallback(
    (message = "") => {
      releaseMic();
      writeSaved(null);
      setActive(null);
      setStatus("idle");
      setError(message);
      micTriesRef.current = 0;
    },
    [releaseMic, setActive, setStatus],
  );

  // ---- start, resume, stop ----
  const start = useCallback(
    // `startedAt` is passed when carrying on after a refresh, so the timer keeps counting from when the stream first began.
    async (sessionId: string, title: string, startedAt?: number) => {
      const current = activeRef.current;
      if (current && current.sessionId !== sessionId) {
        setError(`“${current.title}” is already streaming. Stop it first.`);
        return;
      }
      setError("");
      const a: Active = current ?? { sessionId, title, startedAt: startedAt ?? Date.now() };
      setActive(a);
      setStatus("starting");
      try {
        const mic = await openMic();
        mic.getAudioTracks().forEach((t) => (t.onended = () => lostMicRef.current()));
        if (user) writeSaved({ ...a, userId: user._id, beat: Date.now() });
        emitStart();
        // If the server never confirms, say so instead of spinning forever.
        const sent = Date.now();
        window.setTimeout(() => {
          if (activeRef.current?.sessionId === sessionId && statusRef.current === "starting" && Date.now() - sent >= 14_000) {
            setStatus("paused");
            setError("The server didn’t answer. Check your connection, then press Resume.");
          }
        }, 15_000);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        releaseMic();
        if (!current) {
          setActive(null);
          setStatus("idle");
          writeSaved(null);
        } else setStatus("paused");
        setError(name === "NotAllowedError" ? "Microphone access was blocked. Allow the microphone for this site and try again." : name === "NotFoundError" ? "No microphone was found." : err instanceof Error ? err.message : "Could not access the microphone");
      }
    },
    [setActive, setStatus, openMic, emitStart, releaseMic, user],
  );

  const stop = useCallback(() => {
    if (activeRef.current) getSocket().emit("stream:stop");
    teardown("");
  }, [teardown]);

  // ---- what the server tells us ----
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onReady = () => {
      if (!activeRef.current) return;
      setError("");
      downRef.current = false;
      startRecorder();
      setStatus("streaming");
    };
    const onStatus = (m: { state: string }) => {
      if (activeRef.current && m.state === "reconnecting") setStatus("reconnecting");
    };
    const onErr = (m: { message: string; fatal?: boolean; code?: string }) => {
      if (!activeRef.current) return;
      if (m.fatal) teardown(m.message);
      else setError(m.message);
    };
    const onLost = () => emitStart(); // the server doesn't know this stream (it restarted): start it again
    const onReplaced = () => teardown("Streaming moved to another tab or device.");
    const onEnded = (m: { sessionId: string }) => activeRef.current?.sessionId === m.sessionId && teardown("The session has ended, so streaming stopped.");
    const onDown = () => {
      if (!activeRef.current) return;
      downRef.current = true;
      stopRecorder();
      setStatus("reconnecting");
    };
    const onUp = () => {
      if (activeRef.current && downRef.current) emitStart(); // back: ask for the stream again; "ready" restarts the recorder
    };
    socket.on("stream:ready", onReady);
    socket.on("stream:status", onStatus);
    socket.on("stream:error", onErr);
    socket.on("stream:lost", onLost);
    socket.on("stream:replaced", onReplaced);
    socket.on("stream:ended", onEnded);
    socket.on("disconnect", onDown);
    socket.on("connect", onUp);
    return () => {
      socket.off("stream:ready", onReady);
      socket.off("stream:status", onStatus);
      socket.off("stream:error", onErr);
      socket.off("stream:lost", onLost);
      socket.off("stream:replaced", onReplaced);
      socket.off("stream:ended", onEnded);
      socket.off("disconnect", onDown);
      socket.off("connect", onUp);
    };
  }, [user, startRecorder, setStatus, teardown, emitStart, stopRecorder]);

  // ---- while it's on: stay awake, remember where we are, nudge the connection back ----
  useEffect(() => {
    if (!active || !user) return;
    const beat = setInterval(() => {
      const a = activeRef.current;
      if (a) writeSaved({ ...a, userId: user._id, beat: Date.now() });
    }, 5000);
    const nudge = () => {
      if (!activeRef.current || document.visibilityState === "hidden") return;
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      const track = micRef.current?.getAudioTracks()[0];
      if (!track || track.readyState === "ended") lostMic();
    };
    const take = async () => {
      try {
        lockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {}
    };
    void take();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void take();
        nudge();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", nudge);
    window.addEventListener("focus", nudge);
    // Closing the tab or window by accident would end the service's stream: ask first.
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current !== "paused") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", nudge);
      window.removeEventListener("focus", nudge);
      window.removeEventListener("beforeunload", beforeUnload);
      void lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active, user, lostMic]);

  // ---- after a refresh or reopening the app: carry on ----
  const resumed = useRef(false);
  useEffect(() => {
    if (!user || resumed.current) return;
    resumed.current = true;
    const saved = readSaved();
    if (!saved || saved.userId !== user._id) return;
    if (Date.now() - saved.beat > RESUME_WITHIN_MS) return writeSaved(null);
    if (!user.isAdmin && !user.roles.includes("manager")) return writeSaved(null);
    (async () => {
      try {
        const { session } = await getSession(saved.sessionId);
        if (session.status !== "live") return writeSaved(null);
      } catch {
        return writeSaved(null);
      }
      // The microphone is asked for without a click; if the browser won't allow that, the banner offers a Resume button.
      await start(saved.sessionId, saved.title, saved.startedAt);
    })();
  }, [user, start]);

  // Signing out ends it.
  useEffect(() => {
    if (!user && activeRef.current) teardown("");
  }, [user, teardown]);
  useEffect(() => () => releaseMic(), [releaseMic]);

  const value = useMemo<Ctx>(() => ({ active, status, error, micStream, devices, deviceId, setDeviceId, start, stop }), [active, status, error, micStream, devices, deviceId, start, stop]);
  return (
    <Stream.Provider value={value}>
      {children}
      <StreamPill />
    </Stream.Provider>
  );
}

// ---- the banner -----------------------------------------------------------------------------------------------------------

const LABEL: Record<StreamStatus, string> = { idle: "", starting: "Starting…", streaming: "Streaming in progress", reconnecting: "Reconnecting — your stream will carry on", paused: "Streaming paused" };

// The bar under the top bar (rendered by the NavBar), on every page that has one.
export function StreamBanner() {
  const { active, status, error, start, stop } = useStream();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const pathname = usePathname();
  if (!active || pathname.startsWith("/present/output") || pathname === "/login") return null;

  const bad = status === "paused";
  const warn = status === "reconnecting" || status === "starting";
  return (
    <div role="status" className={`border-t px-4 py-2 sm:px-6 lg:px-20 ${bad ? "border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]" : warn ? "border-[#fde68a] bg-[#fffbeb] text-[#92400e]" : "border-[#fecaca] bg-[#dc2626] text-[#ffffff]"}`}>
      <div className="mx-auto flex max-w-8xl flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {!bad && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${warn ? "bg-[#d97706]" : "bg-[#ffffff]"}`} />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${bad ? "bg-[#dc2626]" : warn ? "bg-[#d97706]" : "bg-[#ffffff]"}`} />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <b>{LABEL[status]}</b>
          <span className="opacity-90"> · {active.title}</span>
          <span className="ml-2 tabular-nums opacity-80">{clock(now - active.startedAt)}</span>
          {error && <span className="ml-2 font-medium">{error}</span>}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {bad && (
            <button onClick={() => void start(active.sessionId, active.title)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#991b1b] px-3 py-1 text-xs font-semibold text-[#ffffff] hover:bg-[#7f1d1d]">
              <Mic size={13} /> Resume
            </button>
          )}
          {status === "starting" && <Loader2 size={15} className="animate-spin" />}
          <Link href={`/sessions/${active.sessionId}`} className={`rounded-lg border px-3 py-1 text-xs font-semibold ${bad || warn ? "border-current" : "border-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.15)]"}`}>
            Open
          </Link>
          <button onClick={() => window.confirm("Stop streaming this session?") && stop()} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold ${bad || warn ? "border-current" : "border-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.15)]"}`}>
            <Square size={11} /> Stop
          </button>
        </span>
      </div>
    </div>
  );
}

// Pages without the top bar (the design editor) get a small floating pill instead, so it is still visible there.
function StreamPill() {
  const { active, status } = useStream();
  const pathname = usePathname();
  if (!active || !pathname.startsWith("/design")) return null;
  const bad = status === "paused";
  return (
    <Link href={`/sessions/${active.sessionId}`} className={`fixed left-1/2 top-3 z-[95] inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-xl ${bad ? "bg-[#991b1b] text-[#ffffff]" : status === "streaming" ? "bg-[#dc2626] text-[#ffffff]" : "bg-[#d97706] text-[#ffffff]"}`}>
      {bad ? <TriangleAlert size={13} /> : <Radio size={13} className="animate-pulse" />}
      {LABEL[status]} · {active.title}
    </Link>
  );
}
