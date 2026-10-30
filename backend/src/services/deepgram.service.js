import WebSocket from 'ws';
import { env } from '../config/env.js';

const DEEPGRAM_LIVE_URL = 'wss://api.deepgram.com/v1/listen';

// Talks to Deepgram's live streaming WebSocket directly via the `ws` package rather than
// through @deepgram/sdk's own transport layer. Node's native `WebSocket` global (which the SDK
// auto-selects on Node 22+) was attempting an experimental HTTP/2 upgrade path
// ("WebSocket over HTTP2 is experimental") that caused connections to open successfully and
// then abruptly drop with code 1006 a moment later. The SDK's alternate custom-transport path
// also never wires up its event listeners, so working around it there wasn't an option either.
// `options` (all optional): { encoding, sampleRate } for raw PCM instead of container audio, { keywords: [word, ...] } to
// boost words the model should favour (Bible book names for the Present listener).
export function createDeepgramLiveConnection({ onOpen, onTranscript, onError, onClose, options = {} }) {
  if (!env.deepgramApiKey) {
    console.warn('[deepgram] missing DEEPGRAM_API_KEY, live transcription disabled');
    return null;
  }

  const params = new URLSearchParams({
    model: 'nova-2',
    language: 'en',
    smart_format: 'true',
    punctuate: 'true',
    interim_results: 'true',
    endpointing: '300',
  });

  if (options.encoding) {
    params.set('encoding', options.encoding);
    params.set('sample_rate', String(options.sampleRate || 16000));
    params.set('channels', '1');
  }
  for (const k of options.keywords || []) params.append('keywords', k);

  const ws = new WebSocket(`${DEEPGRAM_LIVE_URL}?${params.toString()}`, {
    headers: { Authorization: `Token ${env.deepgramApiKey}` },
  });

  ws.on('open', () => {
    console.log('[deepgram] connection open');
    onOpen?.();
  });

  ws.on('message', (data) => {
    let parsed;
    try {
      parsed = JSON.parse(data.toString());
    } catch (err) {
      console.error('[deepgram] failed to parse message', err);
      return;
    }

    if (parsed.type === 'Results') {
      const alt = parsed?.channel?.alternatives?.[0];
      const text = alt?.transcript;
      if (!text) return;
      onTranscript?.({
        text,
        isFinal: Boolean(parsed.is_final),
        startMs: Math.round((parsed.start ?? 0) * 1000),
        endMs: Math.round(((parsed.start ?? 0) + (parsed.duration ?? 0)) * 1000),
      });
    } else if (parsed.type === 'Metadata') {
      console.log('[deepgram] metadata', JSON.stringify(parsed));
    } else {
      console.log('[deepgram] unhandled message', JSON.stringify(parsed));
    }
  });

  ws.on('error', (err) => {
    console.error('[deepgram] error', err);
    onError?.(err);
  });

  ws.on('close', (code, reason) => {
    console.log('[deepgram] connection closed', JSON.stringify({ code, reason: reason?.toString() }));
    onClose?.();
  });

  return {
    send(chunk) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    },
    isConnected() {
      return ws.readyState === WebSocket.OPEN;
    },
    requestClose() {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
      } catch (err) {
        console.error('[deepgram] failed to send CloseStream', err);
      }
      ws.close();
    },
  };
}

// Batch (non-streaming) transcription of a finished audio file, with word-level timings.
// Returns { durationSec, words: [{ w, s, e }], utterances: [{ text, s, e }] }, timed in seconds
// from the start of the file.
export async function transcribeFile(buffer, mimetype = 'audio/mpeg') {
  if (!env.deepgramApiKey) {
    const err = new Error('Speech-to-text is not configured (missing DEEPGRAM_API_KEY on the server).');
    err.status = 503;
    throw err;
  }

  const params = new URLSearchParams({
    model: 'nova-2',
    language: 'en',
    smart_format: 'true',
    punctuate: 'true',
    utterances: 'true',
    utt_split: '0.8',
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Token ${env.deepgramApiKey}`, 'Content-Type': mimetype },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Transcription failed (${res.status}): ${body.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const words = (alt?.words ?? []).map((x) => ({ w: x.punctuated_word || x.word, s: x.start, e: x.end }));
  const utterances = (data?.results?.utterances ?? []).map((u) => ({ text: u.transcript, s: u.start, e: u.end }));
  return { durationSec: data?.metadata?.duration ?? words.at(-1)?.e ?? 0, words, utterances };
}
