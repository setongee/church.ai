"use client";

import { useState } from "react";
import { Check, ChevronDown, Undo2, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useCached } from "@/lib/queries";
import { approveSubmission, COLLECTION_LABEL, getSubmission, listSubmissions, rejectSubmission, withdrawSubmission, type Submission, type SubmissionBrief, type SubmissionStatus } from "@/lib/review";
import { mediaSrc } from "@/lib/present";

const STATUS: Record<SubmissionStatus, { label: string; cls: string }> = {
  pending: { label: "Waiting for review", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Published", cls: "bg-green-100 text-green-800" },
  rejected: { label: "Sent back", cls: "bg-red-100 text-red-700" },
  withdrawn: { label: "Withdrawn", cls: "bg-neutral-200 text-neutral-600" },
};
const VERB = { POST: "New", PUT: "Edited", DELETE: "Removed" } as const;
const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// What a change contains, in words a reviewer can scan.
function peek(body: Record<string, unknown> | null) {
  if (!body) return "";
  const c = body.create as { width?: number; height?: number } | undefined;
  if (c?.width) return `${c.width} × ${c.height}`;
  const items = body.items as unknown[] | undefined;
  if (Array.isArray(items)) return `${items.length} item${items.length === 1 ? "" : "s"} in the order of service`;
  const s = body.settings as { wrapperId?: string } | undefined;
  if (s?.wrapperId) return "uses a wrapper";
  return ["lyrics", "text", "reference"].map((k) => body[k]).find((v) => typeof v === "string" && v)?.toString().slice(0, 140) ?? "";
}

export default function ReviewPage() {
  const { user } = useAuth();
  const admin = Boolean(user?.isAdmin);
  const [filter, setFilter] = useState<SubmissionStatus | "all">(admin ? "pending" : "all");
  const { data, reload, error: loadError } = useCached<SubmissionBrief[]>(["submissions", filter], () => listSubmissions(filter === "all" ? undefined : filter));
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    await reload();
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Review</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
        {admin ? "Schedules, backgrounds, songs, texts and wrappers that presenters made on their own devices. Accept one to publish it to the live screen." : "What you sent for approval. Your own changes stay on your device until an admin accepts them."}
      </p>

      <div role="tablist" className="mt-5 inline-flex flex-wrap gap-1 rounded-full bg-neutral-100 p-1">
        {(["pending", "approved", "rejected", "all"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${filter === k ? "bg-white text-orange-600 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}>
            {k === "pending" ? "Waiting" : k === "approved" ? "Published" : k === "rejected" ? "Sent back" : "All"}
          </button>
        ))}
      </div>

      {(error || loadError) && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || loadError?.message}</p>}

      <ul className="mt-6 space-y-3">
        {(data ?? []).map((s) => (
          <Row key={s._id} s={s} admin={admin} me={user?._id} open={open === s._id} onToggle={() => setOpen(open === s._id ? null : s._id)} act={act} />
        ))}
        {data && !data.length && <li className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-400">{filter === "pending" ? "Nothing is waiting for review." : "Nothing here yet."}</li>}
      </ul>
    </main>
  );
}

function Row({ s, admin, me, open, onToggle, act }: { s: SubmissionBrief; admin: boolean; me?: string; open: boolean; onToggle: () => void; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [note, setNote] = useState("");
  const { data: detail } = useCached<Submission>(["submission", s._id], () => getSubmission(s._id), { enabled: open });
  const pending = s.status === "pending";
  return (
    <li className="rounded-2xl bg-white">
      <button onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900">{s.title}</p>
          <p className="text-xs text-neutral-500">
            {admin && s.author ? `${s.author.name} · ` : ""}
            {when(s.createdAt)} · {s.counts.added} new, {s.counts.changed} edited, {s.counts.removed} removed
          </p>
        </div>
        <span className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
          <ChevronDown size={16} className={`text-neutral-400 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-neutral-100 p-4">
          {s.note && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">“{s.note}”</p>}
          {pending && s.applied > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{s.applied} of {s.counts.total} changes are already live. Accepting again carries on from the one that stopped.</p>}
          {s.reviewNote && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Reviewer: {s.reviewNote}</p>}
          {!detail ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {detail.ops.map((o, i) => {
                const file = detail.files.find((f) => f.tempId === o.tempId);
                const exported = (o.body?.export as { dataUrl?: string } | undefined)?.dataUrl;
                return (
                  <li key={i} className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3 text-sm">
                    {exported && <img src={exported} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                    {file && file.type !== "file" && (file.type === "video" ? <video src={mediaSrc(file.url)} className="h-14 w-24 rounded-lg object-cover" muted /> : <img src={mediaSrc(file.url)} alt="" className="h-14 w-24 rounded-lg object-cover" />)}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900">
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${o.method === "POST" ? "bg-green-100 text-green-700" : o.method === "PUT" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>{VERB[o.method]}</span>
                        {COLLECTION_LABEL[o.collection] ?? o.collection} · {o.label}
                      </p>
                      {peek(o.body) && <p className="mt-0.5 truncate text-xs text-neutral-500">{peek(o.body)}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {admin && pending && (
            <div className="mt-4 space-y-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note back to them (optional)" className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900" />
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => act(() => rejectSubmission(s._id, note))} className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"><X size={15} /> Send back</button>
                <button onClick={() => window.confirm(`Publish “${s.title}” to the live screen?`) && act(() => approveSubmission(s._id, note))} className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700"><Check size={15} /> Accept &amp; publish</button>
              </div>
            </div>
          )}
          {!admin && pending && s.author?._id === me && (
            <div className="mt-4 flex justify-end">
              <button onClick={() => act(() => withdrawSubmission(s._id))} className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"><Undo2 size={15} /> Withdraw</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
