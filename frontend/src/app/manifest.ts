import type { MetadataRoute } from "next";

// What makes the platform installable: with this, "Add to Home Screen" gives it its own icon and a full-screen,
// app-like window (no browser bars).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FAFC Media Engine",
    short_name: "FAFC Media",
    description: "Run services, present, design and publish — the FAFC media team's platform.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#ea580c",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Chat", url: "/chat", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Dashboard", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
