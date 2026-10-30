import { RoomMember } from '../models/TeamRoom.model.js';
import { broadcastCall, endCall, getCall, iceServers, scheduleEmptyEnd, shapeCall } from '../services/call.service.js';

// Signalling for group calls. The audio/video itself flows browser-to-browser; here we only keep track of who is in
// the call and pass their connection messages (offer / answer / ICE candidates) to each other.
//
//   call:join   { roomId }                 -> ack { ok, call, you, iceServers }  (must be in the room and the call must be live)
//   call:signal { roomId, to, data }       -> relayed to that person as call:signal { roomId, from, data }
//   call:media  { roomId, muted, video }   -> others get call:peer-media (for the muted / camera badges)
//   call:leave  { roomId }                 -> others get call:peer-left
//   call:end    { roomId }                 -> host or an admin ends it for everyone (everyone in the room gets call:ended)
// Plus, from the server: call:peer-joined, call:replaced (you joined from another tab), and the call:started / call:update /
// call:ended room updates sent from the call service.
export function registerCallHandlers(io) {
  io.on('connection', (socket) => {
    const mine = new Set(); // rooms this connection is in a call for
    const me = () => socket.data.user && { id: String(socket.data.user._id), name: socket.data.user.name };
    const others = (call, exceptId) => [...call.participants.values()].filter((p) => p.userId !== exceptId);

    function leave(roomId) {
      const call = getCall(roomId);
      mine.delete(String(roomId));
      const u = me();
      if (!call || !u) return;
      const p = call.participants.get(u.id);
      if (!p || p.socketId !== socket.id) return; // a newer tab took over
      call.participants.delete(u.id);
      for (const o of call.participants.values()) io.to(o.socketId).emit('call:peer-left', { roomId: String(roomId), userId: u.id });
      scheduleEmptyEnd(roomId);
      void broadcastCall(roomId);
    }

    socket.on('call:join', async (payload, ack = () => {}) => {
      try {
        const u = me();
        const roomId = String(payload?.roomId ?? '');
        if (!socket.data.authed || !u) return ack({ ok: false, error: 'Sign in again to join.' });
        if (!(await RoomMember.exists({ room: roomId, user: u.id }))) return ack({ ok: false, error: 'Join this room first.' });
        const call = getCall(roomId);
        if (!call) return ack({ ok: false, error: 'That call has ended.' });
        if (call.timer) {
          clearTimeout(call.timer);
          call.timer = null;
        }
        const old = call.participants.get(u.id);
        if (old && old.socketId !== socket.id) io.to(old.socketId).emit('call:replaced', { roomId });
        const peers = others(call, u.id).map((p) => ({ id: p.userId, name: p.name }));
        call.participants.set(u.id, { userId: u.id, name: u.name, socketId: socket.id, muted: false, video: false });
        mine.add(roomId);
        for (const o of others(call, u.id)) io.to(o.socketId).emit('call:peer-joined', { roomId, user: u });
        void broadcastCall(roomId);
        // The newcomer calls everyone already in it (so exactly one side starts each connection).
        ack({ ok: true, call: shapeCall(call), you: u.id, peers, iceServers: iceServers() });
      } catch (err) {
        console.error('[call:join]', err.message);
        ack({ ok: false, error: 'Couldn’t join the call.' });
      }
    });

    socket.on('call:signal', (payload) => {
      const u = me();
      const call = getCall(payload?.roomId);
      const target = call?.participants.get(String(payload?.to));
      if (!u || !call || !target || call.participants.get(u.id)?.socketId !== socket.id) return;
      io.to(target.socketId).emit('call:signal', { roomId: String(payload.roomId), from: u.id, data: payload.data });
    });

    socket.on('call:media', (payload) => {
      const u = me();
      const call = getCall(payload?.roomId);
      const p = call?.participants.get(u?.id);
      if (!p || p.socketId !== socket.id) return;
      p.muted = Boolean(payload.muted);
      p.video = Boolean(payload.video);
      for (const o of others(call, u.id)) io.to(o.socketId).emit('call:peer-media', { roomId: String(payload.roomId), userId: u.id, muted: p.muted, video: p.video });
    });

    socket.on('call:leave', (payload) => leave(payload?.roomId));

    socket.on('call:end', async (payload, ack = () => {}) => {
      const u = me();
      const call = getCall(payload?.roomId);
      if (!u || !call) return ack({ ok: false });
      if (call.host.id !== u.id && !socket.data.admin) return ack({ ok: false, error: 'Only the host or an admin can end the call.' });
      await endCall(payload.roomId, 'ended');
      ack({ ok: true });
    });

    socket.on('disconnect', () => {
      for (const roomId of [...mine]) leave(roomId);
    });
  });
}
