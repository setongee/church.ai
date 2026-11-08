"use client";

import { Suspense, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlignCenter, AlignLeft, BellRing, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Columns2, MessageSquare, TriangleAlert, Eraser, Film, HandHeart, Megaphone, Moon, Music2, Palette, Pause, Play, Power, PowerOff, RefreshCw, Quote as QuoteIcon, LayoutTemplate, RotateCcw, Sparkles, SkipBack, SkipForward, Square, Volume2, VolumeX } from "lucide-react";
import { getBrand } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Spinner } from "@/components/editor/ui";
import { ScheduleLanding } from "@/components/present/ScheduleLanding";
import { getSocket } from "@/lib/socket";
import { useSchedules } from "@/lib/useSchedules";
import { endPresentSession, FRAME_PRESETS, getPresentSession, listBibles, listSceneTemplates, listWrappers, lookOfScene, wrapperPatch, type SceneTemplate, type Wrapper, playShow, presentClose, presentVideo, sessionColor, showCommand, switchPresentSession, usePresentState, type Background, type TriggerEvent, type BibleMeta, type PresentPatch, type PresentSession, type PresentState, type PresentStyle, type TemplateScene, type ScheduleItem, type ScriptureBatch, type ScheduleItemInput, type ScheduleSettings, type Slide } from "@/lib/present";
import { FontPicker } from "@/components/editor/FontPicker";
import { FrameEditor } from "@/components/present/FrameEditor";
import { Stage } from "@/components/present/Stage";
import { PresentLayoutMenu } from "@/components/present/PresentLayoutMenu";
import { ListenButton } from "@/components/present/ListenButton";
import { ListenSuggestions } from "@/components/present/ListenSuggestions";
import { WrapperManager, WrapperMenu } from "@/components/present/WrapperMenu";
import { setWrapperChatSkin } from "@/lib/chatSkins";
import { usePresentLayout } from "@/lib/presentLayouts";
import { forgetScripture } from "@/lib/scriptureSession";
import { ScheduleSwitcher } from "@/components/present/ScheduleSwitcher";
import { SchedulePanel } from "@/components/present/SchedulePanel";
import { ScripturePanel } from "@/components/present/ScripturePanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChat } from "@/components/chat/ChatProvider";
import { Modal } from "@/components/present/ui";
import { TriggerMapEditor } from "@/components/present/TriggerMap";
import { StudioMode } from "@/components/present/StudioMode";
import { OfflineBanner, OfflineChip } from "@/components/present/OfflineBar";
import { FontSizeControl } from "@/components/present/FontSizeControl";
import { BatchCard, BatchModal, batchIndex } from "@/components/present/BatchCard";
import { SplitPanel } from "@/components/present/SplitPanel";
import { SongsTab } from "@/components/present/SongsPanel";
import { AnnouncementsPanel } from "@/components/present/AnnouncementsPanel";
import { TemplatesPanel } from "@/components/present/TemplatesPanel";
import { MediaPanel } from "@/components/present/MediaPanel";
import { PrayersPanel } from "@/components/present/PrayersPanel";
import { QuotesLibraryPanel } from "@/components/present/QuotesLibraryPanel";
import { AlertsPanel, type AlertRequest } from "@/components/present/AlertsPanel";
import { BibleManager } from "@/components/present/BibleManager";

const TABS = [
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "scripture", label: "Scripture", icon: BookOpen },
  { id: "split", label: "Split", icon: Columns2 },
  { id: "songs", label: "Songs", icon: Music2 },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "prayers", label: "Prayers", icon: HandHeart },
  { id: "quotes", label: "Quotes & Excerpts", icon: QuoteIcon },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "media", label: "Media", icon: Film },
  { id: "backgrounds", label: "Backgrounds", icon: Palette },
  { id: "alerts", label: "Alerts", icon: BellRing },
  { id: "chat", label: "Chat", icon: MessageSquare },
] as const;
type TabId = (typeof TABS)[number]["id"];

const VERSION_KEY = "present-version";

// useSearchParams needs a Suspense boundary so the rest of the route can still be prerendered.
export default function PresentPage() {
  return (
    <Suspense fallback={null}>
      <PresentGate />
    </Suspense>
  );
}

// Present opens on the schedules page. The controller is only reachable while a service is running, which
// starts from a schedule and lasts until "End Service" (so a refresh mid-service comes straight back).
function PresentGate() {
  const [session, setSession] = useState<PresentSession | null | undefined>(undefined);
  useEffect(() => {
    getPresentSession()
      .then((r) => setSession(r.session))
      .catch(() => setSession(null));
  }, []);

  if (session === undefined) {
    return (
      <div className="flex h-[60vh] items-center justify-center gap-2 text-sm text-neutral-400">
        <Spinner /> Loading…
      </div>
    );
  }
  if (!session) return <ScheduleLanding onStarted={setSession} />;
  return <PresentController key={session._id} session={session} onEnded={() => setSession(null)} />;
}

