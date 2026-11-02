'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSocket } from './socket';
import { useStream } from '@/components/StreamProvider';
import type { Insight, Quote, TranscriptSegment } from './types';

interface UseLiveSessionOptions {
  sessionId: string;
  title: string;
  initialTranscript: TranscriptSegment[];
  initialQuotes: Quote[];
  initialInsights: Insight[];
}

export function useLiveSession({
  sessionId,
  title,
  initialTranscript,
  initialQuotes,
  initialInsights,
}: UseLiveSessionOptions) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>(initialTranscript);
  const [interimText, setInterimText] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [insights, setInsights] = useState<Insight[]>(initialInsights);

  // The microphone and the link to the server belong to the app, not to this page (see StreamProvider), so streaming carries on
  // when you go elsewhere. This hook is just this session's view of it, plus its transcript, quotes and insights.
  const stream = useStream();
  const mine = stream.active?.sessionId === sessionId;
  const isStreaming = mine && (stream.status === 'streaming' || stream.status === 'reconnecting');
  const isStarting = mine && stream.status === 'starting';
  const isPaused = mine && stream.status === 'paused';
  const start = useCallback(() => stream.start(sessionId, title), [stream, sessionId, title]);
  const stop = useCallback(() => {
    if (mine) stream.stop();
    setInterimText('');
  }, [mine, stream]);

  // Coming back to the page after streaming from elsewhere: the server has kept everything, so take its copy when it arrives
  // (never going backwards, so a segment that is on screen but not yet saved doesn't blink away). This adjusts state while
  // rendering, the way React asks for "state that follows a prop".
  const [seen, setSeen] = useState({ t: initialTranscript, q: initialQuotes, i: initialInsights });
  if (seen.t !== initialTranscript || seen.q !== initialQuotes || seen.i !== initialInsights) {
    setSeen({ t: initialTranscript, q: initialQuotes, i: initialInsights });
    if (seen.t !== initialTranscript) setTranscript((prev) => (initialTranscript.length >= prev.length ? initialTranscript : prev));
    if (seen.q !== initialQuotes) setQuotes((prev) => (initialQuotes.length >= prev.length ? initialQuotes : prev));
    if (seen.i !== initialInsights) setInsights((prev) => (initialInsights.length >= prev.length ? initialInsights : prev));
  }

  useEffect(() => {
    const socket = getSocket();
    // Watching a session (this page open) means being in its room, whether or not you are the one streaming it.
    const join = () => socket.emit('session:watch', { sessionId });
    if (socket.connected) join();
    socket.on('connect', join);

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
      setQuotes((prev) => (prev.some((q) => q._id === quote._id) ? prev : [quote, ...prev]));
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

    socket.on('transcript:chunk', onTranscriptChunk);
    socket.on('quote:new', onQuoteNew);
    socket.on('insight:new', onInsightNew);

    return () => {
      socket.off('connect', join);
      socket.off('transcript:chunk', onTranscriptChunk);
      socket.off('quote:new', onQuoteNew);
      socket.off('insight:new', onInsightNew);
    };
  }, [sessionId]);

  // Lets tabs that mutate a quote after the fact (captions, Instagram publish state) write the
  // result back into the same list `QuotesPanel` reads, instead of keeping a separate copy that
  // could drift out of sync.
  const updateQuote = useCallback((updated: Quote) => {
    setQuotes((prev) => prev.map((q) => (q._id === updated._id ? updated : q)));
  }, []);

  return {
    transcript,
    interimText,
    quotes,
    updateQuote,
    insights,
    isStarting,
    isStreaming,
    isPaused,
    reconnecting: mine && stream.status === 'reconnecting',
    error: mine ? stream.error : '',
    micStream: mine ? stream.micStream : null,
    audioDevices: stream.devices,
    selectedDeviceId: stream.deviceId,
    setSelectedDeviceId: stream.setDeviceId,
    start,
    stop,
  };
}
