"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { Schedule, ScheduleSummary } from "@/lib/present";
import { inputCls } from "./ui";

interface Props {
  list: ScheduleSummary[];
  active: Schedule | null;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

// Header dropdown: pick which schedule is running, or create / rename / copy / delete one.
export function ScheduleSwitcher({ list, active, onSwitch, onCreate, onRename, onDuplicate, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "new" | "rename">("menu");
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setMode("menu");
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (mode === "new") onCreate(text.trim());
    else onRename(text.trim());
    setText("");
    close();
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50";

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setMode("menu");
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex max-w-72 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        <CalendarDays size={16} className="shrink-0 text-orange-600" />
        <span className="truncate">{active?.name ?? "Loading…"}</span>
        <ChevronDown size={14} className={`shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-neutral-100 bg-white p-1.5 shadow-xl">
          {mode === "menu" ? (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Schedules</p>
              <div className="max-h-64 overflow-y-auto">
                {list.map((s) => (
                  <button
                    key={s._id}
                    onClick={() => {
                      onSwitch(s._id);
                      close();
                    }}
                    className={`${item} ${s._id === active?._id ? "bg-orange-50 text-orange-700" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <span className="text-xs text-neutral-400">{s.count}</span>
                    {s._id === active?._id && <Check size={14} className="shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="mt-1 border-t border-neutral-100 pt-1">
                <button
                  onClick={() => {
                    setText("");
                    setMode("new");
                  }}
                  className={item}
                >
                  <Plus size={15} /> New schedule
                </button>
                <button
                  onClick={() => {
                    setText(active?.name ?? "");
                    setMode("rename");
                  }}
                  className={item}
                >
                  <Pencil size={15} /> Rename
                </button>
                <button
                  onClick={() => {
                    onDuplicate();
                    close();
                  }}
                  className={item}
                >
                  <Copy size={15} /> Duplicate
                </button>
                <button
                  onClick={() => {
                    if (active && confirm(`Delete “${active.name}” and its ${active.items.length} item(s)?`)) {
                      onDelete();
                      close();
                    }
                  }}
                  className={`${item} text-red-600 hover:bg-red-50`}
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-2 p-2">
              <p className="text-xs font-semibold text-neutral-500">{mode === "new" ? "New schedule (starts with the current look)" : "Rename schedule"}</p>
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Sunday Service, Youth Night" className={inputCls} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode("menu")} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100">
                  Back
                </button>
                <button type="submit" disabled={!text.trim()} className="rounded-lg bg-orange-600 px-3.5 py-1.5 text-sm font-semibold text-[#ffffff] disabled:opacity-50">
                  {mode === "new" ? "Create" : "Save"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
