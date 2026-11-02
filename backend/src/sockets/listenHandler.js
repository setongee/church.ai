import { createDeepgramLiveConnection } from '../services/deepgram.service.js';

// The Present screen's "Listen" (server engine): the operator's browser streams raw 16-bit mono PCM here, it goes
// to Deepgram live, and the interim + final transcript comes straight back (`listen:transcript`). The browser
// does the scripture spotting. Presenter role only (see the socket gate in server.js).
//
// It is meant to run through a whole service, so a hiccup must not end it: if the link to Deepgram drops the server reconnects
// it by itself and holds the last few seconds of audio meanwhile, so nothing said is lost. The browser does the same on its
// side if its own connection to the server drops (see lib/listen/engines.ts).
//
// Events in:  listen:start { sampleRate } · listen:audio <binary PCM16> · listen:stop
// Events out: listen:ready { resumed } · listen:status { state: 'reconnecting', attempt } · listen:transcript { text, isFinal }
//             listen:error { message, code? } (only for things a retry won't fix)

// Book names the model should favour (it otherwise hears "Habakkuk" as nonsense).
const BOOK_KEYWORDS = ['Genesis', 'Exodus', 'Leviticus', 'Deuteronomy', 'Joshua', 'Ruth', 'Samuel', 'Chronicles', 'Nehemiah', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Hosea', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Romans', 'Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', 'Thessalonians', 'Timothy', 'Titus', 'Philemon', 'Hebrews', 'Revelation'].map((w) => `${w}:2`);

const RETRY_MS = [300, 800, 1500, 3000, 6000, 10000]; // then every 10 s while the browser is listening
const HOLD_CHUNKS = 150; // about 15 s of audio (100 ms chunks) held while the link is down

export function registerListenHandlers(io, { connect = createDeepgramLiveConnection } = {}) {
  io.on('connection', (socket) => {
    let dg = null;
    let gen = 0;
    let active = false; // the browser wants to be listening
    let ready = false;
    let attempts = 0;
    let retry = null;
    let rate = 16000;
    let resumed = false;
    let held = []; // audio that arrived while the link was down

    const closeLink = () => {
      gen += 1;
      ready = false;
      clearTimeout(retry);
      const c = dg;
      dg = null;
      try {
        c?.requestClose();
      } catch {
        // already closed
      }
    };

    const reconnect = () => {
      clearTimeout(retry);
      if (!active) return;
      const wait = RETRY_MS[Math.min(attempts, RETRY_MS.length - 1)];
      attempts += 1;
      socket.emit('listen:status', { state: 'reconnecting', attempt: attempts });
      retry = setTimeout(open, wait);
    };

    const open = () => {
      closeLink();
      const mine = gen;
      const c = connect({
        options: { encoding: 'linear16', sampleRate: rate, keywords: BOOK_KEYWORDS },
        onOpen: () => {
          if (mine !== gen) return;
          ready = true;
          attempts = 0;
          for (const chunk of held.splice(0)) c?.send(chunk); // what was said while it was down
          socket.emit('listen:ready', { resumed });
          resumed = true;
        },
        onTranscript: ({ text, isFinal }) => mine === gen && socket.emit('listen:transcript', { text, isFinal }),
        onError: (err) => console.error('[listen] deepgram error', err?.message),
        onClose: () => {
          if (mine !== gen) return;
          dg = null;
          ready = false;
          reconnect();
        },
      });
      if (!c) {
        active = false;
        socket.emit('listen:error', { code: 'no-key', message: 'Server listening isn’t set up yet (the server has no DEEPGRAM_API_KEY).' });
        return;
      }
      dg = c;
    };

    socket.on('listen:start', (msg) => {
      closeLink();
      held = [];
      attempts = 0;
      resumed = false;
      active = true;
      rate = Math.min(48000, Math.max(8000, Number(msg?.sampleRate) || 16000));
      open();
    });

    socket.on('listen:audio', (chunk) => {
      if (!active) return;
      if (ready && dg) {
        try {
          dg.send(chunk);
        } catch (err) {
          console.error('[listen] failed to forward audio', err.message);
        }
        return;
      }
      held.push(chunk);
      if (held.length > HOLD_CHUNKS) held.shift();
    });

    const stop = () => {
      active = false;
      held = [];
      closeLink();
    };
    socket.on('listen:stop', stop);
    socket.on('disconnect', stop);
  });
}
