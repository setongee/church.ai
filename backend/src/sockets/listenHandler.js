import { createDeepgramLiveConnection } from '../services/deepgram.service.js';

// The Present screen's "Listen" (server engine): the operator's browser streams raw 16-bit mono PCM here, it goes
// to Deepgram live, and the interim + final transcript comes straight back (`listen:transcript`). The browser
// does the scripture spotting. Presenter role only (see the socket gate in server.js).
//
// Events in:  listen:start { sampleRate } · listen:audio <binary PCM16> · listen:stop
// Events out: listen:ready · listen:transcript { text, isFinal } · listen:error { message, code? }

// Book names the model should favour (it otherwise hears "Habakkuk" as nonsense).
const BOOK_KEYWORDS = ['Genesis', 'Exodus', 'Leviticus', 'Deuteronomy', 'Joshua', 'Ruth', 'Samuel', 'Chronicles', 'Nehemiah', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Hosea', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Romans', 'Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', 'Thessalonians', 'Timothy', 'Titus', 'Philemon', 'Hebrews', 'Revelation'].map((w) => `${w}:2`);

export function registerListenHandlers(io) {
  io.on('connection', (socket) => {
    let dg = null;
    let sentAudio = false;

    const stop = () => {
      const c = dg;
      dg = null;
      if (c) c.requestClose();
    };

    socket.on('listen:start', (msg) => {
      stop();
      sentAudio = false;
      const rate = Math.min(48000, Math.max(8000, Number(msg?.sampleRate) || 16000));
      dg = createDeepgramLiveConnection({
        options: { encoding: 'linear16', sampleRate: rate, keywords: BOOK_KEYWORDS },
        onOpen: () => socket.emit('listen:ready'),
        onTranscript: ({ text, isFinal }) => socket.emit('listen:transcript', { text, isFinal }),
        onError: (err) => socket.emit('listen:error', { message: err?.message || 'The transcription service had a problem.' }),
        onClose: () => {
          if (dg) {
            dg = null;
            socket.emit('listen:error', { message: 'The transcription connection closed. Start listening again to resume.' });
          }
        },
      });
      if (!dg) socket.emit('listen:error', { code: 'no-key', message: 'Server listening isn’t set up yet (the server has no DEEPGRAM_API_KEY).' });
    });

    socket.on('listen:audio', (chunk) => {
      if (!dg) {
        if (!sentAudio) {
          sentAudio = true;
          socket.emit('listen:error', { message: 'Lost the transcription connection. Start listening again.' });
        }
        return;
      }
      try {
        dg.send(chunk);
      } catch (err) {
        console.error('[listen] failed to forward audio', err.message);
      }
    });

    socket.on('listen:stop', stop);
    socket.on('disconnect', stop);
  });
}
