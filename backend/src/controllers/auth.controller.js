import { User } from '../models/User.model.js';
import { hashPassword, verifyPassword, hashToken, newToken } from '../services/password.service.js';
import { disconnectUser, replaceSessions } from '../services/realtime.service.js';
import { sessionCutoff, sessionIsActive } from '../middlewares/auth.js';
import { effectiveRoles, serviceModeSummary } from '../services/access.service.js';
import { notify } from '../services/notification.service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `roles` are the jobs on the person's current rosters - they decide which pages open for them.
export const publicUser = (u, roles = []) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  isAdmin: u.isAdmin,
  roles,
  appRole: u.appRole?.name ? { _id: u.appRole._id, name: u.appRole.name } : null, // the app-level role (null for admins and people without one)
  active: u.active,
});
export const userView = async (u) => {
  await u.populate('appRole', 'name');
  return { ...publicUser(u, await effectiveRoles(u)), serviceMode: await serviceModeSummary(u) };
};

// Slows down password guessing: 8 wrong tries per email+IP per 15 minutes.
const fails = new Map();
const WINDOW_MS = 15 * 60 * 1000;
function tooManyFails(key) {
  const hits = (fails.get(key) || []).filter((t) => Date.now() - t < WINDOW_MS);
  fails.set(key, hits);
  return hits.length >= 8;
}
const noteFail = (key) => fails.set(key, [...(fails.get(key) || []), Date.now()]);

// "Chrome on Mac", from the browser's own description of itself.
export function deviceLabel(ua = '') {
  const s = String(ua);
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /Electron\//.test(s) ? 'the desktop app' : /Chrome\/|CriOS/.test(s) ? 'Chrome' : /Firefox\/|FxiOS/.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'a browser';
  const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /CrOS/.test(s) ? 'Chromebook' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

// `takeOver` signs in even if another device holds the session (that device is signed out by the caller).
async function startSession(user, req, { takeOver = false } = {}) {
  const token = newToken();
  const now = new Date();
  // Only succeeds if nobody else holds a live session - two logins at once can't both win.
  const updated = await User.findOneAndUpdate(
    takeOver ? { _id: user._id } : { _id: user._id, $or: [{ sessionTokenHash: null }, { lastSeenAt: { $lt: sessionCutoff() } }] },
    { sessionTokenHash: hashToken(token), sessionStartedAt: now, lastSeenAt: now, sessionDevice: String(req.headers['user-agent'] || '').slice(0, 200) },
    { new: true }
  );
  return updated ? { token, user: updated } : null;
}

export async function status(req, res) {
  res.json({ needsSetup: (await User.countDocuments()) === 0 });
}

// First run only: creates the first admin.
export async function setup(req, res) {
  if ((await User.countDocuments()) > 0) return res.status(403).json({ error: 'Setup is already done.' });
  const { name, email, password } = req.body || {};
  if (!String(name || '').trim() || !EMAIL_RE.test(String(email || '').trim())) return res.status(400).json({ error: 'A name and a valid email are required.' });
  if (String(password || '').length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  const user = await User.create({ name: name.trim(), email: email.trim(), passwordHash: await hashPassword(password), isAdmin: true });
  const s = await startSession(user, req);
  res.status(201).json({ token: s.token, user: await userView(s.user) });
}

export async function login(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${email}|${req.ip}`;
  if (tooManyFails(key)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

  const user = email ? await User.findOne({ email }) : null;
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    noteFail(key);
    return res.status(401).json({ error: 'That email and password don’t match.' });
  }
  if (!user.active) return res.status(403).json({ error: 'This account has been turned off. Ask an admin.' });
  const other = sessionIsActive(user);
  const takeOver = Boolean(req.body?.takeOver);
  if (other && !takeOver) {
    // Not signed in yet: the new device is told who has the session, and asked whether to sign them out.
    return res.status(409).json({
      code: 'ALREADY_SIGNED_IN',
      error: 'You’re signed in on another device.',
      device: deviceLabel(user.sessionDevice),
      lastSeenAt: user.lastSeenAt,
    });
  }
  const previous = { device: deviceLabel(user.sessionDevice), had: other };
  const s = await startSession(user, req, { takeOver });
  if (!s) return res.status(409).json({ code: 'ALREADY_SIGNED_IN', error: 'You’re signed in on another device.', device: previous.device });
  fails.delete(key);
  if (previous.had) {
    // The old device hears why it's being signed out (then its connections are closed), and the person is told on this one.
    const now = deviceLabel(req.headers['user-agent']);
    await replaceSessions(user._id, s.token, { device: now });
    await notify([user._id], { type: 'account', title: 'You signed in on a new device', body: `${previous.device} was signed out. If that wasn’t you, change your password.`, href: '/settings' });
  }
  res.json({ token: s.token, user: await userView(s.user) });
}

export async function me(req, res) {
  res.json({ user: await userView(req.user) });
}

export async function logout(req, res) {
  await User.updateOne({ _id: req.user._id }, { sessionTokenHash: null, sessionStartedAt: null, lastSeenAt: null, sessionDevice: '' });
  disconnectUser(req.user._id);
  res.json({ ok: true });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!(await verifyPassword(String(currentPassword || ''), req.user.passwordHash))) return res.status(400).json({ error: 'Your current password is wrong.' });
  if (String(newPassword || '').length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  req.user.passwordHash = await hashPassword(newPassword);
  await req.user.save();
  res.json({ ok: true });
}

// Personal settings that follow the person across devices (for now: how the Present screen is laid out).
const PRESENT_LAYOUTS = ['classic', 'stage', 'mirror'];
const SKINS = ['ember', 'sunrise', 'ocean', 'forest', 'royal', 'rose']; // see frontend/src/lib/skins.ts
const prefsOf = (u) => ({ presentLayout: PRESENT_LAYOUTS.includes(u?.prefs?.presentLayout) ? u.prefs.presentLayout : 'classic', skin: SKINS.includes(u?.prefs?.skin) ? u.prefs.skin : '' });

export async function getPrefs(req, res) {
  const u = await User.findById(req.user._id).select('prefs').lean();
  res.json(prefsOf(u));
}

export async function setPrefs(req, res) {
  const set = {};
  if (PRESENT_LAYOUTS.includes(req.body?.presentLayout)) set['prefs.presentLayout'] = req.body.presentLayout;
  if (typeof req.body?.skin === 'string' && (req.body.skin === '' || SKINS.includes(req.body.skin))) set['prefs.skin'] = req.body.skin;
  if (Object.keys(set).length) await User.updateOne({ _id: req.user._id }, { $set: set });
  res.json(prefsOf(await User.findById(req.user._id).select('prefs').lean()));
}
