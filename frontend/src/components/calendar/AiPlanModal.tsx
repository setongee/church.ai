"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, CheckCircle2, Loader2, RefreshCw, Sparkles, Trash2, Users, X } from "lucide-react";
import { Avatar } from "@/components/notify/ToastHost";
import { FORMAT_LABEL, PLATFORM_LABEL, aiPlanContent, aiPlanOne, bulkCreateContent, campaignColor, type ContentFormat, type ContentPlatform, type Person, type PlanItem, type ServiceFocus } from "@/lib/content";

type Row = PlanItem & { key: string; on: boolean; owners: string[]; busy?: boolean; open?: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parse = (s: string) => new Date(`${s}T12:00:00`);
const nextMonday = () => {
  const t = new Date();
  return addDays(new Date(t.getFullYear(), t.getMonth(), t.getDate()), ((8 - t.getDay()) % 7) || 7);
};
const weekOf = (s: string) => {
  const d = parse(s);
  return addDays(d, -((d.getDay() + 6) % 7));
};
const nice = (d: Date, withYear = false) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

const GOALS: { label: string; campaign: string; text: string }[] = [
  { label: "Church engagement", campaign: "Church Engagement", text: "Grow engagement with our church family online: more comments, shares and conversations, and help members feel connected between Sundays." },
  { label: "Programme / event drive", campaign: "Programme Drive", text: "Promote our upcoming programme: build awareness and excitement, share the details, count down to the day, and drive registrations and attendance. (Programme name, date and venue: …)" },
  { label: "Word growth", campaign: "Word Growth", text: "Help members grow in the Word: daily scripture, Bible-reading habits, midweek Bible study invitations, and testimonies of life change." },
  { label: "Invite & outreach", campaign: "Invite a Friend", text: "Make it easy for members to invite friends and for newcomers to find us: warm invitations, what to expect on Sunday, and stories of belonging." },
  { label: "Giving & serving", campaign: "Serve & Give", text: "Encourage generosity and serving: stories of impact, ways to give and volunteer, and thanks to our teams." },
  { label: "Youth & special month", campaign: "Special Month", text: "A themed month for our youth/women/men: a different focus each week, real stories, and an event to rally around. (Theme and dates: …)" },
];
// What to make from a service message.
const FOCUS: { id: ServiceFocus; label: string; hint: string }[] = [
  { id: "recap", label: "Service recap", hint: "The big idea and the moments that landed, for people who missed it" },
  { id: "growth", label: "Word-growth actions", hint: "Practical points turned into things to do this week: read, journal, memorise, try" },
  { id: "context", label: "Context & background", hint: "The setting and meaning behind the message, so it lands better" },
];
const MIN_EXCERPT = 80;
const MAX_EXCERPT = 12000;
const LENGTHS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "4 weeks", days: 28 },
  { label: "6 weeks", days: 42 },
  { label: "3 months", days: 91 },
];
const TONES = ["Warm", "Bold", "Playful", "Reflective", "Youthful", "Formal"];
const FORMATS: ContentFormat[] = ["post", "reel", "carousel", "story", "video"];
const PLATFORMS: ContentPlatform[] = ["instagram", "facebook", "youtube", "tiktok"];

const field = "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-500/10";
const chip = (on: boolean) => `rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${on ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`;
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500";

