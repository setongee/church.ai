"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarDays, CalendarX, Info, ListChecks, MessageCircle, Phone, Send, X } from "lucide-react";
import { timeAgo } from "@/lib/notifications";

export interface ToastItem {
  key: string; // pushing the same key again updates that toast (and bumps its count) instead of stacking another
  kind: "chat" | "roster" | "roster-removed" | "task" | "content" | "call" | "info";
  title: string; // the room, or the notification's headline
  author?: string;
  body: string;
  mentioned?: boolean;
  count?: number;
  ttl?: number;
  onOpen?: () => void;
  onReply?: (text: string) => Promise<void>;
  // Buttons on the toast itself (e.g. Approve / Decline a call request). The toast closes when one finishes.
  actions?: { label: string; primary?: boolean; run: () => Promise<void> | void }[];
}
type Live = ToastItem & { at: number };

interface Ctx {
  push: (t: ToastItem) => void;
  dismiss: (key: string) => void;
}
const ToastCtx = createContext<Ctx>({ push: () => {}, dismiss: () => {} });
export const useToasts = () => useContext(ToastCtx);

const PALETTE = ["#ea580c", "#0d9488", "#7c3aed", "#db2777", "#2563eb", "#65a30d", "#c026d3", "#d97706"];
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold text-[#ffffff]" style={{ width: size, height: size, background: PALETTE[Math.abs(h) % PALETTE.length], fontSize: size * 0.38 }}>
      {initials || "?"}
    </span>
  );
}

// Highlights @tags inside a preview.
export function Tagged({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@[\p{L}\p{N}_]+)/gu).map((part, i) =>
        part.startsWith("@") ? (
          <b key={i} className="font-semibold text-[#fdba74]">
            {part}
          </b>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Live[]>([]);

  const dismiss = useCallback((key: string) => setToasts((t) => t.filter((x) => x.key !== key)), []);
  const push = useCallback((t: ToastItem) => {
    setToasts((list) => {
      const old = list.find((x) => x.key === t.key);
      const merged: Live = { ...t, count: old ? (old.count ?? 1) + 1 : (t.count ?? 1), mentioned: Boolean(old?.mentioned || t.mentioned), at: Date.now() };
      return [...list.filter((x) => x.key !== t.key), merged].slice(-4);
    });
  }, []);
  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {!pathname.startsWith("/present/output") && toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[95] flex flex-col items-end gap-2.5 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[22rem]">
          {toasts.map((t) => (
            <Toast key={t.key} t={t} onClose={() => dismiss(t.key)} />
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

function Toast({ t, onClose }: { t: Live; onClose: () => void }) {
  const [hover, setHover] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const [focused, setFocused] = useState(false);
  const ttl = t.ttl ?? (t.mentioned ? 12000 : 8000);
  const hold = hover || focused || sending || acting || reply.length > 0;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // Auto-dismiss, restarted when the toast updates, and held while you're hovering or typing a reply.
  useEffect(() => {
    if (hold) return;
    const id = setTimeout(() => closeRef.current(), ttl);
    return () => clearTimeout(id);
  }, [t.at, hold, ttl]);

  const chat = t.kind === "chat";
  const Icon = t.kind === "roster" ? CalendarCheck : t.kind === "roster-removed" ? CalendarX : t.kind === "task" ? ListChecks : t.kind === "content" ? CalendarDays : t.kind === "call" ? Phone : t.kind === "info" ? Info : MessageCircle;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = reply.trim();
    if (!text || !t.onReply || sending) return;
    setSending(true);
    try {
      await t.onReply(text);
      onClose();
    } catch {
      setSending(false);
    }
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className={`present-slide-up pointer-events-auto relative w-full overflow-hidden rounded-2xl bg-[#171717] text-[#ffffff] shadow-2xl ring-1 ${t.mentioned ? "ring-[var(--accent-solid)]" : "ring-[rgba(255,255,255,0.12)]"}`}>
      <div className="flex items-start gap-3 p-3.5 pb-3">
        {chat && t.author ? (
          <Avatar name={t.author} />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-solid)]">
            <Icon size={18} />
          </span>
        )}
        <button
          onClick={() => {
            onClose();
            t.onOpen?.();
          }}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-1.5 text-xs">
            <span className="truncate font-semibold">{chat ? t.author : t.title}</span>
            {chat && <span className="truncate text-[#a3a3a3]">· {t.title}</span>}
            <span className="ml-auto shrink-0 text-[#a3a3a3]">{timeAgo(t.at)}</span>
          </span>
          {t.mentioned && <span className="mt-1 inline-block rounded-full bg-[var(--accent-solid)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Tagged you</span>}
          <span className="mt-1 line-clamp-3 block whitespace-pre-line text-[13px] leading-snug text-[#e5e5e5]">{chat ? <Tagged text={t.body} /> : t.body}</span>
          {(t.count ?? 1) > 1 && <span className="mt-1.5 inline-block rounded-full bg-[rgba(255,255,255,0.14)] px-2 py-0.5 text-[10px] font-semibold">{t.count} new messages</span>}
        </button>
        <button onClick={onClose} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#ffffff]">
          <X size={15} />
        </button>
      </div>
      {t.actions && t.actions.length > 0 && (
        <div className="flex gap-2 border-t border-[rgba(255,255,255,0.1)] px-3 py-2.5">
          {t.actions.map((a) => (
            <button
              key={a.label}
              disabled={acting}
              onClick={async () => {
                setActing(true);
                try {
                  await a.run();
                  onClose();
                } catch {
                  setActing(false);
                }
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${a.primary ? "bg-[var(--accent-solid)] text-[#ffffff] hover:bg-[var(--accent-solid-hover)]" : "bg-[rgba(255,255,255,0.12)] text-[#ffffff] hover:bg-[rgba(255,255,255,0.2)]"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {t.onReply && (
        <form onSubmit={send} className="flex items-center gap-2 border-t border-[rgba(255,255,255,0.1)] px-3 py-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="Quick reply…" maxLength={4000} className="min-w-0 flex-1 rounded-full bg-[rgba(255,255,255,0.1)] px-3.5 py-1.5 text-[13px] text-[#ffffff] outline-none placeholder:text-[#a3a3a3] focus:bg-[rgba(255,255,255,0.16)]" />
          <button type="submit" disabled={!reply.trim() || sending} aria-label="Send reply" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-solid)] text-[#ffffff] disabled:opacity-40">
            <Send size={14} />
          </button>
        </form>
      )}
      {!hold && <span key={t.at} className="absolute bottom-0 left-0 h-[3px] bg-[var(--accent-solid)]" style={{ animation: `toast-bar ${ttl}ms linear forwards` }} />}
    </div>
  );
}
