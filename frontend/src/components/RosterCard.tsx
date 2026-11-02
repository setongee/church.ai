"use client";

import { useEffect, useState } from "react";
import { Layers, Mail, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { TEAM_ROLES, type TeamRole } from "@/lib/auth";
import {
  getRoster,
  listTeam,
  notifyRoster,
  saveRoster,
  type Roster,
  type RosterSession,
  type TeamMember,
} from "@/lib/team";

type Pick = Record<TeamRole, string[]>;
const empty = (): Pick => ({
  presenter: [],
  design: [],
  audio: [],
  manager: [],
  social: [],
});

// A job is given either for the whole service (scope "all") or for one of its sessions (the session's id).
const ALL = "all";
const PRESETS = ["Praise & Worship", "Word", "Prayer", "Altar call"];
const newId = () => `new_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const told = (role: TeamRole, userId: string, scope: string) => `${role}:${userId}:${scope}`;

// Who is doing what for this service, and for which part of it. Admins edit it and can email everyone their assignments.
export function RosterCard({ serviceId }: { serviceId: string }) {
  const { user } = useAuth();
  const admin = Boolean(user?.isAdmin);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [sessions, setSessions] = useState<RosterSession[]>([]);
  const [picks, setPicks] = useState<Record<string, Pick>>({ [ALL]: empty() });
  const [scope, setScope] = useState(ALL);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [note, setNote] = useState("");
  const [notifiedAt, setNotifiedAt] = useState<string | null>(null);
  const [toldKeys, setToldKeys] = useState<Set<string>>(new Set()); // "role:userId:scope" already emailed
  const [emailOk, setEmailOk] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Puts what the server holds on screen (on load, and after a save, when new sessions get their real ids).
  function apply(r: Roster) {
    const p: Record<string, Pick> = { [ALL]: empty() };
    for (const s of r.sessions) p[s.id] = empty();
    for (const a of r.assignments) (p[a.sessionId ?? ALL] ??= empty())[a.role].push(a.user._id);
    setSessions(r.sessions);
    setPicks(p);
    setScope((cur) => (cur === ALL || r.sessions.some((s) => s.id === cur) ? cur : ALL));
    setToldKeys(new Set(r.assignments.filter((a) => a.notified).map((a) => told(a.role, a.user._id, a.sessionId ?? ALL))));
    setNote(r.note);
    setNotifiedAt(r.notifiedAt);
    setEmailOk(r.emailConfigured);
  }

  useEffect(() => {
    Promise.all([getRoster(serviceId), listTeam()])
      .then(([r, t]) => {
        apply(r);
        setTeam(t);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [serviceId]);

  const scopes = [ALL, ...sessions.map((s) => s.id)];
  const countIn = (sc: string) => TEAM_ROLES.reduce((n, r) => n + (picks[sc]?.[r.id].length ?? 0), 0);
  const total = scopes.reduce((n, sc) => n + countIn(sc), 0);
  const newCount = scopes.reduce((n, sc) => n + TEAM_ROLES.reduce((m, r) => m + (picks[sc]?.[r.id] ?? []).filter((id) => !toldKeys.has(told(r.id, id, sc))).length, 0), 0);
  const nameOf = (id: string) => team.find((m) => m._id === id)?.name ?? "Unknown";
  const here = picks[scope] ?? empty();
  const sessionName = sessions.find((s) => s.id === scope)?.name;

  const change = (role: TeamRole, ids: string[]) => {
    setPicks((p) => ({ ...p, [scope]: { ...(p[scope] ?? empty()), [role]: ids } }));
    setDirty(true);
  };

  function addSession(raw: string) {
    const name = raw.trim().slice(0, 60);
    if (!name) return;
    const existing = sessions.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setScope(existing.id);
    } else {
      const id = newId();
      setSessions((cur) => [...cur, { id, name }]);
      setPicks((p) => ({ ...p, [id]: empty() }));
      setScope(id);
      setDirty(true);
    }
    setNewName("");
    setAdding(false);
  }
  function renameSession(id: string) {
    const cur = sessions.find((s) => s.id === id);
    const name = window.prompt("Rename this session", cur?.name)?.trim().slice(0, 60);
    if (!name || name === cur?.name) return;
    if (sessions.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) return setMsg({ ok: false, text: "There is already a session with that name." });
    setSessions((list) => list.map((s) => (s.id === id ? { ...s, name } : s)));
    setDirty(true);
  }
  function removeSession(id: string) {
    const s = sessions.find((x) => x.id === id);
    const people = countIn(id);
    if (people && !window.confirm(`Remove “${s?.name}”? ${people === 1 ? "The 1 job" : `The ${people} jobs`} given for it will be removed too.`)) return;
    setSessions((list) => list.filter((x) => x.id !== id));
    setPicks((p) => {
      const { [id]: gone, ...rest } = p;
      void gone;
      return rest;
    });
    setScope(ALL);
    setDirty(true);
  }

  async function save(mode: "save" | "new" | "all") {
    const andEmail = mode !== "save";
    setBusy(mode);
    setMsg(null);
    try {
      const assignments = scopes.flatMap((sc) => TEAM_ROLES.flatMap((r) => (picks[sc]?.[r.id] ?? []).map((userId) => ({ role: r.id, userId, sessionId: sc === ALL ? null : sc }))));
      const saved = await saveRoster(serviceId, { sessions, assignments, note });
      apply(saved);
      setDirty(false);
      if (andEmail) {
        const r = await notifyRoster(serviceId, mode === "all");
        apply(await getRoster(serviceId));
        const failed = r.results.filter((x) => !x.ok);
        setMsg(
          failed.length
            ? { ok: false, text: `Emailed ${r.results.length - failed.length}; couldn’t reach ${failed.map((f) => f.name).join(", ")}.` }
            : { ok: true, text: `Emailed ${r.results.length} ${r.results.length === 1 ? "person" : "people"} their assignments.` },
        );
      } else setMsg({ ok: true, text: "Roster saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    }
    setBusy("");
  }

  // The whole-service team, shown on a session's page so it's clear they are on it too.
  const wholeService = TEAM_ROLES.map((r) => ({ label: r.label, names: (picks[ALL]?.[r.id] ?? []).map(nameOf) })).filter((x) => x.names.length);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium text-neutral-900">Team roster</h2>
        {notifiedAt && <span className="text-xs text-neutral-400">Last emailed {new Date(notifiedAt).toLocaleString()}</span>}
      </div>

      {/* Whole service, or one session of it */}
      <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Roster scope">
        {scopes.map((sc) => {
          const label = sc === ALL ? "Whole service" : (sessions.find((s) => s.id === sc)?.name ?? "");
          const on = sc === scope;
          return (
            <button key={sc} role="tab" aria-selected={on} onClick={() => setScope(sc)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${on ? "bg-orange-600 text-[#ffffff]" : "bg-white text-neutral-600 hover:text-orange-600"}`}>
              {sc === ALL && <Layers size={14} />}
              {label}
              <span className={`rounded-full px-1.5 text-[11px] font-semibold ${on ? "bg-[rgba(255,255,255,0.25)]" : "bg-neutral-100 text-neutral-500"}`}>{countIn(sc)}</span>
            </button>
          );
        })}
        {admin &&
          (adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addSession(newName);
              }}
              className="flex items-center gap-1.5"
            >
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Session name" maxLength={60} className="w-40 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-sm outline-none focus:border-neutral-900" />
              <button className="rounded-full bg-neutral-900 px-3.5 py-1.5 text-sm font-semibold text-[#ffffff]">Add</button>
              <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100">
                <X size={15} />
              </button>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-500 hover:border-orange-400 hover:text-orange-600">
              <Plus size={14} /> Add session
            </button>
          ))}
      </div>
      {admin && adding && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          Quick add:
          {PRESETS.filter((p) => !sessions.some((s) => s.name.toLowerCase() === p.toLowerCase())).map((p) => (
            <button key={p} onClick={() => addSession(p)} className="rounded-full bg-white px-2.5 py-1 font-medium text-neutral-600 hover:text-orange-600">
              {p}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        {scope === ALL ? (
          sessions.length ? (
            <>These jobs cover the <b>whole service</b>, so those people are on every session. To give a job to different people in different parts (say, who presents Praise and who presents the Word), choose a session above.</>
          ) : (
            <>Everyone here is on the <b>whole service</b>. {admin ? "Add a session (Praise & Worship, Word, …) to give jobs for just one part of it." : ""}</>
          )
        ) : (
          <>
            Jobs for <b>{sessionName}</b> only.
            {wholeService.length > 0 && <> The whole-service team is on it too: {wholeService.map((w) => `${w.label} (${w.names.join(", ")})`).join(" · ")}.</>}
          </>
        )}
        {admin && scope !== ALL && (
          <span className="ml-2 inline-flex gap-2">
            <button onClick={() => renameSession(scope)} className="inline-flex items-center gap-1 font-semibold text-neutral-600 hover:text-orange-600">
              <Pencil size={11} /> Rename
            </button>
            <button onClick={() => removeSession(scope)} className="font-semibold text-neutral-500 hover:text-red-600">
              Remove session
            </button>
          </span>
        )}
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {TEAM_ROLES.map((r) => {
          const ids = here[r.id];
          const options = team.filter((m) => !ids.includes(m._id));
          return (
            <div key={r.id} className="rounded-xl bg-white p-6">
              <p className="text-sm font-semibold text-neutral-900">{r.label}</p>
              <p className="mb-2 text-xs text-neutral-400">{r.hint}</p>
              <div className="flex min-h-7 flex-wrap gap-1.5">
                {ids.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                    {nameOf(id)}
                    {admin && (
                      <button
                        onClick={() =>
                          change(
                            r.id,
                            ids.filter((x) => x !== id),
                          )
                        }
                        aria-label={`Remove ${nameOf(id)}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
                {!ids.length && <span className="text-xs text-neutral-400">Nobody yet</span>}
              </div>
              {admin && (
                <select value="" onChange={(e) => e.target.value && change(r.id, [...ids, e.target.value])} className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-600">
                  <option value="">+ Add someone…</option>
                  {options.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
      {admin && (
        <div className="mt-5 rounded-xl bg-white p-4">
          <input
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
            placeholder="Note included in the email (optional) — e.g. call time"
            className="w-full rounded-lg bg-gray-100/70 px-3 py-3 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {newCount > 0 || !notifiedAt ? (
              <button
                onClick={() => save("new")}
                disabled={!!busy || !emailOk || total === 0}
                title={emailOk ? "" : "Set the SMTP_* or MULTITEXTER_* values in backend/.env to enable messages"}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50"
              >
                <Mail size={15} /> {busy === "new" ? "Sending…" : notifiedAt ? `Save & notify ${newCount} new` : "Save & notify team"}
              </button>
            ) : null}
            {notifiedAt && (
              <button onClick={() => save("all")} disabled={!!busy || !emailOk || total === 0} className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                <Mail size={15} /> {busy === "all" ? "Sending…" : "Notify everyone again"}
              </button>
            )}
            <button onClick={() => save("save")} disabled={!!busy || !dirty} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
              {busy === "save" ? "Saving…" : "Save only"}
            </button>
            {!emailOk && <span className="text-xs text-amber-700">Email and SMS aren’t set up on the server yet.</span>}
          </div>
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
    </section>
  );
}
