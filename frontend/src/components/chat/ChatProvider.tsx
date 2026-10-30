"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSocket } from "@/lib/socket";
import { desktopAlert, ping } from "@/lib/notifications";
import { useToasts } from "@/components/notify/ToastHost";
import { CallProvider } from "./CallProvider";
import { listRooms, markRoomRead, previewOf, sendMessage, type ChatMessage, type IncomingMessage, type Reaction, type Room } from "@/lib/chat";

type ChatEvent = { type: "message"; data: IncomingMessage } | { type: "reaction"; roomId: string; messageId: string; reactions: Reaction[] } | { type: "edit"; message: ChatMessage } | { type: "delete"; roomId: string; messageId: string };
type Listener = (e: ChatEvent) => void;

interface ChatCtx {
  rooms: Room[];
  unread: number;
  mentioned: boolean;
  refresh: () => Promise<void>;
  markRead: (roomId: string) => void;
  // The room the user is looking at right now (no alert for it); null when no chat is on screen.
  setViewing: (roomId: string | null) => void;
  // Live feed for open conversations.
  subscribe: (fn: Listener) => () => void;
}

const Ctx = createContext<ChatCtx>({ rooms: [], unread: 0, mentioned: false, refresh: async () => {}, markRead: () => {}, setViewing: () => {}, subscribe: () => () => {} });
export const useChat = () => useContext(Ctx);

// Platform-wide chat: keeps unread counts for the nav badge, listens for messages on the socket, and pops an alert
// when one arrives for a room you're not looking at - wherever you are in the app (the presenter's locked view too).
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, kiosk } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [rooms, setRooms] = useState<Room[]>([]);
  const toast = useToasts();
  const viewing = useRef<string | null>(null);
  const listeners = useRef(new Set<Listener>());
  const roomsRef = useRef<Room[]>([]);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const refresh = useCallback(async () => {
    try {
      setRooms(await listRooms());
    } catch {
      // chat is optional; the rest of the app carries on
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    listRooms()
      .then(setRooms)
      .catch(() => {});
  }, [user]);

  const markRead = useCallback((roomId: string) => {
    setRooms((rs) => rs.map((r) => (r.id === roomId ? { ...r, unread: 0, mentioned: false } : r)));
    void markRoomRead(roomId).catch(() => {});
  }, []);
  const setViewing = useCallback((id: string | null) => {
    viewing.current = id;
  }, []);
  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const goTo = useCallback(
    (roomId: string) => {
      router.push(kiosk || pathname.startsWith("/present") ? `/present?tab=chat&room=${roomId}` : `/chat?room=${roomId}`);
    },
    [router, kiosk, pathname],
  );

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onMessage = (data: IncomingMessage) => {
      const m = data.message;
      listeners.current.forEach((fn) => fn({ type: "message", data }));
      if (m.author.id === user._id) return;
      const watching = viewing.current === m.roomId && document.visibilityState === "visible";
      // The room list: bump the unread count and the preview (or fetch the list if this is a room we haven't seen).
      if (!roomsRef.current.some((r) => r.id === m.roomId)) void refresh();
      setRooms((rs) => rs.map((r) => (r.id === m.roomId ? { ...r, last: { text: previewOf(m).slice(0, 90), author: m.author.name, at: m.createdAt }, unread: watching ? r.unread : r.unread + 1, mentioned: watching ? r.mentioned : r.mentioned || data.mentioned } : r)));
      if (!watching) {
        // One toast per room: more messages from the same room update it ("3 new messages") instead of piling up.
        const open = () => goTo(m.roomId);
        toast.push({
          key: `chat:${m.roomId}`,
          kind: "chat",
          title: data.roomName,
          author: m.author.name,
          body: previewOf(m),
          mentioned: data.mentioned,
          onOpen: open,
          onReply: async (text) => {
            await sendMessage(m.roomId, { text, mentions: [], all: false });
            markRead(m.roomId);
          },
        });
        ping();
        desktopAlert({ title: `${m.author.name} · ${data.roomName}${data.mentioned ? " (tagged you)" : ""}`, body: previewOf(m).slice(0, 140), tag: `chat:${m.roomId}`, onClick: open });
      }
    };
    const onReaction = (d: { roomId: string; messageId: string; reactions: Reaction[] }) => listeners.current.forEach((fn) => fn({ type: "reaction", ...d }));
    socket.on("chat:message", onMessage);
    const onEdit = (d: { message: ChatMessage }) => listeners.current.forEach((fn) => fn({ type: "edit", message: d.message }));
    const onDelete = (d: { roomId: string; messageId: string }) => listeners.current.forEach((fn) => fn({ type: "delete", ...d }));
    socket.on("chat:reaction", onReaction);
    socket.on("chat:edit", onEdit);
    socket.on("chat:delete", onDelete);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:reaction", onReaction);
      socket.off("chat:edit", onEdit);
      socket.off("chat:delete", onDelete);
    };
  }, [user, refresh, toast, goTo, markRead]);

  const unread = useMemo(() => rooms.reduce((n, r) => n + (r.joined ? r.unread : 0), 0), [rooms]);
  const mentioned = useMemo(() => rooms.some((r) => r.joined && r.mentioned), [rooms]);

  // The browser tab title carries the count too, so it shows up when the app is in the background.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread ? `(${unread}) ${base}` : base;
  }, [unread]);

  return (
    <Ctx.Provider value={{ rooms, unread, mentioned, refresh, markRead, setViewing, subscribe }}>
      <CallProvider>{children}</CallProvider>
    </Ctx.Provider>
  );
}
