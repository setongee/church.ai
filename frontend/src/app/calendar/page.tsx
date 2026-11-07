"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Columns3, LayoutGrid, List, Plus, Rows3, Search, Sparkles, Tag, Zap } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Modal, btnPrimary } from "@/components/present/ui";
import { AiPlanModal } from "@/components/calendar/AiPlanModal";
import { CampaignsModal } from "@/components/calendar/CampaignsModal";
import { ItemDrawer, type DrawerTarget } from "@/components/calendar/ItemDrawer";
import { ListView } from "@/components/calendar/ListView";
import { MonthView } from "@/components/calendar/MonthView";
import { PipelineView } from "@/components/calendar/PipelineView";
import { WeekView } from "@/components/calendar/WeekView";
import { Chip, dropProps } from "@/components/calendar/parts";
import { flashElement, queryParam } from "@/lib/deeplink";
import { listTeam } from "@/lib/team";
import { useCached } from "@/lib/queries";
import {
  PLATFORM_LABEL,
  STATUSES,
  addDays,
  campaignColor,
  dayKey,
  fmtDay,
  fmtWhen,
  getContent,
  listCampaigns,
  listContent,
  moveToDay,
  needsAttention,
  scheduleContent,
  startOfWeek,
  updateContent,
  type ContentItem,
  type ContentPlatform,
  type ContentStatus,
  type Person,
} from "@/lib/content";

type View = "month" | "week" | "pipeline" | "list";
const VIEWS: { id: View; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "month", label: "Month", Icon: LayoutGrid },
  { id: "week", label: "Week", Icon: Rows3 },
  { id: "pipeline", label: "Pipeline", Icon: Columns3 },
  { id: "list", label: "List", Icon: List },
];
const VIEW_KEY = "content-calendar-view";
const select = "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-orange-400";

