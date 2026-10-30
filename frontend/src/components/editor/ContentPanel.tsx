'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Plus } from 'lucide-react';
import { getService, getSession, listServices } from '@/lib/api';
import type { Service, Session, SessionDetail } from '@/lib/types';
import type { DesignCanvas } from './useDesignCanvas';
import { PanelSection, Spinner, cx } from './ui';

const selectClass = 'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-50';

function Item({ text, ed }: { text: string; ed: DesignCanvas }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="group flex items-start gap-2 rounded-lg border border-neutral-200 p-2.5">
      <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-snug text-neutral-800">{text}</p>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          title="Copy"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          title="Add to design"
          onClick={() => ed.addText('body', { text })}
          className="rounded-md bg-neutral-900 p-1.5 text-white hover:bg-neutral-700"
        >
          <Plus size={14} />
        </button>
      </div>
    </li>
  );
}

function Group({ title, items, ed, joinLabel }: { title: string; items: string[]; ed: DesignCanvas; joinLabel?: string }) {
  if (items.length === 0) return null;
  return (
    <PanelSection
      title={`${title} (${items.length})`}
      action={
        joinLabel && items.length > 1 ? (
          <button type="button" onClick={() => ed.addText('body', { text: items.map((t, i) => `${i + 1}. ${t}`).join('\n\n') })} className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900">
            {joinLabel}
          </button>
        ) : undefined
      }
    >
      <ul className="space-y-2">
        {items.map((t, i) => (
          <Item key={`${i}-${t.slice(0, 20)}`} text={t} ed={ed} />
        ))}
      </ul>
    </PanelSection>
  );
}

// Service -> session selects. Reports the loaded session via onLoaded (null while nothing is picked).
export function SessionPicker({ onLoaded }: { onLoaded: (d: SessionDetail | null) => void }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listServices()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

  function pickService(id: string) {
    setServiceId(id);
    setSessionId('');
    onLoaded(null);
    setSessions(null);
    setError('');
    if (!id) return;
    setLoading('sessions');
    getService(id)
      .then((d) => setSessions(d.sessions))
      .catch(() => setError('Could not load that service’s sessions.'))
      .finally(() => setLoading(''));
  }

  function pickSession(id: string) {
    setSessionId(id);
    onLoaded(null);
    setError('');
    if (!id) return;
    setLoading('detail');
    getSession(id)
      .then(onLoaded)
      .catch(() => setError('Could not load that session.'))
      .finally(() => setLoading(''));
  }

  return (
    <div className="space-y-2.5">
      <select value={serviceId} onChange={(e) => pickService(e.target.value)} className={selectClass} aria-label="Service">
        <option value="">{services ? 'Choose a service…' : 'Loading services…'}</option>
        {(services ?? []).map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </select>
      <select value={sessionId} onChange={(e) => pickSession(e.target.value)} disabled={!serviceId || loading === 'sessions'} className={selectClass} aria-label="Session">
        <option value="">{loading === 'sessions' ? 'Loading sessions…' : sessions && sessions.length === 0 ? 'No sessions in this service' : 'Choose a session…'}</option>
        {(sessions ?? []).map((s) => (
          <option key={s._id} value={s._id}>
            {s.title}
            {s.preacher ? ` — ${s.preacher}` : ''}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading === 'detail' && (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <Spinner className="h-3 w-3" /> Loading content…
        </p>
      )}
    </div>
  );
}

// Everything usable as a "point" from a session, grouped by kind.
export function sessionSources(d: SessionDetail | null): { label: string; items: string[] }[] {
  if (!d) return [];
  const sum = d.session.summary;
  const live = (type: string) => d.insights.filter((i) => i.type === type).flatMap((i) => (i.items?.length ? i.items : [i.reference ? `${i.text} (${i.reference})` : i.text]));
  return [
    { label: 'Key points', items: sum?.keyPoints?.length ? sum.keyPoints : live('keyPoint') },
    { label: 'Scriptures', items: sum?.scriptures?.length ? sum.scriptures : live('scripture') },
    { label: 'Declarations', items: sum?.declarations?.length ? sum.declarations : live('declaration') },
    { label: 'Topics', items: sum?.topics ?? [] },
    { label: 'Quotes', items: d.quotes.map((q) => q.text) },
    { label: 'Post slides', items: (d.session.carousel ?? []).map((c) => `${c.title}: ${c.body}`) },
  ].filter((s) => s.items.length > 0);
}

// Pick a service, then one of its sessions, and pull its key points, scriptures, declarations,
// quotes and live notes straight onto the canvas.
export function ContentPanel({ ed }: { ed: DesignCanvas }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  const summary = detail?.session.summary;
  const insights = detail?.insights ?? [];
  const noteOf = (type: string) =>
    insights.filter((i) => i.type === type).map((i) => (i.items?.length ? `${i.text}\n${i.items.map((x, n) => `${n + 1}. ${x}`).join('\n')}` : i.reference ? `${i.text} (${i.reference})` : i.text));
  const quotes = (detail?.quotes ?? []).map((q) => q.text);
  const hasAnything = !!summary || insights.length > 0 || quotes.length > 0;

  return (
    <div>
      <PanelSection title="Source">
        <SessionPicker onLoaded={setDetail} />
      </PanelSection>

      {detail && !hasAnything && <p className="px-4 py-4 text-sm text-neutral-400">This session has no summary, notes or quotes yet.</p>}

      {summary?.overview && (
        <PanelSection title="Overview">
          <ul>
            <Item text={summary.overview} ed={ed} />
          </ul>
        </PanelSection>
      )}
      <Group title="Key points" items={summary?.keyPoints ?? []} ed={ed} joinLabel="Add all" />
      <Group title="Topics" items={summary?.topics ?? []} ed={ed} />
      <Group title="Scriptures" items={summary?.scriptures ?? []} ed={ed} />
      <Group title="Declarations" items={summary?.declarations ?? []} ed={ed} />
      <Group title="Quotes" items={quotes} ed={ed} />
      {/* Live notes only add what the final summary doesn't already cover, e.g. a live session. */}
      {!summary && (
        <>
          <Group title="Live key points" items={noteOf('keyPoint')} ed={ed} joinLabel="Add all" />
          <Group title="Live scriptures" items={noteOf('scripture')} ed={ed} />
          <Group title="Live declarations" items={noteOf('declaration')} ed={ed} />
        </>
      )}
    </div>
  );
}
