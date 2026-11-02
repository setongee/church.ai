import mongoose from 'mongoose';
import { Roster } from '../models/Roster.model.js';
import { Service } from '../models/Service.model.js';
import { User, ROLES } from '../models/User.model.js';
import { env } from '../config/env.js';
import { notify } from '../services/notification.service.js';
import { assignmentsFor, clearAccessCache } from '../services/access.service.js';
import { sendMail, mailConfigured } from '../services/mail.service.js';
import { sendSms, smsConfigured } from '../services/sms.service.js';

export const ROLE_LABELS = { presenter: 'Presenter', design: 'Design', audio: 'Audio', manager: 'Service Manager', social: 'Social Media Manager' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function view(serviceId) {
  const roster = await Roster.findOne({ service: serviceId }).populate('assignments.user', 'name email roles active');
  return {
    sessions: (roster?.sessions ?? []).map((x) => ({ id: String(x._id), name: x.name })),
    assignments: (roster?.assignments ?? []).filter((a) => a.user).map((a) => ({ role: a.role, sessionId: a.session ? String(a.session) : null, notified: Boolean(a.notifiedAt), user: { _id: a.user._id, name: a.user.name, email: a.user.email } })),
    note: roster?.note ?? '',
    notifiedAt: roster?.notifiedAt ?? null,
    emailConfigured: mailConfigured() || smsConfigured(),
  };
}

// "Presenter" for the whole service, "Presenter (Word)" for one session.
const jobLabel = (role, sessionName) => `${ROLE_LABELS[role]}${sessionName ? ` (${sessionName})` : ''}`;
const nameOfSession = (sessions, id) => (id ? (sessions.find((x) => String(x._id) === String(id))?.name ?? '') : '');

export async function getRoster(req, res) {
  if (!(await Service.exists({ _id: req.params.id }))) return res.status(404).json({ error: 'service not found' });
  res.json(await view(req.params.id));
}

// Replaces the whole roster: { sessions: [{ id, name }], assignments: [{ role, userId, sessionId? }], note }.
// A session keeps its id when the browser sends back one it already had; anything else is new, and assignments name their
// session by the id the browser used (so a session added a moment ago can be given people in the same save).
export async function saveRoster(req, res) {
  const service = await Service.findById(req.params.id);
  if (!service) return res.status(404).json({ error: 'service not found' });
  const before = await Roster.findOne({ service: service._id });
  const had = new Set((before?.sessions ?? []).map((x) => String(x._id)));

  const sessions = [];
  const idFor = new Map(); // the id the browser used -> the real one
  const seenNames = new Set();
  for (const x of (Array.isArray(req.body?.sessions) ? req.body.sessions : []).slice(0, 12)) {
    const name = String(x?.name ?? '').trim().slice(0, 60);
    if (!name || seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());
    const real = had.has(String(x?.id)) ? new mongoose.Types.ObjectId(String(x.id)) : new mongoose.Types.ObjectId();
    idFor.set(String(x?.id), real);
    sessions.push({ _id: real, name });
  }

  const incoming = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
  const seen = new Set();
  const assignments = [];
  for (const a of incoming) {
    if (!ROLES.includes(a?.role) || !a?.userId) continue;
    let session = null;
    if (a.sessionId && a.sessionId !== 'all') {
      session = idFor.get(String(a.sessionId)) ?? null;
      if (!session) continue; // its session was removed
    }
    const key = `${a.role}:${a.userId}:${session ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assignments.push({ role: a.role, user: String(a.userId), session });
  }
  const known = new Set((await User.find({ _id: { $in: assignments.map((a) => a.user) }, active: true }).select('_id')).map((u) => String(u._id)));
  // People who were already on the roster keep their "told" status, so adding someone later only needs them emailed.
  const told = new Map((before?.assignments ?? []).map((a) => [`${a.role}:${a.user}:${a.session ?? ''}`, a.notifiedAt]));
  const valid = assignments.filter((a) => known.has(a.user)).map((a) => ({ ...a, notifiedAt: told.get(`${a.role}:${a.user}:${a.session ?? ''}`) ?? null }));
  const note = String(req.body?.note ?? '').slice(0, 1000);
  await Roster.findOneAndUpdate({ service: service._id }, { assignments: valid, sessions, note }, { upsert: true, new: true, setDefaultsOnInsert: true });
  clearAccessCache();

  // In-app notifications: jobs added to or taken off each person.
  const was = new Map();
  for (const a of before?.assignments ?? []) was.set(String(a.user), [...(was.get(String(a.user)) ?? []), { key: `${a.role}:${a.session ?? ''}`, label: jobLabel(a.role, nameOfSession(before.sessions, a.session)) }]);
  const now = new Map();
  for (const a of valid) now.set(a.user, [...(now.get(a.user) ?? []), { key: `${a.role}:${a.session ?? ''}`, label: jobLabel(a.role, nameOfSession(sessions, a.session)) }]);
  const labels = (list) => list.map((x) => x.label).join(' & ');
  const when = service.date ? ` · ${new Date(service.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}` : '';
  for (const [uid, jobs] of now) {
    const prev = new Set((was.get(uid) ?? []).map((x) => x.key));
    const added = jobs.filter((x) => !prev.has(x.key));
    if (added.length) await notify([uid], { type: 'roster', title: `You're rostered for ${service.name}`, body: `Your job: ${labels(added)}${when}`, href: `/dashboard?service=${service._id}` });
  }
  for (const [uid, jobs] of was) {
    const keep = new Set((now.get(uid) ?? []).map((x) => x.key));
    const gone = jobs.filter((x) => !keep.has(x.key));
    if (gone.length) await notify([uid], { type: 'roster-removed', title: `Roster change for ${service.name}`, body: `You're no longer down as ${labels(gone)}.`, href: `/dashboard?service=${service._id}` });
  }
  res.json(await view(service._id));
}

// `jobs` are this person's jobs ({ role, session }); `everyone` is the whole roster; `sessions` the service's sessions.
function emailFor(user, jobs, service, everyone, note, sessions) {
  const link = `${env.frontendOrigin.replace(/\/$/, '')}/services/${service._id}`;
  const labels = jobs.map((j) => jobLabel(j.role, nameOfSession(sessions, j.session)));
  // The full team: the whole-service jobs first, then each session.
  const groups = [{ title: '', session: null }, ...sessions.map((x) => ({ title: x.name, session: String(x._id) }))].map((g) => ({
    title: g.title,
    lines: ROLES.map((r) => ({ label: ROLE_LABELS[r], names: everyone.filter((a) => a.role === r && String(a.session ?? '') === String(g.session ?? '')).map((a) => a.user.name) })).filter((t) => t.names.length),
  })).filter((g) => g.lines.length);
  const subject = `You're on the team for ${service.name} — ${labels.join(' & ')}`;
  const text = [
    `Hi ${user.name},`,
    '',
    `You've been rostered for "${service.name}" as: ${labels.join(', ')}.`,
    note ? `\nNote: ${note}` : '',
    '',
    'The full team:',
    ...groups.flatMap((g) => [g.title ? `  ${g.title}:` : '  Whole service:', ...g.lines.map((t) => `    ${t.label}: ${t.names.join(', ')}`)]),
    '',
    `Open it: ${link}`,
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#171717">
    <p>Hi ${esc(user.name)},</p>
    <p>You've been rostered for <b>${esc(service.name)}</b> as:</p>
    <p>${labels.map((l) => `<span style="display:inline-block;background:#ffedd5;color:#9a3412;border-radius:999px;padding:4px 12px;margin:0 6px 6px 0;font-weight:600">${esc(l)}</span>`).join('')}</p>
    ${note ? `<p style="background:#f5f5f5;border-radius:8px;padding:10px 12px">${esc(note)}</p>` : ''}
    <p style="margin-bottom:4px"><b>The full team</b></p>
    ${groups.map((g) => `<p style="margin:8px 0 2px;color:#737373;font-size:13px">${esc(g.title || 'Whole service')}</p><ul style="margin-top:0;padding-left:18px">${g.lines.map((t) => `<li>${esc(t.label)}: ${esc(t.names.join(', '))}</li>`).join('')}</ul>`).join('')}
    <p><a href="${esc(link)}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;padding:10px 16px;font-weight:600">Open the service</a></p>
  </div>`;
  return { subject, text, html };
}

// Emails each rostered person the roles they have for this service.
export async function notifyRoster(req, res) {
  const service = await Service.findById(req.params.id);
  if (!service) return res.status(404).json({ error: 'service not found' });
  if (!mailConfigured() && !smsConfigured()) return res.status(503).json({ error: 'Neither email nor SMS is set up on the server yet. Add the SMTP_* or MULTITEXTER_* settings to backend/.env.' });
  const roster = await Roster.findOne({ service: service._id }).populate('assignments.user', 'name email phone active');
  const everyone = (roster?.assignments ?? []).filter((a) => a.user?.active);
  if (!everyone.length) return res.status(400).json({ error: 'Nobody is on the roster yet.' });

  // By default only people with something new to be told about; `all: true` re-sends to the whole team.
  const everything = Boolean(req.body?.all);
  const pending = new Set(everyone.filter((a) => everything || !a.notifiedAt).map((a) => String(a.user._id)));
  if (!pending.size) return res.status(400).json({ error: 'Everyone on the roster has already been told. Use “Email everyone” to send it again.' });
  const byUser = new Map();
  for (const a of everyone.filter((x) => pending.has(String(x.user._id)))) {
    const entry = byUser.get(String(a.user._id)) ?? { user: a.user, jobs: [] };
    entry.jobs.push({ role: a.role, session: a.session ? String(a.session) : null });
    byUser.set(String(a.user._id), entry);
  }
  const results = await Promise.all(
    [...byUser.values()].map(async ({ user, jobs }) => {
      const mail = emailFor(user, jobs, service, everyone, roster.note, roster.sessions);
      const sent = [];
      if (mailConfigured()) sent.push(await sendMail({ to: user.email, ...mail }));
      // A short text too, for people who have a phone number on their profile.
      if (user.phone && smsConfigured()) sent.push(await sendSms({ to: user.phone, message: `Hi ${user.name.split(' ')[0]}, you're on ${service.name} as ${jobs.map((j) => jobLabel(j.role, nameOfSession(roster.sessions, j.session))).join(' & ')}.${roster.note ? ` ${roster.note}` : ''}` }));
      const ok = sent.some((r) => r.ok);
      return { name: user.name, email: user.email, ok, error: ok ? undefined : sent[0]?.error || 'Nothing could be sent (no phone number and email is off).' };
    })
  );
  const reached = new Set(results.filter((r) => r.ok).map((r) => r.email));
  if (reached.size) {
    const now = new Date();
    for (const a of roster.assignments) if (a.user && reached.has(a.user.email) && pending.has(String(a.user._id))) a.notifiedAt = now;
    roster.notifiedAt = now;
    await roster.save();
  }
  res.json({ results, notifiedAt: roster.notifiedAt });
}