export default function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const canWrite = isAdmin || (user?.roles ?? []).some((r) => r === "design" || r === "manager" || r === "social");

  const { data, set, loading, error, reload: reloadContent } = useCached<ContentItem[]>(["content"], listContent);
  const { data: teamData } = useCached<Person[]>(["content-team"], listTeam);
  const { data: campaignData, reload: reloadCampaigns } = useCached<string[]>(["content-campaigns"], listCampaigns);
  const all = useMemo(() => data ?? [], [data]);
  const team = teamData ?? [];

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [campaign, setCampaign] = useState("");
  const [drawer, setDrawer] = useState<(DrawerTarget & { key: string }) | null>(null);
  const [planning, setPlanning] = useState<false | { campaign: string; goal: string }>(false); // the "Plan with AI" wizard (optionally for a campaign)
  const [managing, setManaging] = useState(false); // the campaigns manager
  const [dayList, setDayList] = useState<Date | null>(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4200);
  }, []);

  // The last view you used comes back next time.
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      if (v === "month" || v === "week" || v === "pipeline" || v === "list") setView(v);
    } catch {}
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // ---- filtering -----------------------------------------------------------------------------------------------------
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((i) => (!platform || i.platform === platform) && (!status || i.status === status) && (!owner || i.owners.some((o) => o._id === owner)) && (!campaign || i.campaign === campaign) && (!needle || `${i.title} ${i.caption} ${i.campaign}`.toLowerCase().includes(needle)));
  }, [all, q, platform, status, owner, campaign]);
  const filtering = Boolean(q || platform || status || owner || campaign);
  const campaigns = useMemo(() => [...new Set([...(campaignData ?? []), ...all.map((i) => i.campaign).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [campaignData, all]);
  const unscheduled = items.filter((i) => !i.scheduledAt && i.status !== "published");

  // ---- this week at a glance ----------------------------------------------------------------------------------------
  const summary = useMemo(() => {
    const start = startOfWeek(new Date());
    const end = addDays(start, 7);
    const week = all.filter((i) => i.scheduledAt && new Date(i.scheduledAt) >= start && new Date(i.scheduledAt) < end);
    return {
      planned: week.filter((i) => ["idea", "drafting", "review"].includes(i.status)).length,
      ready: week.filter((i) => i.status === "ready").length,
      scheduled: week.filter((i) => i.status === "scheduled" || i.status === "publishing").length,
      posted: week.filter((i) => i.status === "published").length,
      attention: all.filter(needsAttention).length,
    };
  }, [all]);

  // ---- changing things -------------------------------------------------------------------------------------------------
  const onChanged = useCallback(
    (item: ContentItem) => {
      set((prev) => (prev?.some((i) => i._id === item._id) ? prev.map((i) => (i._id === item._id ? item : i)) : [item, ...(prev ?? [])]));
      void reloadCampaigns();
    },
    [set, reloadCampaigns],
  );
  const onDeleted = useCallback((id: string) => set((prev) => prev?.filter((i) => i._id !== id)), [set]);

  // Optimistic edit with a rollback if the server says no.
  async function patch(id: string, change: Partial<ContentItem>, send: () => Promise<ContentItem>, done?: string) {
    const before = all.find((i) => i._id === id);
    set((prev) => prev?.map((i) => (i._id === id ? { ...i, ...change } : i)));
    try {
      onChanged(await send());
      if (done) say(done);
    } catch (e) {
      if (before) set((prev) => prev?.map((i) => (i._id === id ? before : i)));
      say(e instanceof Error ? e.message : "That didn’t work.");
    }
  }

  function reschedule(id: string, to: Date) {
    const item = all.find((i) => i._id === id);
    if (!item) return;
    const kept = item.status === "scheduled" ? " It will post then." : "";
    void patch(id, { scheduledAt: to.toISOString() }, () => updateContent(id, { scheduledAt: to.toISOString() }), `Moved to ${fmtWhen(to.toISOString())}.${kept}`);
  }
  const dropOnDay = (id: string, day: Date) => {
    const item = all.find((i) => i._id === id);
    if (item) reschedule(id, moveToDay(item, day));
  };
  const dropOnSlot = (id: string, day: Date, hour: number) => {
    const item = all.find((i) => i._id === id);
    if (item) reschedule(id, moveToDay(item, day, hour));
  };
  function dropOnTray(id: string) {
    const item = all.find((i) => i._id === id);
    if (!item || !item.scheduledAt) return;
    void patch(id, { scheduledAt: null, status: item.status === "scheduled" ? "ready" : item.status }, () => updateContent(id, { scheduledAt: null }), "Date removed — it’s back in “Not scheduled yet”.");
  }

  function moveStage(id: string, to: ContentStatus) {
    const item = all.find((i) => i._id === id);
    if (!item || item.status === to) return;
    if (item.status === "published" || item.status === "publishing") return say(item.status === "published" ? "That one is already posted." : "It’s being posted right now.");
    if (to === "published") return say("Posts go live by scheduling them, or with “Post now” inside the item.");
    if (to === "scheduled") {
      if (!item.scheduledAt || !item.upload || item.platform !== "instagram") {
        setDrawer({ item, key: id });
        return say("To schedule it: add a date and time, and attach the video or picture.");
      }
      return void patch(id, { status: "scheduled" }, () => scheduleContent(id, {}), `Scheduled — it will post by itself on ${fmtWhen(item.scheduledAt)}.`);
    }
    void patch(id, { status: to }, () => updateContent(id, { status: to }));
  }

  const openItem = useCallback((item: ContentItem) => setDrawer({ item, key: item._id }), []);
  const addOn = (day?: Date, hour?: number, st?: ContentStatus) => {
    setDrawer({ key: `new-${Date.now()}`, defaults: { date: day ? dayKey(day) : undefined, time: hour !== undefined ? `${String(hour).padStart(2, "0")}:00` : undefined, status: st } });
  };

  // ---- a link from a notification (?item=ID) opens that item ---------------------------------------------------------
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || loading) return;
    const id = queryParam("item");
    if (!id) return;
    deepLinked.current = true;
    const show = (item: ContentItem) => {
      if (item.scheduledAt) setCursor(new Date(item.scheduledAt));
      setDrawer({ item, key: item._id });
      flashElement(`content-${item._id}`);
    };
    const known = all.find((i) => i._id === id);
    if (known) show(known);
    else
      getContent(id)
        .then((item) => (onChanged(item), show(item)))
        .catch(() => say("That content item is gone."));
  }, [loading, all, onChanged, say]);

  // ---- navigation ------------------------------------------------------------------------------------------------------
  const step = (dir: number) => setCursor((c) => (view === "week" ? addDays(c, dir * 7) : new Date(c.getFullYear(), c.getMonth() + dir, 1)));
  const weekStart = startOfWeek(cursor);
  const label = view === "week" ? `${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dated = view === "month" || view === "week";

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-6 sm:py-10 lg:px-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Content calendar</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Plan every post, tie it to the work behind it, and schedule it to go out by itself.{!canWrite && " You can look at the plan; planning is for the design, social media and service manager roles."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="View">
            {VIEWS.map(({ id, label: l, Icon }) => (
              <button key={id} role="tab" aria-selected={view === id} onClick={() => pickView(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${view === id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
                <Icon size={15} /> <span className="hidden sm:inline">{l}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setManaging(true)} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:border-orange-300 hover:text-orange-700">
            <Tag size={16} /> Campaigns
          </button>
          {canWrite && (
            <button onClick={() => setPlanning({ campaign: "", goal: "" })} className="inline-flex items-center gap-2 rounded-xl bg-[#171717] px-4 py-2.5 text-sm font-semibold text-[#ffffff] transition hover:bg-[#404040]">
              <Sparkles size={16} className="text-[#fdba74]" /> Plan with AI
            </button>
          )}
          {canWrite && (
            <button onClick={() => addOn()} className={btnPrimary}>
              <Plus size={16} /> New content
            </button>
          )}
        </div>
      </div>

      {/* This week at a glance */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat icon={CalendarDays} color="#2563eb" value={summary.planned} label="Planned this week" hint="Ideas, drafts, in review" />
        <Stat icon={CheckCircle2} color="#0d9488" value={summary.ready} label="Ready this week" hint="Waiting to be scheduled" />
        <Stat icon={Zap} color="#7c3aed" value={summary.scheduled} label="Scheduled this week" hint="Posting by themselves" />
        <Stat icon={CalendarClock} color="#16a34a" value={summary.posted} label="Posted this week" hint="Live on Instagram" />
        <Stat icon={AlertTriangle} color={summary.attention ? "#dc2626" : "#94a3b8"} value={summary.attention} label="Needs attention" hint="Failed, overdue or no media" onClick={summary.attention ? () => (setStatus(""), pickView("list")) : undefined} />
      </div>

      {/* Navigation + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {dated ? (
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} aria-label="Previous" className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setCursor(new Date())} className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
              Today
            </button>
            <button onClick={() => step(1)} aria-label="Next" className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100">
              <ChevronRight size={18} />
            </button>
            <h2 className="ml-2 min-w-[11rem] text-lg font-semibold tracking-tight text-neutral-900">{label}</h2>
          </div>
        ) : (
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">{view === "pipeline" ? "Pipeline" : "Everything, in order"}</h2>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search content" className="w-40 rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-orange-400 sm:w-48" />
          </label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as ContentPlatform | "")} aria-label="Platform" className={select}>
            <option value="">All platforms</option>
            {(Object.keys(PLATFORM_LABEL) as ContentPlatform[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={select}>
            <option value="">All stages</option>
            {STATUSES.filter((s) => s.id !== "publishing").map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className={select}>
            <option value="">Everyone</option>
            {team.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="Campaign" className={select}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {filtering && (
            <button
              onClick={() => (setQ(""), setPlatform(""), setStatus(""), setOwner(""), setCampaign(""))}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-orange-600 hover:bg-orange-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && !data && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>}
      {loading && !data ? (
        <div className="h-96 animate-pulse rounded-2xl bg-white" />
      ) : (
        <>
          {dated && <Tray items={unscheduled} canWrite={canWrite} onOpen={openItem} onDropHere={dropOnTray} />}
          {view === "month" && <MonthView items={items} cursor={cursor} canWrite={canWrite} onOpen={openItem} onQuickAdd={(d) => addOn(d)} onDropOnDay={dropOnDay} onShowDay={setDayList} />}
          {view === "week" && <WeekView items={items} cursor={cursor} canWrite={canWrite} onOpen={openItem} onQuickAdd={(d, h) => addOn(d, h)} onDropOnSlot={dropOnSlot} />}
          {view === "pipeline" && <PipelineView items={items} canWrite={canWrite} onOpen={openItem} onMoveTo={moveStage} onAdd={(s) => addOn(undefined, undefined, s)} />}
          {view === "list" && <ListView items={items} onOpen={openItem} />}
        </>
      )}

      <Legend campaigns={campaigns} />

      {managing && (
        <CampaignsModal
          canWrite={canWrite}
          onClose={() => setManaging(false)}
          onChanged={() => (void reloadContent(), void reloadCampaigns())}
          onPlan={(c) => (setManaging(false), setPlanning({ campaign: c.name, goal: c.goal }))}
          onShow={(name) => (setCampaign(name), setManaging(false))}
        />
      )}
      {planning && (
        <AiPlanModal
          initial={planning}
          team={team}
          isAdmin={isAdmin}
          onClose={() => setPlanning(false)}
          onAdded={(first) => {
            void reloadContent();
            void reloadCampaigns();
            if (first) setCursor(new Date(`${first}T12:00:00`));
          }}
        />
      )}
      {drawer && <ItemDrawer key={drawer.key} target={drawer} canWrite={canWrite} isAdmin={isAdmin} team={team} campaigns={campaigns} onClose={() => setDrawer(null)} onChanged={onChanged} onDeleted={onDeleted} say={say} />}

      {dayList && (
        <Modal title={fmtDay(dayList, true)} onClose={() => setDayList(null)}>
          <div className="space-y-1.5">
            {items
              .filter((i) => i.scheduledAt && dayKey(new Date(i.scheduledAt)) === dayKey(dayList))
              .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime())
              .map((i) => (
                <Chip
                  key={i._id}
                  item={i}
                  canDrag={false}
                  onOpen={(it) => {
                    setDayList(null);
                    openItem(it);
                  }}
                />
              ))}
          </div>
        </Modal>
      )}

      {notice && (
        <div role="status" className="present-slide-up fixed bottom-6 left-1/2 z-[96] max-w-[90vw] -translate-x-1/2 rounded-full bg-[#171717] px-5 py-2.5 text-sm font-medium text-[#ffffff] shadow-2xl">
          {notice}
        </div>
      )}
    </main>
  );
}

function Stat({ icon: Icon, color, value, label, hint, onClick }: { icon: typeof Zap; color: string; value: number; label: string; hint: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex items-center gap-3 rounded-2xl bg-white p-4 text-left ${onClick ? "transition hover:-translate-y-px" : ""}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold leading-none tabular-nums text-neutral-900">{value}</span>
        <span className="mt-1 block text-xs font-semibold leading-tight text-neutral-700">{label}</span>
        <span className="block truncate text-[11px] text-neutral-400">{hint}</span>
      </span>
    </Tag>
  );
}

// Ideas that don't have a day yet: drag one onto a day to give it a date, or drag a dated item here to take its date away.
function Tray({ items, canWrite, onOpen, onDropHere }: { items: ContentItem[]; canWrite: boolean; onOpen: (i: ContentItem) => void; onDropHere: (id: string) => void }) {
  const [over, setOver] = useState(false);
  if (!items.length && !canWrite) return null;
  return (
    <div {...(canWrite ? dropProps(onDropHere, setOver) : {})} className={`mb-4 rounded-2xl p-3 transition-colors ${over ? "bg-orange-50" : "bg-white"}`}>
      <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
        Not scheduled yet <span className="ml-1 font-semibold normal-case tracking-normal text-neutral-400">{canWrite ? "· drag onto a day to plan it" : ""}</span>
      </p>
      {items.length === 0 ? (
        <p className="px-1 pb-1 text-xs text-neutral-400">Ideas without a date will wait here.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((i) => (
            <Chip key={i._id} item={i} onOpen={onOpen} canDrag={canWrite} showTime={false} />
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({ campaigns }: { campaigns: string[] }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-neutral-500">
      <span className="font-bold uppercase tracking-widest text-neutral-400">Stages</span>
      {STATUSES.filter((s) => s.id !== "publishing").map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.label}
        </span>
      ))}
      {campaigns.length > 0 && (
        <>
          <span className="ml-2 font-bold uppercase tracking-widest text-neutral-400">Campaigns</span>
          {campaigns.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: campaignColor(c) }} /> {c}
            </span>
          ))}
        </>
      )}
      <span className="inline-flex items-center gap-1.5">
        <Zap size={12} className="text-[#7c3aed]" /> posts by itself
      </span>
      <span className="inline-flex items-center gap-1.5">
        <AlertTriangle size={12} className="text-[#d97706]" /> no media yet
      </span>
    </div>
  );
}
