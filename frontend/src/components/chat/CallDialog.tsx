"use client";

import { useState } from "react";
import { CalendarClock, Lock, Phone, Users } from "lucide-react";
import { Modal } from "@/components/present/ui";

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900";

// A `datetime-local` value (the person's own clock) for roughly half an hour from now, on a 5-minute mark.
const soon = () => {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// The admin's way to start a call now or set one for later; both can carry a title.
export function CallDialog({ roomName, members, meId, onStart, onSchedule, onClose }: { roomName: string; members: { id: string; name: string }[]; meId?: string; onStart: (title: string, invited?: string[]) => Promise<void>; onSchedule: (title: string, startAt: string, invited?: string[]) => Promise<void>; onClose: () => void }) {
  const [mode, setMode] = useState<"now" | "later">("now");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(soon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Who the call is for: everyone in the room, or only the people ticked here.
  const [audience, setAudience] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const others = members.filter((m) => m.id !== meId);
  const shown = others.filter((m) => m.name.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (id: string) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (audience === "some" && !picked.size) {
      setError("Tick at least one person, or choose everyone.");
      return;
    }
    setBusy(true);
    setError("");
    const invited = audience === "some" ? [...picked] : undefined;
    try {
      if (mode === "now") await onStart(title, invited);
      else await onSchedule(title, new Date(when).toISOString(), invited);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <Modal title={`Group call in ${roomName}`} onClose={() => !busy && onClose()}>
      <form onSubmit={submit} className="space-y-3">
        <div role="tablist" className="inline-flex gap-1 rounded-full bg-neutral-100 p-1">
          {([["now", "Start now"], ["later", "Schedule for later"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
              {label}
            </button>
          ))}
        </div>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Call title (optional), e.g. Sunday service prep" className={field} />
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Who is it for?</p>
          <div className="grid grid-cols-2 gap-2">
            {([["all", `Everyone (${members.length})`, Users], ["some", "Choose people", Lock]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => setAudience(k)} aria-pressed={audience === k} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${audience === k ? "border-orange-400 bg-orange-50 text-orange-700" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          {audience === "some" && (
            <div className="mt-2 rounded-xl border border-neutral-200">
              <div className="flex items-center gap-2 border-b border-neutral-100 p-2">
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find someone" className="min-w-0 flex-1 rounded-lg bg-neutral-50 px-3 py-1.5 text-sm outline-none" />
                <button type="button" onClick={() => setPicked(new Set(others.map((m) => m.id)))} className="shrink-0 text-xs font-semibold text-orange-700 hover:underline">All</button>
                <button type="button" onClick={() => setPicked(new Set())} className="shrink-0 text-xs font-semibold text-neutral-500 hover:underline">None</button>
              </div>
              <ul className="max-h-48 overflow-y-auto p-1">
                {shown.map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-neutral-50">
                      <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} /> {m.name}
                    </label>
                  </li>
                ))}
                {!shown.length && <li className="px-3 py-4 text-center text-xs text-neutral-400">{others.length ? "Nobody matches." : "There’s nobody else in this room."}</li>}
              </ul>
              <p className="border-t border-neutral-100 px-3 py-2 text-xs text-neutral-500">{picked.size} chosen. Only they are told about it and can join; everyone else in the room won’t see it.</p>
            </div>
          )}
        </div>
        {mode === "later" && (
          <div>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className={field} />
            <p className="mt-1.5 text-xs text-neutral-500">Everyone in the room is told it’s scheduled. At that time the call starts by itself and they’re all pinged. You can ping the ones who haven’t joined.</p>
          </div>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">
            {mode === "now" ? <Phone size={15} /> : <CalendarClock size={15} />}
            {busy ? "Working…" : mode === "now" ? "Start call" : "Schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
