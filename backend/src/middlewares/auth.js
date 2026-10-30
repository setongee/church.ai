import { User } from '../models/User.model.js';
import { hashToken } from '../services/password.service.js';
import { env } from '../config/env.js';
import { effectiveRoles } from '../services/access.service.js';

const IDLE_MS = env.authIdleHours * 3600 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;

export const sessionCutoff = () => new Date(Date.now() - IDLE_MS);
export const sessionIsActive = (user) => Boolean(user?.sessionTokenHash && user.lastSeenAt && user.lastSeenAt > sessionCutoff());

export function tokenFrom(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  // Plain links (downloads) can't set headers.
  return typeof req.query?.token === 'string' ? req.query.token : '';
}

// The user behind a token, or null (unknown token, deactivated, or idle for too long). Refreshes lastSeenAt.
export async function userForToken(token) {
  if (!token) return null;
  const user = await User.findOne({ sessionTokenHash: hashToken(token), active: true });
  if (!user || !sessionIsActive(user)) return null;
  if (Date.now() - user.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    user.lastSeenAt = new Date();
    await user.save();
  }
  return user;
}

export async function requireAuth(req, res, next) {
  try {
    const user = await userForToken(tokenFrom(req));
    if (!user) return res.status(401).json({ error: 'Please sign in.', code: 'UNAUTHENTICATED' });
    req.user = user;
    req.roles = await effectiveRoles(user);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Only an admin can do that.' });
  next();
}

// Passes admins, and anyone whose current roster roles include one of `roles`.
export const requireRole = (...roles) => (req, res, next) => {
  if (req.user?.isAdmin || roles.some((r) => req.roles?.includes(r))) return next();
  res.status(403).json({ error: 'You aren’t rostered for that.', code: 'FORBIDDEN' });
};

// Reading is open to anyone with a current role; changing things needs one of `roles`.
export const readAnyWriteRole = (...roles) => (req, res, next) => {
  if (req.user?.isAdmin) return next();
  if (req.method === 'GET' && req.roles?.length) return next();
  return requireRole(...roles)(req, res, next);
};
