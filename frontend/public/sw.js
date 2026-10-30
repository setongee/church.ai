// A small service worker: it makes the platform installable and keeps a friendly offline page. It deliberately does
// NOT cache pages or API calls - this is a live, signed-in tool and stale data is worse than none.
const CACHE = "fafc-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only page navigations get the offline fallback; everything else goes straight to the network.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

// ---- push notifications -------------------------------------------------------------------------------------------
// The server sends { title, body, url, tag }. If the app is open and in front, the in-app toast already covers it, so the
// system banner is shown silently and withdrawn at once (browsers expect every push to show *something*).
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {}
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const inFront = wins.some((w) => w.visibilityState === "visible" && w.focused);
      await self.registration.showNotification(d.title || "FAFC Media Engine", {
        body: d.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/favicon-64.png",
        tag: d.tag || undefined,
        renotify: Boolean(d.tag),
        silent: inFront,
        data: { url: d.url || "/dashboard" },
      });
      if (inFront) {
        await new Promise((r) => setTimeout(r, 1200));
        (await self.registration.getNotifications({ tag: d.tag || undefined })).forEach((n) => n.close());
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url);
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          // The open app moves there itself (no reload); see NotificationProvider.
          w.postMessage({ type: "navigate", url: target.pathname + target.search + target.hash });
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
