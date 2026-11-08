"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, ImageIcon, Moon, Plus, Sparkles, Trash2, Wand2, Zap } from "lucide-react";
import { BACKGROUND_PRESETS, EMPTY_TRIGGER_MAP, newId, sessionColor, type Schedule, type ScheduleItem, type TriggerEvent, type TriggerLink, type TriggerMap, type TriggerNode } from "@/lib/present";
import { BackgroundField, BackgroundThumb } from "./BackgroundPicker";
import { btnGhost } from "./ui";

const W = 220;
const H = { item: 60, session: 64, action: 92 } as const;
type Kind = keyof typeof H;
interface NodeView {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SCREEN_LABEL = { black: "Black screen", clear: "Clear the screen", logo: "Show the logo" } as const;
const SCREEN_ICON = { black: Moon, clear: Eraser, logo: Sparkles } as const;
const typeLabel = (it: ScheduleItem) => (it.type === "template" ? "Template" : it.type === "slideshow" ? "Slide show" : it.type[0].toUpperCase() + it.type.slice(1));

// The trigger map: a playground where items and sessions are wired to what should happen when they are clicked or go live -
// apply a template already in the schedule, change the background, put another item up, black or clear the screen.
// Drag from the dot on a card's right edge to the card (or action) it should trigger; click a line to set when and how late.
export function TriggerMapEditor({ schedule, onChange, onClose }: { schedule: Schedule; onChange: (m: TriggerMap) => void; onClose: () => void }) {
  const map = schedule.triggerMap ?? EMPTY_TRIGGER_MAP;
  const items = schedule.items;
  const sessions = useMemo(() => schedule.sessions ?? [], [schedule.sessions]);
  const [sel, setSel] = useState<{ type: "link" | "node"; id: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Every card, with its saved place or a tidy default: sessions on the left, items in the middle, actions on the right.
  const nodes = useMemo(() => {
    const out: NodeView[] = [];
    const place = (id: string, kind: Kind, fallback: { x: number; y: number }) => {
      const p = map.pos[id] ?? fallback;
      out.push({ id, kind, x: p.x, y: p.y, w: W, h: H[kind] });
    };
    sessions.forEach((s, i) => place(s._id, "session", { x: 40, y: 40 + i * 92 }));
    const order = [...items].sort((a, b) => {
      const ai = sessions.findIndex((s) => s._id === a.session);
      const bi = sessions.findIndex((s) => s._id === b.session);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    order.forEach((it, i) => place(it._id, "item", { x: 340, y: 40 + i * 76 }));
    map.nodes.forEach((n, i) => place(n.id, "action", { x: 680, y: 40 + i * 112 }));
    return out;
  }, [items, sessions, map.nodes, map.pos]);
  const at = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n && drag?.id === id ? { ...n, x: drag.x, y: drag.y } : n;
  };
  const size = useMemo(() => ({ w: Math.max(1200, ...nodes.map((n) => n.x + n.w + 240)), h: Math.max(760, ...nodes.map((n) => n.y + n.h + 240)) }), [nodes]);

  const links = map.links.filter((l) => at(l.from) && at(l.to));
  const itemOf = (id: string) => items.find((i) => i._id === id);
  const sessionOf = (id: string) => sessions.find((s) => s._id === id);
  const nodeOf = (id: string) => map.nodes.find((n) => n.id === id);
  const nameOf = (id: string) => itemOf(id)?.title || sessionOf(id)?.name || (nodeOf(id)?.kind === "background" ? "Background change" : nodeOf(id) ? SCREEN_LABEL[(nodeOf(id) as Extract<TriggerNode, { kind: "screen" }>).mode] : "") || "Untitled";
  const kindOf = (id: string): Kind | "" => (itemOf(id) ? "item" : sessionOf(id) ? "session" : nodeOf(id) ? "action" : "");

  const commit = (patch: Partial<TriggerMap>) => onChange({ ...map, ...patch });
  const setLink = (id: string, patch: Partial<TriggerLink>) => commit({ links: map.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLink = (id: string) => (setSel(null), commit({ links: map.links.filter((l) => l.id !== id) }));
  const removeNode = (id: string) => (setSel(null), commit({ nodes: map.nodes.filter((n) => n.id !== id), links: map.links.filter((l) => l.from !== id && l.to !== id) }));
  const setNode = (id: string, node: TriggerNode) => commit({ nodes: map.nodes.map((n) => (n.id === id ? node : n)) });

  function addAction(kind: "background" | "screen") {
    const id = newId();
    const view = scroller.current;
    const node: TriggerNode = kind === "background" ? { id, kind, background: BACKGROUND_PRESETS[0].bg } : { id, kind, mode: "black" };
    commit({ nodes: [...map.nodes, node], pos: { ...map.pos, [id]: { x: (view?.scrollLeft ?? 0) + 680, y: (view?.scrollTop ?? 0) + 40 + (map.nodes.length % 5) * 24 } } });
    setSel({ type: "node", id });
  }
  function tidy() {
    commit({ pos: {} });
  }

  const canLink = (from: string, to: string) => from !== to && kindOf(to) !== "session" && kindOf(from) !== "action" && !map.links.some((l) => l.from === from && l.to === to);
  function link(from: string, to: string) {
    if (!canLink(from, to)) return;
    const id = newId();
    commit({ links: [...map.links, { id, from, to, on: "live", delay: 0 }] });
    setSel({ type: "link", id });
  }

  // Dragging a card.
  const start = useRef<{ id: string; px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  function downNode(e: React.PointerEvent, n: NodeView) {
    if ((e.target as HTMLElement).closest("[data-port]")) return;
    start.current = { id: n.id, px: e.clientX, py: e.clientY, x: n.x, y: n.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moveNode(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!s.moved && Math.hypot(dx, dy) < 4) return;
    s.moved = true;
    setDrag({ id: s.id, x: Math.max(0, Math.round(s.x + dx)), y: Math.max(0, Math.round(s.y + dy)) });
  }
  function upNode() {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (s.moved && drag) commit({ pos: { ...map.pos, [s.id]: { x: drag.x, y: drag.y } } });
    else setSel({ type: "node", id: s.id });
    setDrag(null);
  }

  // Dragging a new line out of a card's right-hand dot.
  useEffect(() => {
    if (!linking) return;
    const rel = (e: PointerEvent) => {
      const r = canvas.current?.getBoundingClientRect();
      return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
    };
    const move = (e: PointerEvent) => setLinking((l) => (l ? { ...l, ...rel(e) } : l));
    const up = (e: PointerEvent) => {
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-node]");
      if (target?.dataset.node) link(linking.from, target.dataset.node);
      setLinking(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `link` reads the latest map on each render
  }, [linking, map]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "");
      if (e.key === "Escape") {
        if (sel) setSel(null);
        else onClose();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel && !typing) {
        if (sel.type === "link") removeLink(sel.id);
        else if (nodeOf(sel.id)) removeNode(sel.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, map, onClose]);

  const selLink = sel?.type === "link" ? map.links.find((l) => l.id === sel.id) : undefined;
  const selNode = sel?.type === "node" ? sel.id : "";
  const selAction = selNode ? nodeOf(selNode) : undefined;
  const lineFor = (l: TriggerLink) => {
    const a = at(l.from)!;
    const b = at(l.to)!;
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const dx = Math.max(60, Math.abs(x2 - x1) / 2);
    return { d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  };
  const pending = linking ? at(linking.from) : undefined;

  return (
    <div className="fixed inset-0 z-[65] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Trigger map">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-3 py-2.5 sm:px-5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-800">
          <Zap size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-neutral-900">Trigger map · {schedule.name}</h2>
          <p className="hidden text-xs text-neutral-500 sm:block">Drag from the dot on the right of a card to what it should trigger. Click a line to set when and how late.</p>
        </div>
        <button onClick={() => addAction("background")} className={`${btnGhost} !py-1.5 text-xs`}>
          <Plus size={14} /> Background change
        </button>
        <button onClick={() => addAction("screen")} className={`${btnGhost} !py-1.5 text-xs`}>
          <Plus size={14} /> Screen action
        </button>
        <button onClick={tidy} title="Put every card back in its default place" className={`${btnGhost} !py-1.5 text-xs`}>
          <Wand2 size={14} /> Tidy
        </button>
        <button onClick={onClose} className="rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
          Done
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={scroller} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)} className="relative min-h-0 flex-1 overflow-auto bg-neutral-50 [background-image:radial-gradient(circle,#d4d4d4_1px,transparent_1px)] [background-size:22px_22px]">
          <div ref={canvas} className="relative" style={{ width: size.w, height: size.h }} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
            <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
              <defs>
                <marker id="tm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#a3a3a3" />
                </marker>
                <marker id="tm-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ea580c" />
                </marker>
              </defs>
              {links.map((l) => {
                const { d } = lineFor(l);
                const on = sel?.type === "link" && sel.id === l.id;
                return (
                  <g key={l.id}>
                    <path d={d} fill="none" stroke={on ? "#ea580c" : "#a3a3a3"} strokeWidth={on ? 3 : 2} markerEnd={`url(#${on ? "tm-arrow-on" : "tm-arrow"})`} />
                    <path d={d} fill="none" stroke="transparent" strokeWidth={16} className="pointer-events-auto cursor-pointer" onClick={() => setSel({ type: "link", id: l.id })} />
                  </g>
                );
              })}
              {linking && pending && <path d={`M ${pending.x + pending.w} ${pending.y + pending.h / 2} L ${linking.x} ${linking.y}`} fill="none" stroke="#ea580c" strokeWidth={2} strokeDasharray="6 5" />}
            </svg>

            {links.map((l) => {
              const { mx, my } = lineFor(l);
              const on = sel?.type === "link" && sel.id === l.id;
              return (
                <button key={l.id} onClick={() => setSel({ type: "link", id: l.id })} style={{ left: mx, top: my }} className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold shadow-sm ${on ? "border-orange-500 bg-orange-600 text-[#ffffff]" : "border-neutral-200 bg-white text-neutral-600 hover:border-orange-300"}`}>
                  {l.on === "stage" ? "on click" : "on live"}
                  {l.delay > 0 ? ` · ${l.delay}s` : ""}
                </button>
              );
            })}

            {nodes.map((n0) => {
              const n = at(n0.id)!;
              const it = itemOf(n.id);
              const session = sessionOf(n.id);
              const action = nodeOf(n.id);
              const color = it ? sessionColor(sessions, it.session) : session ? sessionColor(sessions, session._id) : "";
              const selected = sel?.type === "node" && sel.id === n.id;
              const targetable = linking ? canLink(linking.from, n.id) : false;
              return (
                <div
                  key={n.id}
                  data-node={n.id}
                  onPointerDown={(e) => downNode(e, n)}
                  onPointerMove={moveNode}
                  onPointerUp={upNode}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h, touchAction: "none", ...(color ? { borderLeftColor: color, borderLeftWidth: 5 } : {}) }}
                  className={`absolute flex cursor-grab select-none flex-col justify-center rounded-xl border bg-white px-3 shadow-sm active:cursor-grabbing ${color ? "rounded-l-none" : ""} ${selected ? "border-orange-400 ring-2 ring-orange-500/20" : "border-neutral-200"} ${targetable ? "ring-2 ring-emerald-400" : ""} ${action ? "bg-amber-50/60" : ""}`}
                >
                  {kindOf(n.id) !== "session" && <span data-port="in" title="Drop a line here" className="absolute -left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-neutral-400 bg-white" />}
                  {kindOf(n.id) !== "action" && (
                    <span
                      data-port="out"
                      title="Drag to what this should trigger"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const r = canvas.current?.getBoundingClientRect();
                        setLinking({ from: n.id, x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) });
                      }}
                      style={{ touchAction: "none" }}
                      className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-orange-500 bg-white hover:bg-orange-100"
                    />
                  )}
                  {it && (
                    <>
                      <span className="truncate text-sm font-semibold text-neutral-900">{it.title || "Untitled"}</span>
                      <span className="truncate text-[11px] text-neutral-400">{[typeLabel(it), sessions.find((s) => s._id === it.session)?.name].filter(Boolean).join(" · ")}</span>
                    </>
                  )}
                  {session && (
                    <>
                      <span className="flex items-center gap-1.5 truncate text-sm font-bold text-neutral-900">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        {session.name}
                      </span>
                      <span className="truncate text-[11px] text-neutral-400">Session · any item in it ({items.filter((x) => x.session === session._id).length})</span>
                    </>
                  )}
                  {action?.kind === "background" && (
                    <div className="flex items-center gap-2">
                      <BackgroundThumb bg={action.background} className="h-12 w-16 shrink-0 rounded-md border border-neutral-200" />
                      <span className="text-xs font-semibold text-neutral-700">Change the background</span>
                    </div>
                  )}
                  {action?.kind === "screen" && (
                    <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
                      {(() => {
                        const Icon = SCREEN_ICON[action.mode];
                        return <Icon size={18} className="shrink-0 text-amber-700" />;
                      })()}
                      {SCREEN_LABEL[action.mode]}
                    </div>
                  )}
                </div>
              );
            })}

            {!items.length && !sessions.length && <p className="absolute left-10 top-10 text-sm text-neutral-400">Add items to the schedule first, then link them here.</p>}
          </div>
        </div>

        <aside className="max-h-[42%] shrink-0 overflow-y-auto border-t border-neutral-100 bg-white p-4 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
          {selLink ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Trigger</p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">
                  {nameOf(selLink.from)} <span className="text-neutral-400">→</span> {nameOf(selLink.to)}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {itemOf(selLink.to)?.type === "template" ? "Applies this template’s scene to the screen." : itemOf(selLink.to) ? "Puts this item on the screen." : nodeOf(selLink.to)?.kind === "background" ? "Changes the screen background." : "Changes what the screen is showing."}
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-neutral-600">When</p>
                <div className="grid gap-1.5">
                  {(
                    [
                      ["stage", `When ${kindOf(selLink.from) === "session" ? "any item in it" : "it"} is clicked`],
                      ["live", `When ${kindOf(selLink.from) === "session" ? "any item in it" : "it"} goes live`],
                    ] as [TriggerEvent, string][]
                  ).map(([v, label]) => (
                    <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selLink.on === v ? "border-orange-400 bg-orange-50 text-orange-800" : "border-neutral-200 text-neutral-700"}`}>
                      <input type="radio" name="when" checked={selLink.on === v} onChange={() => setLink(selLink.id, { on: v })} className="accent-orange-600" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-neutral-600">
                  <span>Wait before it happens</span>
                  <span className="tabular-nums text-neutral-500">{selLink.delay ? `${selLink.delay}s` : "straight away"}</span>
                </span>
                <input type="range" min={0} max={30} step={1} value={Math.min(30, selLink.delay)} onChange={(e) => setLink(selLink.id, { delay: Number(e.target.value) })} className="w-full accent-orange-600" />
              </label>
              <button onClick={() => removeLink(selLink.id)} className={`${btnGhost} w-full justify-center text-red-600`}>
                <Trash2 size={14} /> Remove this trigger
              </button>
            </div>
          ) : selAction ? (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{selAction.kind === "background" ? "Background change" : "Screen action"}</p>
              {selAction.kind === "background" ? (
                <BackgroundField label="Switch the screen to" value={selAction.background} onChange={(b) => b && setNode(selAction.id, { ...selAction, background: b })} />
              ) : (
                <div className="grid gap-1.5">
                  {(Object.keys(SCREEN_LABEL) as (keyof typeof SCREEN_LABEL)[]).map((m) => (
                    <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selAction.mode === m ? "border-orange-400 bg-orange-50 text-orange-800" : "border-neutral-200 text-neutral-700"}`}>
                      <input type="radio" name="screen" checked={selAction.mode === m} onChange={() => setNode(selAction.id, { ...selAction, mode: m })} className="accent-orange-600" />
                      {SCREEN_LABEL[m]}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-neutral-500">Drag a line from any item or session onto this card to make it happen.</p>
              <button onClick={() => removeNode(selAction.id)} className={`${btnGhost} w-full justify-center text-red-600`}>
                <Trash2 size={14} /> Remove this action
              </button>
            </div>
          ) : selNode ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-neutral-900">{nameOf(selNode)}</p>
              <p className="text-xs text-neutral-500">Drag from the orange dot on its right edge to another card or action to link them.</p>
              {map.links.filter((l) => l.from === selNode || l.to === selNode).map((l) => (
                <button key={l.id} onClick={() => setSel({ type: "link", id: l.id })} className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-left text-xs text-neutral-700 hover:border-orange-300">
                  {nameOf(l.from)} → {nameOf(l.to)} <span className="text-neutral-400">({l.on === "stage" ? "on click" : "on live"})</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-neutral-600">
              <p className="font-semibold text-neutral-900">Map how this schedule runs</p>
              <ul className="list-disc space-y-1.5 pl-5 text-xs">
                <li>Each card is an item or a session. Move them anywhere.</li>
                <li>Drag from the orange dot on a card’s right edge to a template, another item, or an action card.</li>
                <li>Click the line to choose <b>when</b> it fires (clicked, or goes live) and an optional delay.</li>
                <li>Add a <b>Background change</b> or <b>Screen action</b> card from the top bar.</li>
                <li>A session as the source fires for any item inside it.</li>
              </ul>
              <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                <ImageIcon size={12} /> Triggers only run during a service, from the schedule.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
