"use client";

import { useEffect } from "react";

// Registers the service worker (production only, so local development never gets stuck behind a cached shell).
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
