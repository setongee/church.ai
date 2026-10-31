"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { getSocket } from "@/lib/socket";
import { liveCalls, type CallInfo } from "@/lib/chat";
import { useToasts } from "@/components/notify/ToastHost";
import { CallOverlay } from "./CallOverlay";

// What the call screen draws: one tile per person (you first), plus your own controls.
export interface Tile {
  id: string;
  name: string;
  you: boolean;
  stream: MediaStream | null;
  muted: boolean;
  video: boolean;
  speaking: boolean;
  state: string; // "connected", "connecting", "failed"...
}
export interface CallSession {
  roomId: string;
  roomName: string;
  title: string;
  host: { id: string; name: string };
  startedAt: string;
  tiles: Tile[];
  micOn: boolean;
  hasMic: boolean;
  camOn: boolean;
  minimized: boolean;
  reconnecting: boolean;
}

interface CallCtx {
  calls: Record<string, CallInfo>; // live calls in the rooms you're in, by room id
  ready: boolean; // the first look at which calls are live has come back
  refreshCalls: () => Promise<Record<string, CallInfo> | null>; // look again, e.g. before offering to join from a link
  session: CallSession | null; // the call you're in right now
  join: (roomId: string, roomName: string) => Promise<string | null>; // resolves to an error message, or null
  leave: () => void;
  endForAll: () => void;
  toggleMic: () => void;
  toggleCam: () => Promise<string | null>;
  setMinimized: (v: boolean) => void;
}
const noop = async () => null;
const Ctx = createContext<CallCtx>({ calls: {}, ready: false, refreshCalls: async () => null, session: null, join: noop, leave: () => {}, endForAll: () => {}, toggleMic: () => {}, toggleCam: noop, setMinimized: () => {} });
export const useCall = () => useContext(Ctx);

interface Peer {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
  pending: RTCIceCandidateInit[];
  remoteSet: boolean;
  muted: boolean;
  video: boolean;
  state: string;
  aSender: RTCRtpSender | null;
  vSender: RTCRtpSender | null;
}

