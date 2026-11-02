import mongoose from 'mongoose';
import { TranscriptSegment } from '../models/TranscriptSegment.model.js';
import { Quote } from '../models/Quote.model.js';
import { Insight } from '../models/Insight.model.js';
import { Session } from '../models/Session.model.js';
import { createDeepgramLiveConnection } from '../services/deepgram.service.js';
import { startAnalysis, stopAnalysis } from '../services/analysis.service.js';
import { startRecording, appendAudioChunk, pauseRecording } from '../services/audioRecording.service.js';

// Live transcription of a session, built to survive a service.
//
// A stream belongs to the SESSION, not to one socket. If the browser's socket drops (a network blip, a phone switching from
// wifi to data, a page refresh) the stream is kept for a grace period and the same person picks it up again when they
// reconnect. If the link to Deepgram drops, the server reconnects it by itself - the browser is told, restarts its recorder (a
// fresh recorder gives the new Deepgram link the audio header it needs) and carries on. Each restart is its own recording
// segment, and segments are stitched into one recording when the session ends (see audioRecording.service.js).
//
// Events in:  stream:start { sessionId } · stream:audio <binary> · stream:stop
// Events out: stream:ready { resumed } · stream:status { state: 'reconnecting', attempt } · stream:error { message, fatal? }
//             stream:lost (this server doesn't know your stream: start it again) · stream:replaced · stream:ended

const RETRY_MS = [400, 1000, 2000, 4000, 8000, 15000]; // then every 15 s for as long as someone is attached
const GRACE_MS = 60_000; // how long a stream with nobody attached is kept before it is closed for good

const streams = new Map(); // sessionId -> stream state
let controls = null;

// Ends a stream from outside (the session was ended over HTTP).
export function stopStream(sessionId, reason = 'ended') {
  controls?.destroy(String(sessionId), reason);
}
export const isStreaming = (sessionId) => streams.has(String(sessionId));

