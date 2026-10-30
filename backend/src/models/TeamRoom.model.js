import mongoose from 'mongoose';

// A chat room for the whole team. "general" is the team-wide room; every service also has its own room that
// people join (and rostered people are added to automatically).
const teamRoomSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['general', 'service'], required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: undefined },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);
teamRoomSchema.index({ service: 1 }, { unique: true, sparse: true });

export const TeamRoom = mongoose.model('TeamRoom', teamRoomSchema);

// Who is in which room, and how far they've read it (for unread counts).
const memberSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamRoom', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
memberSchema.index({ room: 1, user: 1 }, { unique: true });
memberSchema.index({ user: 1 });

export const RoomMember = mongoose.model('RoomMember', memberSchema);
