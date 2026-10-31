"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown, Download, LogOut, Menu, Palette, Settings, UserRound, UsersRound, X } from "lucide-react";
import { useInstall } from "@/lib/pwa";
import { useIsApp } from "@/lib/downloads";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "./AuthProvider";
import { useChat } from "./chat/ChatProvider";
import { useCall } from "./chat/CallProvider";
import { NotificationBell } from "./notify/NotificationBell";
import { canOpen } from "@/lib/auth";

interface Item {
  href: string;
  label: string;
  hint: string;
  path?: string; // decides who sees it (see canOpen); defaults to href. Admins see everything.
}
type Entry = { kind: "link"; href: string; label: string; badge?: boolean } | { kind: "menu"; label: string; items: Item[] };

// The whole navigation. A menu shows only the items the signed-in person may open, and disappears if none.
const NAV: Entry[] = [
  { kind: "link", href: "/dashboard", label: "Dashboard" },
  { kind: "link", href: "/services", label: "Services" },
  {
    kind: "menu",
    label: "Studio",
    items: [
      { href: "/studio", label: "Image Studio", hint: "Quote graphics & posts" },
      { href: "/presentation", label: "Presentation", hint: "16:9 slides & animations for the screen" },
      { href: "/carousels", label: "Carousels", hint: "Swipeable posts from a service" },
      { href: "/reel-studio", label: "Reel Studio", hint: "Videos from audio & photos" },
      { href: "/audio-lab", label: "Audio Lab", hint: "Cut, clean and merge recordings" },
    ],
  },
  {
    kind: "menu",
    label: "Content",
    items: [
      { href: "/calendar", label: "Content calendar", hint: "Plan, schedule and track every post" },
      { href: "/present", label: "Present", hint: "Run the screens for a service" },
      { href: "/published", label: "Published posts", hint: "What went out and how it’s doing" },
      { href: "/upload-post", label: "Upload & post", hint: "A video or picture to Instagram" },
    ],
  },
  { kind: "link", href: "/chat", label: "Chat", badge: true },
  {
    kind: "menu",
    label: "Workspace",
    items: [
      { href: "/board", label: "Tasks", hint: "Sprints and the work given to you" },
      { href: "/analytics", label: "Analytics", hint: "Numbers across the platform" },
      { href: "/activity", label: "Activity", hint: "Who did what, live" },
      { href: "/review", label: "Review", hint: "Work sent for approval" },
    ],
  },
];

// Kept in the account menu rather than the main navigation. Admins only (see canOpen).
const CHURCH_PROFILE = { href: "/brand", label: "Church Profile", Icon: Palette };
const TEAM = { href: "/team", label: "Team", Icon: UsersRound };