export function registerStreamHandlers(io, { connect = createDeepgramLiveConnection } = {}) {
  const toOwner = (st, event, payload) => st.socketId && io.to(st.socketId).emit(event, payload);

  function closeLink(st) {
    st.gen += 1; // callbacks from the old link are now ignored
    st.ready = false;
    clearTimeout(st.retryTimer);
    const dg = st.dg;
    st.dg = null;
    try {
      dg?.requestClose();
    } catch {
      // already closed
    }
  }

  function scheduleReconnect(st) {
    clearTimeout(st.retryTimer);
    if (!st.socketId || st.closing) return; // nobody is there to hear audio; the next stream:start opens a link
    const wait = RETRY_MS[Math.min(st.attempts, RETRY_MS.length - 1)];
    st.attempts += 1;
    toOwner(st, 'stream:status', { state: 'reconnecting', attempt: st.attempts });
    st.retryTimer = setTimeout(() => openLink(st), wait);
  }

  function openLink(st) {
    closeLink(st);
    const gen = st.gen;
    const dg = connect({
      // The browser only starts (or restarts) its recorder once the link is really open: audio sent before then has nowhere
      // to go, and the first chunk of a recorder carries the header every later chunk depends on.
      onOpen: async () => {
        if (gen !== st.gen) return;
        st.ready = true;
        st.attempts = 0;
        // The recorder is about to restart, so its audio goes into a new recording segment.
        await pauseRecording(st.sessionId).catch(() => {});
        if (gen !== st.gen) return;
        startRecording(st.sessionId);
        toOwner(st, 'stream:ready', { resumed: st.resumed });
        st.resumed = true;
      },
      onTranscript: async ({ text, isFinal, startMs, endMs }) => {
        if (gen !== st.gen) return;
        io.to(st.sessionId).emit('transcript:chunk', { text, isFinal });
        if (isFinal) {
          try {
            await TranscriptSegment.create({ session: st.sessionId, text, isFinal, startMs, endMs });
          } catch (err) {
            console.error('[stream] failed to persist transcript segment', err);
          }
          st.analysis.addFinalText(text);
        }
      },
      onError: (err) => console.error('[stream] deepgram error', err?.message),
      onClose: () => {
        if (gen !== st.gen) return; // we closed it ourselves
        st.dg = null;
        st.ready = false;
        scheduleReconnect(st);
      },
    });
    if (!connect || !dg) {
      toOwner(st, 'stream:error', { fatal: true, message: 'Speech-to-text is not configured (missing DEEPGRAM_API_KEY on the server).' });
      destroy(st.sessionId, 'unavailable');
      return;
    }
    st.dg = dg;
  }

  function destroy(sessionId, reason = 'stopped') {
    const st = streams.get(sessionId);
    if (!st) return;
    st.closing = true;
    clearTimeout(st.graceTimer);
    closeLink(st);
    streams.delete(sessionId);
    stopAnalysis(sessionId);
    pauseRecording(sessionId).catch((err) => console.error('[stream] failed to pause recording', err));
    if (reason === 'ended') io.to(sessionId).emit('stream:ended', { sessionId });
    if (st.socketId) {
      const s = io.sockets.sockets.get(st.socketId);
      if (s) s.data.streamSession = null;
    }
  }
  controls = { destroy };

  // The socket is gone but the person may be back in a moment: close the link and the segment, keep the stream.
  function detach(st) {
    st.socketId = null;
    closeLink(st);
    pauseRecording(st.sessionId).catch(() => {});
    clearTimeout(st.graceTimer);
    st.graceTimer = setTimeout(() => destroy(st.sessionId, 'timeout'), GRACE_MS);
  }

  io.on('connection', (socket) => {
    const mine = () => {
      const id = socket.data.streamSession;
      const st = id ? streams.get(id) : null;
      return st && st.socketId === socket.id ? st : null;
    };

    socket.on('stream:start', async (msg) => {
      try {
        const sessionId = String(msg?.sessionId ?? '');
        const user = socket.data.user;
        if (!user || !mongoose.isValidObjectId(sessionId)) return;
        const session = await Session.findById(sessionId).select('status').lean();
        if (!session || session.status !== 'live') {
          return socket.emit('stream:error', { fatal: true, code: 'ended', message: 'This session has ended, so it can’t be streamed.' });
        }
        let st = streams.get(sessionId);
        if (st && String(st.ownerId) !== String(user._id)) {
          const busy = st.socketId && io.sockets.sockets.get(st.socketId)?.connected && Date.now() - st.lastAudioAt < 30_000;
          if (busy) return socket.emit('stream:error', { fatal: true, code: 'busy', message: `${st.ownerName} is already streaming this session.` });
          destroy(sessionId, 'taken');
          st = null;
        }
        if (!st) {
          st = {
            sessionId,
            ownerId: String(user._id),
            ownerName: user.name,
            socketId: null,
            dg: null,
            gen: 0,
            ready: false,
            attempts: 0,
            resumed: false,
            closing: false,
            retryTimer: null,
            graceTimer: null,
            lastAudioAt: 0,
            analysis: null,
          };
          st.analysis = startAnalysis(sessionId, {
            onQuote: async ({ text, imagePrompt, caption, sourceText, groupId }) => {
              try {
                const quote = await Quote.create({ session: sessionId, text, imagePrompt, caption, sourceText, groupId });
                io.to(sessionId).emit('quote:new', quote);
              } catch (err) {
                console.error('[stream] failed to persist quote', err);
              }
            },
            onInsight: async ({ type, text, reference, items, groupId }) => {
              try {
                // A groupId means this is an enumerated list that can grow across transcript windows - upsert so later items
                // land on the same doc instead of creating a duplicate insight each time a new item is heard.
                const insight = groupId ? await Insight.findOneAndUpdate({ session: sessionId, groupId }, { type, text, reference, items }, { new: true, upsert: true }) : await Insight.create({ session: sessionId, type, text, reference });
                io.to(sessionId).emit('insight:new', insight);
              } catch (err) {
                console.error('[stream] failed to persist insight', err);
              }
            },
          });
          streams.set(sessionId, st);
        } else {
          clearTimeout(st.graceTimer);
          if (st.socketId && st.socketId !== socket.id) {
            // The same person opened it somewhere else (or this is their old tab): the old one lets go.
            const old = io.sockets.sockets.get(st.socketId);
            old?.emit('stream:replaced', { sessionId });
            if (old) old.data.streamSession = null;
          }
        }
        st.socketId = socket.id;
        st.lastAudioAt = Date.now();
        st.attempts = 0;
        socket.data.streamSession = sessionId;
        socket.join(sessionId);
        openLink(st);
      } catch (err) {
        console.error('[stream:start]', err);
        socket.emit('stream:error', { message: 'Couldn’t start the stream. Try again.' });
      }
    });

    let toldLost = false;
    socket.on('stream:audio', (chunk) => {
      const st = mine();
      if (!st) {
        // The browser thinks it is streaming but this server has no stream for it (the server restarted, or the grace period
        // passed). Tell it once so it starts the stream again by itself.
        if (!toldLost) {
          toldLost = true;
          socket.emit('stream:lost');
          setTimeout(() => (toldLost = false), 5000).unref?.();
        }
        return;
      }
      st.lastAudioAt = Date.now();
      appendAudioChunk(st.sessionId, chunk); // the recording keeps going even while transcription reconnects
      if (st.ready && st.dg) {
        try {
          st.dg.send(chunk);
        } catch (err) {
          console.error('[stream] failed to forward audio chunk', err);
        }
      }
    });

    // A page showing a session listens to its live feed (transcript, quotes, insights), whoever is streaming it.
    socket.on('session:watch', (msg) => {
      const sessionId = String(msg?.sessionId ?? '');
      if (socket.data.authed && mongoose.isValidObjectId(sessionId)) socket.join(sessionId);
    });

    socket.on('stream:stop', () => {
      const st = mine();
      if (st) destroy(st.sessionId, 'stopped');
    });

    socket.on('disconnect', () => {
      const st = mine();
      if (st) detach(st);
    });
  });
}
