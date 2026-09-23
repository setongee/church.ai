import { TranscriptSegment } from '../models/TranscriptSegment.model.js';
import { Quote } from '../models/Quote.model.js';
import { Insight } from '../models/Insight.model.js';
import { createDeepgramLiveConnection } from '../services/deepgram.service.js';
import { startAnalysis, stopAnalysis } from '../services/analysis.service.js';
import { startRecording, appendAudioChunk, pauseRecording } from '../services/audioRecording.service.js';

export function registerStreamHandlers(io) {
  io.on('connection', (socket) => {
    let dgConnection = null;
    let currentSessionId = null;

    socket.on('stream:start', ({ sessionId }) => {
      if (!sessionId) return;
      currentSessionId = sessionId;
      socket.join(sessionId);
      startRecording(sessionId);

      const analysis = startAnalysis(sessionId, {
        onQuote: async ({ text, imagePrompt, caption, sourceText, groupId }) => {
          try {
            const quote = await Quote.create({
              session: sessionId,
              text,
              imagePrompt,
              caption,
              sourceText,
              groupId,
            });
            io.to(sessionId).emit('quote:new', quote);
          } catch (err) {
            console.error('[stream] failed to persist quote', err);
          }
        },
        onInsight: async ({ type, text, reference, items, groupId }) => {
          try {
            // A groupId means this is an enumerated list that can grow across transcript
            // windows - upsert so later items land on the same doc instead of creating a
            // duplicate insight each time a new item is heard.
            const insight = groupId
              ? await Insight.findOneAndUpdate(
                  { session: sessionId, groupId },
                  { type, text, reference, items },
                  { new: true, upsert: true }
                )
              : await Insight.create({ session: sessionId, type, text, reference });
            io.to(sessionId).emit('insight:new', insight);
          } catch (err) {
            console.error('[stream] failed to persist insight', err);
          }
        },
      });

      dgConnection = createDeepgramLiveConnection({
        // The SDK's WebSocket connects asynchronously; audio sent before it's open is
        // silently dropped (its internal queue for that case is never flushed). Losing the
        // very first chunk also loses the WebM header every later chunk depends on, which
        // breaks transcription for the rest of the session. So only tell the client to start
        // recording once the connection is actually open.
        onOpen: () => {
          socket.emit('stream:ready');
        },
        onTranscript: async ({ text, isFinal, startMs, endMs }) => {
          io.to(sessionId).emit('transcript:chunk', { text, isFinal });

          if (isFinal) {
            try {
              await TranscriptSegment.create({ session: sessionId, text, isFinal, startMs, endMs });
            } catch (err) {
              console.error('[stream] failed to persist transcript segment', err);
            }
            analysis.addFinalText(text);
          }
        },
        onError: (err) => {
          socket.emit('stream:error', { message: err?.message || 'transcription error' });
        },
        // Deepgram connections have a max duration and can also close on their own (idle
        // timeout, network blip) well before the client's socket.io connection notices
        // anything is wrong. Without this, `dgConnection` would keep pointing at a dead
        // connection, audio would keep going nowhere, and the client would never find out.
        onClose: () => {
          if (dgConnection) {
            dgConnection = null;
            socket.emit('stream:error', {
              message: 'The transcription connection closed unexpectedly. Click "Start streaming" to resume.',
            });
          }
        },
      });

      if (!dgConnection) {
        socket.emit('stream:error', {
          message: 'Speech-to-text is not configured (missing DEEPGRAM_API_KEY on the server).',
        });
      }
    });

    let warnedAboutMissingConnection = false;

    socket.on('stream:audio', (chunk) => {
      if (currentSessionId) appendAudioChunk(currentSessionId, chunk);

      if (!dgConnection) {
        // Audio arriving with no active connection means the client thinks it's still
        // streaming against a link that's gone (e.g. this socket reconnected after a server
        // restart without the client knowing to re-run `stream:start`). Tell it once so it
        // can stop and let the user restart cleanly, instead of silently discarding audio.
        if (!warnedAboutMissingConnection) {
          warnedAboutMissingConnection = true;
          console.warn('[stream] audio received with no active Deepgram connection for this socket');
          socket.emit('stream:error', {
            message: 'Lost the transcription connection. Click "Start streaming" to resume.',
          });
        }
        return;
      }
      try {
        dgConnection.send(chunk);
      } catch (err) {
        console.error('[stream] failed to forward audio chunk', err);
      }
    });

    socket.on('stream:stop', () => {
      cleanup();
    });

    socket.on('disconnect', () => {
      cleanup();
    });

    function cleanup() {
      if (dgConnection) {
        try {
          dgConnection.requestClose();
        } catch {
          // connection may already be closed
        }
        dgConnection = null;
      }
      if (currentSessionId) {
        stopAnalysis(currentSessionId);
        pauseRecording(currentSessionId).catch((err) => {
          console.error('[stream] failed to pause recording', err);
        });
        currentSessionId = null;
      }
    }
  });
}
