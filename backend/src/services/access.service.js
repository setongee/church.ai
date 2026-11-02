import { Roster } from '../models/Roster.model.js';
import { Role } from '../models/Role.model.js';
import { Service } from '../models/Service.model.js';

// A rostered job opens its pages from when the service is planned until a week after its date (so the
// team can still finish edits and exports). A service with no date counts as current.
const GRACE_MS = 7 * 24 * 3600 * 1000;

const isCurrent = (service) => Boolean(service) && (!service.date || service.date.getTime() > Date.now() - GRACE_MS);

// Every rostered job this person has: [{ service: { _id, name, date }, role, session: { id, name } | null }] (session null = the whole service).
export async function assignmentsFor(userId, { onlyCurrent = false } = {}) {
  const rosters = await Roster.find({ 'assignments.user': userId }).populate('service', 'name date');
  const out = [];
  for (const r of rosters) {
    if (!r.service) continue;
    if (onlyCurrent && !isCurrent(r.service)) continue;
    for (const a of r.assignments) {
      if (String(a.user) !== String(userId)) continue;
      const part = a.session ? r.sessions.find((x) => String(x._id) === String(a.session)) : null;
      out.push({ service: r.service, role: a.role, session: part ? { id: String(part._id), name: part.name } : null });
    }
  }
  return out;
}

// Short cache: this runs on every API request. Cleared whenever a roster or service date changes.
const cache = new Map();
const TTL_MS = 20_000;

const roleCache = new Map();
const modeCache = new Map();
export const clearAccessCache = () => {
  cache.clear();
  roleCache.clear();
  modeCache.clear();
};

// The access an app role gives.
async function accessOf(roleId) {
  if (!roleId) return [];
  const key = String(roleId);
  if (!roleCache.has(key)) roleCache.set(key, (await Role.findById(key).select('access').lean())?.access ?? []);
  return roleCache.get(key);
}

export async function rolesFor(user) {
  const roleId = String(user.appRole?._id ?? user.appRole ?? '');
  const hit = cache.get(String(user._id));
  if (hit && hit.base === roleId && Date.now() - hit.at < TTL_MS) return hit.roles;
  const assigned = (await assignmentsFor(user._id, { onlyCurrent: true })).map((a) => a.role);
  const roles = [...new Set([...(await accessOf(roleId)), ...assigned])];
  cache.set(String(user._id), { at: Date.now(), base: roleId, roles });
  return roles;
}

// ---- service mode ----------------------------------------------------------------------------------------------------------
// While a service is live, the people on its roster are limited to the jobs they're rostered for: whole-service jobs from the
// moment the service starts, session jobs while that session is the active one. Everyone else is unaffected, and so is anyone
// whose jobs aren't in force yet (they keep what they could open before).

// The live services this person is rostered on: [{ serviceId, name, since, activeSession, sessions, jobs, bound }].
// `jobs` are all their jobs there; `bound` the ones in force right now.
async function liveRosters(userId) {
  const services = await Service.find({ 'live.on': true }).select('name live').lean();
  if (!services.length) return [];
  const rosters = await Roster.find({ service: { $in: services.map((s) => s._id) }, 'assignments.user': userId }).lean();
  const byService = new Map(rosters.map((r) => [String(r.service), r]));
  return services.flatMap((s) => {
    const r = byService.get(String(s._id));
    if (!r) return [];
    const active = s.live.activeSession ? String(s.live.activeSession) : null;
    const nameOf = (id) => r.sessions.find((x) => String(x._id) === String(id))?.name ?? null;
    const jobs = r.assignments.filter((a) => String(a.user) === String(userId)).map((a) => ({ role: a.role, session: a.session ? String(a.session) : null, sessionName: a.session ? nameOf(a.session) : null }));
    return [{ serviceId: String(s._id), name: s.name, since: s.live.startedAt, activeSession: active ? { id: active, name: nameOf(active) } : null, jobs, bound: jobs.filter((j) => !j.session || j.session === active) }];
  });
}

const MODE_TTL_MS = 20_000;
export async function serviceModeFor(user) {
  const hit = modeCache.get(String(user._id));
  if (hit && Date.now() - hit.at < MODE_TTL_MS) return hit.value;
  const live = await liveRosters(user._id);
  const bound = live.flatMap((l) => l.bound);
  const value = { live, limited: bound.length > 0, roles: [...new Set(bound.map((j) => j.role))] };
  modeCache.set(String(user._id), { at: Date.now(), value });
  return value;
}

// What the app needs to know about service mode for this person (sent with their account).
export async function serviceModeSummary(user) {
  if (user.isAdmin) {
    const live = await Service.find({ 'live.on': true }).select('name live').lean();
    return { limited: false, live: live.map((s) => ({ serviceId: String(s._id), name: s.name, since: s.live.startedAt, activeSession: null, jobs: [], limited: false })) };
  }
  const m = await serviceModeFor(user);
  return { limited: m.limited, live: m.live.map((l) => ({ serviceId: l.serviceId, name: l.name, since: l.since, activeSession: l.activeSession, jobs: l.jobs.map((j) => ({ role: j.role, session: j.sessionName })), limited: l.bound.length > 0 })) };
}

// The roles a person effectively has (admins have all of them). Everyone on the team is at least a Presenter: Present, Image
// Studio, the calendar, tasks and chat - with their changes kept on their own device until an admin approves them.
// Rosters and standing roles add the rest (design, audio, ...). While service mode limits them, it is only the jobs in force.
export async function effectiveRoles(user) {
  if (user.isAdmin) return ['presenter', 'design', 'audio', 'manager', 'social'];
  const mode = await serviceModeFor(user);
  if (mode.limited) return mode.roles;
  return [...new Set(['presenter', ...(await rolesFor(user))])];
}
