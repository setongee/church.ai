"use client";

import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { TEAM_ROLES, type TeamRole } from "@/lib/auth";
import {
  getRoster,
  listTeam,
  notifyRoster,
  saveRoster,
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

// Who is doing what for this service. Admins edit it and can email everyone their assignments.
export function RosterCard({ serviceId }: { serviceId: string }) {
  const { user } = useAuth();
  const admin = Boolean(user?.isAdmin);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pick, setPick] = useState<Pick>(empty());
  const [note, setNote] = useState("");
  const [notifiedAt, setNotifiedAt] = useState<string | null>(null);
  const [toldKeys, setToldKeys] = useState<Set<string>>(new Set()); // "role:userId" pairs already emailed
  const [emailOk, setEmailOk] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([getRoster(serviceId), listTeam()])
      .then(([r, t]) => {
        const p = empty();
        for (const a of r.assignments) p[a.role].push(a.user._id);
        setToldKeys(
          new Set(
            r.assignments
              .filter((a) => a.notified)
              .map((a) => `${a.role}:${a.user._id}`),
          ),
        );
        setPick(p);
        setNote(r.note);
        setNotifiedAt(r.notifiedAt);
        setEmailOk(r.emailConfigured);
        setTeam(t);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [serviceId]);

  const total = TEAM_ROLES.reduce((n, r) => n + pick[r.id].length, 0);
  const newCount = TEAM_ROLES.reduce(
    (n, r) =>
      n + pick[r.id].filter((id) => !toldKeys.has(`${r.id}:${id}`)).length,
    0,
  );
  const nameOf = (id: string) =>
    team.find((m) => m._id === id)?.name ?? "Unknown";
  const change = (role: TeamRole, ids: string[]) => {
    setPick((p) => ({ ...p, [role]: ids }));
    setDirty(true);
  };

  async function save(mode: "save" | "new" | "all") {
    const andEmail = mode !== "save";
    setBusy(mode);
    setMsg(null);
    try {
      const assignments = TEAM_ROLES.flatMap((r) =>
        pick[r.id].map((userId) => ({ role: r.id, userId })),
      );
      const saved = await saveRoster(serviceId, { assignments, note });
      setDirty(false);
      setNotifiedAt(saved.notifiedAt);
      setToldKeys(
        new Set(
          saved.assignments
            .filter((a) => a.notified)
            .map((a) => `${a.role}:${a.user._id}`),
        ),
      );
      if (andEmail) {
        const r = await notifyRoster(serviceId, mode === "all");
        setNotifiedAt(r.notifiedAt);
        setToldKeys(
          new Set(
            TEAM_ROLES.flatMap((t) => pick[t.id].map((id) => `${t.id}:${id}`)),
          ),
        );
        const failed = r.results.filter((x) => !x.ok);
        setMsg(
          failed.length
            ? {
                ok: false,
                text: `Emailed ${r.results.length - failed.length}; couldn’t reach ${failed.map((f) => f.name).join(", ")}.`,
              }
            : {
                ok: true,
                text: `Emailed ${r.results.length} ${r.results.length === 1 ? "person" : "people"} their assignments.`,
              },
        );
      } else setMsg({ ok: true, text: "Roster saved." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    }
    setBusy("");
  }

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium text-neutral-900">Team roster</h2>
        {notifiedAt && (
          <span className="text-xs text-neutral-400">
            Last emailed {new Date(notifiedAt).toLocaleString()}
          </span>
        )}
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {TEAM_ROLES.map((r) => {
          const ids = pick[r.id];
          const options = team.filter((m) => !ids.includes(m._id));
          return (
            <div key={r.id} className="rounded-xl bg-white p-6">
              <p className="text-sm font-semibold text-neutral-900">
                {r.label}
              </p>
              <p className="mb-2 text-xs text-neutral-400">{r.hint}</p>
              <div className="flex min-h-7 flex-wrap gap-1.5">
                {ids.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700"
                  >
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
                {!ids.length && (
                  <span className="text-xs text-neutral-400">Nobody yet</span>
                )}
              </div>
              {admin && (
                <select
                  value=""
                  onChange={(e) =>
                    e.target.value && change(r.id, [...ids, e.target.value])
                  }
                  className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-600"
                >
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
        <div className="p-4 bg-white rounded-xl mt-5">
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
                title={
                  emailOk
                    ? ""
                    : "Set the SMTP_* or MULTITEXTER_* values in backend/.env to enable messages"
                }
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700 disabled:opacity-50"
              >
                <Mail size={15} />{" "}
                {busy === "new"
                  ? "Sending…"
                  : notifiedAt
                    ? `Save & notify ${newCount} new`
                    : "Save & notify team"}
              </button>
            ) : null}
            {notifiedAt && (
              <button
                onClick={() => save("all")}
                disabled={!!busy || !emailOk || total === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                <Mail size={15} />{" "}
                {busy === "all" ? "Sending…" : "Notify everyone again"}
              </button>
            )}
            <button
              onClick={() => save("save")}
              disabled={!!busy || !dirty}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Save only"}
            </button>
            {!emailOk && (
              <span className="text-xs text-amber-700">
                Email and SMS aren’t set up on the server yet.
              </span>
            )}
          </div>
        </div>
      )}
      {msg && (
        <p
          className={`mt-3 text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
