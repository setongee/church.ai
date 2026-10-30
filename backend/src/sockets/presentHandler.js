import { cleanSections, cleanSlide, cleanSplit } from '../controllers/schedule.controller.js';
import crypto from 'node:crypto';
import { recordActivity } from '../services/activity.service.js';

// An alert banner from the controller: its messages and style, cleaned.
const FX = new Set(['slide-up', 'slide-down', 'fade', 'pop', 'scroll']);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
function cleanAlert(a) {
  if (!a || typeof a !== 'object') return null;
  const texts = (Array.isArray(a.texts) ? a.texts : [a.text]).map((t) => String(t ?? '').slice(0, 300).trim()).filter(Boolean).slice(0, 20);
  if (!texts.length) return null;
  const st = a.style && typeof a.style === 'object' ? a.style : {};
  const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  return {
    id: String(a.id ?? Date.now()).slice(0, 40),
    text: texts[0],
    texts,
    seconds: num(a.seconds, 2, 600, 6),
    startedAt: num(a.startedAt, 0, 9e15, Date.now()),
    style: {
      effect: FX.has(st.effect) ? st.effect : 'slide-up',
      position: ['top', 'middle', 'bottom'].includes(st.position) ? st.position : 'bottom',
      bg: hex(st.bg, '#ea580c'),
      color: hex(st.color, '#ffffff'),
      font: String(st.font ?? '').slice(0, 80),
      weight: [400, 600, 700, 900].includes(Number(st.weight)) ? Number(st.weight) : 700,
      size: num(st.size, 20, 200, 64),
      height: num(st.height, 0, 700, 0),
      align: st.align === 'left' ? 'left' : 'center',
      uppercase: Boolean(st.uppercase),
      speed: ['slow', 'normal', 'fast'].includes(st.speed) ? st.speed : 'normal',
    },
  };
}

// What was just put on screen, in a few words, for the activity feed.
function describeSlide(s) {
  if (!s) return 'something';
  if (s.kind === 'scripture') return `scripture ${s.reference}`;
  if (s.kind === 'scripture2') return `scripture ${s.left?.reference} | ${s.right?.reference}`;
  if (s.kind === 'song') return `the song “${String(s.title || '').slice(0, 50)}”`;
  if (s.kind === 'quote') return 'a quote';
  if (s.kind === 'text') return s.title ? `“${String(s.title).slice(0, 50)}”` : 'an announcement';
  if (s.kind === 'image') return 'an image';
  if (s.kind === 'video') return 'a video';
  return `the ${s.kind} screen`;
}

// Live link between a Present controller and ITS output screen(s) (projector / stream window).
//
// Every device that runs Present gets its own display state, its own output screens and its own show timers - nothing
// is shared between devices, so nobody on another device or account (an admin included) can end the service, take it
// offline, or change what is on screen. A controller is identified by a secret device id its browser keeps (sent in
// the socket handshake) and can only ever address the room made from that id. Output screens find their controller
// through a public output id that is a one-way hash of the device id, so opening an output never reveals the key and
// can only watch, never control. The server holds each device's current state so an output that opens or reconnects
// mid-service immediately shows what the congregation should be seeing.
const DEVICE_RE = /^[A-Za-z0-9_-]{16,80}$/;
export const isDeviceId = (v) => DEVICE_RE.test(String(v ?? ''));
export const outputIdFor = (deviceId) => crypto.createHash('sha256').update(`present-out:${deviceId}`).digest('hex').slice(0, 24);
const ctrlRoomName = (outId) => `present-ctrl:${outId}`;
const outRoomName = (outId) => `present-out:${outId}`;

const DEFAULT_STATE = {
  rev: 0,
  mode: 'clear', // live | clear | black | logo
  slide: null, // what's on screen when mode is "live"
  background: { type: 'gradient', value: 'linear-gradient(135deg,#0f172a,#1e293b)' },
  alert: null, // { id, text } - a banner over everything
  logoUrl: '',
  logoKind: 'logo', // logo | image | video
  logoSlide: null, // an animated template used as the logo screen
  bgSlide: null, // an animated template used as the background
  style: { align: 'center', scale: 1, font: '', weight: 500, imageFit: 'contain', quoteLayout: 'classic', frame: null, frameBg: null }, // font '' = app default
  outputs: 0, // how many output windows (projector / stream) are connected right now
  split: null, // key points beside the scripture: { on, title, pages, index }
  sectionStyles: null, // looks for scripture / song / prayer set by a template or wrapper: { scripture?, song?, prayer? }
  show: null, // a slide show that is playing: { name, index, total, playing, seconds, loop }
};

