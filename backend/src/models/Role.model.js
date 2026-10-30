import mongoose from 'mongoose';
import { ROLES } from './User.model.js';

// An app-level role (Social Media Manager, Design Lead, ...): a name an admin gives to a set of accesses that a person
// keeps all the time. This is different from an assignment, which is a job on one service (see Roster.model.js) and
// only opens things around that service. `access` uses the same access ids as assignments do.
// "Admin" isn't stored here: it is the user's `isAdmin` flag and opens everything.
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    access: { type: [{ type: String, enum: ROLES }], default: [] },
  },
  { timestamps: true }
);
roleSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Role = mongoose.model('Role', roleSchema);

// Roles an install starts with (only created when there are none).
export const DEFAULT_ROLES = [
  { name: 'Social Media Manager', description: 'Plans and posts content, and watches how it performs.', access: ['social'] },
  { name: 'Design Lead', description: 'Runs the design and studio tools.', access: ['design'] },
  { name: 'Service Manager', description: 'Looks after services, sessions and quotes.', access: ['manager'] },
  { name: 'Audio Engineer', description: 'Cuts, cleans and merges recordings.', access: ['audio'] },
];

export async function seedRoles() {
  if ((await Role.estimatedDocumentCount()) === 0) await Role.insertMany(DEFAULT_ROLES);
}
