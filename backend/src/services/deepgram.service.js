import WebSocket from 'ws';
import { env } from '../config/env.js';

const DEEPGRAM_LIVE_URL = 'wss://api.deepgram.com/v1/listen';

// Talks to Deepgram's live streaming WebSocket directly via the `ws` package rather than
// through @deepgram/sdk's own transport layer. Node's native `WebSocket` global (which the SDK
// auto-selects on Node 22+) was attempting an experimental HTTP/2 upgrade path
// ("WebSocket over HTTP2 is experimental") that caused connections to open successfully and
// then abruptly drop with code 1006 a moment later. The SDK's alternate custom-transport path
// also never wires up its event listeners, so working around it there wasn't an option either.
export function createDeepgramLiveConnection({ onOpen, onTranscript, onError, onClose }) {
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