function PresentController({ session, onEnded }: { session: PresentSession; onEnded: () => void }) {
  const { state, patch, connected, outputId, localOutputs } = usePresentState();
  // A presenter-only user runs the service in a locked full-screen window: no menus, and the only way out is
  // End Service. (Admins and people with other roles keep the normal layout.)
  const { user, setKiosk, offlineMode } = useAuth();
  const { layout, setLayout } = usePresentLayout(); // how this person likes the screen arranged (saved on their account)
  const { unread: chatUnread, mentioned: chatMentioned } = useChat();
  // This controller only exists while a service is running, so the lock holds for exactly that long: afterwards End Service
  // returns them to the dashboard, where the rest of their pages (Image Studio, calendar, tasks, chat) are one click away.
  const kiosk = Boolean(!offlineMode && user && !user.isAdmin && user.roles.length > 0 && user.roles.every((r) => r === "presenter"));
  const [fullscreen, setFullscreen] = useState(true);
  useEffect(() => {
    if (!kiosk) return;
    setKiosk(true);
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.documentElement.requestFullscreen?.().catch(() => {}); // usually needs a click; the overlay below asks
    return () => {
      setKiosk(false);
      document.removeEventListener("fullscreenchange", sync);
    };
  }, [kiosk, setKiosk]);
  // The open tab lives in the URL (?tab=songs) so a refresh or a shared link lands on the same tab.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: TabId = TABS.find((t) => t.id === (requested === "images" ? "media" : requested))?.id ?? "schedule";
  const setTab = useCallback(
    (id: TabId) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", id);
      // The browser's own history, which Next keeps useSearchParams in step with: no server round trip, so tabs switch with no connection too.
      window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
    },
    [pathname, params],
  );
  const [toast, setToast] = useState("");
  const [staged, setStaged] = useState<Slide | null>(null);
  const [bibles, setBibles] = useState<BibleMeta[]>([]);
  const [versionId, setVersionId] = useState("");
  const [managing, setManaging] = useState(false);
  const [framing, setFraming] = useState(false);
  // Ends the service: clears the output, closes the session and goes back to the schedules page.
  const endService = useCallback(
    async (ask: boolean) => {
      if (ask && !window.confirm("End the service? The screen will clear and you’ll go back to your schedules.")) return;
      getSocket().emit("present:end");
      await endPresentSession().catch(() => {});
      forgetScripture(); // the next service starts the Bible browser fresh, at Genesis 1:1
      setWrapperChatSkin(""); // and the wrapper's chat skin goes with the service
      if (kiosk) {
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        setKiosk(false);
        router.replace("/");
      } else router.replace(pathname);
      onEnded();
    },
    [onEnded, router, pathname, kiosk, setKiosk],
  );
  const schedules = useSchedules({
    startId: session.schedule,
    onActive: (id) => void switchPresentSession(id).catch(() => {}),
    onGone: () => void endService(false),
    current: () => ({ background: state.background, style: state.style, logoUrl: state.logoUrl, logoKind: state.logoKind, logoSlide: state.logoSlide, bgSlide: state.bgSlide }),
    apply: (look: ScheduleSettings) => {
      patch({ ...(look.background && { background: look.background }), ...(look.style && { style: look.style }), ...(look.logoUrl && { logoUrl: look.logoUrl, logoKind: look.logoKind ?? "logo" }), logoSlide: look.logoSlide ?? null, bgSlide: look.bgSlide ?? null });
      // The schedule's service wrapper goes back on; a schedule without one clears the last schedule's.
      if (look.wrapperId) void reapplyWrapper(look.wrapperId);
      else {
        wrapperBefore.current = null;
        patch({ sectionStyles: null });
        setWrapperChatSkin("");
      }
    },
  });
  const [brandLogo, setBrandLogo] = useState("");
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Installed Bibles + the remembered version.
  useEffect(() => {
    listBibles()
      .then((r) => {
        setBibles(r.installed);
        let saved = "";
        try {
          saved = localStorage.getItem(VERSION_KEY) || "";
        } catch {}
        setVersionId(r.installed.find((b) => b.id === saved)?.id || r.installed.find((b) => b.id === "kjv")?.id || r.installed[0]?.id || "");
      })
      .catch(() => {});
  }, []);
  const chooseVersion = useCallback((id: string) => {
    setVersionId(id);
    try {
      localStorage.setItem(VERSION_KEY, id);
    } catch {}
  }, []);

  // The church logo for the Logo screen, once, and only if the output has none yet.
  useEffect(() => {
    getBrand()
      .then((b) => {
        const url = b.logoLightUrl || b.logoUrl;
        if (url) setBrandLogo(url);
        if (url && !state.logoUrl) patch({ logoUrl: url, logoKind: "logo" });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload guard: a refresh mid-service wipes what's staged and anything half-typed, so it has to be confirmed.
  // F5 / Ctrl-R / Cmd-R open our own warning (louder when the output is live). The browser's own refresh button
  // and closing the tab can't be given a custom dialog, so those get the browser's standard "Leave site?" prompt.
  const isLive = state.mode === "live" && Boolean(state.slide);
  const [confirmReload, setConfirmReload] = useState(false);
  const reloading = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === "F5" || ((e.metaKey || e.ctrlKey) && k === "r")) {
        e.preventDefault();
        setConfirmReload(true);
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (reloading.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
  useEffect(() => {
    if (!confirmReload) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setConfirmReload(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [confirmReload]);

  // Verses picked together in the Scripture tab: stepped through with the Batch card.
  const [batch, setBatch] = useState<ScriptureBatch | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const stage = useCallback((s: Slide) => setStaged(s), []);
  // A prayer carries its template's look (placement, size, backdrop): it is put on the screen with the prayer, and
  // taken off again when something else without a look goes live. Held in refs so going live never goes stale.
  const sceneFns = useRef<{ apply: (s: TemplateScene) => void; clear: () => void; on: () => boolean }>({ apply: () => {}, clear: () => {}, on: () => false });
  const sceneByPrayer = useRef(false);
  const goLiveRaw = useCallback(
    (s?: Slide | null) => {
      const slide = s ?? staged;
      if (!slide) return;
      setStaged(slide);
      if (slide.kind === "text" && slide.scene) {
        sceneFns.current.apply(slide.scene);
        sceneByPrayer.current = true;
      } else if (sceneByPrayer.current) {
        sceneByPrayer.current = false;
        if (sceneFns.current.on()) sceneFns.current.clear();
      }
      patch({ mode: "live", slide });
    },
    [staged, patch],
  );
  // Trigger map: items (or whole sessions) linked to a template, a background change, another item or a screen action. Whatever
  // goes live from the schedule - by double-click, Enter or Go live - fires its "goes live" links; clicking an item fires
  // its "clicked" links. Both run from the latest render (so a delayed trigger never acts on stale state).
  const fireRef = useRef<(itemId: string, event: TriggerEvent) => void>(() => {});
  const runRef = useRef<(targetId: string) => void>(() => {});
  const goLive = useCallback(
    (s?: Slide | null) => {
      goLiveRaw(s);
      const slide = s ?? staged;
      const it = slide ? schedules.active?.items.find((i) => i.slides.includes(slide)) : undefined;
      if (it) fireRef.current(it._id, "live");
    },
    [goLiveRaw, staged, schedules.active],
  );
  // Move through the batch (lowest verse -> highest); every move goes straight to the live screen.
  const stepBatch = useCallback(
    (dir: 1 | -1) => {
      if (!batch) return;
      const at = batchIndex(batch, state);
      const next = at < 0 ? 0 : Math.min(batch.slides.length - 1, Math.max(0, at + dir));
      goLive(batch.slides[next]);
    },
    [batch, state, goLive],
  );
  const setMode = (mode: PresentState["mode"]) => patch({ mode: state.mode === mode ? (state.slide ? "live" : "clear") : mode });

  function showAlert(req: AlertRequest) {
    if (alertTimer.current) clearTimeout(alertTimer.current);
    // `startedAt` lets every screen work out which message of a slide show is up, in step with the others.
    patch({ alert: { id: String(Date.now()), text: req.texts[0], texts: req.texts, seconds: req.interval, startedAt: Date.now(), style: req.style } });
    if (req.seconds > 0) alertTimer.current = setTimeout(() => patch({ alert: null }), req.seconds * 1000);
  }
  // Restyle the alert that's on screen (same message, same place in the slide show).
  const restyleAlert = (style: AlertRequest["style"]) => state.alert && patch({ alert: { ...state.alert, style } });
  const hideAlert = () => {
    if (alertTimer.current) clearTimeout(alertTimer.current);
    patch({ alert: null });
  };

  // Operator shortcuts (ignored while typing): Enter = go live, B black, L logo, C clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (managing || t.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (batch && !t.closest("[data-own-arrows]") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        stepBatch(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "Enter" && e.shiftKey) {
        // Shift+Enter belongs to the Scripture tab (save to the scripture box).
      } else if (e.key === "Enter") {
        e.preventDefault();
        goLive();
      } else if (k === "b") setMode("black");
      else if (k === "l") setMode("logo");
      else if (k === "c" || e.key === "Escape") setMode("clear");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Opens the output on the extended display when there is one (Chrome/Edge ask for the
  // "window management" permission once); otherwise a normal popup you can drag across.
  async function openOutput() {
    type ScreenInfo = { isPrimary: boolean; availLeft: number; availTop: number; availWidth: number; availHeight: number };
    let features = "popup,width=1280,height=720";
    let target: unknown;
    try {
      const details = await (window as unknown as { getScreenDetails?: () => Promise<{ screens: ScreenInfo[] }> }).getScreenDetails?.();
      const ext = details?.screens.find((sc) => !sc.isPrimary);
      target = ext;
      if (ext) features = `popup,left=${ext.availLeft},top=${ext.availTop},width=${ext.availWidth},height=${ext.availHeight}`;
    } catch {
      // permission denied or unsupported - fall back to the default popup
    }
    if (!outputId) return; // still connecting to this device's presenter
    const w = window.open(`/present/output?o=${outputId}`, "present-output", features);
    w?.focus();
    if (!w) return;
    // Go full screen on that display as soon as the page is up. Browsers only allow this with a
    // recent click, so it can be refused - the output then goes full screen on its first click.
    const started = Date.now();
    const timer = setInterval(() => {
      if (w.closed || Date.now() - started > 8000) return clearInterval(timer);
      const el = w.document?.documentElement;
      if (w.document?.readyState !== "complete" || !el) return;
      clearInterval(timer);
      el.requestFullscreen(target ? ({ screen: target } as FullscreenOptions) : undefined).catch(() => {});
    }, 150);
  }

  // Background / font / size / alignment belong to the active schedule, so changing them also saves them there.
  function changeLook(p: Pick<PresentPatch, "background" | "style">) {
    // Picking an ordinary background replaces a template background.
    const bgSlide = p.background ? null : state.bgSlide;
    patch({ ...p, bgSlide });
    schedules.saveSettings({ background: p.background ?? state.background, style: { ...state.style, ...p.style }, logoUrl: state.logoUrl, logoKind: state.logoKind, logoSlide: state.logoSlide, bgSlide });
  }

  // Use a picture, GIF or video from Media as the Logo screen (or go back to the church logo).
  function setLogoScreen(url: string, kind: PresentState["logoKind"]) {
    if (!url) return;
    patch({ logoUrl: url, logoKind: kind, logoSlide: null });
    schedules.saveSettings({ background: state.background, style: state.style, logoUrl: url, logoKind: kind, logoSlide: null, bgSlide: state.bgSlide });
    setToast(kind === "logo" ? "Logo screen is back to the church logo" : "Logo screen set — press L to show it");
    setTimeout(() => setToast(""), 2400);
  }
  // Use an animated template as the Logo screen (press L) or as the background behind every slide.
  function setTemplateLogo(slide: Slide) {
    patch({ logoSlide: slide });
    schedules.saveSettings({ background: state.background, style: state.style, logoUrl: state.logoUrl, logoKind: state.logoKind, logoSlide: slide, bgSlide: state.bgSlide });
    setToast("Logo screen set — press L to show it");
    setTimeout(() => setToast(""), 2400);
  }
  function setTemplateBackground(slide: Slide | null) {
    patch({ bgSlide: slide });
    schedules.saveSettings({ background: state.background, style: state.style, logoUrl: state.logoUrl, logoKind: state.logoKind, logoSlide: state.logoSlide, bgSlide: slide });
  }
  const onBackground = (background: Background) => changeLook({ background });

  // Puts a scene on the screen: the template (an animated one, or a custom one's own background) becomes the
  // backdrop and the text style fits around it, so the scripture and songs on top sit in the scene's frame. What
  // the screen looked like before is remembered, so Clear can bring it back.
  const sceneBefore = useRef<{ background: Background; style: PresentStyle; sectionStyles: PresentState["sectionStyles"] } | null>(null);
  const [sceneOn, setSceneOn] = useState(false);
  // A template can give scripture, songs and prayers a look each (scene.sections). A prayer's own template only
  // changes the prayer look, leaving a wrapper's scripture and song looks alone.
  function applyScene(scene: TemplateScene, slide?: Slide | null, prayerOnly = false) {
    if (!sceneBefore.current) sceneBefore.current = { background: state.background, style: state.style, sectionStyles: state.sectionStyles ?? null };
    setSceneOn(true);
    const sectionStyles = prayerOnly ? { ...(state.sectionStyles ?? {}), prayer: lookOfScene(scene) } : (scene.sections ?? null);
    patch({ mode: "live", bgSlide: slide ?? null, ...(scene.background ? { background: scene.background } : {}), style: scene.style, sectionStyles });
  }
  useEffect(() => {
    sceneFns.current = { apply: (sc) => applyScene(sc, null, true), clear: clearScene, on: () => Boolean(sceneBefore.current) };
  });
  function triggerTemplate(it: ScheduleItem) {
    if (it.scene) {
      applyScene(it.scene, it.slides[0]);
      setToast(`Scene on: ${it.title}`);
      setTimeout(() => setToast(""), 2000);
    } else if (it.slides[0]) goLive(it.slides[0]);
  }
  const triggerTemplateFromSchedule = (it: ScheduleItem) => {
    triggerTemplate(it);
    fireRef.current(it._id, "live");
  };
  const playShowFromSchedule = (it: ScheduleItem) => {
    playShow(it.slides, { seconds: it.show?.seconds ?? 8, loop: it.show?.loop ?? false, name: it.title });
    fireRef.current(it._id, "live");
  };
  useEffect(() => {
    fireRef.current = (itemId, event) => {
      const sch = schedules.active;
      const item = sch?.items.find((i) => i._id === itemId);
      if (!sch?.triggerMap || !item) return;
      for (const l of sch.triggerMap.links) {
        if (l.on !== event || (l.from !== itemId && l.from !== item.session)) continue;
        if (l.delay > 0) setTimeout(() => runRef.current(l.to), l.delay * 1000);
        else runRef.current(l.to);
      }
    };
    runRef.current = (id) => {
      const sch = schedules.active;
      const target = sch?.items.find((i) => i._id === id);
      if (target) {
        if (target.type === "template") triggerTemplate(target);
        else if (target.type === "slideshow") playShow(target.slides, { seconds: target.show?.seconds ?? 8, loop: target.show?.loop ?? false, name: target.title });
        else if (target.slides[0]) goLiveRaw(target.slides[0]);
        return;
      }
      const node = sch?.triggerMap?.nodes.find((n) => n.id === id);
      if (node?.kind === "background") changeLook({ background: node.background });
      else if (node?.kind === "screen") patch({ mode: node.mode });
    };
  });
  const [mapOpen, setMapOpen] = useState(false);
  const [studio, setStudio] = useState<{ scope: string } | null>(null);
  const triggerCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of schedules.active?.triggerMap?.links ?? []) c[l.from] = (c[l.from] ?? 0) + 1;
    return c;
  }, [schedules.active?.triggerMap]);

  // Takes a template scene off again: the screen goes back to how it was (background, text layout).
  function clearScene() {
    const before = sceneBefore.current;
    sceneBefore.current = null;
    setSceneOn(false);
    patch({ bgSlide: null, sectionStyles: before?.sectionStyles ?? null, ...(before ? { background: before.background, style: { frame: before.style.frame, frameBg: before.style.frameBg, align: before.style.align, scale: before.style.scale } } : { style: { frame: null, frameBg: null } }) });
  }

  // ---- service wrappers ----------------------------------------------------------------------------------
  // A wrapper sets the screen's whole look in one go (themes per section, announcement and quote looks, font, backdrop),
  // the chat skin and the presenter layout, and stays with the schedule so reopening it puts it back.
  const [wrappers, setWrappers] = useState<Wrapper[]>([]);
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [wrapperUi, setWrapperUi] = useState(false);
  const wrapperBefore = useRef<{ background: Background; style: PresentStyle } | null>(null);
  const loadWrapperData = useCallback(async () => {
    const [ws, general, prayer] = await Promise.all([listWrappers(), listSceneTemplates("general"), listSceneTemplates("prayer")]);
    setWrappers(ws);
    setTemplates([...general, ...prayer]);
    return { ws, all: [...general, ...prayer] };
  }, []);
  useEffect(() => {
    Promise.all([listWrappers(), listSceneTemplates("general"), listSceneTemplates("prayer")])
      .then(([ws, general, prayer]) => {
        setWrappers(ws);
        setTemplates([...general, ...prayer]);
      })
      .catch(() => {});
  }, []);
  async function reapplyWrapper(id: string) {
    try {
      const { ws, all } = await loadWrapperData();
      const w = ws.find((x) => x._id === id);
      if (!w) return;
      const p = wrapperPatch(w, all);
      patch({ ...(p.background ? { background: p.background } : {}), style: p.style, sectionStyles: p.sectionStyles });
      setWrapperChatSkin(w.chatSkin);
      if (w.layout) setLayout(w.layout);
    } catch {
      // the schedule opens as it was saved
    }
  }
  const activeWrapperId = schedules.active?.settings?.wrapperId ?? "";
  function applyWrapper(w: Wrapper | null) {
    const base = { logoUrl: state.logoUrl, logoKind: state.logoKind, logoSlide: state.logoSlide, bgSlide: state.bgSlide };
    const saved = schedules.active?.settings?.wrapperBefore;
    if (!w) {
      // No wrapper: the screen goes back to how it was before one was chosen (remembered with the schedule, so a reload doesn't lose it).
      const before = wrapperBefore.current ?? (saved?.style ? { background: saved.background ?? state.background, style: saved.style } : null);
      wrapperBefore.current = null;
      const style = before ? { ...before.style, announcementTemplate: before.style.announcementTemplate ?? "" } : { announcementTemplate: "" as const };
      patch({ sectionStyles: null, ...(before ? { background: before.background } : {}), style });
      setWrapperChatSkin("");
      schedules.saveSettings({ background: before?.background ?? state.background, style: { ...state.style, ...style }, ...base, wrapperId: undefined, wrapperBefore: undefined });
      return;
    }
    // Moving from one wrapper to another keeps the original look as the one to go back to.
    if (!wrapperBefore.current) wrapperBefore.current = activeWrapperId && saved?.style ? { background: saved.background ?? state.background, style: saved.style } : { background: state.background, style: state.style };
    const p = wrapperPatch(w, templates);
    patch({ ...(p.background ? { background: p.background } : {}), style: p.style, sectionStyles: p.sectionStyles });
    setWrapperChatSkin(w.chatSkin);
    if (w.layout) setLayout(w.layout);
    schedules.saveSettings({ background: p.background ?? state.background, style: { ...state.style, ...p.style }, ...base, wrapperId: w._id, wrapperBefore: wrapperBefore.current });
  }

  // With sessions in the schedule, ask which one the item goes in (or none); without any, just add it.
  const [pendingAdd, setPendingAdd] = useState<ScheduleItemInput | null>(null);
  function addToSchedule(item: ScheduleItemInput) {
    if (schedules.active?.sessions?.length) setPendingAdd(item);
    else finishAdd(item, "");
  }
  function finishAdd(item: ScheduleItemInput, sessionId: string) {
    if (!schedules.addItem(item, sessionId)) return;
    const into = schedules.active?.sessions?.find((x) => x._id === sessionId);
    setToast(`Added “${item.title}” to ${into ? `${into.name} · ` : ""}${schedules.active?.name}`);
    setTimeout(() => setToast(""), 2200);
  }
  // A staged prayer previews with its template's look, so what you see is what goes live.
  const stagedScene = staged?.kind === "text" ? staged.scene : undefined;
  const previewState: PresentState = { ...state, mode: "live", slide: staged, alert: null, ...(stagedScene ? { background: stagedScene.background ?? state.background, bgSlide: null, style: { ...state.style, ...stagedScene.style }, sectionStyles: { ...(state.sectionStyles ?? {}), prayer: lookOfScene(stagedScene) } } : {}) };
  // "Connected" means an output screen is actually open and listening (and we can reach the server).
  const online = (connected && (state.outputs ?? 0) > 0) || localOutputs > 0;
  const liveLabel = state.mode === "live" && state.slide ? "On screen" : state.mode === "black" ? "Black screen" : state.mode === "logo" ? "Logo screen" : "Cleared";

  return (
    <main className={`mx-auto flex w-full max-w-none flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-[30px] sm:py-4 ${kiosk ? "h-dvh bg-neutral-50" : "min-h-[calc(100dvh-4.5rem)] lg:h-[calc(100dvh-73px)]"}`}>
      {/* Heard a scripture? Floating cards ask to put it on screen. Mounted here so listening survives tab changes. */}
      <ListenSuggestions bibles={bibles} versionId={versionId} onStage={stage} onLive={goLive} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScheduleSwitcher
            list={schedules.list}
            active={schedules.active}
            onSwitch={schedules.switchTo}
            onCreate={(name) => schedules.create(name)}
            onRename={schedules.rename}
            onDuplicate={schedules.duplicate}
            onDelete={schedules.removeActive}
          />
          <WrapperMenu wrappers={wrappers} activeId={activeWrapperId} onPick={applyWrapper} onManage={() => setWrapperUi(true)} />
          <span title={online ? "An output screen is open and receiving" : "No output screen is open"} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${online ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
            <span className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-neutral-400"}`} />
            {online ? (connected ? "Connected" : "Connected · local") : "Offline"}
          </span>
          <OfflineChip />
        </div>
        <div className="flex items-center gap-2">
          <ListenButton />
          <PresentLayoutMenu />
          {/* The presenter's locked full-screen view has no nav bar, so the light/dark switch lives here. */}
          {kiosk && (
            <>
              <ThemeToggle />
              {/* No browser chrome in the locked full-screen view, so refresh lives here (it asks first, like F5). */}
              <button onClick={() => setConfirmReload(true)} aria-label="Refresh" title="Refresh the controller" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100 hover:text-orange-600">
                <RefreshCw size={17} />
              </button>
            </>
          )}
          {online ? (
            <button
              onClick={() => presentClose()}
              title="Close the output window on the other screen"
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <PowerOff size={16} /> Go Offline
            </button>
          ) : (
            <button
              onClick={openOutput}
              title="Open the output on the projector / stream screen"
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-green-700"
            >
              <Power size={16} /> Go Online
            </button>
          )}
          <button
            onClick={() => endService(true)}
            title="End the service — clears the screen and returns to your schedules"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-red-700"
          >
            <Square size={14} fill="currentColor" /> End Service
          </button>
        </div>
      </div>

      <OfflineBanner />

      {wrapperUi && <WrapperManager wrappers={wrappers} templates={templates} activeId={activeWrapperId} baseBackground={state.background} onClose={() => setWrapperUi(false)} onChanged={() => void loadWrapperData().catch(() => {})} onApply={applyWrapper} />}

      {schedules.error && (
        <button onClick={schedules.clearError} className="rounded-lg bg-red-50 px-3 py-2 text-left text-sm text-red-700">
          {schedules.error} <span className="text-red-400">(dismiss)</span>
        </button>
      )}

      <div className={`grid min-h-0 flex-1 gap-4 overflow-y-auto grid-cols-1 lg:overflow-visible ${layout === "stage" ? "lg:grid-cols-1 lg:grid-rows-[auto_minmax(0,1fr)]" : layout === "mirror" ? "lg:grid-cols-[26rem_1fr]" : "lg:grid-cols-[1fr_26rem]"}`}>
        {/* Library */}
        <section className={`flex min-h-[78vh] flex-col overflow-hidden rounded-2xl bg-white lg:min-h-0 ${layout === "classic" ? "" : "lg:order-2"}`}>
          <div className="flex gap-1 overflow-x-auto border-b border-neutral-100 px-3 py-2.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${tab === t.id ? "bg-orange-50 text-orange-700" : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"}`}
              >
                <t.icon size={16} />
                {t.label}
                {t.id === "schedule" && !!schedules.active?.items.length && <span className="rounded-full bg-neutral-100 px-1.5 text-[11px] font-semibold text-neutral-500">{schedules.active.items.length}</span>}
                {t.id === "alerts" && state.alert && <span className="h-2 w-2 rounded-full bg-orange-500" />}
                {t.id === "chat" && chatUnread > 0 && tab !== "chat" && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-[#ffffff] ${chatMentioned ? "bg-orange-600" : "bg-[#404040]"}`}>{chatMentioned ? "@" : ""}{chatUnread}</span>}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 bg-neutral-50/40 p-3 sm:p-4">
            {tab === "schedule" && <SchedulePanel schedule={schedules.active} onStage={stage} onLive={goLive} onTrigger={triggerTemplateFromSchedule} onMove={schedules.moveItem} onRemove={schedules.removeItem} onAddSession={schedules.addSession} onUpdateSession={schedules.updateSession} onMoveSession={schedules.moveSession} onRemoveSession={schedules.removeSession} onAssign={schedules.assignItem} onPick={(it) => fireRef.current(it._id, "stage")} triggerCounts={triggerCounts} onOpenMap={() => setMapOpen(true)} onStudio={(scope) => setStudio({ scope })} onPlayShow={playShowFromSchedule} />}
            {tab === "scripture" && <ScripturePanel bibles={bibles} versionId={versionId} setVersionId={chooseVersion} onManage={user?.isAdmin || offlineMode ? () => setManaging(true) : undefined} onStage={stage} onLive={goLive} onAdd={addToSchedule} onBatch={setBatch} pointsSplitOn={Boolean(state.split?.on)} onPointsSplitOff={() => state.split && patch({ split: { ...state.split, on: false } })} liveReference={state.mode === "live" ? (state.slide?.kind === "scripture" ? state.slide.reference : state.slide?.kind === "scripture2" ? state.slide.left.reference : undefined) : undefined} />}
            {tab === "split" && <SplitPanel deck={state.split} patch={patch} liveSlide={state.mode === "live" ? state.slide : null} />}
            {tab === "songs" && <SongsTab onStage={stage} onLive={goLive} onAdd={addToSchedule} liveSlide={state.mode === "live" ? state.slide : null} />}
            {tab === "announcements" && <AnnouncementsPanel onStage={stage} onLive={goLive} onAdd={addToSchedule} defaultTemplate={state.style.announcementTemplate || undefined} />}
            {tab === "prayers" && <PrayersPanel onStage={stage} onLive={goLive} onAdd={addToSchedule} look={{ background: state.background, style: state.style }} onScene={(sc) => applyScene(sc)} />}
            {tab === "quotes" && <QuotesLibraryPanel onStage={stage} onLive={goLive} onAdd={addToSchedule} style={state.style} background={state.background} onStyle={(p) => changeLook({ style: p })} />}
            {(tab === "backgrounds" || tab === "media") && <MediaPanel key={tab} mode={tab} background={state.background} onBackground={onBackground} onStage={stage} onLive={goLive} onAdd={addToSchedule} style={state.style} onStyle={(p) => changeLook({ style: p })} logoUrl={state.logoUrl} logoKind={state.logoKind} brandLogo={brandLogo} onLogo={setLogoScreen} />}
            {tab === "templates" && <TemplatesPanel look={{ background: state.background, style: state.style }} onScene={(sc) => applyScene(sc)} onStage={stage} onLive={goLive} onAdd={addToSchedule} onLogo={setTemplateLogo} onBackground={setTemplateBackground} hasBackground={Boolean(state.bgSlide)} hasLogo={Boolean(state.logoSlide)} onClearLogo={() => { patch({ logoSlide: null }); schedules.saveSettings({ background: state.background, style: state.style, logoUrl: state.logoUrl, logoKind: state.logoKind, logoSlide: null, bgSlide: state.bgSlide }); }} />}
            {tab === "chat" && <ChatPanel key={params.get("room") ?? "none"} initialRoomId={params.get("room")} />}
            {tab === "alerts" && <AlertsPanel state={state} active={state.alert} onShow={showAlert} onHide={hideAlert} onStyle={restyleAlert} />}
          </div>
        </section>

        {/* Monitors + master controls */}
        <aside className={`flex min-h-0 flex-col gap-4 ${layout === "stage" ? "lg:order-1 lg:flex-row lg:items-start lg:overflow-visible lg:[&>*:first-child]:w-[22rem] lg:[&>*:first-child]:shrink-0 lg:[&>*:not(:first-child)]:min-w-0 lg:[&>*:not(:first-child)]:flex-1" : layout === "mirror" ? "lg:order-1 lg:overflow-y-auto" : "lg:overflow-y-auto"}`}>
        <div className="space-y-3 rounded-2xl bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-500">Font</span>
              <div className="flex min-w-0 items-center gap-1.5">
                <FontPicker value={state.style.font || "Default"} onChange={(font) => changeLook({ style: { font } })} className="w-32" />
                <div className="flex rounded-lg bg-neutral-100 p-0.5" role="group" aria-label="Font weight">
                  {(
                    [
                      [400, "Regular"],
                      [500, "Medium"],
                      [700, "Bold"],
                    ] as const
                  ).map(([w, label]) => (
                    <button
                      key={w}
                      onClick={() => changeLook({ style: { weight: w } })}
                      className={`rounded-md px-2 py-1 text-xs transition ${state.style.weight === w ? "bg-white font-semibold text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {(state.style.font || state.style.weight !== 500) && (
                  <button onClick={() => changeLook({ style: { font: "", weight: 500 } })} aria-label="Reset font" title="Reset font" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-orange-600">
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
              <span className="text-xs font-semibold text-neutral-500">Frame</span>
              <button onClick={() => setFraming(true)} title="Place the text — a lower third, a side panel…" className="flex h-8 min-w-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-800 hover:border-orange-300 hover:text-orange-700">
                <LayoutTemplate size={14} className="shrink-0" />
                <span className="truncate">{state.style.frame ? (FRAME_PRESETS.find((p) => p.frame && p.frame.x === state.style.frame!.x && p.frame.y === state.style.frame!.y && p.frame.w === state.style.frame!.w && p.frame.h === state.style.frame!.h)?.label ?? `Custom ${state.style.frame.w}×${state.style.frame.h}`) : "Full screen"}</span>
                <span className="shrink-0 text-xs font-semibold text-orange-600">Edit</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
              <span className="text-xs font-semibold text-neutral-500">Text</span>
              <div className="flex items-center gap-1">
                <IconBtn label="Align left" on={state.style.align === "left"} onClick={() => changeLook({ style: { align: "left" } })}>
                  <AlignLeft size={15} />
                </IconBtn>
                <IconBtn label="Center" on={state.style.align === "center"} onClick={() => changeLook({ style: { align: "center" } })}>
                  <AlignCenter size={15} />
                </IconBtn>
                <span className="mx-1 h-5 w-px bg-neutral-200" />
                <FontSizeControl scale={state.style.scale} onChange={(scale) => changeLook({ style: { scale } })} iconBtn="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-orange-600 disabled:opacity-40" />
              </div>
            </div>
        </div>

          <div className="rounded-2xl bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Preview</span>
              <span className="truncate pl-3 text-xs text-neutral-400">{staged ? describe(staged) : "Nothing staged"}</span>
            </div>
            <Stage state={previewState} monitor="preview" className="rounded-xl" />
            <button
              onClick={() => goLive()}
              disabled={!staged}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-sm font-semibold text-[#ffffff] transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={16} fill="currentColor" /> Go live
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">Enter</kbd>
            </button>
          </div>

          {batch && <BatchCard batch={batch} state={state} onStep={stepBatch} onOpen={() => setBatchOpen(true)} />}

          <div className="rounded-2xl bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-400">
                <span className={`h-2 w-2 rounded-full ${state.mode === "live" && state.slide ? "animate-pulse bg-red-500" : "bg-neutral-300"}`} />
                Live
              </span>
              <span className="text-xs text-neutral-400">{liveLabel}</span>
            </div>
            <Stage state={state} monitor="live" className={`rounded-xl ${state.mode === "live" && state.slide ? "ring-2 ring-red-500/70" : ""}`} />

            {state.show && (
              <div className="mt-3 rounded-xl bg-neutral-50 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <span className="min-w-0 truncate text-xs font-semibold text-neutral-600">Slide show · {state.show.name || "Untitled"}</span>
                  <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                    {state.show.index + 1} / {state.show.total}
                    {state.show.loop ? " · loops" : ""}
                  </span>
                </div>
                <div className="mb-2 h-1 overflow-hidden rounded-full bg-neutral-200">
                  {/* restarts for every slide; frozen while paused */}
                  <div key={`${state.show.index}-${state.show.playing}`} className="h-full rounded-full bg-orange-500" style={{ width: state.show.playing ? undefined : "100%", animation: state.show.playing ? `present-progress ${state.show.seconds}s linear forwards` : undefined, opacity: state.show.playing ? 1 : 0.35 }} />
                </div>
                <div className="flex items-center gap-1.5">
                  <VideoBtn label="Previous slide" onClick={() => showCommand("prev")}>
                    <SkipBack size={14} />
                  </VideoBtn>
                  <VideoBtn label={state.show.playing ? "Pause" : "Play"} onClick={() => showCommand(state.show!.playing ? "pause" : "resume")}>
                    {state.show.playing ? <Pause size={14} /> : <Play size={14} />}
                  </VideoBtn>
                  <VideoBtn label="Next slide" onClick={() => showCommand("next")}>
                    <SkipForward size={14} />
                  </VideoBtn>
                  <VideoBtn label="Stop the slide show" onClick={() => showCommand("stop")}>
                    <Square size={13} />
                  </VideoBtn>
                </div>
              </div>
            )}

            {state.split?.on && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-neutral-50 p-1.5">
                <span className="flex items-center gap-1.5 pl-2 pr-1 text-xs font-semibold text-neutral-500">
                  <Columns2 size={13} /> Points
                </span>
                <VideoBtn label="Previous points slide" onClick={() => patch({ split: { ...state.split!, index: Math.max(0, state.split!.index - 1) } })}>
                  <ChevronLeft size={14} />
                </VideoBtn>
                <span className="shrink-0 px-1 text-xs font-semibold tabular-nums text-neutral-600">
                  {state.split.index + 1} / {state.split.pages.length}
                </span>
                <VideoBtn label="Next points slide" onClick={() => patch({ split: { ...state.split!, index: Math.min(state.split!.pages.length - 1, state.split!.index + 1) } })}>
                  <ChevronRight size={14} />
                </VideoBtn>
                <VideoBtn label="Turn the split off" onClick={() => patch({ split: { ...state.split!, on: false } })}>
                  <Square size={13} />
                </VideoBtn>
              </div>
            )}

            {state.mode === "live" && state.slide?.kind === "video" && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-neutral-50 p-1.5">
                <span className="pl-2 pr-1 text-xs font-semibold text-neutral-500">Video</span>
                <VideoBtn label="Play / pause" onClick={() => presentVideo("toggle")}>
                  <Pause size={14} />
                </VideoBtn>
                <VideoBtn label="Restart" onClick={() => presentVideo("restart")}>
                  <RotateCcw size={14} />
                </VideoBtn>
                <VideoBtn label="Mute" onClick={() => presentVideo("mute")}>
                  <VolumeX size={14} />
                </VideoBtn>
                <VideoBtn label="Sound on" onClick={() => presentVideo("unmute")}>
                  <Volume2 size={14} />
                </VideoBtn>
              </div>
            )}

            {(sceneOn || state.bgSlide) && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs">
                <span className="font-semibold text-orange-700">Template scene is on</span>
                <button onClick={clearScene} className="font-semibold text-orange-700 underline hover:text-orange-900">Clear</button>
              </div>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              <ScreenBtn active={state.mode === "logo"} onClick={() => setMode("logo")} icon={<Sparkles size={16} />} label="Logo" k="L" />
              <ScreenBtn active={state.mode === "black"} onClick={() => setMode("black")} icon={<Moon size={16} />} label="Black" k="B" />
              <ScreenBtn active={state.mode === "clear"} onClick={() => setMode("clear")} icon={<Eraser size={16} />} label="Clear" k="C" />
            </div>

          </div>
        </aside>
      </div>

      {toast && (
        <div className="present-slide-up pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#171717] px-4 py-2.5 text-sm font-medium text-[#ffffff] shadow-xl">{toast}</div>
      )}

      {kiosk && !fullscreen && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center">
          <h2 className="text-2xl font-semibold text-white">Go full screen to run the service</h2>
          <p className="max-w-md text-sm text-neutral-400">The presenter view runs full screen. You leave it by pressing End Service.</p>
          <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
            Enter full screen
          </button>
        </div>
      )}

      {studio && schedules.active && (
        <StudioMode
          schedule={schedules.active}
          scope={studio.scope}
          liveSlide={state.mode === "live" ? state.slide : null}
          onLive={goLive}
          onPick={(it) => fireRef.current(it._id, "stage")}
          onTrigger={triggerTemplateFromSchedule}
          onPlayShow={playShowFromSchedule}
          onScreen={(mode) => patch({ mode })}
          onClose={() => setStudio(null)}
        />
      )}
      {mapOpen && schedules.active && <TriggerMapEditor schedule={schedules.active} onChange={schedules.saveTriggerMap} onClose={() => setMapOpen(false)} />}
      {pendingAdd && (
        <Modal title="Add to which session?" onClose={() => setPendingAdd(null)}>
          <p className="mb-3 truncate text-sm text-neutral-500">“{pendingAdd.title}”</p>
          <div className="space-y-2">
            {[{ _id: "", name: "No session", description: "" }, ...(schedules.active?.sessions ?? [])].map((x) => (
              <button
                key={x._id || "none"}
                autoFocus={!x._id}
                onClick={() => {
                  finishAdd(pendingAdd, x._id);
                  setPendingAdd(null);
                }}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition hover:border-orange-300 hover:bg-orange-50 ${x._id ? "border-neutral-200 text-neutral-900" : "border-dashed border-neutral-300 text-neutral-600"}`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {x._id && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: sessionColor(schedules.active?.sessions, x._id) }} />}
                  <span className="min-w-0">
                    <span className="block truncate">{x.name}</span>
                    {x.description && <span className="block truncate text-xs font-normal text-neutral-400">{x.description}</span>}
                  </span>
                </span>
                {x._id && <span className="shrink-0 text-xs font-medium text-neutral-400">{schedules.active?.items.filter((i) => i.session === x._id).length} items</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {confirmReload && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="reload-title" onClick={() => setConfirmReload(false)}>
          <div className="sheet-anim w-full max-w-md rounded-b-none rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${isLive ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-800"}`}>
                <TriangleAlert size={20} />
              </span>
              <div>
                <h2 id="reload-title" className="text-lg font-semibold text-neutral-900">
                  {isLive ? "You're live — refresh anyway?" : "Refresh this page?"}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                  {isLive ? (
                    <>
                      The output is <span className="font-semibold text-red-600">live right now</span>
                      {state.slide ? ` (${describe(state.slide)})` : ""}. The screen will keep showing it, but this controller will reload: whatever is staged and any points you haven&apos;t sent will be lost, and you&apos;ll be disconnected for a moment.
                    </>
                  ) : (
                    <>A service is running. Refreshing reloads the controller, so whatever is staged and any points you haven&apos;t sent will be lost.</>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button autoFocus onClick={() => setConfirmReload(false)} className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800">
                Stay here
              </button>
              <button
                onClick={() => {
                  reloading.current = true;
                  window.location.reload();
                }}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${isLive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"}`}
              >
                {isLive ? "Refresh while live" : "Refresh"}
              </button>
            </div>
          </div>
        </div>
      )}

      {batchOpen && batch && <BatchModal batch={batch} state={state} onPick={(i) => goLive(batch.slides[i])} onClose={() => setBatchOpen(false)} />}

      {framing && <FrameEditor state={state} onChange={(p) => changeLook({ style: p })} onClose={() => setFraming(false)} />}

      {managing && (
        <BibleManager
          onClose={() => setManaging(false)}
          onChanged={(installed, addedId) => {
            setBibles(installed);
            if (addedId) chooseVersion(addedId);
            else if (!installed.some((b) => b.id === versionId)) chooseVersion(installed[0]?.id || "");
          }}
        />
      )}
    </main>
  );
}

function describe(s: Slide) {
  if (s.kind === "scripture") return `${s.reference} · ${s.version}`;
  if (s.kind === "scripture2") return `${s.left.reference} ${s.left.version} | ${s.right.reference} ${s.right.version}`;
  if (s.kind === "song") return `${s.title}${s.label ? ` — ${s.label}` : ""}`;
  if (s.kind === "text") return s.title || "Text";
  if (s.kind === "quote") return `“${s.text.slice(0, 40)}${s.text.length > 40 ? "…" : ""}”`;
  if (s.kind === "video") return "Video";
  if (s.kind === "welcome") return `Welcome screen — ${s.main ?? ""}`;
  if (s.kind === "giving") return `Offering & Tithe — ${s.bankName || s.accountNo}`;
  if (s.kind === "ministering") return `Ministering — ${s.name}`;
  return "Image";
}

function VideoBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="flex flex-1 items-center justify-center rounded-lg py-2 text-neutral-600 transition hover:bg-white hover:text-orange-600 hover:shadow-sm">
      {children}
    </button>
  );
}

function ScreenBtn({ active, onClick, icon, label, k }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; k: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition ${active ? "border-orange-500 bg-orange-600 text-[#ffffff] shadow-sm" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}
    >
      {icon}
      <span>{label}</span>
      <kbd className={`rounded px-1 text-[9px] ${active ? "bg-white/20" : "bg-neutral-100 text-neutral-400"}`}>{k}</kbd>
    </button>
  );
}

function IconBtn({ children, label, on, onClick }: { children: React.ReactNode; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`rounded-lg p-2 transition ${on ? "bg-orange-50 text-orange-600" : "text-neutral-500 hover:bg-neutral-100"}`}>
      {children}
    </button>
  );
}
