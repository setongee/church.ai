import { User, ROLES } from '../models/User.model.js';
import { Service } from '../models/Service.model.js';
import { Role } from '../models/Role.model.js';
import mongoose from 'mongoose';
import { Roster } from '../models/Roster.model.js';
import { hashPassword, generatePassword } from '../services/password.service.js';
import { disconnectUser } from '../services/realtime.service.js';
import { sessionIsActive } from '../middlewares/auth.js';
import { publicUser } from './auth.controller.js';
import { assignmentsFor, clearAccessCache, rolesFor } from '../services/access.service.js';
import { notify } from '../services/notification.service.js';
import { sendMail } from '../services/mail.service.js';
import { sendSms } from '../services/sms.service.js';
import { env } from '../config/env.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const loginUrl = () => `${env.frontendOrigin.replace(/\/$/, '')}/login`;

const adminView = (u, roles = []) => ({ ...publicUser(u, roles), signedIn: sessionIsActive(u), lastSeenAt: u.lastSeenAt, sessionDevice: sessionIsActive(u) ? u.sessionDevice : '', createdAt: u.createdAt });

async function signOut(user) {
  await User.updateOne({ _id: user._id }, { sessionTokenHash: null, sessionStartedAt: null, lastSeenAt: null, sessionDevice: '' });
  disconnectUser(user._id);
}

const otherAdmins = (id) => User.countDocuments({ _id: { $ne: id }, isAdmin: true, active: true });

export async function listUsers(req, res) {
  const users = await User.find().sort({ name: 1 }).populate('appRole', 'name');
  const roles = await Promise.all(users.map((u) => rolesFor(u)));
  res.json(users.map((u, i) => adminView(u, roles[i])));
}

// Names and roles only - for anyone signed in (the roster shows who is on the team).
export async function listTeam(req, res) {
  const users = await User.find({ active: true }).sort({ name: 1 }).select('name');
  res.json(users.map((u) => ({ _id: u._id, name: u.name })));
}

// Emails and texts a new person their login details.
async function sendCredentials(user, password) {
  const url = loginUrl();
  const first = user.name.split(' ')[0];
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const emailJob = sendMail({
    to: user.email,
    subject: 'Your FAFC Media Engine login',
    text: `Hi ${first},\n\nYou've been added to the FAFC Media team.\n\nSign in: ${url}\nEmail: ${user.email}\nPassword: ${password}\n\nChange your password from your dashboard after you sign in. You can only be signed in on one device at a time.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#171717"><p>Hi ${esc(first)},</p><p>You've been added to the <b>FAFC Media</b> team. Here are your login details:</p><p style="background:#f5f5f5;border-radius:8px;padding:12px 14px;line-height:1.7">Email: <b>${esc(user.email)}</b><br>Password: <b style="font-family:monospace">${esc(password)}</b></p><p><a href="${esc(url)}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;border-radius:8px;padding:10px 16px;font-weight:600">Sign in</a></p><p style="color:#737373;font-size:13px">Change your password from your dashboard after you sign in. You can only be signed in on one device at a time.</p></div>`,
  });
  const smsJob = user.phone ? sendSms({ to: user.phone, message: `Hi ${first}, your FAFC Media login - email: ${user.email} password: ${password} Sign in: ${url}` }) : { ok: false, error: 'No phone number' };
  const [email, sms] = await Promise.all([emailJob, smsJob]); // together, so the admin waits for the slower one, not both
  return { email, sms };
}

// Sets a person's app-level role from what the admin picked: 'admin', a role id, or '' for none.
// Returns a message if it can't be done.
async function applyRole(user, value, self) {
  if (value === undefined) return null;
  if (value === 'admin') {
    user.isAdmin = true;
    user.appRole = null;
    return null;
  }
  if (user.isAdmin && (self || (await otherAdmins(user._id)) === 0)) return 'There has to be at least one admin.';
  if (value) {
    if (!mongoose.isValidObjectId(value) || !(await Role.exists({ _id: value }))) return 'That role no longer exists.';
    user.appRole = value;
  } else user.appRole = null;
  user.isAdmin = false;
  clearAccessCache();
  return null;
}