// The signed-in person's assignments, newest services first. `roles` is the distinct jobs; `items` says which session each is for.
export async function myAssignments(req, res) {
  const mine = await assignmentsFor(req.user._id);
  const byService = new Map();
  for (const { service, role, session } of mine) {
    const e = byService.get(String(service._id)) ?? { serviceId: service._id, serviceName: service.name, date: service.date, roles: [], items: [] };
    if (!e.roles.includes(role)) e.roles.push(role);
    e.items.push({ role, session: session?.name ?? null });
    byService.set(String(service._id), e);
  }
  // Each service also carries its whole team, so past rosters can be looked back on.
  const rosters = await Roster.find({ service: { $in: [...byService.keys()] } }).populate('assignments.user', 'name');
  for (const r of rosters) {
    const e = byService.get(String(r.service));
    if (!e) continue;
    const groups = [{ session: null, id: null }, ...r.sessions.map((x) => ({ session: x.name, id: String(x._id) }))];
    e.team = groups.flatMap((g) => ROLES.map((role) => ({ role, session: g.session, names: r.assignments.filter((a) => a.role === role && a.user && String(a.session ?? '') === String(g.id ?? '')).map((a) => a.user.name) })).filter((t) => t.names.length));
  }
  res.json([...byService.values()]);
}