// Group calls: WebRTC in a mesh (everyone connects to everyone), with the server only passing the connection messages
// along (see backend/src/sockets/callHandler.js). Lives above the whole app, so a call keeps going while you move around.
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const toasts = useToasts();
  const [calls, setCalls] = useState<Record<string, CallInfo>>({});
  const [session, setSession] = useState<CallSession | null>(null);
  const [ready, setReady] = useState(false);

  const peers = useRef(new Map<string, Peer>());
  const names = useRef(new Map<string, string>());
  const local = useRef<{ audio: MediaStreamTrack | null; video: MediaStreamTrack | null; camStream: MediaStream | null }>({ audio: null, video: null, camStream: null });
  const meta = useRef<{ roomId: string; roomName: string; title: string; host: { id: string; name: string }; startedAt: string } | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const speaking = useRef(new Set<string>());
  const analysers = useRef(new Map<string, { an: AnalyserNode; buf: Uint8Array<ArrayBuffer> }>());
  const audioCtx = useRef<AudioContext | null>(null);
  const flags = useRef({ minimized: false, reconnecting: false, hasMic: true });
  const off = useRef<(() => void) | null>(null);
  const meId = useRef("");
  const meName = useRef("You");
  useEffect(() => {
    meId.current = user?._id ?? "";
    meName.current = user?.name ?? "You";
  }, [user]);

  // ---- the list of live calls (for the banners) ----
  // Asked for again whenever it might be out of date: an installed app stays open for days and sleeps, and a socket that
  // dropped and came back has missed any "call started" in between.
  const refreshCalls = useCallback(async () => {
    try {
      const map = Object.fromEntries((await liveCalls()).map((c) => [c.roomId, c]));
      setCalls(map);
      return map;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    liveCalls()
      .then((l) => setCalls(Object.fromEntries(l.map((c) => [c.roomId, c]))))
      .catch(() => {})
      .finally(() => setReady(true));
    const socket = getSocket();
    const upsert = (d: { roomId: string; call: CallInfo | null }) => setCalls((c) => (d.call ? { ...c, [d.roomId]: d.call } : Object.fromEntries(Object.entries(c).filter(([k]) => k !== d.roomId))));
    const ended = (d: { roomId: string }) => setCalls((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== d.roomId)));
    const resync = () => void refreshCalls();
    const onVisible = () => document.visibilityState === "visible" && resync();
    socket.on("call:started", upsert);
    socket.on("call:update", upsert);
    socket.on("call:ended", ended);
    socket.on("connect", resync); // also fires on every reconnect
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", resync);
    window.addEventListener("online", resync);
    const timer = setInterval(resync, 60_000);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("call:started", upsert);
      socket.off("call:update", upsert);
      socket.off("call:ended", ended);
      socket.off("connect", resync);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", resync);
      window.removeEventListener("online", resync);
      clearInterval(timer);
    };
  }, [user, refreshCalls]);

  // ---- building what the screen shows ----
  const publish = useCallback(() => {
    const m = meta.current;
    if (!m) return setSession(null);
    const l = local.current;
    const tiles: Tile[] = [
      { id: meId.current, name: meName.current, you: true, stream: l.camStream, muted: !l.audio?.enabled, video: Boolean(l.video), speaking: speaking.current.has("me"), state: "connected" },
      ...[...peers.current.values()].map((p) => ({ id: p.id, name: p.name, you: false, stream: p.stream, muted: p.muted, video: p.video && p.stream.getVideoTracks().length > 0, speaking: speaking.current.has(p.id), state: p.state })),
    ];
    setSession({ ...m, tiles, micOn: Boolean(l.audio?.enabled), hasMic: flags.current.hasMic, camOn: Boolean(l.video), minimized: flags.current.minimized, reconnecting: flags.current.reconnecting });
  }, []);

  // Who is talking: loudness of each person's audio, checked a few times a second.
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const watch = useCallback((id: string, track: MediaStreamTrack) => {
    try {
      audioCtx.current ??= new AudioContext();
      const an = audioCtx.current.createAnalyser();
      an.fftSize = 512;
      audioCtx.current.createMediaStreamSource(new MediaStream([track])).connect(an);
      analysers.current.set(id, { an, buf: new Uint8Array(an.fftSize) });
    } catch {}
    if (levelTimer.current) return;
    levelTimer.current = setInterval(() => {
      const now = new Set<string>();
      for (const [key, { an, buf }] of analysers.current) {
        if (key === "me" && !local.current.audio?.enabled) continue;
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        if (Math.sqrt(sum / buf.length) > 0.035) now.add(key);
      }
      const prev = speaking.current;
      if (now.size !== prev.size || [...now].some((k) => !prev.has(k))) {
        speaking.current = now;
        publish();
      }
    }, 140);
  }, [publish]);

  // ---- one connection to one other person ----
  const sock = () => getSocket();
  const closePeer = useCallback((id: string) => {
    const p = peers.current.get(id);
    if (!p) return;
    p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null;
    p.pc.close();
    peers.current.delete(id);
    analysers.current.delete(id);
  }, []);

  const createPeer = useCallback(
    (id: string, name: string, initiator: boolean): Peer => {
      closePeer(id);
      const pc = new RTCPeerConnection({ iceServers: ice.current });
      const peer: Peer = { id, name, pc, stream: new MediaStream(), pending: [], remoteSet: false, muted: false, video: false, state: "connecting", aSender: null, vSender: null };
      // The video "slot" exists from the start (empty), so turning the camera on later is just filling it - no renegotiation.
      if (initiator) {
        peer.aSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
        peer.vSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
        if (local.current.audio) void peer.aSender.replaceTrack(local.current.audio);
        if (local.current.video) void peer.vSender.replaceTrack(local.current.video);
      }
      pc.onicecandidate = (e) => {
        if (e.candidate && meta.current) sock().emit("call:signal", { roomId: meta.current.roomId, to: id, data: { type: "candidate", candidate: e.candidate.toJSON() } });
      };
      pc.ontrack = (e) => {
        peer.stream.addTrack(e.track);
        if (e.track.kind === "audio") watch(id, e.track);
        e.track.onmute = e.track.onunmute = () => publish();
        publish();
      };
      pc.onconnectionstatechange = () => {
        peer.state = pc.connectionState;
        publish();
      };
      peers.current.set(id, peer);
      return peer;
    },
    [closePeer, publish, watch],
  );

  const offerTo = useCallback(
    async (id: string, name: string) => {
      const peer = createPeer(id, name, true);
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      if (meta.current) sock().emit("call:signal", { roomId: meta.current.roomId, to: id, data: { type: "offer", sdp: peer.pc.localDescription } });
      publish();
    },
    [createPeer, publish],
  );

  const onSignal = useCallback(
    async (msg: { roomId: string; from: string; data: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      if (!meta.current || msg.roomId !== meta.current.roomId) return;
      const { from, data } = msg;
      try {
        if (data.type === "offer" && data.sdp) {
          const peer = createPeer(from, names.current.get(from) ?? "Someone", false);
          await peer.pc.setRemoteDescription(data.sdp);
          peer.remoteSet = true;
          // The slots made from their offer are ours to send on too: audio, and the (empty) video one.
          for (const t of peer.pc.getTransceivers()) {
            t.direction = "sendrecv";
            if (t.receiver.track.kind === "audio") peer.aSender = t.sender;
            else peer.vSender = t.sender;
          }
          if (local.current.audio) await peer.aSender?.replaceTrack(local.current.audio);
          if (local.current.video) await peer.vSender?.replaceTrack(local.current.video);
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          sock().emit("call:signal", { roomId: msg.roomId, to: from, data: { type: "answer", sdp: peer.pc.localDescription } });
          for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
        } else if (data.type === "answer" && data.sdp) {
          const peer = peers.current.get(from);
          if (!peer) return;
          await peer.pc.setRemoteDescription(data.sdp);
          peer.remoteSet = true;
          for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
        } else if (data.type === "candidate" && data.candidate) {
          const peer = peers.current.get(from);
          if (!peer) return;
          if (peer.remoteSet) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
          else peer.pending.push(data.candidate);
        }
      } catch (err) {
        console.error("[call] signalling failed", err);
      }
    },
    [createPeer],
  );

  // ---- leaving ----
  const teardown = useCallback(() => {
    off.current?.();
    off.current = null;
    for (const id of [...peers.current.keys()]) closePeer(id);
    local.current.audio?.stop();
    local.current.video?.stop();
    local.current = { audio: null, video: null, camStream: null };
    if (levelTimer.current) clearInterval(levelTimer.current);
    levelTimer.current = null;
    analysers.current.clear();
    speaking.current = new Set();
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    meta.current = null;
    flags.current = { minimized: false, reconnecting: false, hasMic: true };
    setSession(null);
  }, [closePeer]);

  const leave = useCallback(() => {
    if (meta.current) sock().emit("call:leave", { roomId: meta.current.roomId });
    teardown();
  }, [teardown]);

  const endForAll = useCallback(() => {
    if (meta.current) sock().emit("call:end", { roomId: meta.current.roomId });
    teardown();
  }, [teardown]);

  // ---- joining ----
  const enter = useCallback(
    (roomId: string) =>
      new Promise<{ ok: boolean; error?: string; call?: CallInfo; peers?: { id: string; name: string }[]; iceServers?: RTCIceServer[] }>((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, error: "The call didn’t answer. Check your connection and try again." }), 9000);
        sock().emit("call:join", { roomId }, (res: { ok: boolean; error?: string; call?: CallInfo; peers?: { id: string; name: string }[]; iceServers?: RTCIceServer[] }) => {
          clearTimeout(timer);
          resolve(res);
        });
      }),
    [],
  );

  const join = useCallback(
    async (roomId: string, roomName: string): Promise<string | null> => {
      if (typeof RTCPeerConnection === "undefined") return "This browser can’t take part in calls.";
      if (meta.current) leave();
      const socket = sock();
      if (!socket.connected) socket.connect();
      // The microphone first; if it's blocked you can still listen in.
      let audio: MediaStreamTrack | null = null;
      try {
        audio = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })).getAudioTracks()[0] ?? null;
      } catch {
        audio = null;
      }
      local.current = { audio, video: null, camStream: null };
      flags.current = { minimized: false, reconnecting: false, hasMic: Boolean(audio) };
      const res = await enter(roomId);
      if (!res.ok || !res.call) {
        audio?.stop();
        local.current = { audio: null, video: null, camStream: null };
        return res.error ?? "Couldn’t join the call.";
      }
      ice.current = res.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }];
      names.current = new Map(res.call.participants.map((p) => [p.id, p.name]));
      meta.current = { roomId, roomName, title: res.call.title ?? "", host: res.call.host, startedAt: res.call.startedAt };
      if (audio) watch("me", audio);

      const onJoined = (d: { roomId: string; user: { id: string; name: string } }) => {
        if (d.roomId !== roomId) return;
        names.current.set(d.user.id, d.user.name);
        closePeer(d.user.id); // they came back: the old connection is dead, theirs offers a new one
        publish();
      };
      const onLeft = (d: { roomId: string; userId: string }) => {
        if (d.roomId !== roomId) return;
        closePeer(d.userId);
        publish();
      };
      const onMedia = (d: { roomId: string; userId: string; muted: boolean; video: boolean }) => {
        const p = peers.current.get(d.userId);
        if (d.roomId !== roomId || !p) return;
        p.muted = d.muted;
        p.video = d.video;
        publish();
      };
      const onEnded = (d: { roomId: string }) => {
        if (d.roomId !== roomId) return;
        teardown();
        toasts.push({ key: `call-ended:${roomId}`, kind: "call", title: "Call ended", body: `The call in ${roomName} has ended.`, ttl: 5000 });
      };
      const onReplaced = (d: { roomId: string }) => {
        if (d.roomId !== roomId) return;
        teardown();
        toasts.push({ key: `call-replaced:${roomId}`, kind: "call", title: "Call moved", body: "You joined this call from another tab or device.", ttl: 6000 });
      };
      // The connection to the server dropped and came back: join again and reconnect to everyone.
      const onDown = () => {
        flags.current.reconnecting = true;
        publish();
      };
      const onUp = async () => {
        if (!meta.current) return;
        for (const id of [...peers.current.keys()]) closePeer(id);
        const again = await enter(roomId);
        if (!again.ok) {
          teardown();
          return;
        }
        flags.current.reconnecting = false;
        for (const p of again.peers ?? []) await offerTo(p.id, p.name);
        publish();
      };
      socket.on("call:signal", onSignal);
      socket.on("call:peer-joined", onJoined);
      socket.on("call:peer-left", onLeft);
      socket.on("call:peer-media", onMedia);
      socket.on("call:ended", onEnded);
      socket.on("call:replaced", onReplaced);
      socket.on("disconnect", onDown);
      socket.on("connect", onUp);
      off.current = () => {
        socket.off("call:signal", onSignal);
        socket.off("call:peer-joined", onJoined);
        socket.off("call:peer-left", onLeft);
        socket.off("call:peer-media", onMedia);
        socket.off("call:ended", onEnded);
        socket.off("call:replaced", onReplaced);
        socket.off("disconnect", onDown);
        socket.off("connect", onUp);
      };
      // You call everyone already in it; they answer.
      for (const p of res.peers ?? []) {
        await offerTo(p.id, p.name);
      }
      publish();
      return null;
    },
    [closePeer, enter, leave, offerTo, onSignal, publish, teardown, toasts, watch],
  );

  const shareMedia = useCallback(() => {
    if (meta.current) sock().emit("call:media", { roomId: meta.current.roomId, muted: !local.current.audio?.enabled, video: Boolean(local.current.video) });
  }, []);

  const toggleMic = useCallback(() => {
    const a = local.current.audio;
    if (!a) return;
    a.enabled = !a.enabled;
    shareMedia();
    publish();
  }, [publish, shareMedia]);

  const toggleCam = useCallback(async (): Promise<string | null> => {
    const l = local.current;
    if (l.video) {
      for (const p of peers.current.values()) await p.vSender?.replaceTrack(null);
      l.video.stop();
      l.video = null;
      l.camStream = null;
    } else {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" } });
        l.video = cam.getVideoTracks()[0];
        l.camStream = new MediaStream([l.video]);
        for (const p of peers.current.values()) await p.vSender?.replaceTrack(l.video);
      } catch {
        return "Couldn’t start the camera. Allow camera access for this site and try again.";
      }
    }
    shareMedia();
    publish();
    return null;
  }, [publish, shareMedia]);

  const setMinimized = useCallback(
    (v: boolean) => {
      flags.current.minimized = v;
      publish();
    },
    [publish],
  );

  // Closing the tab ends your part of the call.
  useEffect(() => {
    const bye = () => meta.current && sock().emit("call:leave", { roomId: meta.current.roomId });
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  const value = useMemo(() => ({ calls, ready, refreshCalls, session, join, leave, endForAll, toggleMic, toggleCam, setMinimized }), [calls, ready, refreshCalls, session, join, leave, endForAll, toggleMic, toggleCam, setMinimized]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {session && typeof document !== "undefined" && createPortal(<CallOverlay session={session} canEnd={session.host.id === user?._id || Boolean(user?.isAdmin)} />, document.body)}
    </Ctx.Provider>
  );
}
