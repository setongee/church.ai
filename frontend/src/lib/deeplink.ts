"use client";

// Deep links land on a page with a query like ?task=ID or ?msg=ID. Once the thing is on screen, this scrolls it into
// view and flashes it so the person sees exactly what the notification was about. Elements carry id="<kind>-<id>".
export function flashElement(domId: string, tries = 20) {
  const el = document.getElementById(domId);
  if (!el) {
    if (tries > 0) setTimeout(() => flashElement(domId, tries - 1), 250); // the list may still be loading
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("deeplink-flash");
  setTimeout(() => el.classList.remove("deeplink-flash"), 2600);
}

export const queryParam = (name: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name));
