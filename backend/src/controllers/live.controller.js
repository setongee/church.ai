import { Service } from '../models/Service.model.js';
import { Roster } from '../models/Roster.model.js';
import { ROLES } from '../models/User.model.js';
import { notify } from '../services/notification.service.js';
import { clearAccessCache, serviceModeFor } from '../services/access.service.js';
import { emitToAuthed } from '../services/realtime.service.js';
import { ROLE_LABELS } from './roster.controller.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

const nameOfSession = (roster, id) => (id ? (roster?.sessions.find((x) => String(x._id) === String(id))?.name ?? '') : '');
const jobText = (a, roster) => `${ROLE_LABELS[a.role]}${a.session ? ` (${nameOfSession(roster, a.session)})` : ''}`;

// Everyone's screens re-read who they are and what's live.
const changed = () => emitToAuthed('service:changed', {});

async function load(id) {
  const service = await Service.findById(id);
  if (!service) throw bad('Service not found.', 404);
  return { service, roster: await Roster.findOne({ service: service._id }) };
}

// Admins and service managers start the service. People rostered for it are told, and whole-service people are limited to
// their job from now on; session people are limited once their session starts.
export async function startLive(req, res) {
  const { service, roster } = await load(req.params.id);
  if (service.live?.on) throw bad('This service is already live.', 409);
  // Only one service can be live at a time.
  const other = await Service.findOne({ 'live.on': true, _id: { $ne: service._id } }).select('name').lean();
  if (other) throw bad(`“${other.name}” is live. End it before starting another service.`, 409);
  service.live = { on: true, startedAt: new Date(), startedBy: req.user._id, activeSession: null };
  await service.save();
  clearAccessCache();
  const byUser = new Map();
  for (const a of roster?.assignments ?? []) byUser.set(String(a.user), [...(byUser.get(String(a.user)) ?? []), a]);
  for (const [uid, jobs] of byUser) {
    const whole = jobs.filter((j) => !j.session);
    const body = whole.length
      ? `You're on ${whole.map((j) => jobText(j, roster)).join(' & ')}. You're limited to your job's pages until the service ends.`
      : `You're on ${jobs.map((j) => jobText(j, roster)).join(' & ')}. You'll be limited to your job when your session starts.`;
    await notify([uid], { type: 'roster', title: `${service.name} has started`, body, href: '/dashboard' });
  }
  changed();
  res.json({ ok: true });
}

export async function endLive(req, res) {
  const { service, roster } = await load(req.params.id);
  if (!service.live?.on) throw bad('This service isn’t live.', 409);
  service.live = { on: false, startedAt: null, startedBy: null, activeSession: null };
  await service.save();
  clearAccessCache();
  const ids = [...new Set((roster?.assignments ?? []).map((a) => String(a.user)))];
  await notify(ids, { type: 'roster', title: `${service.name} has ended`, body: 'Thank you. You can open everything you could before again.', href: '/dashboard' });
  changed();
  res.json({ ok: true });
}

// Starts a session of the live service (ending the one that was on), or with no sessionId ends the current one.
export async function setLiveSession(req, res) {
  const { service, roster } = await load(req.params.id);
  if (!service.live?.on) throw bad('Start the service first.', 409);
  const next = req.body?.sessionId ? String(req.body.sessionId) : null;
  if (next && !roster?.sessions.some((x) => String(x._id) === next)) throw bad('That session isn’t on this service.', 400);
  const before = service.live.activeSession ? String(service.live.activeSession) : null;
  if (before === next) return res.json({ ok: true });
  service.live.activeSession = next;
  await service.save();
  clearAccessCache();
  const peopleOf = (sid) => [...new Set((roster?.assignments ?? []).filter((a) => String(a.session ?? '') === sid).map((a) => String(a.user)))];
  const stillOn = new Set(next ? peopleOf(next) : []);
  if (next) await notify(peopleOf(next), { type: 'roster', title: `${nameOfSession(roster, next)} has started`, body: `You're on ${nameOfSession(roster, next)}. You're limited to your job's pages until it ends.`, href: '/dashboard' });
  if (before) await notify(peopleOf(before).filter((id) => !stillOn.has(id)), { type: 'roster', title: `${nameOfSession(roster, before)} has ended`, body: 'You can open everything you could before again.', href: '/dashboard' });
  changed();
  res.json({ ok: true });
}

// The live services this person should see on their dashboard: the ones they're rostered on, and every live service for admins
// and service managers (who also get the controls).
export async function liveNow(req, res) {
  const services = await Service.find({ 'live.on': true }).sort({ 'live.startedAt': 1 }).lean();
  if (!services.length) return res.json([]);
  const canControl = Boolean(req.user.isAdmin || req.roles?.includes('manager'));
  const mode = req.user.isAdmin ? { live: [] } : await serviceModeFor(req.user);
  const rosters = await Roster.find({ service: { $in: services.map((s) => s._id) } }).populate('assignments.user', 'name').lean();
  const rosterOf = new Map(rosters.map((r) => [String(r.service), r]));
  const out = [];
  for (const s of services) {
    const mine = mode.live.find((l) => l.serviceId === String(s._id));
    if (!canControl && !mine) continue;
    const r = rosterOf.get(String(s._id));
    const active = s.live.activeSession ? String(s.live.activeSession) : null;
    const groups = [{ id: null, title: 'Whole service' }, ...(r?.sessions ?? []).map((x) => ({ id: String(x._id), title: x.name }))]
      .map((g) => ({
        ...g,
        active: g.id !== null && g.id === active,
        jobs: ROLES.map((role) => ({ role, label: ROLE_LABELS[role], names: (r?.assignments ?? []).filter((a) => a.user && a.role === role && String(a.session ?? '') === String(g.id ?? '')).map((a) => a.user.name) })).filter((j) => j.names.length),
      }))
      .filter((g) => g.id !== null || g.jobs.length);
    out.push({
      id: String(s._id),
      name: s.name,
      startedAt: s.live.startedAt,
      activeSessionId: active,
      sessions: (r?.sessions ?? []).map((x) => ({ id: String(x._id), name: x.name })),
      groups,
      mine: mine ? mine.jobs.map((j) => ({ role: j.role, session: j.sessionName })) : [],
      limitedForMe: Boolean(mine?.bound.length),
      canControl,
    });
  }
  res.json(out);
}
