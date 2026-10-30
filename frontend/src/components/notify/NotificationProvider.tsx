"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSocket } from "@/lib/socket";
import { clearNotifications, desktopAlert, listNotifications, ping, readAllNotifications, readNotification, type AppNotification } from "@/lib/notifications";
import { syncPush } from "@/lib/push";
import { approveCallRequest, declineCallRequest } from "@/lib/chat";
import { useToasts } from "./ToastHost";

interface Ctx {
  items: AppNotification[];
  unread: number;
  open: (n: AppNotification) => void;
  markAll: () => void;
  clear: () => void;
  // Approve or decline a member's call request (admins); the row then shows the outcome.
  decideCall: (n: AppNotification, approve: boolean) => Promise<void>;
}
const NotifCtx = createContext<Ctx>({ items: [], unread: 0, open: () => {}, markAll: () => {}, clear: () => {}, decideCall: async () => {} });
export const useNotifications = () => useContext(NotifCtx);

// In-app notifications (roster changes, account news): loaded once, then topped up live over the socket. Each new one
// also pops a toast, plays a soft ping, and - if the app is in the background - raises an alert from the system.
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, kiosk } = useAuth();
  const router = useRouter();
  const toasts = useToasts();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    listNotifications()
      .then((r) => setItems(r.items))
      .catch(() => {});
    void syncPush(); // a device that already allowed notifications is (re)attached to whoever just signed in
  }, [user]);

  // Tapping a push notification while the app is open: the service worker asks us to go to the deep link.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "navigate" && typeof e.data.url === "string" && !kiosk) router.push(e.data.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router, kiosk]);

  const go = useCallback(
    (href: string) => {
      if (href && !kiosk) router.push(href);
    },
    [router, kiosk],
  );

  const decideCall = useCallback(async (n: AppNotification, approve: boolean) => {
    const requestId = String(n.data?.requestId ?? "");
    if (!requestId) return;
    const r = approve ? await approveCallRequest(requestId) : await declineCallRequest(requestId);
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true, data: { ...x.data, status: r.status } } : x)));
    void readNotification(n.id).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onNotification = (n: AppNotification) => {
      setItems((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list].slice(0, 50)));
      const pendingCall = n.type === "call-request" && (n.data?.status ?? "pending") === "pending";
      toasts.push({
        actions: pendingCall
          ? [
              { label: "Approve", primary: true, run: () => decideCall(n, true) },
              { label: "Decline", run: () => decideCall(n, false) },
            ]
          : undefined,
        key: `n:${n.id}`, kind: n.type === "roster" || n.type === "roster-removed" ? n.type : n.type === "task" || n.type === "task-moved" ? "task" : n.type === "content" ? "content" : n.type === "call" || n.type === "call-request" ? "call" : "info", title: n.title, body: n.body, ttl: pendingCall ? 45000 : 10000, onOpen: () => go(n.href) });
      ping();
      desktopAlert({ title: n.title, body: n.body, tag: `n:${n.id}`, onClick: () => go(n.href) });
    };
    // Another admin already settled a call request: update the row (and the toast, via its next render).
    const onUpdate = (n: AppNotification) => setItems((list) => list.map((x) => (x.id === n.id ? n : x)));
    socket.on("notification", onNotification);
    socket.on("notification:update", onUpdate);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off("notification", onNotification);
      socket.off("notification:update", onUpdate);
    };
  }, [user, toasts, go, decideCall]);

  const open = useCallback(
    (n: AppNotification) => {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void readNotification(n.id).catch(() => {});
      go(n.href);
    },
    [go],
  );
  const markAll = useCallback(() => {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    void readAllNotifications().catch(() => {});
  }, []);
  const clear = useCallback(() => {
    setItems([]);
    void clearNotifications().catch(() => {});
  }, []);

  const unread = useMemo(() => items.filter((x) => !x.read).length, [items]);
  const value = useMemo(() => ({ items, unread, open, markAll, clear, decideCall }), [items, unread, open, markAll, clear, decideCall]);
  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}
