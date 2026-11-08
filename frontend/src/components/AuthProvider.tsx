"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canOpen, clearToken, fetchMe, getToken, logoutRequest, type AuthUser } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import { clearCache } from "@/lib/cache";
import { disablePush } from "@/lib/push";
import { resetPresentLayout } from "@/lib/presentLayouts";
import { resetSkin } from "@/lib/skins";
import { setDraftUser } from "@/lib/draft";
import { OFFLINE_USER, rememberOfflineMode, setOfflineModeActive, wantsOfflineMode } from "@/lib/offlineMode";
import { DraftBar } from "./DraftBar";
import { StreamProvider } from "./StreamProvider";
import { ChatProvider } from "./chat/ChatProvider";
import { ToastProvider } from "./notify/ToastHost";
import { PushPrompt } from "./notify/PushPrompt";
import { NotificationProvider } from "./notify/NotificationProvider";

interface AuthCtx {
  user: AuthUser | null;
  // Kiosk: the Present controller of a presenter-only user takes over the whole window (no nav, no leaving).
  kiosk: boolean;
  setKiosk: (on: boolean) => void;
  setUser: (u: AuthUser | null) => void;
  logout: () => Promise<void>;
  // Offline mode: Present only, no sign-in, everything kept on this device. goOnline() leaves it and signs in the normal way.
  offlineMode: boolean;
  goOffline: () => void;
  goOnline: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, kiosk: false, setKiosk: () => {}, setUser: () => {}, logout: async () => {}, offlineMode: false, goOffline: () => {}, goOnline: () => {} });
export const useAuth = () => useContext(Ctx);

