import { Role } from '../models/Role.model.js';
import { User, ROLES } from '../models/User.model.js';
import { clearAccessCache } from '../services/access.service.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

function fields(b = {}) {
  const name = String(b.name ?? '').trim().slice(0, 60);
  if (!name) throw bad('Give the role a name.');
  const access = [...new Set((Array.isArray(b.access) ? b.access : []).filter((a) => ROLES.includes(a)))];
  return { name, description: String(b.description ?? '').trim().slice(0, 300), access };
}

const dupe = (err) => (err?.code === 11000 ? bad('There is already a role with that name.', 409) : err);

export async function listRoles(req, res) {
  const [roles, counts] = await Promise.all([Role.find().sort({ name: 1 }).lean(), User.aggregate([{ $match: { appRole: { $ne: null } } }, { $group: { _id: '$appRole', n: { $sum: 1 } } }])]);
  const byRole = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json(roles.map((r) => ({ ...r, members: byRole.get(String(r._id)) ?? 0 })));
}

export async function createRole(req, res) {
  try {
    const role = await Role.create(fields(req.body));
    res.status(201).json({ ...role.toObject(), members: 0 });
  } catch (err) {
    throw dupe(err);
  }
}

export async function updateRole(req, res) {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, fields(req.body), { new: true, runValidators: true });
    if (!role) throw bad('Role not found.', 404);
    clearAccessCache(); // everyone holding it gets the new access straight away
    res.json({ ...role.toObject(), members: await User.countDocuments({ appRole: role._id }) });
  } catch (err) {
    throw dupe(err);
  }
}

// People who held the role are left without one (they keep the baseline and any service assignments).
export async function deleteRole(req, res) {
  const role = await Role.findByIdAndDelete(req.params.id);
  if (!role) throw bad('Role not found.', 404);
  const { modifiedCount } = await User.updateMany({ appRole: role._id }, { appRole: null });
  clearAccessCache();
  res.json({ ok: true, unassigned: modifiedCount });
}
