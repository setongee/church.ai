"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canOpen, clearToken, fetchMe, getToken, logoutRequest, type AuthUser } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import { clearCache } from "@/lib/cache";
import { disablePush } from "@/lib/push";
import { resetPresentLayout } from "@/lib/presentLayouts";
import { resetSkin } from "@/lib/skins";
import { setDraftUser } from "@/lib/draft";
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
}

const Ctx = createContext<AuthCtx>({ user: null, kiosk: false, setKiosk: () => {}, setUser: () => {}, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

// The projector window has nobody signed in on it; it only watches the output.
const USER_KEY = "auth-user";
const isPublic = (path: string) => path === "/login" || path.startsWith("/present/output");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUserState] = useState<AuthUser | null>(null);
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
  useEffect(() => {
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
    if (pub || user) return;
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
  }, [pub, user, pathname, router, setUser]);

  // Roles can change while someone is signed in (they get rostered, or a service passes): re-read them on
  // each page change, and send people who open a page they aren't rostered for back to their dashboard.
  useEffect(() => {
    if (!user || pub) return;
    if (!canOpen(user, pathname)) router.replace("/");
  }, [user, pub, pathname, router]);

  // Keep-alive + sign-out detection: if this device was signed out elsewhere or by an admin, say so promptly.
  useEffect(() => {
    if (!user) return;
    const check = () => void fetchMe().then((r) => setUser((u) => (u && JSON.stringify(u) !== JSON.stringify(r.user) ? r.user : u))).catch(() => {});
    check(); // confirm the remembered session right away
    const t = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", check);
    };
  }, [user, setUser]);

  // The service started or ended, or a session did: what this person may open may have changed, so look again at once.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const refresh = () => void fetchMe().then((r) => setUser((u) => (u && JSON.stringify(u) !== JSON.stringify(r.user) ? r.user : u))).catch(() => {});
    socket.on("service:changed", refresh);
    return () => void socket.off("service:changed", refresh);
  }, [user, setUser]);

  // Someone (this person, on another device) signed in: this device is signed out, and says why.
  useEffect(() => {
    if (!user) return;
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
  }, [user, setUser]);

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

  if (pub) return <Ctx.Provider value={{ user, kiosk, setKiosk, setUser, logout }}>{children}</Ctx.Provider>;
  if (user && !canOpen(user, pathname)) return null; // redirecting
  if (!user) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-neutral-400">{checked ? "Can’t reach the server. Check that the backend is running, then refresh." : "Loading…"}</div>
    );
  }
  return (
    <Ctx.Provider value={{ user, kiosk, setKiosk, setUser, logout }}>
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
