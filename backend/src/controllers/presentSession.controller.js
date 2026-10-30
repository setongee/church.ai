import { PresentSession } from '../models/PresentSession.model.js';
import { Schedule } from '../models/Schedule.model.js';
import { isDeviceId, outputIdFor } from '../sockets/presentHandler.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const shape = (s) => (s ? { _id: String(s._id), schedule: String(s.schedule), scheduleName: s.scheduleName, startedAt: s.startedAt } : null);

// Each service belongs to the device that started it. The device is named by the secret id its browser keeps
// (X-Device-Id); only a hash of it is stored. Another device - or another account, an admin included - never sees
// this device's service and can't switch or end it.
const deviceOf = (req) => {
  const id = String(req.headers['x-device-id'] || '');
  return isDeviceId(id) ? outputIdFor(id) : '';
};
const needDevice = (req) => {
  const d = deviceOf(req);
  if (!d) throw bad('Couldn’t tell which device this is. Refresh the page and try again.');
  return d;
};

// The service running on THIS device, if any.
export async function getSession(req, res) {
  const device = deviceOf(req);
  res.json({ session: device ? shape(await PresentSession.findOne({ endedAt: null, device }).sort({ startedAt: -1 })) : null });
}

// Start a service on a schedule (ending any that was still open on this device).
export async function startSession(req, res) {
  const device = needDevice(req);
  const schedule = await Schedule.findById(req.body?.scheduleId);
  if (!schedule) throw bad('Schedule not found.', 404);
  await PresentSession.updateMany({ endedAt: null, device }, { endedAt: new Date() });
  res.json({ session: shape(await PresentSession.create({ schedule: schedule._id, scheduleName: schedule.name, device, owner: req.user?._id ?? null })) });
}

// Switch this device's running service to another schedule.
export async function updateSession(req, res) {
  const device = needDevice(req);
  const schedule = await Schedule.findById(req.body?.scheduleId);
  if (!schedule) throw bad('Schedule not found.', 404);
  const session = await PresentSession.findOneAndUpdate({ endedAt: null, device }, { schedule: schedule._id, scheduleName: schedule.name }, { new: true, sort: { startedAt: -1 } });
  res.json({ session: shape(session) });
}

export async function endSession(req, res) {
  const device = deviceOf(req);
  if (device) await PresentSession.updateMany({ endedAt: null, device }, { endedAt: new Date() });
  res.json({ session: null });
}

// Services started before services belonged to a device have no owner to end them: close them once, at start-up.
export async function endLegacySessions() {
  await PresentSession.updateMany({ endedAt: null, $or: [{ device: '' }, { device: { $exists: false } }] }, { endedAt: new Date() });
}
