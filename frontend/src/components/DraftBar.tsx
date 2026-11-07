"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CloudOff, Send } from "lucide-react";
import { Modal } from "@/components/present/ui";
import { discardDrafts, listDraftOps, submitDrafts, useDraftCount } from "@/lib/draft";
import { COLLECTION_LABEL } from "@/lib/review";

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900";

// Shown to anyone whose Present changes are kept on their own device: how much is waiting, and the way to send it
// to an admin for review.
export function DraftBar() {
  useDraftCount(); // re-render as changes are made
  const count = listDraftOps().length;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!count || pathname.startsWith("/present/output") || pathname === "/review") return null;
  const ops = listDraftOps();
  const kinds = [...new Set(ops.map((o) => COLLECTION_LABEL[o.collection] ?? o.collection))];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await submitDrafts({ title, note });
      setOpen(false);
      setTitle("");
      setNote("");
      router.push("/review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-200 bg-white py-2 pl-4 pr-2 shadow-xl">
        <CloudOff size={16} className="shrink-0 text-amber-600" />
        <p className="min-w-0 truncate text-sm text-neutral-700">
          <b>{count}</b> change{count === 1 ? "" : "s"} on this device only
        </p>
        <button onClick={() => window.confirm("Throw away everything you changed on this device?") && void discardDrafts()} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100">
          Discard
        </button>
        <button onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
          <Send size={14} /> Send for review
        </button>
      </div>
      {open && (
        <Modal title="Send for review" guard onClose={() => !busy && setOpen(false)}>
          <form onSubmit={send} className="space-y-3">
            <p className="text-sm text-neutral-600">An admin will look through your changes and, if they’re happy, publish them to the live screen. They stay on this device until then.</p>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this? e.g. Sunday 12 Oct service" required className={field} />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the reviewer should know (optional)" rows={3} className={field} />
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
              {ops.map((o, i) => (
                <li key={i}>
                  <b>{o.method === "POST" ? "New" : o.method === "PUT" ? "Edited" : "Removed"}</b> {COLLECTION_LABEL[o.collection] ?? o.collection} — {o.label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-400">Covers: {kinds.join(", ")}</p>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button disabled={busy} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