export async function createUser(req, res) {
  const { name, email, phone, password, appRoleId } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'A name is required.' });
  if (!EMAIL_RE.test(String(email || '').trim())) return res.status(400).json({ error: 'A valid email is required.' });
  if (password && String(password).length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  if (await User.exists({ email: String(email).trim().toLowerCase() })) return res.status(409).json({ error: 'Someone with that email is already on the team.' });
  const plain = password ? String(password) : generatePassword();
  const user = new User({ name: name.trim(), email: email.trim(), phone: String(phone || '').trim().slice(0, 30), passwordHash: await hashPassword(plain) });
  const problem = await applyRole(user, appRoleId, false);
  if (problem) return res.status(400).json({ error: problem });
  await user.save();
  await user.populate('appRole', 'name');
  await notify([user._id], { type: 'account', title: 'Welcome to FAFC Media Engine', body: 'Change your password from your dashboard, and check back here for your roster and team updates.', href: '/dashboard' });
  const delivery = await sendCredentials(user, plain);
  // A generated password is also shown to the admin once (in case the email/text didn't get through); only its hash is kept.
  res.status(201).json({ user: adminView(user), password: password ? undefined : plain, delivery });
}

export async function updateUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const b = req.body || {};
  const self = String(user._id) === String(req.user._id);
  if (typeof b.name === 'string' && b.name.trim()) user.name = b.name.trim().slice(0, 120);
  if (typeof b.email === 'string' && b.email.trim() && b.email.trim().toLowerCase() !== user.email) {
    if (!EMAIL_RE.test(b.email.trim())) return res.status(400).json({ error: 'A valid email is required.' });
    if (await User.exists({ email: b.email.trim().toLowerCase(), _id: { $ne: user._id } })) return res.status(409).json({ error: 'That email is already used.' });
    user.email = b.email.trim();
  }
  if (typeof b.phone === 'string') user.phone = b.phone.trim().slice(0, 30);
  if (b.appRoleId !== undefined) {
    const problem = await applyRole(user, b.appRoleId, self);
    if (problem) return res.status(400).json({ error: problem });
  }
  let signedOut = false;
  if (typeof b.active === 'boolean' && b.active !== user.active) {
    if (!b.active && (self || (user.isAdmin && (await otherAdmins(user._id)) === 0))) return res.status(400).json({ error: 'You can’t turn off the last admin (or yourself).' });
    user.active = b.active;
    signedOut = !b.active;
  }
  let password;
  if (b.resetPassword) {
    password = generatePassword();
    user.passwordHash = await hashPassword(password);
    signedOut = true;
  } else if (typeof b.password === 'string' && b.password) {
    if (b.password.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    user.passwordHash = await hashPassword(b.password);
    signedOut = true;
  }
  await user.save();
  await user.populate('appRole', 'name');
  clearAccessCache();
  if (signedOut && !self) await signOut(user);
  res.json({ user: adminView(user, await rolesFor(user)), password });
}

// An admin freeing up an account that is stuck signed in on a device nobody can reach.
export async function signOutUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  await signOut(user);
  res.json({ ok: true });
}

export async function deleteUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (String(user._id) === String(req.user._id)) return res.status(400).json({ error: 'You can’t remove yourself.' });
  if (user.isAdmin && (await otherAdmins(user._id)) === 0) return res.status(400).json({ error: 'There has to be at least one admin.' });
  await signOut(user);
  await Roster.updateMany({}, { $pull: { assignments: { user: user._id } } });
  await user.deleteOne();
  res.json({ ok: true });
}

const dateOf = (d) => (d ? new Date(d).getTime() : 0);

// One person's roster, split into what is coming up / running now and what is behind them.
export async function userRosters(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const all = await assignmentsFor(user._id);
  const byService = new Map();
  for (const { service, role } of all) {
    const e = byService.get(String(service._id)) ?? { serviceId: service._id, serviceName: service.name, date: service.date, roles: [] };
    e.roles.push(role);
    byService.set(String(service._id), e);
  }
  const current = new Set((await assignmentsFor(user._id, { onlyCurrent: true })).map((a) => String(a.service._id)));
  const rows = [...byService.values()].sort((a, b) => dateOf(b.date) - dateOf(a.date));
  res.json({ upcoming: rows.filter((r) => current.has(String(r.serviceId))), history: rows.filter((r) => !current.has(String(r.serviceId))) });
}

// Puts a person on a service's roster in one role (keeps everyone else as they are).
export async function assignRoster(req, res) {
  const user = await User.findById(req.params.id);
  if (!user || !user.active) return res.status(404).json({ error: 'user not found' });
  const { serviceId, role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Pick a role.' });
  const service = await Service.findById(serviceId);
  if (!service) return res.status(404).json({ error: 'service not found' });
  const roster = (await Roster.findOne({ service: service._id })) ?? new Roster({ service: service._id, assignments: [] });
  if (roster.assignments.some((a) => String(a.user) === String(user._id) && a.role === role)) return res.status(409).json({ error: 'They already have that role on this service.' });
  roster.assignments.push({ role, user: user._id });
  await roster.save();
  clearAccessCache();
  await notify([user._id], { type: 'roster', title: `You're rostered for ${service.name}`, body: `Your role: ${role}`, href: `/dashboard?service=${service._id}` });
  res.json({ ok: true });
}