export function AiPlanModal({ team, isAdmin, onClose, onAdded }: { team: Person[]; isAdmin: boolean; onClose: () => void; onAdded: (firstDate: string | null) => void }) {
  const [step, setStep] = useState<"brief" | "writing" | "review" | "done">("brief");
  const [brief, setBrief] = useState("");
  const [excerpt, setExcerpt] = useState(""); // a service message pasted or typed in
  const [focus, setFocus] = useState<ServiceFocus[]>(["recap", "growth", "context"]);
  const [campaign, setCampaign] = useState("");
  const [start, setStart] = useState(() => ymd(nextMonday()));
  const [days, setDays] = useState(28);
  const [perWeek, setPerWeek] = useState(4);
  const [formats, setFormats] = useState<ContentFormat[]>(["post", "reel", "carousel", "story"]);
  const [platforms, setPlatforms] = useState<ContentPlatform[]>(["instagram"]);
  const [tone, setTone] = useState("Warm");
  const [error, setError] = useState("");

  const [summary, setSummary] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [chosen, setChosen] = useState<string[]>([]); // people picked for "assign"
  const [makeTasks, setMakeTasks] = useState(false);
  const [sprintName, setSprintName] = useState("");
  const [daysBefore, setDaysBefore] = useState(2);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; tasks: number; sprint: { id: string; name: string } | null; firstDate: string | null } | null>(null);

  const end = ymd(addDays(parse(start), days - 1));
  const totalPosts = Math.max(1, Math.round((days / 7) * perWeek));
  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void, min = 1) => set(list.includes(v) ? (list.length > min ? list.filter((x) => x !== v) : list) : [...list, v]);

  async function write() {
    setError("");
    const hasExcerpt = excerpt.trim().length > 0;
    if (hasExcerpt && excerpt.trim().length < MIN_EXCERPT) return setError("Paste a little more of the service — a few sentences at least — so the AI has something to work from.");
    if (!hasExcerpt && brief.trim().length < 10) return setError("Tell the AI a little more about what you want — a sentence or two is enough — or paste in a service message.");
    setStep("writing");
    try {
      const r = await aiPlanContent({ brief: brief.trim(), serviceExcerpt: excerpt.trim() || undefined, serviceFocus: excerpt.trim() ? focus : undefined, startDate: start, endDate: end, postsPerWeek: perWeek, formats, platforms, tone, campaign: campaign.trim() || undefined });
      setSummary(r.summary);
      setRows(r.items.map((it, i) => ({ ...it, key: `${i}-${it.date}-${it.title}`, on: true, owners: [] })));
      setSprintName(campaign.trim() ? `${campaign.trim()} · ${nice(parse(start))} – ${nice(parse(end))}` : `Content plan · ${nice(parse(start))} – ${nice(parse(end))}`);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t write the calendar.");
      setStep("brief");
    }
  }

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  async function another(r: Row) {
    patch(r.key, { busy: true });
    try {
      const { item } = await aiPlanOne({ brief: brief.trim(), serviceExcerpt: excerpt.trim() || undefined, serviceFocus: excerpt.trim() ? focus : undefined, campaign: campaign.trim() || undefined, date: r.date, format: r.format, platform: r.platform, tone, avoid: rows.map((x) => x.title) });
      patch(r.key, { title: item.title, caption: item.caption, notes: item.notes, theme: item.theme, time: item.time, busy: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t get another idea.");
      patch(r.key, { busy: false });
    }
  }

  const picked = rows.filter((r) => r.on);
  const weeks = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) map.set(ymd(weekOf(r.date)), [...(map.get(ymd(weekOf(r.date))) ?? []), r]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  // Hands the work out: everyone chosen on every selected post, or shared evenly one by one.
  const assignAll = () => setRows((rs) => rs.map((r) => (r.on ? { ...r, owners: [...chosen] } : r)));
  const share = () => {
    let i = 0;
    setRows((rs) => rs.map((r) => (r.on && chosen.length ? { ...r, owners: [chosen[i++ % chosen.length]] } : r)));
  };

  async function save() {
    if (!picked.length) return setError("Pick at least one post to add.");
    setSaving(true);
    setError("");
    try {
      const r = await bulkCreateContent({
        campaign: campaign.trim(),
        items: picked.map((p) => ({ title: p.title, caption: p.caption, notes: p.notes, theme: p.theme, format: p.format, platform: p.platform, scheduledAt: new Date(`${p.date}T${p.time}:00`).toISOString(), owners: p.owners })),
        tasks: isAdmin && makeTasks ? { name: sprintName.trim() || "Content plan", startDate: start, endDate: end, goal: (brief.trim() || "Posts from the service message").slice(0, 300), dueDaysBefore: daysBefore } : undefined,
      });
      setResult({ created: r.created, tasks: r.tasks, sprint: r.sprint, firstDate: picked.map((p) => p.date).sort()[0] ?? null });
      setStep("done");
      onAdded(picked.map((p) => p.date).sort()[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t add them.");
    }
    setSaving(false);
  }

  const person = (id: string) => team.find((t) => t._id === id);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && step !== "writing" && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Plan with AI" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4 sm:px-7">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-[#ffffff]">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-neutral-900">Plan with AI</h2>
            <p className="text-xs text-neutral-500">{step === "brief" ? "Describe what you need — the AI drafts the calendar, you stay in charge" : step === "writing" ? "Writing your calendar…" : step === "review" ? "Review, edit and hand out the work" : "All set"}</p>
          </div>
          <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
            {["brief", "review", "done"].map((s, i) => (
              <span key={s} className={`h-1.5 w-8 rounded-full ${["brief", "writing", "review", "done"].indexOf(step) >= (i === 0 ? 0 : i + 1) ? "bg-orange-500" : "bg-neutral-200"}`} />
            ))}
          </div>
          {step !== "writing" && !saving && (
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100">
              <X size={18} />
            </button>
          )}
        </div>

        {/* 1. the brief */}
        {step === "brief" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            {/* A service message to build the week from */}
            <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
              <span className={label}>From a service (optional)</span>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value.slice(0, MAX_EXCERPT))}
                rows={6}
                placeholder="Paste or type the message, your notes or part of the transcript. The AI turns it into the week's posts: a recap, practical word-growth actions, and the context behind it."
                className={`${field} bg-white`}
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                <span>{excerpt.trim() ? "The posts are built from this text and nothing is added to what was said." : "Leave empty to plan from a goal alone."}</span>
                <span className={excerpt.length > MAX_EXCERPT - 500 ? "font-semibold text-amber-700" : ""}>
                  {excerpt.length.toLocaleString()} / {MAX_EXCERPT.toLocaleString()}
                </span>
              </div>
              {excerpt.trim() && (
                <div className="mt-3">
                  <span className={label}>Make from it</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {FOCUS.map((f) => {
                      const on = focus.includes(f.id);
                      return (
                        <button key={f.id} type="button" onClick={() => toggle(focus, f.id, setFocus)} aria-pressed={on} className={`rounded-xl border p-3 text-left transition ${on ? "border-orange-400 bg-white" : "border-neutral-200 bg-white/60 hover:bg-white"}`}>
                          <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                            <span className={`grid h-4 w-4 place-items-center rounded border ${on ? "border-orange-600 bg-orange-600 text-[#ffffff]" : "border-neutral-300"}`}>{on && <Check size={11} />}</span>
                            {f.label}
                          </span>
                          <span className="mt-1 block text-xs text-neutral-500">{f.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <span className={label}>{excerpt.trim() ? "Anything else the AI should know? (optional)" : "What do you want this calendar to achieve?"}</span>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {GOALS.map((g) => (
                <button
                  key={g.label}
                  onClick={() => {
                    setBrief((b) => (b.trim() ? `${b.trim()}\n\n${g.text}` : g.text));
                    if (!campaign.trim()) setCampaign(g.campaign);
                  }}
                  className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                >
                  + {g.label}
                </button>
              ))}
            </div>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} maxLength={3000} placeholder="e.g. Our Harvest Sunday is on 22 November. Help us get members reading their Bibles daily, joining midweek Bible study, and inviting friends. Warm and youth-friendly." className={field} />
            <p className="mt-1 text-xs text-neutral-400">The more you say about events, dates and your people, the better the plan. You can edit everything before it’s added.</p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <span className={label}>Campaign name (optional)</span>
                <input value={campaign} onChange={(e) => setCampaign(e.target.value)} maxLength={80} placeholder="e.g. Word Growth Drive" className={field} />
                <p className="mt-1 text-xs text-neutral-400">Used as the colour group on the calendar.</p>
              </div>
              <div>
                <span className={label}>Starts on</span>
                <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={field} />
              </div>
            </div>

            <div className="mt-5">
              <span className={label}>How long should it run?</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {LENGTHS.map((l) => (
                  <button key={l.days} onClick={() => setDays(l.days)} aria-pressed={days === l.days} className={chip(days === l.days)}>
                    {l.label}
                  </button>
                ))}
                <span className="ml-1 flex items-center gap-2 text-sm text-neutral-500">
                  or until
                  <input type="date" value={end} min={start} onChange={(e) => e.target.value && setDays(Math.min(92, Math.max(1, Math.round((parse(e.target.value).getTime() - parse(start).getTime()) / 86400000) + 1)))} className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-orange-400" />
                </span>
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">
                {nice(parse(start), true)} → {nice(parse(end), true)} · {days} days
              </p>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <span className={label}>
                  Posts per week: <b className="text-neutral-900">{perWeek}</b> <span className="font-normal normal-case text-neutral-400">(about {totalPosts} in total)</span>
                </span>
                <input type="range" min={1} max={14} value={perWeek} onChange={(e) => setPerWeek(+e.target.value)} className="w-full accent-orange-600" aria-label="Posts per week" />
              </div>
              <div>
                <span className={label}>Tone</span>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((t) => (
                    <button key={t} onClick={() => setTone(tone === t ? "" : t)} aria-pressed={tone === t} className={chip(tone === t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <span className={label}>Formats to include</span>
                <div className="flex flex-wrap gap-1.5">
                  {FORMATS.map((f) => (
                    <button key={f} onClick={() => toggle(formats, f, setFormats)} aria-pressed={formats.includes(f)} className={chip(formats.includes(f))}>
                      {FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className={label}>Platforms</span>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map((p) => (
                    <button key={p} onClick={() => toggle(platforms, p, setPlatforms)} aria-pressed={platforms.includes(p)} className={chip(platforms.includes(p))}>
                      {PLATFORM_LABEL[p]}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-neutral-400">Only Instagram posts go out automatically; the rest are plans for the team.</p>
              </div>
            </div>
            {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </div>
        )}

        {/* 2. writing */}
        {step === "writing" && (
          <div className="grid min-h-[22rem] flex-1 place-items-center px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-orange-50 text-orange-600">
                <Loader2 size={26} className="animate-spin" />
              </span>
              <p className="mt-5 text-base font-semibold text-neutral-900">Writing about {totalPosts} posts for {nice(parse(start))} – {nice(parse(end))}…</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">Hooks, captions and production notes for each one. This takes up to a minute for a long calendar — please keep this window open.</p>
            </div>
          </div>
        )}

        {/* 3. review */}
        {step === "review" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {summary && (
              <div className="mx-5 mt-5 rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-900 sm:mx-7">
                <b className="font-semibold">The plan: </b>
                {summary}
              </div>
            )}
            {error && <p className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{error}</p>}

            {team.length > 0 && (
              <div className="mx-5 mt-4 rounded-2xl bg-neutral-50 p-4 sm:mx-7">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  <Users size={15} /> Who’s doing the work?
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {team.map((t) => {
                    const on = chosen.includes(t._id);
                    return (
                      <button key={t._id} onClick={() => setChosen((c) => (on ? c.filter((x) => x !== t._id) : [...c, t._id]))} aria-pressed={on} className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium ${on ? "bg-orange-600 text-[#ffffff]" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}>
                        <Avatar name={t.name} size={24} /> {t.name.split(" ")[0]}
                      </button>
                    );
                  })}
                  <span className="mx-1 hidden h-5 w-px bg-neutral-200 sm:block" />
                  <button onClick={share} disabled={!chosen.length || !picked.length} className="rounded-full bg-[#171717] px-3.5 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-[#404040] disabled:opacity-40">
                    Share evenly
                  </button>
                  <button onClick={assignAll} disabled={!chosen.length || !picked.length} className="rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-neutral-700 disabled:opacity-40">
                    Everyone on every post
                  </button>
                </div>
                <p className="mt-2 text-xs text-neutral-500">Pick people, then share the selected posts out. You can still change any single post below.</p>
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-3 sm:px-7">
              <p className="text-sm text-neutral-600">
                <b className="text-neutral-900">{picked.length}</b> of {rows.length} posts selected
              </p>
              <div className="flex gap-3 text-sm font-semibold text-orange-600">
                <button onClick={() => setRows((rs) => rs.map((r) => ({ ...r, on: true })))}>Select all</button>
                <button onClick={() => setRows((rs) => rs.map((r) => ({ ...r, on: false })))} className="text-neutral-500">
                  None
                </button>
              </div>
            </div>

            <div className="space-y-5 px-5 pb-5 sm:px-7">
              {weeks.map(([wk, list]) => (
                <section key={wk}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Week of {nice(parse(wk))}</h3>
                  <ul className="space-y-2">
                    {list.map((r) => (
                      <li key={r.key} className={`rounded-2xl border bg-white p-3.5 transition ${r.on ? "border-neutral-200" : "border-neutral-100 opacity-50"}`}>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <input type="checkbox" checked={r.on} onChange={(e) => patch(r.key, { on: e.target.checked })} aria-label="Include this post" className="h-4 w-4 accent-orange-600" />
                          <input type="date" value={r.date} min={start} max={end} onChange={(e) => e.target.value && patch(r.key, { date: e.target.value })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 outline-none focus:border-orange-400" />
                          <input type="time" value={r.time} onChange={(e) => e.target.value && patch(r.key, { time: e.target.value })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 outline-none focus:border-orange-400" />
                          <select value={r.format} onChange={(e) => patch(r.key, { format: e.target.value as ContentFormat })} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-800 outline-none focus:border-orange-400">
                            {FORMATS.map((f) => (
                              <option key={f} value={f}>
                                {FORMAT_LABEL[f]}
                              </option>
                            ))}
                          </select>
                          {r.theme && (
                            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#ffffff]" style={{ background: campaignColor(r.theme) }}>
                              {r.theme}
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-1">
                            <select value={r.owners[0] ?? ""} onChange={(e) => patch(r.key, { owners: e.target.value ? [e.target.value] : [] })} aria-label="Who does this" className="max-w-[9rem] rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800 outline-none focus:border-orange-400">
                              <option value="">Unassigned</option>
                              {team.map((t) => (
                                <option key={t._id} value={t._id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            {r.owners.length > 1 && <span className="text-[11px] font-semibold text-neutral-500">+{r.owners.length - 1}</span>}
                            <button onClick={() => void another(r)} disabled={r.busy} title="Try another idea for this day" aria-label="Try another idea" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-orange-600 disabled:opacity-50">
                              <RefreshCw size={15} className={r.busy ? "animate-spin" : ""} />
                            </button>
                            <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} title="Remove" aria-label="Remove this post" className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 size={15} />
                            </button>
                          </span>
                        </div>
                        <input value={r.title} onChange={(e) => patch(r.key, { title: e.target.value })} maxLength={90} aria-label="Title" className="mt-2.5 w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-[15px] font-semibold text-neutral-900 outline-none hover:border-neutral-200 focus:border-orange-400" />
                        {r.owners.length > 0 && (
                          <p className="mt-1 flex flex-wrap items-center gap-1 px-1 text-xs text-neutral-500">
                            {r.owners.map((o) => person(o)?.name.split(" ")[0]).filter(Boolean).join(", ")}
                          </p>
                        )}
                        <button onClick={() => patch(r.key, { open: !r.open })} className="mt-1 px-1 text-xs font-semibold text-orange-600 hover:underline">
                          {r.open ? "Hide caption & notes" : "Show caption & notes"}
                        </button>
                        {r.open && (
                          <div className="mt-2 grid gap-3 md:grid-cols-2">
                            <div>
                              <span className={label}>Caption draft ({r.caption.length}/2200)</span>
                              <textarea value={r.caption} onChange={(e) => patch(r.key, { caption: e.target.value })} rows={6} maxLength={2200} className={field} />
                            </div>
                            <div>
                              <span className={label}>Production notes</span>
                              <textarea value={r.notes} onChange={(e) => patch(r.key, { notes: e.target.value })} rows={6} maxLength={4000} className={field} />
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        {/* 4. done */}
        {step === "done" && result && (
          <div className="grid min-h-[20rem] flex-1 place-items-center px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-700">
                <CheckCircle2 size={34} />
              </span>
              <h3 className="mt-5 text-xl font-semibold text-neutral-900">Your calendar is ready</h3>
              <p className="mt-1.5 text-sm text-neutral-600">
                {result.created} post{result.created === 1 ? "" : "s"} added as ideas for the team to work up.
                {result.sprint && (
                  <>
                    {" "}
                    A sprint <b>“{result.sprint.name}”</b> was created with {result.tasks} task{result.tasks === 1 ? "" : "s"}, and the people you assigned have been told.
                  </>
                )}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button onClick={onClose} className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
                  See it on the calendar
                </button>
                {result.sprint && (
                  <Link href="/board" className="rounded-xl border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700">
                    Open the board
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* footer */}
        {(step === "brief" || step === "review") && (
          <div className="border-t border-neutral-100 bg-white px-5 py-4 sm:px-7">
            {step === "review" && isAdmin && (
              <div className="mb-3 rounded-2xl bg-neutral-50 px-4 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={makeTasks} onChange={(e) => setMakeTasks(e.target.checked)} className="mt-1 h-4 w-4 accent-orange-600" />
                  <span className="text-sm">
                    <b className="text-neutral-900">Also create a sprint with a task for each post</b>
                    <span className="block text-xs text-neutral-500">Each task carries the production notes and draft caption, is given to whoever you assigned, and is due before the post goes out.</span>
                  </span>
                </label>
                {makeTasks && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input value={sprintName} onChange={(e) => setSprintName(e.target.value)} maxLength={120} aria-label="Sprint name" placeholder="Sprint name" className={field} />
                    <select value={daysBefore} onChange={(e) => setDaysBefore(+e.target.value)} aria-label="Due before posting" className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-800 outline-none focus:border-orange-400">
                      {[1, 2, 3, 5, 7].map((n) => (
                        <option key={n} value={n}>
                          Due {n} day{n === 1 ? "" : "s"} before
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              {step === "review" ? (
                <button onClick={() => setStep("brief")} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
                  <ArrowLeft size={16} /> Change the brief
                </button>
              ) : (
                <span className="text-xs text-neutral-400">Nothing is added to the calendar until you approve it.</span>
              )}
              {step === "brief" ? (
                <button onClick={() => void write()} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-[#ffffff] shadow-sm hover:bg-orange-700">
                  <Sparkles size={16} /> Write my calendar
                </button>
              ) : (
                <button onClick={() => void save()} disabled={saving || !picked.length} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-[#ffffff] shadow-sm hover:bg-orange-700 disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Add {picked.length} post{picked.length === 1 ? "" : "s"}
                  {isAdmin && makeTasks ? " & tasks" : ""}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
