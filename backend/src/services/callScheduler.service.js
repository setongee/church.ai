import { ScheduledCall } from '../models/ScheduledCall.model.js';
import { TeamRoom } from '../models/TeamRoom.model.js';
import { User } from '../models/User.model.js';
import { notify } from './notification.service.js';
import { callAudience, getCall, scheduleEmptyEnd } from './call.service.js';
import { callHeading, launch } from '../controllers/call.controller.js';

const TICK_MS = 20_000;
const LATE_MS = 10 * 60_000; // a call whose time passed more than this long ago (the server was down) isn't started out of the blue
const NOBODY_JOINED_MS = 15 * 60_000; // a call started by the schedule that nobody joins ends by itself

// Starts every call whose time has come and pings the room.
export async function runDueCalls() {
  const due = await ScheduledCall.find({ status: 'scheduled', startAt: { $lte: new Date() } }).limit(20);
  for (const item of due) {
    // Claim it so it starts exactly once.
    const late = Date.now() - item.startAt.getTime() > LATE_MS;
    const claimed = await ScheduledCall.findOneAndUpdate({ _id: item._id, status: 'scheduled' }, { status: late ? 'missed' : 'started' });
    if (!claimed) continue;
    const room = await TeamRoom.findById(item.room);
    const host = await User.findById(item.createdBy).select('name active');
    if (late || !room || !host?.active) {
      if (host?.active) await notify([host._id], { type: 'call', title: `A scheduled call didn’t start${item.title ? `: ${item.title}` : ''}`, body: 'Its time passed while the server was unavailable.', href: room ? `/chat?room=${room._id}` : '/chat' });
      if (!late) await ScheduledCall.updateOne({ _id: item._id }, { status: 'missed' });
      continue;
    }
    try {
      const live = getCall(room._id);
      if (live) {
        // A call is already going on there: just ping the people who aren't on it.
        const onIt = new Set([...live.participants.keys()].map(String));
        const targets = (await callAudience(live)).filter((id) => !onIt.has(id));
        await notify(targets, { type: 'call', title: callHeading(live, room), body: 'The scheduled time has come — tap to join', href: `/chat?room=${room._id}&call=${live.id}`, data: { roomId: String(room._id), callId: live.id } });
        await ScheduledCall.updateOne({ _id: item._id }, { callId: live.id });
        continue;
      }
      const call = await launch(room, host, host, { title: item.title, notifyHost: true, invited: item.invited?.length ? item.invited.map(String) : null });
      if (call) {
        scheduleEmptyEnd(room._id, NOBODY_JOINED_MS);
        await ScheduledCall.updateOne({ _id: item._id }, { callId: call.id });
      }
    } catch (err) {
      console.error('[call-scheduler]', err.message);
    }
  }
}

let timer = null;
export function startCallScheduler() {
  if (timer) return;
  timer = setInterval(() => runDueCalls().catch((e) => console.error('[call-scheduler]', e.message)), TICK_MS);
  timer.unref?.();
}