const linkClass = (active: boolean) => `flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${active ? "text-orange-600 font-semibold" : "text-neutral-800 hover:text-orange-600"}`;
const on = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function NavBar() {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null); // a group's dropdown, or "user"
  const barRef = useRef<HTMLDivElement | null>(null);
  const { user, logout, kiosk } = useAuth();
  const { unread, mentioned } = useChat();
  const { calls, session } = useCall();
  // A call going on that you could join (and aren't already in): shown on every page, so it's never missed.
  const joinable = Object.values(calls).filter((c) => c.roomId !== session?.roomId);
  const { canPrompt, iosHelp, install } = useInstall();
  const isApp = useIsApp();
  const [drawer, setDrawer] = useState(false);

  // Close any dropdown on outside click or Escape.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawer]);

  // The design editor is a full-screen workspace with its own chrome.
  // The Present output is a clean projector screen - no chrome at all.
  if (pathname.startsWith("/design") || pathname.startsWith("/present/output") || pathname === "/login" || !user || kiosk) return null;

  const subtitle = user.isAdmin ? "Admin" : user.appRole?.name || "Team member";
  const entries = NAV.map((e) => (e.kind === "menu" ? { ...e, items: e.items.filter((i) => canOpen(user, i.path ?? i.href)) } : e)).filter((e) => e.kind === "link" ? canOpen(user, e.href) : e.items.length > 0);

  const doLogout = () => {
    if (pathname.startsWith("/present") && !window.confirm("Log out? If a service is running, the controller will stop working until you sign in again.")) return;
    void logout();
  };
  const badge = (cls = "") =>
    unread > 0 ? (
      <span className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-[#ffffff] ${mentioned ? "bg-orange-600" : "bg-[#404040]"} ${cls}`} aria-label={`${unread} unread chat messages`}>
        {mentioned ? "@" : ""}
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div ref={barRef} className="mx-auto flex max-w-8xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-20">
        <button type="button" onClick={() => setDrawer(true)} aria-label="Open the menu" className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 xl:hidden">
          <Menu size={22} />
        </button>
        <Link href="/dashboard" className="flex min-w-0 shrink-0 items-center gap-2.5">
          {/* The app icon (the same one as the home-screen icon). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 shrink-0 rounded-lg" />
          <span className="truncate text-base font-semibold tracking-tight text-gray-600">FAFC Media Engine</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex">
          {entries.map((e) =>
            e.kind === "link" ? (
              <Link key={e.href} href={e.href} onClick={() => setOpenMenu(null)} className={linkClass(on(pathname, e.href))}>
                {e.label}
                {e.badge && badge("ml-0.5")}
              </Link>
            ) : (
              <div key={e.label} className="relative">
                <button onClick={() => setOpenMenu((m) => (m === e.label ? null : e.label))} aria-haspopup="menu" aria-expanded={openMenu === e.label} className={linkClass(e.items.some((i) => on(pathname, i.href)) || openMenu === e.label)}>
                  {e.label}
                  <ChevronDown size={14} className={`transition-transform ${openMenu === e.label ? "rotate-180" : ""}`} />
                </button>
                {openMenu === e.label && (
                  <div role="menu" className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 overflow-hidden rounded-xl border border-gray-50 bg-white p-1.5 shadow-xl">
                    {e.items.map((i) => (
                      <Link key={i.href} href={i.href} role="menuitem" onClick={() => setOpenMenu(null)} className={`block rounded-lg px-3 py-2.5 hover:bg-neutral-50 ${on(pathname, i.href) ? "bg-neutral-50" : ""}`}>
                        <span className={`block text-sm font-medium ${on(pathname, i.href) ? "text-orange-600" : "text-neutral-900"}`}>{i.label}</span>
                        <span className="block text-xs text-neutral-500">{i.hint}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </nav>

        <span className="flex-1 xl:hidden" />
        <ThemeToggle />
        {!isApp && (
          <Link href="/download" title="Download the app" aria-label="Download the app" className={`hidden h-10 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm font-semibold xl:inline-flex ${pathname.startsWith("/download") ? "bg-orange-50 text-orange-700" : "text-neutral-600 hover:bg-neutral-100 hover:text-orange-600"}`}>
            <Download size={18} />
            <span className="hidden 2xl:inline">Download app</span>
          </Link>
        )}
        {joinable[0] && (
          <Link
            href={`/chat?room=${joinable[0].roomId}&call=${joinable[0].id}`}
            title={`${joinable[0].title || `${joinable[0].host.name}’s call`} is live. Tap to join.`}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#16a34a] px-3.5 text-sm font-semibold text-[#ffffff] hover:bg-[#15803d]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffffff] opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ffffff]" />
            </span>
            <span className="hidden sm:inline">Join call{joinable.length > 1 ? ` (${joinable.length})` : ""}</span>
            <span className="sm:hidden">Join</span>
          </Link>
        )}
        <NotificationBell />

        {/* Phones and tablets: the avatar opens your profile (everything else is in the menu drawer). */}
        <Link href="/profile" aria-label="Your profile" className="xl:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-xs font-semibold text-white">{initials(user.name)}</span>
        </Link>
        {/* Desktop: the avatar opens the account menu. */}
        <div className="relative hidden shrink-0 xl:block">
          <button onClick={() => setOpenMenu((m) => (m === "user" ? null : "user"))} aria-haspopup="menu" aria-expanded={openMenu === "user"} aria-label="Account menu" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-neutral-100">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-xs font-semibold text-white">{initials(user.name)}</span>
            <span className="hidden text-left leading-tight 2xl:block">
              <span className="block text-sm font-semibold text-neutral-900">{user.name}</span>
              <span className="block text-xs text-neutral-500">{subtitle}</span>
            </span>
            <ChevronDown size={14} className={`text-neutral-500 transition-transform ${openMenu === "user" ? "rotate-180" : ""}`} />
          </button>
          {openMenu === "user" && (
            <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-50 bg-white p-1.5 shadow-xl">
              <div className="px-3 pb-2.5 pt-2">
                <p className="truncate text-sm font-semibold text-neutral-900">{user.name}</p>
                <p className="truncate text-xs text-neutral-500">{user.email}</p>
                <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>
              </div>
              <div className="border-t border-neutral-100 pt-1">
                <Link href="/profile" role="menuitem" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                  <UserRound size={16} className="text-neutral-500" /> Profile
                </Link>
                {canOpen(user, CHURCH_PROFILE.href) && (
                  <Link href={CHURCH_PROFILE.href} role="menuitem" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                    <CHURCH_PROFILE.Icon size={16} className="text-neutral-500" /> {CHURCH_PROFILE.label}
                  </Link>
                )}
                {canOpen(user, TEAM.href) && (
                  <Link href={TEAM.href} role="menuitem" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                    <TEAM.Icon size={16} className="text-neutral-500" /> {TEAM.label}
                  </Link>
                )}
                <Link href="/settings" role="menuitem" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                  <Settings size={16} className="text-neutral-500" /> Settings
                </Link>
              </div>
              <div className="mt-1 border-t border-neutral-100 pt-1">
                <button role="menuitem" onClick={doLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50">
                  <LogOut size={16} /> Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {drawer &&
        createPortal(
          <div className="fixed inset-0 z-[100] xl:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
            <nav className="absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-base font-semibold text-neutral-900">FAFC Media Engine</span>
                <button onClick={() => setDrawer(false)} aria-label="Close the menu" className="grid h-10 w-10 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100">
                  <X size={20} />
                </button>
              </div>
              <Link href="/profile" onClick={() => setDrawer(false)} className="mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-neutral-50 px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-xs font-semibold text-white">{initials(user.name)}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold text-neutral-900">{user.name}</span>
                  <span className="block truncate text-xs text-neutral-500">{subtitle}</span>
                </span>
              </Link>
              {canOpen(user, CHURCH_PROFILE.href) && (
                <Link href={CHURCH_PROFILE.href} onClick={() => setDrawer(false)} className="mx-3 mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50">
                  <CHURCH_PROFILE.Icon size={18} /> {CHURCH_PROFILE.label}
                </Link>
              )}
              {canOpen(user, TEAM.href) && (
                <Link href={TEAM.href} onClick={() => setDrawer(false)} className="mx-3 mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50">
                  <TEAM.Icon size={18} /> {TEAM.label}
                </Link>
              )}
              <div className="flex-1 space-y-0.5 px-3 py-2">
                {entries.map((e) =>
                  e.kind === "link" ? (
                    <Link key={e.href} href={e.href} onClick={() => setDrawer(false)} className={`flex items-center justify-between rounded-xl px-3 py-3 text-[15px] font-medium ${on(pathname, e.href) ? "bg-orange-50 text-orange-700" : "text-neutral-800 hover:bg-neutral-50"}`}>
                      {e.label}
                      {e.badge && badge()}
                    </Link>
                  ) : (
                    <div key={e.label} className="pt-2">
                      <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-400">{e.label}</p>
                      {e.items.map((i) => (
                        <Link key={i.href} href={i.href} onClick={() => setDrawer(false)} className={`block rounded-xl px-3 py-2.5 ${on(pathname, i.href) ? "bg-orange-50" : "hover:bg-neutral-50"}`}>
                          <span className={`block text-[15px] font-medium ${on(pathname, i.href) ? "text-orange-700" : "text-neutral-800"}`}>{i.label}</span>
                          <span className="block text-xs text-neutral-500">{i.hint}</span>
                        </Link>
                      ))}
                    </div>
                  ),
                )}
              </div>
              <div className="space-y-1 border-t border-neutral-100 px-3 py-3">
                <Link href="/settings" onClick={() => setDrawer(false)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50">
                  <Settings size={18} /> Settings
                </Link>
                {!isApp && (
                  <Link href="/download" onClick={() => setDrawer(false)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50">
                    <Download size={18} /> Download app
                  </Link>
                )}
                {(canPrompt || iosHelp) && (
                  <button
                    onClick={async () => {
                      if (canPrompt) await install();
                      else window.alert("To install: tap the Share button in Safari, then “Add to Home Screen”.");
                      setDrawer(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-800 hover:bg-neutral-50"
                  >
                    <Download size={18} /> Install the app
                  </button>
                )}
                <button onClick={doLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-red-600 hover:bg-red-50">
                  <LogOut size={18} /> Log out
                </button>
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </header>
  );
}
