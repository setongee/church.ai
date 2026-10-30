import { Roster } from '../models/Roster.model.js';
import { Role } from '../models/Role.model.js';

// A rostered job opens its pages from when the service is planned until a week after its date (so the
// team can still finish edits and exports). A service with no date counts as current.
const GRACE_MS = 7 * 24 * 3600 * 1000;

const isCurrent = (service) => Boolean(service) && (!service.date || service.date.getTime() > Date.now() - GRACE_MS);

// Every rostered job this person has: [{ service: { _id, name, date }, role }].
export async function assignmentsFor(userId, { onlyCurrent = false } = {}) {
  const rosters = await Roster.find({ 'assignments.user': userId }).populate('service', 'name date');
  const out = [];
  for (const r of rosters) {
    if (!r.service) continue;
    if (onlyCurrent && !isCurrent(r.service)) continue;
    for (const a of r.assignments) if (String(a.user) === String(userId)) out.push({ service: r.service, role: a.role });
  }
  return out;
}

// Short cache: this runs on every API request. Cleared whenever a roster or service date changes.
const cache = new Map();
const TTL_MS = 20_000;

const roleCache = new Map();
export const clearAccessCache = () => {
  cache.clear();
  roleCache.clear();
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

// The roles a person effectively has (admins have all of them). Everyone on the team is at least a Presenter: Present, Image
// Studio, the calendar, tasks and chat - with their changes kept on their own device until an admin approves them.
// Rosters and standing roles add the rest (design, audio, ...).
export async function effectiveRoles(user) {
  return user.isAdmin ? ['presenter', 'design', 'audio', 'manager', 'social'] : [...new Set(['presenter', ...(await rolesFor(user))])];
}
