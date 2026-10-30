"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import { findSongs, saveSong, songSlides, type Song, type SongFindResponse } from "@/lib/present";
import { btnPrimary, Field, inputCls, Modal } from "./ui";

// Search for a song by name, artist or a line you remember. AI works out which song is meant, then
// lyrics are read from ordinary web search results; pick the version you like and it becomes a song.
export function SongFinder({ onClose, onCreated }: { onClose: () => void; onCreated: (song: Song) => void }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SongFindResponse | null>(null);
  const [error, setError] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);

  const picked = data?.results.find((r) => r.id === pickedId) ?? null;
  const slides = useMemo(() => (picked ? songSlides({ title: picked.title, lyrics: picked.lyrics }) : []), [picked]);

  function pick(id: string) {
    const r = data?.results.find((x) => x.id === id);
    if (!r) return;
    setPickedId(id);
    setTitle(r.title);
    setAuthor(r.artist);
  }

  async function run(query: string) {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError("");
    setData(null);
    setPickedId("");
    try {
      const r = await findSongs(query.trim());
      setData(r);
      if (r.results[0]) {
        setPickedId(r.results[0].id);
        setTitle(r.results[0].title);
        setAuthor(r.results[0].artist);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    if (!loading) run(q);
  }

  async function create() {
    if (!picked || !title.trim()) return;
    setSaving(true);
    setError("");
    try {
      onCreated(await saveSong({ title: title.trim(), author: author.trim(), lyrics: picked.lyrics }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the song");
      setSaving(false);
    }
  }

  return (
    <Modal title="Find lyrics" onClose={onClose} wide>
      <div className="space-y-4">
        <form onSubmit={search} className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-500" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Song name, artist, or a line you remember…" className={`${inputCls} pl-10`} />
          </div>
          <button type="submit" disabled={loading || q.trim().length < 2} className={btnPrimary}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? "Searching the web…" : "Search"}
          </button>
        </form>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {data?.busy && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Web search isn’t responding right now, so nothing could be fetched. Wait a moment and search again.</p>
        )}
        {data && !data.busy && data.results.length === 0 && <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No lyrics could be read from the search results. Try the song title and artist.</p>}

        {data && data.guesses.length > 0 && data.results.length > 0 && (
          <p className="flex items-center gap-2 text-xs text-neutral-500">
            <Sparkles size={13} className="text-orange-500" />
            Looks like: <span className="font-semibold text-neutral-800">{data.guesses.map((g) => `${g.title}${g.artist ? ` — ${g.artist}` : ""}`).join(" · ")}</span>
          </p>
        )}

        {data && data.results.length > 0 && (
          <div className="grid h-[60vh] min-h-72 grid-cols-1 gap-3 md:h-[52vh] md:grid-cols-[15rem_1fr]">
            <div className="overflow-y-auto rounded-xl border border-neutral-100 p-1.5">
              {data.results.map((r) => (
                <button key={r.id} onClick={() => pick(r.id)} className={`block w-full rounded-lg px-3 py-2.5 text-left transition ${r.id === pickedId ? "bg-orange-50" : "hover:bg-neutral-50"}`}>
                  <span className={`block truncate text-sm font-semibold ${r.id === pickedId ? "text-orange-700" : "text-neutral-900"}`}>{r.title}</span>
                  <span className="block truncate text-xs text-neutral-500">{r.artist}</span>
                  <span className="block truncate text-[11px] text-neutral-400">{r.source}</span>
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              {picked && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title">
                      <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Author">
                      <input value={author} onChange={(e) => setAuthor(e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-neutral-50/50 p-2.5">
                    <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-neutral-500">
                      <span>Preview · {slides.length} slides</span>
                      <a href={picked.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-orange-600 hover:underline">
                        {picked.source} <ExternalLink size={11} />
                      </a>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {slides.map((s, i) => (
                        <div key={i} className="rounded-lg bg-white p-2.5">
                          {s.kind === "song" && (
                            <>
                              {s.label && <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-orange-600">{s.label}</span>}
                              <span className="block whitespace-pre-line text-xs leading-snug text-neutral-700">{s.text}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-snug text-neutral-400">Lyrics are copied from the web page shown above. Check they’re accurate and complete, and that your church’s licence covers showing them.</p>
                    <button onClick={create} disabled={saving || !title.trim()} className={`${btnPrimary} shrink-0`}>
                      {saving && <Loader2 size={16} className="animate-spin" />}
                      Create song
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!data && !loading && !error && <p className="py-6 text-center text-sm text-neutral-400">Try “oceans”, “excess love mercy chinwo”, or a lyric like “you call me out upon the waters”. Searches zionlyrics.com, the Tonality Nigerian songbook and the wider web.</p>}
      </div>
    </Modal>
  );
}