// One device's presenter: its display state, its running slide show and its connected screens.
const rooms = new Map();
function getRoom(outId) {
  let r = rooms.get(outId);
  if (!r) {
    r = { outId, state: { ...DEFAULT_STATE }, showSlides: [], showTimer: null, outputs: new Set(), touched: Date.now() };
    rooms.set(outId, r);
  }
  r.touched = Date.now();
  return r;
}

// ---- slide shows: played from here, not from the controller's browser, so a minimised or sleeping
// controller tab can't stall the timer.
const clearShowTimer = (room) => {
  if (room.showTimer) clearTimeout(room.showTimer);
  room.showTimer = null;
};

function stopShow(room) {
  clearShowTimer(room);
  room.showSlides = [];
  if (room.state.show) room.state = { ...room.state, show: null };
}

export function registerPresentHandlers(io) {
  // Tell everyone connected to this device's presenter: its controller tabs and its output screens.
  const emit = (room) => {
    room.state = { ...room.state, rev: room.state.rev + 1 };
    io.to(ctrlRoomName(room.outId)).to(outRoomName(room.outId)).emit('present:state', room.state);
  };

  // Presenters that have been idle for a day (and have nothing connected) are forgotten.
  const sweep = setInterval(() => {
    for (const [id, r] of rooms) {
      if (Date.now() - r.touched < 24 * 3600_000) continue;
      const live = io.sockets.adapter.rooms.get(ctrlRoomName(id))?.size || io.sockets.adapter.rooms.get(outRoomName(id))?.size;
      if (!live) {
        clearShowTimer(r);
        rooms.delete(id);
      }
    }
  }, 3600_000);
  sweep.unref?.();

  function armTimer(room) {
    clearShowTimer(room);
    if (!room.state.show?.playing) return;
    room.showTimer = setTimeout(() => step(room, 1, true), room.state.show.seconds * 1000);
  }

  // Move to another slide. `auto` = the timer fired (it stops at the end unless the show loops).
  function step(room, dir, auto) {
    const show = room.state.show;
    if (!show || !room.showSlides.length) return;
    let next = show.index + dir;
    if (next >= show.total) {
      if (!show.loop) {
        if (auto) {
          room.state = { ...room.state, show: { ...show, playing: false } };
          clearShowTimer(room);
          return emit(room);
        }
        next = show.total - 1;
      } else next = 0;
    } else if (next < 0) next = show.loop ? show.total - 1 : 0;
    room.state = { ...room.state, slide: room.showSlides[next], show: { ...show, index: next } };
    armTimer(room);
    emit(room);
  }

  // Output windows announce themselves; the controller shows "Connected" only while at least one is open.
  const syncOutputs = (room) => {
    if (room.state.outputs === room.outputs.size) return;
    room.state = { ...room.state, outputs: room.outputs.size };
    emit(room);
  };

  io.on('connection', (socket) => {
    let lastLogged = 0;
    // Only a signed-in presenter (or admin) on a known device may drive a presenter - and only its own.
    const canControl = () => Boolean(socket.data.authed && socket.data.deviceId && (socket.data.admin || socket.data.roles?.includes('presenter')));
    const own = () => (canControl() ? getRoom(outputIdFor(socket.data.deviceId)) : null);

    // A controller joins its own device's presenter; an output screen joins the one named in its link ({ out }).
    socket.on('present:join', (a, b) => {
      const opts = a && typeof a === 'object' ? a : {};
      const ack = typeof a === 'function' ? a : b;
      const reply = (...args) => typeof ack === 'function' && ack(...args);
      if (opts.out !== undefined) {
        const id = String(opts.out);
        if (!/^[a-f0-9]{24}$/.test(id)) return reply(null);
        socket.join(outRoomName(id));
        socket.data.outId = id;
        return reply(getRoom(id).state, id);
      }
      const room = own();
      if (!room) return reply(null);
      socket.join(ctrlRoomName(room.outId));
      reply(room.state, room.outId);
    });

    socket.on('present:output', () => {
      if (!socket.data.outId) return;
      const room = getRoom(socket.data.outId);
      room.outputs.add(socket.id);
      syncOutputs(room);
    });
    socket.on('disconnect', () => {
      const room = socket.data.outId && rooms.get(socket.data.outId);
      if (room && room.outputs.delete(socket.id)) syncOutputs(room);
    });

    // The controller sends a partial patch; style is merged one level deep.
    socket.on('present:patch', (patch) => {
      const room = own();
      if (!room || !patch || typeof patch !== 'object') return;
      const { style, ...rest } = patch;
      if ('split' in rest) rest.split = cleanSplit(rest.split);
      if ('alert' in rest) rest.alert = cleanAlert(rest.alert);
      if ('sectionStyles' in rest) rest.sectionStyles = cleanSections(rest.sectionStyles);
      // Putting something else on screen ends a running slide show.
      if (rest.slide !== undefined) stopShow(room);
      // Tell staff what the presenter put on screen (at most every 20s per presenter, folded together).
      if (rest.slide && socket.data.user && Date.now() - lastLogged > 20000) {
        lastLogged = Date.now();
        void recordActivity({ user: socket.data.user, kind: 'present', text: `Put ${describeSlide(rest.slide)} on screen`, collapseKey: 'on-screen' });
      }
      room.state = { ...room.state, ...rest, style: { ...room.state.style, ...(style || {}) }, rev: room.state.rev + 1 };
      // Everyone except the sender: the sender already applied its own change locally, and an
      // echo of an older change arriving late would make its controls jump back.
      socket.to(ctrlRoomName(room.outId)).to(outRoomName(room.outId)).emit('present:state', room.state);
      // ...but the sender needs to hear about a show it just ended.
      if (rest.slide !== undefined) socket.emit('present:state', room.state);
    });

    // Slide shows: start / pause / resume / next / prev / stop.
    socket.on('present:show', (cmd) => {
      const room = own();
      if (!room || !cmd || typeof cmd !== 'object') return;
      if (cmd.action === 'start') {
        const slides = (Array.isArray(cmd.slides) ? cmd.slides : []).slice(0, 300).map(cleanSlide).filter(Boolean);
        if (!slides.length) return;
        stopShow(room);
        room.showSlides = slides;
        const seconds = Math.min(600, Math.max(2, Number(cmd.seconds) || 8));
        room.state = { ...room.state, mode: 'live', slide: slides[0], show: { name: String(cmd.name || '').slice(0, 120), index: 0, total: slides.length, playing: true, seconds, loop: Boolean(cmd.loop) } };
        armTimer(room);
        emit(room);
      } else if (!room.state.show) {
        return;
      } else if (cmd.action === 'pause') {
        clearShowTimer(room);
        room.state = { ...room.state, show: { ...room.state.show, playing: false } };
        emit(room);
      } else if (cmd.action === 'resume') {
        // Resuming at the end of a one-pass show starts it over.
        if (!room.state.show.loop && room.state.show.index >= room.state.show.total - 1) {
          room.state = { ...room.state, slide: room.showSlides[0], show: { ...room.state.show, index: 0, playing: true } };
        } else room.state = { ...room.state, show: { ...room.state.show, playing: true } };
        armTimer(room);
        emit(room);
      } else if (cmd.action === 'next') step(room, 1, false);
      else if (cmd.action === 'prev') step(room, -1, false);
      else if (cmd.action === 'stop') {
        stopShow(room);
        emit(room);
      }
    });

    // Play / pause / restart / mute for a video that's on this device's output.
    socket.on('present:video', (cmd) => {
      const room = own();
      if (room) socket.to(outRoomName(room.outId)).emit('present:video', cmd);
    });

    // "End Service": wipe this device's screen (keeping the look - font, background - for next time).
    socket.on('present:end', () => {
      const room = own();
      if (!room) return;
      stopShow(room);
      room.state = { ...room.state, mode: 'clear', slide: null, alert: null, split: null };
      emit(room);
    });

    // "Go offline": tell this device's output windows to close themselves (no one else's).
    socket.on('present:close', () => {
      const room = own();
      if (room) io.to(outRoomName(room.outId)).emit('present:close');
    });
  });
}
