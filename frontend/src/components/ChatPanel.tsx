'use client';

import { useState } from 'react';
import { postChatMessage } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';

export function ChatPanel({ sessionId, initialMessages }: { sessionId: string; initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError('');
    setSending(true);
    setInput('');
    setMessages((prev) => [
      ...prev,
      { _id: `local-${Date.now()}`, session: sessionId, role: 'user', text, createdAt: new Date().toISOString() },
    ]);

    try {
      const { assistantMessage } = await postChatMessage(sessionId, text);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Ask about this service</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        Ask questions about anything said during this session.
      </p>

      <div className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="py-4 text-center text-xs text-neutral-400">No questions yet - ask something below.</p>
        )}
        {messages.map((m) => (
          <div
            key={m._id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'ml-auto bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-800'
            }`}
          >
            {m.text}
          </div>
        ))}
        {sending && <div className="max-w-[85%] rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-400">Thinking...</div>}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder="What did the preacher say about..."
          rows={2}
          className="flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
