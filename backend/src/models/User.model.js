import mongoose from 'mongoose';

// Roster roles. What a person can open is decided by the roles they hold on current rosters (see access.service.js).
export const ROLES = ['presenter', 'design', 'audio', 'manager', 'social'];

// A team member. `isAdmin` lets them manage the team, services and rosters; everyone else gets access from
// their roster assignments. Only one device can be signed in at a time: logging in stores a token hash here, and a second
// login is refused until this one logs out (or goes idle - see AUTH_IDLE_HOURS).
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: '', trim: true },
    isAdmin: { type: Boolean, default: false },
    // A standing role the admin gives directly (on top of whatever the person is rostered for). '' = none.
    defaultRole: { type: String, enum: ['', ...ROLES], default: '' },
    active: { type: Boolean, default: true },
    sessionTokenHash: { type: String, default: null, index: true },
    sessionStartedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    sessionDevice: { type: String, default: '' },
    // Which activity emails this person wants (the in-app and push notifications are separate). All on by default.
    emailPrefs: { tasks: { type: Boolean, default: true }, reminders: { type: Boolean, default: true }, chat: { type: Boolean, default: true }, calls: { type: Boolean, default: true } },
    // Personal settings that follow the person to any device.
    prefs: { presentLayout: { type: String, enum: ['classic', 'stage', 'mirror'], default: 'classic' }, skin: { type: String, default: '' } }, // skin: '' = follow the team theme
    lastChatEmailAt: { type: Date, default: null }, // throttles the unread-chat reminder email
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
