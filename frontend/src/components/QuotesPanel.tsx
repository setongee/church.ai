"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quote } from "@/lib/types";

function useCopy() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // clipboard not available, ignore
    }
  };
  return { copiedId, copy };
}

interface QuoteGroup {
  groupId: string;
  items: Quote[];
}

function groupQuotes(quotes: Quote[]): QuoteGroup[] {
  const order: string[] = [];
  const map = new Map<string, Quote[]>();
  // `quotes` is newest-first; the first time a group is seen here is its newest member, so
  // `order` naturally comes out newest-group-first too.
  for (const q of quotes) {
    const key = q.groupId || q._id;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(q);
  }
  return order.map((groupId) => ({
    groupId,
    items: [...map.get(groupId)!].reverse(),
  }));
}

function QuoteCard({
  quote,
  copiedId,
  onCopy,
  selected,
  onToggleSelect,
}: {
  quote: Quote;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const router = useRouter();
  return (
    <div
      className={`flex h-full! justify-between flex-col rounded-lg border p-3 ${selected ? "border-amber-400 bg-amber-100" : "border-amber-200 bg-amber-50"}`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(quote._id)}
          className="mt-1 h-4 w-4 shrink-0 accent-amber-600"
          aria-label="Select quote"
        />
        <p className="text-sm font-medium leading-snug text-neutral-900">
          &ldquo;{quote.text}&rdquo;
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => onCopy(`${quote._id}-text`, quote.text)}
          className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
        >
          {copiedId === `${quote._id}-text` ? "Copied!" : "Copy quote"}
        </button>
        <button
          onClick={() => router.push(`/editor/${quote._id}`)}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Generate image
        </button>
      </div>
    </div>
  );
}

export function QuotesPanel({ quotes }: { quotes: Quote[] }) {
  const { copiedId, copy } = useCopy();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupQuotes(quotes), [quotes]);

  function toggle(groupId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = quotes.length > 0 && selected.size === quotes.length;

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(quotes.map((q) => q._id)));
  }

  const selectedText = quotes
    .filter((q) => selected.has(q._id))
    .map((q) => `"${q.text}"`)
    .join("\n\n");

  async function copySelected() {
    try {
      await navigator.clipboard.writeText(selectedText);
    } catch {
      // clipboard not available, ignore
    }
  }

  function shareSelectedToWhatsApp() {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(selectedText)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Punchy quotes
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Ready to post. Copy and drop into your image generator of choice.
          </p>
        </div>
        {quotes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            {selected.size > 0 && (
              <>
                <button
                  onClick={copySelected}
                  className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
                >
                  Copy selected ({selected.size})
                </button>
                <button
                  onClick={shareSelectedToWhatsApp}
                  className="rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                >
                  Share to WhatsApp
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 grid max-h-[70vh] grid-cols-1 gap-5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {groups.length === 0 && (
          <p className="col-span-full py-6 text-center text-xs text-neutral-400">
            Quotes will appear here as soon as something quotable is said.
          </p>
        )}
        {groups.map(({ groupId, items }) => {
          const [primary, ...rest] = items;
          const isExpanded = expanded.has(groupId);
          return (
            <div key={groupId}>
              <QuoteCard
                quote={primary}
                copiedId={copiedId}
                onCopy={copy}
                selected={selected.has(primary._id)}
                onToggleSelect={toggleSelect}
              />
              {/* {rest.length > 0 && (
                <div className="mt-1.5 pl-2">
                  <button
                    onClick={() => toggle(groupId)}
                    className="text-xs font-medium text-amber-700 hover:underline"
                  >
                    {isExpanded ? "Hide" : `+${rest.length} similar`} variation
                    {rest.length > 1 ? "s" : ""}
                  </button>
                  {isExpanded && (
                    <div className="mt-2 flex flex-col gap-2 border-l-2 border-amber-200 pl-3">
                      {rest.map((q) => (
                        <QuoteCard
                          key={q._id}
                          quote={q}
                          copiedId={copiedId}
                          onCopy={copy}
                          selected={selected.has(q._id)}
                          onToggleSelect={toggleSelect}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )} */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
