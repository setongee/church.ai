// The service worker keeps the app usable with no internet. It saves the Present pages and the app's own files as they are
// used, and serves the background / media files that Present saved to this device (see lib/offline/offline.ts), so a
// dropped connection never stops a service. It deliberately does NOT cache API calls: the app keeps its own copy of the data
// (songs, Bibles, schedules) in IndexedDB, and stale answers from here would be worse than none.
const SHELL = "fafc-shell-v2";
const PAGES = "fafc-pages-v1";
const STATIC = "fafc-static-v1";
const MEDIA = "fafc-media"; // filled by the app's offline sync
const KEEP = [SHELL, PAGES, STATIC, MEDIA];
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// A saved file, answered in full or (for video / audio) as the byte range the player asked for.
async function savedMedia(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req.url);
  if (!hit) return fetch(req);
  const range = req.headers.get("range");
  if (!range) return hit;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const blob = await hit.clone().blob();
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), blob.size - 1) : blob.size - 1;
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": hit.headers.get("Content-Type") || "application/octet-stream", "Content-Range": "bytes " + start + "-" + end + "/" + blob.size, "Accept-Ranges": "bytes" },
  });
}

// The app's own files have a hash in their name, so a saved one is always right.
async function staticFile(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Present pages: the network when it answers quickly (and the page is saved for next time), otherwise the saved page.
async function page(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  const saved = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  const fresh = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") cache.put(new Request(req.url.split("?")[0]), res.clone());
    return res;
  });
  if (!saved) return fresh.catch(() => caches.match(OFFLINE_URL));
  event.waitUntil(fresh.catch(() => {}));
  return Promise.race([fresh, new Promise((resolve) => setTimeout(() => resolve(saved), 3500))]).catch(() => saved);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/offline-seed/backgrounds/")) {
    event.respondWith(savedMedia(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // The app asking us to keep a page for offline use (see warmShell): fetch it and save it, as if it had been opened.
  if (req.headers.get("x-warm") === "1") {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone(); // before the page starts reading the body
          event.waitUntil(caches.open(PAGES).then((c) => c.put(new Request(url.origin + url.pathname), copy)));
        }
        return res;
      })
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticFile(req));
    return;
  }
  if (req.mode === "navigate") {
    // Only the Present pages are kept for offline use. With no connection any other page opens Present instead (offline mode
    // is Present on its own), or the friendly offline page if Present has never been opened on this device.
    if (url.pathname.startsWith("/present")) event.respondWith(page(event));
    else
      event.respondWith(
        fetch(req).catch(async () => {
          const saved = await (await caches.open(PAGES)).match("/present", { ignoreSearch: true, ignoreVary: true });
          return saved ? Response.redirect(new URL("/present", self.location.origin).href, 302) : caches.match(OFFLINE_URL);
        })
      );
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