// The projector window has nobody signed in on it; it only watches the output.
const USER_KEY = "auth-user";
// Opening with offline mode chosen, or with no internet and nobody signed in: Present on its own, no sign-in.
const startsOffline = () => wantsOfflineMode() || (!navigator.onLine && !getToken());
const isPublic = (path: string) => path === "/login" || path.startsWith("/present/output");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signedIn, setUserState] = useState<AuthUser | null>(null);
  // Offline mode: Present only, as a local Presenter. Chosen on the login page (and remembered), or taken automatically when the
  // app opens with no internet and nobody signed in.
  const [offlineMode, setOfflineMode] = useState(false);
  const user = offlineMode ? OFFLINE_USER : signedIn;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage and the connection are only readable after mount
    if (startsOffline()) setOfflineMode(true);
  }, []);
  // A layout effect, so the flag is set before the pages underneath run their own effects (which read through it).
  useLayoutEffect(() => setOfflineModeActive(offlineMode), [offlineMode]);
  const goOffline = useCallback(() => {
    rememberOfflineMode(true);
    setOfflineMode(true);
    router.replace("/present");
  }, [router]);
  const goOnline = useCallback(() => {
    rememberOfflineMode(false);
    setOfflineMode(false);
    // Back to the normal app: signed in if this device still is, otherwise the login page.
    window.location.assign(getToken() ? "/dashboard" : "/login");
  }, []);
  // The signed-in person is remembered on this device, so a refresh can show the app (and its cached pages) at once
  // while the server re-confirms the session in the background.
  const setUser = useCallback((u: AuthUser | null | ((prev: AuthUser | null) => AuthUser | null)) => {
    setUserState((prev) => {
      const next = typeof u === "function" ? u(prev) : u;
      try {
        if (next) localStorage.setItem(USER_KEY, JSON.stringify(next));
        else localStorage.removeItem(USER_KEY);
      } catch {}
      return next;
    });
  }, []);
  const [checked, setChecked] = useState(false);
  // A non-admin's changes live on their device: start (or drop) their drafts as the person changes. The projector window
  // has nobody signed in, so it borrows the remembered person to show device-made pictures.
  // A layout effect: the device's own changes (drafts, a service started here) must be in place before the page underneath reads.
  useLayoutEffect(() => {
    if (user) {
      setDraftUser(user);
      return;
    }
    try {
      const saved = localStorage.getItem(USER_KEY);
      setDraftUser(saved && isPublic(window.location.pathname) ? (JSON.parse(saved) as AuthUser) : null);
    } catch {
      setDraftUser(null);
    }
  }, [user]);
  const [kiosk, setKiosk] = useState(false);
  const pub = isPublic(pathname);

  // Work out who is signed in (once per page load), or send them to the login page.
  useEffect(() => {
    if (pub || user || offlineMode || startsOffline()) return; // (offline mode is taken up by the effect above)
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
      return;
    }
    try {
      const saved = localStorage.getItem(USER_KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
        setUser(JSON.parse(saved) as AuthUser);
        setChecked(true);
        return; // the keep-alive effect below re-confirms it with the server straight away
      }
    } catch {}
    fetchMe()
      .then((r) => setUser(r.user))
      .catch(() => {}) // a 401 already redirected; anything else (server down) leaves the spinner
      .finally(() => setChecked(true));
  }, [pub, user, offlineMode, pathname, router, setUser]);

  // Roles can change while someone is signed in (they get rostered, or a service passes): re-read them on
  // each page change, and send people who open a page they aren't rostered for back to their dashboard.
  useEffect(() => {
    if (!user || pub) return;
    // Offline mode is Present only; and a device that opens with no internet lands on Present too.
    if (offlineMode) {
      if (!pathname.startsWith("/present")) router.replace("/present");
      return;
    }
    if (!canOpen(user, pathname)) router.replace("/");
  }, [user, pub, offlineMode, pathname, router]);
  useEffect(() => {
    if (!navigator.onLine && !pub && signedIn && !pathname.startsWith("/present")) router.replace("/present");
    // only when the app first opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(signedIn)]);

  // Keep-alive + sign-out detection: if this device was signed out elsewhere or by an admin, say so promptly.
  useEffect(() => {
    if (!user || offlineMode) return;
    const check = () => void fetchMe().then((r) => setUser((u) => (u && JSON.stringify(u) !== JSON.stringify(r.user) ? r.user : u))).catch(() => {});
    check(); // confirm the remembered session right away
    const t = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", check);
    };
  }, [user, offlineMode, setUser]);

  // The service started or ended, or a session did: what this person may open may have changed, so look again at once.
  useEffect(() => {
    if (!user || offlineMode) return;
    const socket = getSocket();
    const refresh = () => void fetchMe().then((r) => setUser((u) => (u && JSON.stringify(u) !== JSON.stringify(r.user) ? r.user : u))).catch(() => {});
    socket.on("service:changed", refresh);
    return () => void socket.off("service:changed", refresh);
  }, [user, offlineMode, setUser]);

  // Someone (this person, on another device) signed in: this device is signed out, and says why.
  useEffect(() => {
    if (!user || offlineMode) return;
    const socket = getSocket();
    const onReplaced = (m: { device?: string }) => {
      clearToken();
      clearCache();
      socket.disconnect();
      setUser(null);
      window.location.assign(`/login?reason=replaced&device=${encodeURIComponent(m?.device || "another device")}`);
    };
    socket.on("session:replaced", onReplaced);
    return () => void socket.off("session:replaced", onReplaced);
  }, [user, offlineMode, setUser]);

  const logout = useCallback(async () => {
    resetPresentLayout();
    resetSkin();
    await disablePush(); // before the token goes, so this device stops getting this person's alerts
    await logoutRequest().catch(() => {});
    clearToken();
    clearCache();
    getSocket().disconnect();
    setDraftUser(null);
    setUser(null);
    window.location.assign("/login");
  }, []);

  const ctx = { user, kiosk, setKiosk, setUser, logout, offlineMode, goOffline, goOnline };
  if (pub) return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
  // Offline mode is just Present: no chat, notifications or live-stream plumbing, which all need the server.
  if (offlineMode) return <Ctx.Provider value={ctx}>{pathname.startsWith("/present") ? children : null}</Ctx.Provider>;
  if (user && !canOpen(user, pathname)) return null; // redirecting
  if (!user) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-neutral-400">{checked ? "Can’t reach the server. Check that the backend is running, then refresh." : "Loading…"}</div>
    );
  }
  return (
    <Ctx.Provider value={ctx}>
      <ToastProvider>
        <PushPrompt />
        <NotificationProvider>
          <ChatProvider>
            <StreamProvider>{children}</StreamProvider>
          </ChatProvider>
          <DraftBar />
        </NotificationProvider>
      </ToastProvider>
    </Ctx.Provider>
  );
}
