"use client";

import { useCallback, useEffect, useState } from "react";

// "Install to the home screen". Chrome / Edge / Android hand us a `beforeinstallprompt` event we can trigger from our
// own button; iPhone and iPad Safari don't, so there we explain the Share > Add to Home Screen steps instead.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

export function useInstall() {
  const [, rerender] = useState(0);
  const [standalone, setStandalone] = useState(true); // assume installed until we've looked (avoids a flash)
  const [ios, setIos] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser-only checks, readable only after mount */
    setStandalone(isStandalone());
    setIos(isIOS());
    /* eslint-enable react-hooks/set-state-in-effect */
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === "accepted";
  }, []);

  return { installed: standalone, canPrompt: !standalone && !!deferred, iosHelp: !standalone && ios, install };
}
