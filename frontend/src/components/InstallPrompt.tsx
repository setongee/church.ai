"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useInstall } from "@/lib/pwa";

const KEY = "pwa-install-snooze";
const SNOOZE_DAYS = 7;

// A gentle "Install the app" card: Chrome/Android get an Install button; iPhone/iPad get the Add to Home Screen steps.
// Dismissing it hides it for a week. Never shown once the app is installed, or on the projector output.
export function InstallPrompt() {
  const { canPrompt, iosHelp, install } = useInstall();
  const pathname = usePathname();
  const [snoozed, setSnoozed] = useState(true);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(KEY) || 0);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      setSnoozed(Date.now() < until);
    } catch {
      setSnoozed(false);
    }
  }, []);

  if (snoozed || pathname.startsWith("/present/output") || pathname.startsWith("/download") || (!canPrompt && !iosHelp)) return null;

  const dismiss = () => {
    setSnoozed(true);
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    } catch {}
  };

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-2xl bg-[#171717] p-4 text-[#ffffff] shadow-2xl sm:left-5 sm:right-auto sm:mx-0 sm:w-96">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install FAFC Media Engine</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#d4d4d4]">Add it to your home screen to open it full screen, like a native app.</p>
          {steps && iosHelp && (
            <ol className="mt-3 space-y-2 text-xs text-[#e5e5e5]">
              <li className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[rgba(255,255,255,0.15)] text-[10px] font-bold">1</span> Tap <Share size={14} className="inline" /> <b>Share</b> in the Safari toolbar
              </li>
              <li className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[rgba(255,255,255,0.15)] text-[10px] font-bold">2</span> Choose <SquarePlus size={14} className="inline" /> <b>Add to Home Screen</b>
              </li>
              <li className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[rgba(255,255,255,0.15)] text-[10px] font-bold">3</span> Tap <b>Add</b>
              </li>
            </ol>
          )}
          <div className="mt-3 flex items-center gap-2">
            {canPrompt ? (
              <button onClick={async () => ((await install()) ? setSnoozed(true) : dismiss())} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
                <Download size={15} /> Install
              </button>
            ) : (
              !steps && (
                <button onClick={() => setSteps(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
                  <Download size={15} /> Show me how
                </button>
              )
            )}
            <button onClick={dismiss} className="rounded-lg px-3 py-2 text-sm font-medium text-[#d4d4d4] hover:bg-[rgba(255,255,255,0.1)]">
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Close" className="shrink-0 rounded-md p-1 text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#ffffff]">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
