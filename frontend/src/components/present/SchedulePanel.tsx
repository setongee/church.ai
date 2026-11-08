"use client";

import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Film, FolderPlus, GalleryHorizontal, GripVertical, HandHeart, Image as ImageIcon, LayoutTemplate, Megaphone, Music2, Pencil, Quote as QuoteIcon, Trash2, Workflow, X, Zap } from "lucide-react";
import { SESSION_COLORS, sessionColor, type Schedule, type ScheduleItem, type ScheduleItemType, type ScheduleSession, type Slide } from "@/lib/present";
import { btnGhost, Empty } from "./ui";

interface Props {
  schedule: Schedule | null;
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  // Play a slide show item from the schedule.
  onPlayShow: (item: ScheduleItem) => void;
  // Trigger a template item: applies its scene (or shows the template).
  onTrigger: (item: ScheduleItem) => void;
  // Sessions: named, colour-coded groups inside the schedule, each with a description.
  onAddSession: (input: { name: string; description?: string; color?: string }) => void;
  onUpdateSession: (id: string, patch: Partial<Pick<ScheduleSession, "name" | "description" | "color">>) => void;
  onMoveSession: (from: number, to: number) => void;
  onRemoveSession: (id: string, withItems: boolean) => void;
  onAssign: (itemId: string, session: string) => void;
  // Clicking an item picks it: its "when clicked" triggers run.
  onPick: (item: ScheduleItem) => void;
  // How many triggers start from each item, and the button that opens the trigger map.
  triggerCounts: Record<string, number>;
  onOpenMap: () => void;
}

// Name, description and colour of a session. Enter in the name saves, Escape cancels.
function SessionForm({ initial, defaultColor, onSave, onCancel }: { initial?: ScheduleSession; defaultColor: string; onSave: (v: { name: string; description: string; color: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color || defaultColor);
  const save = () => name.trim() && onSave({ name: name.trim(), description: description.trim(), color });
  return (
    <div className="space-y-2.5 rounded-xl border border-orange-200 bg-white p-3" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onCancel())}>
      <input
        autoFocus
        value={name}
        maxLength={60}
        placeholder="Session name, e.g. Praise"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
        className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
      />
      <textarea
        value={description}
        maxLength={300}
        rows={2}
        placeholder="What this session is for (optional), e.g. All the praise songs before the word"
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-neutral-500">Colour</span>
        {SESSION_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={`h-6 w-6 rounded-full border-2 ${color === c ? "scale-110 border-neutral-900" : "border-white ring-1 ring-neutral-300"}`} style={{ background: c }} />
        ))}
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom colour" className="h-7 w-9 cursor-pointer rounded border border-neutral-200 bg-white p-0.5" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${btnGhost} !py-1 text-xs`}>Cancel</button>
        <button type="button" onClick={save} disabled={!name.trim()} className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">Save session</button>
      </div>
    </div>
  );
}

const ICONS = { scripture: BookOpen, song: Music2, announcement: Megaphone, image: ImageIcon, prayer: HandHeart, quote: QuoteIcon, media: Film, slideshow: GalleryHorizontal, template: LayoutTemplate };

// The kinds of thing in a schedule, for the filter chips.
const FILTERS: { id: ScheduleItemType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "scripture", label: "Scripture" },
  { id: "song", label: "Songs" },
  { id: "template", label: "Templates" },
  { id: "announcement", label: "Announcements" },
  { id: "prayer", label: "Prayers" },
  { id: "quote", label: "Quotes" },
  { id: "media", label: "Media" },
  { id: "image", label: "Images" },
  { id: "slideshow", label: "Slide shows" },
];

const preview = (s: Slide) => (s.kind === "image" ? "Image" : s.kind === "video" ? "Video" : s.kind === "welcome" ? `Welcome — ${s.main ?? ""}` : s.kind === "giving" ? `Offering & Tithe — ${s.accountNo}` : s.kind === "ministering" ? `Speaker intro — ${s.name}` : s.kind === "scripture2" ? `${s.left.reference} ${s.left.version} | ${s.right.reference} ${s.right.version}` : s.text.replace(/\s+/g, " "));

