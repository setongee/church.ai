"use client";

import { Avatar } from "@/components/notify/ToastHost";
import { priorityMeta, type Person, type Priority } from "@/lib/board";

export function AvatarStack({ people, size = 26, max = 3 }: { people: Person[]; size?: number; max?: number }) {
  if (!people.length) {
    return (
      <span className="grid place-items-center rounded-full border border-dashed border-neutral-300 text-[10px] text-neutral-400" style={{ width: size, height: size }} title="Nobody yet">
        ?
      </span>
    );
  }
  const shown = people.slice(0, max);
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <span key={p.id} title={p.name} className="rounded-full ring-2 ring-white">
          <Avatar name={p.name} size={size} />
        </span>
      ))}
      {people.length > max && (
        <span className="grid place-items-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-600 ring-2 ring-white" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  const m = priorityMeta(priority);
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.chip}`}>{m.label}</span>;
}

export function ProgressRing({ value, size = 64, stroke = 7 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-neutral-200" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} className="stroke-orange-500 transition-all duration-500" />
      </svg>
      <span className="absolute text-sm font-bold text-neutral-900">{value}%</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200/70 ${className}`} />;
}

// Everyone on the team as tap-to-select chips (a list is friendlier than a dropdown inside a modal or drawer).
export function PeopleChips({ people, value, onChange, disabled }: { people: Person[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  if (!people.length) return <p className="text-sm text-neutral-400">No one on the team yet.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => {
        const on = value.includes(p.id);
        return (
          <button key={p.id} type="button" disabled={disabled} onClick={() => toggle(p.id)} aria-pressed={on} className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm transition ${on ? "bg-orange-500/15 font-semibold text-orange-700 ring-1 ring-orange-400" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"} ${disabled ? "cursor-default opacity-80" : ""}`}>
            <Avatar name={p.name} size={24} />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
