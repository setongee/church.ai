"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, Loader2, Zap } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Field, Modal, btnGhost, btnPrimary, inputCls } from "@/components/present/ui";
import { DEFAULT_POST_TIME, addDays, contentByUpload, createContent, dayKey, fmtWhen, fromParts, scheduleContent, timeKey, tzLabel, updateContent, type ContentItem } from "@/lib/content";

// "Add to calendar" from Upload & post: puts this upload on the content calendar, optionally with a time to post by itself.
export function ScheduleUploadModal({ upload, caption, onClose }: { upload: { _id: string; title: string; kind: "video" | "image" }; caption: string; onClose: () => void }) {
  const { user } = useAuth();
  const [existing, setExisting] = useState<ContentItem | null | undefined>(undefined); // undefined = still looking
  const [title, setTitle] = useState(upload.title);
  const [campaign, setCampaign] = useState("");
  const [date, setDate] = useState(dayKey(addDays(new Date(), 1)));
  const [time, setTime] = useState(DEFAULT_POST_TIME);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<ContentItem | null>(null);

  useEffect(() => {
    contentByUpload(upload._id)
      .then((item) => {
        setExisting(item);
        if (item) {
          setTitle(item.title);
          setCampaign(item.campaign);
          if (item.scheduledAt) {
            const at = new Date(item.scheduledAt);
            setDate(dayKey(at));
            setTime(timeKey(at));
          }
        }
      })
      .catch(() => setExisting(null));
  }, [upload._id]);

  const when = () => fromParts(date, time).toISOString();

  async function go(schedule: boolean) {
    setBusy(schedule ? "schedule" : "draft");
    setError("");
    try {
      const base = { title: title.trim(), caption, campaign, format: upload.kind === "video" ? ("reel" as const) : ("post" as const), platform: "instagram" as const };
      let item = existing ? await updateContent(existing._id, { ...base, scheduledAt: date ? when() : null }) : await createContent({ ...base, upload: upload._id, owners: user ? [user._id] : [], scheduledAt: date ? when() : null });
      if (schedule) item = await scheduleContent(item._id, { scheduledAt: when(), caption });
      else if (!existing && item.status !== "ready") item = await updateContent(item._id, { status: "ready" });
      setDone(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
    }
    setBusy("");
  }

  const wasScheduled = existing?.status === "scheduled";
  return (
    <Modal title={existing ? "On the content calendar" : "Add to the content calendar"} guard onClose={() => !busy && onClose()}>
      {done ? (
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[rgba(22,163,74,0.14)] text-[#16a34a]">
            <Check size={24} />
          </span>
          <p className="mt-3 text-base font-semibold text-neutral-900">{done.status === "scheduled" ? "Scheduled" : "Saved to the calendar"}</p>
          <p className="mt-1 text-sm text-neutral-500">{done.status === "scheduled" && done.scheduledAt ? `It will post to Instagram by itself on ${fmtWhen(done.scheduledAt)}.` : "You can schedule it from the calendar whenever you’re ready."}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={onClose} className={btnGhost}>
              Close
            </button>
            <Link href={`/calendar?item=${done._id}`} className={btnPrimary}>
              <CalendarClock size={15} /> Open in calendar
            </Link>
          </div>
        </div>
      ) : existing === undefined ? (
        <p className="py-6 text-center text-sm text-neutral-400">Checking the calendar…</p>
      ) : existing?.status === "published" ? (
        <p className="text-sm text-neutral-600">This one has already been posted.</p>
      ) : (
        <div className="space-y-4">
          {existing && <p className="rounded-xl bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-600">It’s already on the calendar{wasScheduled && existing.scheduledAt ? `, scheduled for ${fmtWhen(existing.scheduledAt)}` : ""}. Changing it here updates that entry.</p>}
          <Field label="Title on the calendar">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-neutral-400">Your time zone{tzLabel() ? ` (${tzLabel()})` : ""}. Scheduled posts go out automatically at this time.</p>
          <Field label="Campaign (optional)">
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} maxLength={80} placeholder="e.g. Youth Night" className={inputCls} />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => go(false)} disabled={!!busy || !title.trim()} className={btnGhost}>
              {busy === "draft" ? <Loader2 size={15} className="animate-spin" /> : null} {existing ? "Save changes" : "Save without posting"}
            </button>
            <button onClick={() => go(true)} disabled={!!busy || !title.trim() || !date || !caption.trim()} className={btnPrimary} title={!caption.trim() ? "Write a caption first" : undefined}>
              {busy === "schedule" ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} {wasScheduled ? "Reschedule" : "Schedule it"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
