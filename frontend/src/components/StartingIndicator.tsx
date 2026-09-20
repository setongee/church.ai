'use client';

import { useEffect, useState } from 'react';

const MESSAGES = [
  'Setting things up for you',
  'Getting your microphone ready',
  'Your audio stream is being set up',
  'Connecting to the transcription service',
  'Almost there',
];

export function StartingIndicator() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const messageTimer = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);
    const dotTimer = setInterval(() => {
      setDotCount((d) => (d % 3) + 1);
    }, 1000);
    return () => {
      clearInterval(messageTimer);
      clearInterval(dotTimer);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5">
      <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-400" />
      <span className="min-w-[15rem] text-xs font-medium text-neutral-600">
        {MESSAGES[messageIndex]}
        {'.'.repeat(dotCount)}
      </span>
    </div>
  );
}