// The order of service. Click an item to stage it; arrow keys step through every slide in order.
export function SchedulePanel({ schedule, onStage, onLive, onMove, onRemove, onPlayShow, onTrigger, onAddSession, onUpdateSession, onMoveSession, onRemoveSession, onAssign, onPick, triggerCounts, onOpenMap }: Props) {
  const [filter, setFilter] = useState<ScheduleItemType | "all">("all");
  const [pos, setPos] = useState<{ item: string; slide: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [sdrag, setSdrag] = useState<number | null>(null); // the session being dragged (by its grip)
  const [sover, setSover] = useState<number | null>(null);

  const items = useMemo(() => schedule?.items ?? [], [schedule]);
  // Only the kinds that are actually in this schedule get a chip (with how many).
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const it of items) c.set(it.type, (c.get(it.type) ?? 0) + 1);
    return c;
  }, [items]);
  const active = filter === "all" || counts.has(filter) ? filter : "all"; // a kind that's been emptied falls back to All
  const shown = active === "all" ? items : items.filter((it) => it.type === active);
  const sessions = useMemo(() => schedule?.sessions ?? [], [schedule]);
  // Items grouped by session, in the order of the schedule; "" holds the ones in no session.
  const groups = useMemo(() => {
    const known = new Set(sessions.map((x) => x._id));
    const loose = shown.filter((it) => !it.session || !known.has(it.session));
    return [
      ...(sessions.length ? [{ id: "", name: "No session", items: loose }] : [{ id: "", name: "", items: loose }]),
      ...sessions.map((x) => ({ id: x._id, name: x.name, items: shown.filter((it) => it.session === x._id) })),
    ];
  }, [shown, sessions]);
  const ordered = useMemo(() => groups.filter((g) => !closed[g.id] || !g.id).flatMap((g) => g.items), [groups, closed]);
  const flat = useMemo(() => ordered.flatMap((it) => it.slides.map((_, i) => ({ item: it._id, slide: i }))), [ordered]);

  function pick(it: ScheduleItem, slide: number) {
    setPos({ item: it._id, slide });
    if (it.slides[slide]) onStage(it.slides[slide]);
    onPick(it);
  }

  function step(dir: 1 | -1) {
    if (!flat.length) return;
    const cur = pos ? flat.findIndex((f) => f.item === pos.item && f.slide === pos.slide) : -1;
    const next = flat[Math.min(flat.length - 1, Math.max(0, cur + dir))];
    const it = ordered.find((i) => i._id === next.item);
    if (it) pick(it, next.slide);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (["ArrowDown", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      step(1);
    } else if (["ArrowUp", "ArrowLeft"].includes(e.key)) {
      e.preventDefault();
      step(-1);
    }
  }

  if (!schedule) return <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>;
  if (!items.length && !sessions.length) {
    return (
      <Empty icon={<CalendarDays size={22} />} title={`${schedule.name} is empty`}>
        Use <b>Add to schedule</b> in Scripture, Songs, Announcements or Images to build the order of service.
        <span className="mt-3 block">
          {adding ? (
            <span className="block text-left"><SessionForm defaultColor={SESSION_COLORS[0]} onSave={(v) => (onAddSession(v), setAdding(false))} onCancel={() => setAdding(false)} /></span>
          ) : (
            <button onClick={() => setAdding(true)} className={btnGhost}>
              <FolderPlus size={15} /> Start with a session (e.g. Praise)
            </button>
          )}
        </span>
      </Empty>
    );
  }

  const row = (it: ScheduleItem) => {
        const idx = items.indexOf(it);
        const Icon = ICONS[it.type];
        const on = pos?.item === it._id;
        const tint = sessionColor(sessions, it.session);
        const zaps = triggerCounts[it._id] ?? 0;
        return (
          <div
            key={it._id}
            draggable
            onDragStart={() => setDrag(idx)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(idx);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            onDrop={() => {
              if (drag !== null) {
                const dragged = items[drag];
                if (dragged && (dragged.session ?? "") !== (it.session ?? "")) onAssign(dragged._id, it.session ?? "");
                onMove(drag, idx);
              }
              setDrag(null);
              setOver(null);
            }}
            style={tint ? { borderLeftColor: tint, borderLeftWidth: 4 } : undefined}
            className={`group rounded-xl border bg-white transition ${on ? "border-orange-300 ring-2 ring-orange-500/10" : "border-neutral-100 hover:border-neutral-200"} ${over === idx && drag !== null && drag !== idx ? "border-t-4 border-t-orange-400" : ""} ${drag === idx ? "opacity-40" : ""}`}
          >
            <div className="flex items-center gap-2 pr-2">
              <GripVertical size={16} className="ml-2 shrink-0 cursor-grab text-neutral-300 group-hover:text-neutral-400" />
              <button onClick={() => pick(it, on ? pos!.slide : 0)} onDoubleClick={() => (it.type === "template" ? onTrigger(it) : it.slides[0] && onLive(it.slides[on ? pos!.slide : 0]))} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-orange-50 text-orange-600" : "bg-neutral-100 text-neutral-500"}`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
                    <span className="truncate">{it.title || "Untitled"}</span>
                    {zaps > 0 && (
                      <span title={`${zaps} trigger${zaps === 1 ? "" : "s"} start from this item`} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        <Zap size={10} /> {zaps}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-neutral-400">
                    {[it.subtitle, it.scene && "Scene", it.slides.length > 1 && `${it.slides.length} slides`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              {it.type === "template" && (
                <button onClick={() => onTrigger(it)} className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700">
                  Go live
                </button>
              )}
              {it.type === "slideshow" && (
                <button onClick={() => onPlayShow(it)} className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700">
                  Play
                </button>
              )}
              {sessions.length > 0 && (
                <select
                  value={it.session && sessions.some((x) => x._id === it.session) ? it.session : ""}
                  onChange={(e) => onAssign(it._id, e.target.value)}
                  aria-label="Move to session"
                  title="Move to a session"
                  className="max-w-28 shrink-0 rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-600 opacity-0 transition focus:opacity-100 group-hover:opacity-100"
                >
                  <option value="">No session</option>
                  {sessions.map((x) => (
                    <option key={x._id} value={x._id}>{x.name}</option>
                  ))}
                </select>
              )}
              <button onClick={() => onRemove(it._id)} aria-label="Remove from schedule" className="rounded-md p-1.5 text-neutral-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                <X size={15} />
              </button>
            </div>

            {on && it.slides.length > 1 && (
              <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 p-3 xl:grid-cols-3">
                {it.slides.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => pick(it, i)}
                    onDoubleClick={() => onLive(s)}
                    className={`rounded-lg border p-2.5 text-left transition ${pos?.slide === i ? "border-orange-300 bg-orange-50" : "border-neutral-100 bg-neutral-50/60 hover:border-neutral-200"}`}
                  >
                    {s.kind === "song" && s.label && <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-orange-600">{s.label}</span>}
                    <span className="line-clamp-3 text-xs leading-snug text-neutral-700">{preview(s)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
  };

  return (
    <div tabIndex={0} data-own-arrows onKeyDown={onKeyDown} className="h-full min-h-0 space-y-2 overflow-y-auto outline-none">
      <div className="flex flex-wrap gap-1.5 pb-1">
        {FILTERS.filter((f) => f.id === "all" || counts.has(f.id)).map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={active === f.id} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${active === f.id ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
            {f.label}
            <span className="ml-1.5 opacity-70">{f.id === "all" ? items.length : counts.get(f.id)}</span>
          </button>
        ))}
      </div>
      {adding ? (
        <SessionForm defaultColor={SESSION_COLORS[sessions.length % SESSION_COLORS.length]} onSave={(v) => (onAddSession(v), setAdding(false))} onCancel={() => setAdding(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAdding(true)} className={`${btnGhost} !py-1.5 text-xs`}>
            <FolderPlus size={14} /> New session
          </button>
          <button onClick={onOpenMap} title="Link items so clicking or going live on one triggers a template, a background change and more" className={`${btnGhost} !py-1.5 text-xs`}>
            <Workflow size={14} /> Trigger map
            {Object.values(triggerCounts).reduce((a, b) => a + b, 0) > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">{Object.values(triggerCounts).reduce((a, b) => a + b, 0)}</span>}
          </button>
        </div>
      )}
      {groups.map((g) => {
        if (!g.id && !g.items.length && sessions.length) return null; // an empty "No session" group isn't worth showing
        if (!g.id && !sessions.length) return g.items.map(row);
        if (g.id && !g.items.length && active !== "all") return null;
        const open = !g.id || !closed[g.id];
        const si = sessions.findIndex((x) => x._id === g.id);
        const session = sessions[si];
        const color = g.id ? sessionColor(sessions, g.id) : "";
        if (g.id && renaming === g.id && session) {
          return <SessionForm key={g.id} initial={session} defaultColor={color} onSave={(v) => (onUpdateSession(g.id, v), setRenaming(""))} onCancel={() => setRenaming("")} />;
        }
        return (
          <section
            key={g.id || "none"}
            onDragOver={(e) => {
              if (sdrag === null || !g.id) return;
              e.preventDefault();
              setSover(si);
            }}
            onDrop={() => {
              if (sdrag !== null && si >= 0) onMoveSession(sdrag, si);
              setSdrag(null);
              setSover(null);
            }}
            style={g.id ? { borderColor: `${color}66`, background: `${color}0f` } : undefined}
            className={`space-y-2 ${g.id ? "rounded-2xl border p-2" : ""} ${sover === si && sdrag !== null && sdrag !== si ? "ring-2 ring-orange-400" : ""} ${sdrag === si && sdrag !== null ? "opacity-50" : ""}`}
          >
            {g.id ? (
              <div className="px-1">
                <div className="flex items-center gap-1.5">
                  <span
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", g.name);
                      setSdrag(si);
                    }}
                    onDragEnd={() => (setSdrag(null), setSover(null))}
                    title="Drag to reorder sessions"
                    className="cursor-grab rounded p-0.5 text-neutral-400 hover:text-neutral-700"
                  >
                    <GripVertical size={15} />
                  </span>
                  <button onClick={() => setClosed((c) => ({ ...c, [g.id]: open }))} aria-label={open ? "Collapse session" : "Expand session"} className="rounded p-1 text-neutral-400 hover:text-neutral-700">
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-800">
                    {g.name} <span className="text-xs font-medium text-neutral-400">{g.items.length}</span>
                  </span>
                  <button onClick={() => onMoveSession(si, si - 1)} disabled={si === 0} aria-label="Move session up" className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"><ChevronUp size={14} /></button>
                  <button onClick={() => onMoveSession(si, si + 1)} disabled={si === sessions.length - 1} aria-label="Move session down" className="rounded p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"><ChevronDown size={14} /></button>
                  <button onClick={() => setRenaming(g.id)} aria-label="Edit session" title="Edit name, description and colour" className="rounded p-1 text-neutral-400 hover:text-neutral-700"><Pencil size={13} /></button>
                  <button
                    onClick={() => {
                      if (g.items.length === 0 || confirm(`Delete the session “${g.name}”? Its ${g.items.length} item${g.items.length === 1 ? "" : "s"} stay in the schedule, outside any session.\n\nPress Cancel to keep it.`)) onRemoveSession(g.id, false);
                    }}
                    aria-label="Delete session"
                    className="rounded p-1 text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {session?.description && <p className="ml-9 mt-0.5 line-clamp-2 text-xs text-neutral-500">{session.description}</p>}
              </div>
            ) : (
              <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-neutral-400">No session</p>
            )}
            {open && g.items.map(row)}
            {open && g.id && !g.items.length && <p className="px-2 pb-1 text-xs text-neutral-400">Empty. Choose this session when you “Add to schedule”, or move items in.</p>}
          </section>
        );
      })}
      <p className="pt-1 text-xs text-neutral-400">Click to preview · Double-click or Enter to go live · ↑ ↓ step through slides · Drag to reorder · Templates: Go live or double-click</p>
    </div>
  );
}
