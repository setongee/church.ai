"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, CalendarDays, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Field, Modal, btnGhost, btnPrimary, inputCls } from "@/components/present/ui";
import { useCached } from "@/lib/queries";
import { campaignColor, createCampaign, deleteCampaign, draftCampaignWithAi, listCampaignsFull, updateCampaign, type CampaignInfo } from "@/lib/content";

const nice = (d: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const span = (c: { startDate: string; endDate: string }) => (c.startDate && c.endDate ? `${nice(c.startDate)} – ${nice(c.endDate)}` : c.startDate ? `From ${nice(c.startDate)}` : c.endDate ? `Until ${nice(c.endDate)}` : "");

// Create, edit, archive and delete campaigns. A campaign is a theme or series that posts on the calendar belong to; the AI
// can help write one, but nothing here needs it.
export function CampaignsModal({ canWrite, onClose, onChanged, onPlan, onShow }: { canWrite: boolean; onClose: () => void; onChanged: () => void; onPlan: (c: { name: string; goal: string }) => void; onShow: (name: string) => void }) {
  const { data, reload, loading, error } = useCached<CampaignInfo[]>(["campaigns-full"], listCampaignsFull);
  const [form, setForm] = useState<CampaignInfo | "new" | null>(null);
  const [doomed, setDoomed] = useState<CampaignInfo | null>(null);
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const all = data ?? [];
  const live = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);
  const done = async (text?: string) => {
    if (text) setNotice(text);
    await reload();
    onChanged();
  };

  async function toggleArchive(c: CampaignInfo) {
    try {
      await updateCampaign(c._id, { archived: !c.archived });
      await done(c.archived ? `“${c.name}” is active again.` : `“${c.name}” was archived. Its posts stay on the calendar.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn’t change that");
    }
  }

  const card = (c: CampaignInfo) => (
    <li key={c._id} className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: campaignColor(c.name) }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{c.name}</p>
          {span(c) && <p className="text-xs text-neutral-500">{span(c)}</p>}
          {c.goal && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-neutral-600">{c.goal}</p>}
          <p className="mt-1.5 text-xs text-neutral-500">
            {c.posts} post{c.posts === 1 ? "" : "s"}
            {c.published ? ` · ${c.published} posted` : ""}
            {c.scheduled ? ` · ${c.scheduled} scheduled` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button onClick={() => onShow(c.name)} disabled={!c.posts} className={`${btnGhost} !px-2.5 !py-1.5 !text-xs`}>
          <CalendarDays size={13} /> View posts
        </button>
        {canWrite && (
          <>
            {!c.archived && (
              <button onClick={() => onPlan({ name: c.name, goal: c.goal })} className={`${btnGhost} !px-2.5 !py-1.5 !text-xs`}>
                <Sparkles size={13} /> Plan posts with AI
              </button>
            )}
            <button onClick={() => setForm(c)} className={`${btnGhost} !px-2.5 !py-1.5 !text-xs`}>
              <Pencil size={13} /> Edit
            </button>
            <button onClick={() => void toggleArchive(c)} className={`${btnGhost} !px-2.5 !py-1.5 !text-xs`}>
              {c.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {c.archived ? "Restore" : "Archive"}
            </button>
            <button onClick={() => setDoomed(c)} className={`${btnGhost} !px-2.5 !py-1.5 !text-xs !text-red-600 hover:!bg-red-50`}>
              <Trash2 size={13} /> Delete
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <Modal title="Campaigns" wide onClose={onClose}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-sm text-neutral-500">A campaign is a theme or series — Easter, Youth Night, Word Growth. Posts in the same campaign share a colour on the calendar.</p>
        {canWrite && (
          <button onClick={() => setForm("new")} className={btnPrimary}>
            <Plus size={16} /> New campaign
          </button>
        )}
      </div>
      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && !data && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}

      {loading && !data ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-neutral-400"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : live.length === 0 && archived.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">No campaigns yet.{canWrite ? " Create one, then put posts in it from the calendar or let the AI plan them." : ""}</div>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">{live.map(card)}</ul>
      )}

      {archived.length > 0 && (
        <div className="mt-5">
          <button onClick={() => setShowArchived((s) => !s)} className="text-xs font-semibold text-neutral-500 hover:text-neutral-800">
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived && <ul className="mt-3 grid gap-3 opacity-80 sm:grid-cols-2">{archived.map(card)}</ul>}
        </div>
      )}

      {form && (
        <CampaignForm
          campaign={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={async (c, text) => {
            setForm(null);
            await done(text);
            return c;
          }}
          onPlan={(c) => (setForm(null), onPlan(c))}
        />
      )}

      {doomed && (
        <DeleteDialog
          campaign={doomed}
          onClose={() => setDoomed(null)}
          onDone={async (text) => {
            setDoomed(null);
            await done(text);
          }}
        />
      )}
    </Modal>
  );
}

function CampaignForm({ campaign, onClose, onSaved, onPlan }: { campaign: CampaignInfo | null; onClose: () => void; onSaved: (c: CampaignInfo | null, text: string) => Promise<unknown>; onPlan: (c: { name: string; goal: string }) => void }) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [goal, setGoal] = useState(campaign?.goal ?? "");
  const [startDate, setStart] = useState(campaign?.startDate ?? "");
  const [endDate, setEnd] = useState(campaign?.endDate ?? "");
  const [idea, setIdea] = useState("");
  const [angles, setAngles] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "save" | "ai">("");
  const [error, setError] = useState("");

  async function draft() {
    setBusy("ai");
    setError("");
    try {
      const r = await draftCampaignWithAi({ idea, name: name || undefined });
      setName(r.name);
      setGoal(r.goal);
      setAngles(r.angles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI couldn’t write that");
    }
    setBusy("");
  }

  async function save(e: React.FormEvent, thenPlan = false) {
    e.preventDefault();
    setBusy("save");
    setError("");
    try {
      if (campaign) {
        await updateCampaign(campaign._id, { name, goal, startDate, endDate });
        await onSaved(campaign, `“${name}” was saved.`);
      } else {
        await createCampaign({ name, goal, startDate, endDate });
        await onSaved(null, `“${name}” was created.`);
      }
      if (thenPlan) onPlan({ name: name.trim(), goal });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save the campaign");
      setBusy("");
    }
  }

  return (
    <Modal title={campaign ? "Edit campaign" : "New campaign"} guard onClose={() => !busy && onClose()}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="e.g. Easter, Youth Night, Word Growth" className={inputCls} />
        </Field>
        <Field label="What is it for?" hint="Optional. Who it’s for and what it should help them do. The AI uses this when it plans posts for the campaign.">
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={1500} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (optional)">
            <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Ends (optional)">
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="rounded-xl bg-orange-50/60 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700"><Sparkles size={13} /> Need a hand? Optional</p>
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={2} maxLength={1500} placeholder="Describe the idea in a sentence — e.g. “a month leading up to our youth conference, getting teens excited and inviting friends”" className={`${inputCls} mt-2`} />
          <button type="button" onClick={draft} disabled={!!busy || idea.trim().length < 8} className={`${btnGhost} mt-2`}>
            {busy === "ai" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Write the name and goal for me
          </button>
          {angles.length > 0 && (
            <div className="mt-3 text-xs text-neutral-600">
              <p className="font-semibold text-neutral-700">Post angles to start from</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{angles.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={!!busy} className={btnGhost}>
            Cancel
          </button>
          {!campaign && (
            <button type="button" onClick={(e) => void save(e, true)} disabled={!!busy || !name.trim()} className={btnGhost}>
              <Sparkles size={15} /> Create &amp; plan posts with AI
            </button>
          )}
          <button disabled={!!busy || !name.trim()} className={btnPrimary}>
            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : null} {campaign ? "Save changes" : "Create campaign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ campaign, onClose, onDone }: { campaign: CampaignInfo; onClose: () => void; onDone: (text: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unposted = campaign.posts - campaign.published;
  async function go(withPosts: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await deleteCampaign(campaign._id, withPosts);
      await onDone(withPosts ? `“${campaign.name}” and ${r.deleted ?? 0} unposted post${r.deleted === 1 ? "" : "s"} were deleted.` : `“${campaign.name}” was deleted. Its ${r.kept ?? 0} post${r.kept === 1 ? "" : "s"} stay on the calendar.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t delete it");
      setBusy(false);
    }
  }
  return (
    <Modal title={`Delete “${campaign.name}”?`} onClose={() => !busy && onClose()}>
      <p className="text-sm text-neutral-600">
        {campaign.posts === 0 ? "No posts are in this campaign." : `${campaign.posts} post${campaign.posts === 1 ? " is" : "s are"} in this campaign${campaign.published ? ` (${campaign.published} already posted)` : ""}. Choose what happens to ${campaign.posts === 1 ? "it" : "them"}.`}
      </p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex flex-col gap-2">
        <button onClick={() => void go(false)} disabled={busy} className={btnPrimary}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Delete the campaign, keep the posts
        </button>
        {unposted > 0 && (
          <button onClick={() => void go(true)} disabled={busy} className={`${btnGhost} !text-red-600 hover:!bg-red-50`}>
            Delete the campaign and its {unposted} unposted post{unposted === 1 ? "" : "s"}
          </button>
        )}
        <button onClick={onClose} disabled={busy} className={btnGhost}>
          Cancel
        </button>
      </div>
      {unposted > 0 && campaign.published > 0 && <p className="mt-3 text-xs text-neutral-400">Posts already on Instagram are never deleted here.</p>}
    </Modal>
  );
}
