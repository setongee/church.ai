"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, BellRing, CalendarCheck, CalendarDays, CalendarX, Info, ListChecks, MessageCircle, Phone, Volume2, VolumeX } from "lucide-react";
import { askDesktopAlerts, desktopAlertState, setSoundOn, soundOn, timeAgo, type AppNotification } from "@/lib/notifications";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/push";
import { useChat } from "@/components/chat/ChatProvider";
import { useNotifications } from "./NotificationProvider";

const iconFor = (t: AppNotification["type"]) => (t === "roster" ? CalendarCheck : t === "roster-removed" ? CalendarX : t === "task" || t === "task-moved" ? ListChecks : t === "content" ? CalendarDays : t === "call" || t === "call-request" ? Phone : Info);

export function NotificationBell() {
  const { items, unread, open: openOne, markAll, clear, decideCall } = useNotifications();
  const [deciding, setDeciding] = useState<string | null>(null);
  const { unread: chatUnread, mentioned } = useChat();
  const [shown, setShown] = useState(false);
  const [sound, setSound] = useState(true);
  const [alerts, setAlerts] = useState<string>("unsupported");
  const [push, setPush] = useState<PushStatus>("unsupported");
  const total = unread + chatUnread;
  // The desktop app shows the count on its dock / taskbar icon.
  useEffect(() => {
    window.fafcDesktop?.badge(total);
  }, [total]);

  // Settings live in the browser, so they're read after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage / Notification are only available after mount
    setSound(soundOn());
    setAlerts(desktopAlertState());
    void pushStatus().then(setPush);
  }, []);
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShown(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shown]);

  return (
    <>
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={total ? `Notifications, ${total} unread` : "Notifications"} aria-expanded={shown} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-orange-600">
        <Bell size={19} />
        {total > 0 && <span className={`absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-[#ffffff] ${mentioned ? "bg-orange-600" : "bg-[#dc2626]"}`}>{total > 99 ? "99+" : total}</span>}
      </button>
      {shown &&
        createPortal(
          <div className="fixed inset-0 z-[80]" onMouseDown={() => setShown(false)}>
            <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Notifications" className="absolute right-3 top-[calc(4.25rem+env(safe-area-inset-top))] flex max-h-[min(34rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-2xl sm:right-6">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold text-neutral-900">Notifications</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => (setSoundOn(!sound), setSound(!sound))}
                    aria-label={sound ? "Mute notification sound" : "Turn notification sound on"}
                    title={sound ? "Sound on" : "Sound off"}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
                  >
                    {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  </button>
                  {unread > 0 && (
                    <button onClick={markAll} className="rounded-full px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50">
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              {chatUnread > 0 && (
                <Link href="/chat" onClick={() => setShown(false)} className="mx-3 mb-2 flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2.5 hover:bg-neutral-100">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-100 text-orange-700">
                    <MessageCircle size={16} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <b className="text-neutral-900">{chatUnread} unread chat message{chatUnread === 1 ? "" : "s"}</b>
                    <span className="block text-xs text-neutral-500">{mentioned ? "Someone tagged you" : "Open the team chat"}</span>
                  </span>
                </Link>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                {items.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-neutral-400">You’re all caught up.</p>
                ) : (
                  items.map((n) => {
                    const Icon = iconFor(n.type);
                    // A member's request for a call: an admin settles it right here.
                    if (n.type === "call-request") {
                      const status = String(n.data?.status ?? "pending");
                      const by = n.data?.decidedBy ? ` by ${String(n.data.decidedBy)}` : "";
                      return (
                        <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${status === "pending" ? "bg-orange-50/60" : ""}`}>
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-700">
                            <Icon size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="truncate text-sm font-semibold text-neutral-900">{n.title}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-neutral-400">{timeAgo(n.createdAt)}</span>
                            </span>
                            {n.body && <span className="mt-0.5 block text-[13px] text-neutral-600">{n.body}</span>}
                            {status === "pending" ? (
                              <span className="mt-2 flex gap-2">
                                <button
                                  disabled={deciding === n.id}
                                  onClick={async () => {
                                    setDeciding(n.id);
                                    await decideCall(n, true).catch(() => {});
                                    setDeciding(null);
                                  }}
                                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={deciding === n.id}
                                  onClick={async () => {
                                    setDeciding(n.id);
                                    await decideCall(n, false).catch(() => {});
                                    setDeciding(null);
                                  }}
                                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                                >
                                  Decline
                                </button>
                              </span>
                            ) : (
                              <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status === "approved" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-600"}`}>
                                {status === "approved" ? "Approved" : status === "declined" ? "Declined" : "Cancelled"}
                                {status !== "cancelled" ? by : ""}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={n.id}
                        onClick={() => (setShown(false), openOne(n))}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 ${n.read ? "" : "bg-orange-50/60"}`}
                      >
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.type === "roster-removed" ? "bg-neutral-200 text-neutral-600" : "bg-orange-100 text-orange-700"}`}>
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-semibold text-neutral-900">{n.title}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-neutral-400">{timeAgo(n.createdAt)}</span>
                          </span>
                          {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-neutral-600">{n.body}</span>}
                        </span>
                        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-label="Unread" />}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-4 py-2.5">
                {push === "on" ? (
                  <span className="text-xs text-neutral-500">
                    Notifications are on ·{" "}
                    <button onClick={async () => (await disablePush(), setPush(await pushStatus()))} className="font-semibold text-neutral-500 underline hover:text-red-600">
                      turn off
                    </button>
                  </span>
                ) : push === "off" ? (
                  <button onClick={async () => setPush(await enablePush())} className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:underline">
                    <BellRing size={14} /> Turn on notifications
                  </button>
                ) : push === "denied" ? (
                  <span className="text-xs text-neutral-400">Notifications are blocked — allow them in your browser settings</span>
                ) : push === "ios-install" ? (
                  <span className="text-xs text-neutral-500">On iPhone, add the app to your Home Screen to get notifications.</span>
                ) : alerts === "default" ? (
                  <button onClick={async () => setAlerts(await askDesktopAlerts())} className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:underline">
                    <BellRing size={14} /> Turn on desktop alerts
                  </button>
                ) : alerts === "granted" ? (
                  <span className="text-xs text-neutral-400">Desktop alerts are on</span>
                ) : alerts === "denied" ? (
                  <span className="text-xs text-neutral-400">Desktop alerts are blocked in this browser</span>
                ) : (
                  <span />
                )}
                {items.length > 0 && (
                  <button onClick={clear} className="text-xs text-neutral-400 hover:text-red-600">
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
