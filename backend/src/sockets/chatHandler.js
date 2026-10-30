import mongoose from 'mongoose';
import { RoomMember } from '../models/TeamRoom.model.js';
import { emitToUsers } from '../services/realtime.service.js';

// "Someone is typing…". Nothing is saved: a typing event from a member is passed on to the other members of that room.
// Who is in a room is remembered for a short while so a burst of keystrokes doesn't mean a burst of database reads.
const MEMBERS_TTL_MS = 30_000;
const members = new Map(); // roomId -> { at, ids }

async function memberIds(roomId) {
  const hit = members.get(roomId);
  if (hit && Date.now() - hit.at < MEMBERS_TTL_MS) return hit.ids;
  const ids = (await RoomMember.find({ room: roomId }).select('user').lean()).map((m) => String(m.user));
  members.set(roomId, { at: Date.now(), ids });
  return ids;
}

export function registerChatHandlers(io) {
  io.on('connection', (socket) => {
    const lastSent = new Map(); // roomId -> when this person's last "typing" went out
    socket.on('chat:typing', async (msg) => {
      try {
        const roomId = String(msg?.roomId ?? '');
        if (!socket.data.authed || !socket.data.user || !mongoose.isValidObjectId(roomId)) return;
        const typing = Boolean(msg?.typing);
        if (typing && Date.now() - (lastSent.get(roomId) ?? 0) < 1500) return; // the browser sends one every few seconds; ignore anything faster
        const ids = await memberIds(roomId);
        const me = String(socket.data.user._id);
        if (!ids.includes(me)) return;
        if (typing) lastSent.set(roomId, Date.now());
        else lastSent.delete(roomId);
        emitToUsers(ids.filter((id) => id !== me), 'chat:typing', { roomId, user: { id: me, name: socket.data.user.name }, typing });
      } catch (err) {
        console.error('[chat:typing]', err.message);
      }
    });
  });
}
