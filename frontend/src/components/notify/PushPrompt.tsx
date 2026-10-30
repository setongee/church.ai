"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { enablePush, pushStatus, type PushStatus } from "@/lib/push";

const KEY = "push-prompt-snooze";

// A one-time nudge to turn on notifications (shown after sign-in, snoozed for a week if dismissed).
export function PushPrompt() {
  const { user, kiosk } = useAuth();
  const pathname = usePathname();
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    if (!user) return;
    let until = 0;
    try {
      until = Number(localStorage.getItem(KEY) || 0);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setSnoozed(Date.now() < until);
    void pushStatus().then(setStatus);
  }, [user]);

  if (!user || kiosk || snoozed || status !== "off" || pathname.startsWith("/present") || pathname === "/login") return null;
  const close = () => {
    setSnoozed(true);
    try {
      localStorage.setItem(KEY, String(Date.now() + 7 * 86400000));
    } catch {}
  };
  return (
    <div className="fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-30 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-[#171717] p-4 text-[#ffffff] shadow-2xl sm:left-auto sm:right-6 sm:mx-0 sm:w-96">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent-solid)]">
        <BellRing size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Turn on notifications</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#d4d4d4]">Hear about your roster and team chat straight away, even when the app is closed.</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={async () => {
              const s = await enablePush();
              setStatus(s);
              if (s !== "off") close();
            }}
            className="rounded-lg bg-[var(--accent-solid)] px-3.5 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-[var(--accent-solid-hover)]"
          >
            Turn on
          </button>
          <button onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-[#d4d4d4] hover:text-[#ffffff]">
            Not now
          </button>
        </div>
      </div>
      <button onClick={close} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-[#a3a3a3] hover:text-[#ffffff]">
        <X size={15} />
      </button>
    </div>
  );
}
