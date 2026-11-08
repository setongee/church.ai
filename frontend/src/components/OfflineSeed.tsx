"use client";

import { useEffect } from "react";
import { loadSeed, warmShell } from "@/lib/offline/seed";

// Quietly puts the bundled Bibles, hymns and backgrounds on this device (once per seed version), whatever page opened first.
export function OfflineSeed() {
  useEffect(() => {
    const run = () => void loadSeed().then(warmShell).catch(() => {});
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
