'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from './socket';
import type { Insight, Quote, TranscriptSegment } from './types';

interface UseLiveSessionOptions {
  sessionId: string;
  initialTranscript: TranscriptSegment[];
  initialQuotes: Quote[];
  initialInsights: Insight[];
}

export function useLiveSession({
  sessionId,
  initialTranscript,
  initialQuotes,
  initialInsights,
}: UseLiveSessionOptions) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>(initialTranscript);
  const [interimText, setInterimText] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [isStarting, setIsStarting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      setAudioDevices(mics);
      setSelectedDeviceId((prev) => {
        if (prev && mics.some((m) => m.deviceId === prev)) return prev;
        return mics[0]?.deviceId ?? '';
      });
    } catch {
      // enumerateDevices can fail before permission is granted in some browsers; ignore.
    }
  }, []);

  useEffect(() => {
    // Fetching the device list on mount (and on devicechange) is exactly the "synchronize with
    // an external system" case effects are for; the state update happens asynchronously after
    // the enumerateDevices() promise resolves, not synchronously during this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  useEffect(() => {
    const socket = getSocket();

    function onTranscriptChunk({ text, isFinal }: { text: string; isFinal: boolean }) {
      if (isFinal) {
        setInterimText('');
        setTranscript((prev) => [
          ...prev,
          {
            _id: `${Date.now()}-${Math.random()}`,
            session: sessionId,
            text,
            isFinal: true,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setInterimText(text);
      }
    }

    function onQuoteNew(quote: Quote) {
      setQuotes((prev) => [quote, ...prev]);
    }

    function onInsightNew(insight: Insight) {
      // A grouped keyPoint list re-emits the same _id (same groupId) with more items appended
      // each time a new item is heard, so this needs to replace, not just append.
      setInsights((prev) => {
        const idx = prev.findIndex((i) => i._id === insight._id);
        if (idx === -1) return [...prev, insight];
        const next = [...prev];
        next[idx] = insight;
        return next;
      });
    }

    function onStreamError({ message }: { message: string }) {
      setError(message);
    }

    // If the underlying socket drops mid-stream (server restart, network blip), socket.io
    // reconnects transparently but the server loses all state tied to the old connection -
    // including the Deepgram link. Audio would otherwise keep "streaming" from the client's
    // point of view (recorder still running, mic pulse still animating) while silently going
    // nowhere. Stop cleanly and surface it instead of leaving that invisible.
    function onDisconnect() {
      if (!mediaRecorderRef.current) return;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsStarting(false);
      setIsStreaming(false);
      setMicStream(null);
      setError('Connection to the server was lost. Click "Start streaming" to resume.');
    }

    socket.on('transcript:chunk', onTranscriptChunk);
    socket.on('quote:new', onQuoteNew);
    socket.on('insight:new', onInsightNew);
    socket.on('stream:error', onStreamError);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('transcript:chunk', onTranscriptChunk);
      socket.off('quote:new', onQuoteNew);
      socket.off('insight:new', onInsightNew);
      socket.off('stream:error', onStreamError);
      socket.off('disconnect', onDisconnect);
    };
  }, [sessionId]);

  const start = useCallback(async () => {
    setError('');
    setIsStarting(true);
    try {
      const socket = getSocket();
      if (!socket.connected) socket.connect();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      });
      streamRef.current = stream;
      // Labels are blank until permission is granted; refresh now that it has been.
      refreshDevices();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data.size === 0) return;
        const buffer = await event.data.arrayBuffer();
        socket.emit('stream:audio', buffer);
      };

      // The backend only confirms `stream:ready` once its Deepgram connection is actually
      // open. Starting the recorder before that would send audio the server has nowhere to
      // forward yet - and losing the first chunk (which carries the WebM header every later
      // chunk depends on) would silently break transcription for the whole session.
      const ready = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off('stream:ready', onReady);
          socket.off('stream:error', onStreamErr);
          reject(new Error('Timed out waiting for the server to confirm the stream was ready.'));
        }, 15000);
        const onReady = () => {
          clearTimeout(timeout);
          socket.off('stream:error', onStreamErr);
          resolve();
        };
        const onStreamErr = ({ message }: { message: string }) => {
          clearTimeout(timeout);
          socket.off('stream:ready', onReady);
          reject(new Error(message));
        };
        socket.once('stream:ready', onReady);
        socket.once('stream:error', onStreamErr);
      });

      socket.emit('stream:start', { sessionId });
      await ready;

      recorder.start(250);
      setIsStreaming(true);
      setMicStream(stream);
    } catch (err) {
      mediaRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setError(err instanceof Error ? err.message : 'Could not access microphone');
      setIsStreaming(false);
      setMicStream(null);
    } finally {
      setIsStarting(false);
    }
  }, [sessionId, selectedDeviceId, refreshDevices]);

  // Lets tabs that mutate a quote after the fact (captions, Instagram publish state) write the
  // result back into the same list `QuotesPanel` reads, instead of keeping a separate copy that
  // could drift out of sync.
  const updateQuote = useCallback((updated: Quote) => {
    setQuotes((prev) => prev.map((q) => (q._id === updated._id ? updated : q)));
  }, []);

  const stop = useCallback(() => {
    const socket = getSocket();
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    socket.emit('stream:stop');
    setIsStreaming(false);
    setInterimText('');
    setMicStream(null);
  }, []);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    transcript,
    interimText,
    quotes,
    updateQuote,
    insights,
    isStarting,
    isStreaming,
    error,
    micStream,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    start,
    stop,
  };
}
