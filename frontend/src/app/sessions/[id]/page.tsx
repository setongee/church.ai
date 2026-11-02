"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDesign, deleteSession, endSession, getSession } from "@/lib/api";
import { useLiveSession } from "@/lib/useLiveSession";
import { TranscriptDrawer } from "@/components/TranscriptDrawer";
import { QuotesPanel } from "@/components/QuotesPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { EditorLibrary, type CreateDesignInput } from "@/components/editor/EditorLibrary";
import { MicPulse } from "@/components/MicPulse";
import { MicSelector } from "@/components/MicSelector";
import { StartingIndicator } from "@/components/StartingIndicator";
import { MessageNotesPanel } from "@/components/notes/MessageNotesPanel";
import { ReelsPanel } from "@/components/ReelsPanel";
import { MergedPanel } from "@/components/MergedPanel";
import { AudioPlayer } from "@/components/AudioPlayer";
import { AudioLabPanel } from "@/components/AudioLabPanel";
import type { Service, SessionDetail } from "@/lib/types";

type TabKey = "message" | "notes" | "quotes" | "reels" | "merged" | "audiolab" | "editor";

const ENDED_ONLY_TABS: TabKey[] = ["message", "reels", "merged", "audiolab"];

export default function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; design?: string }>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    getSession(id)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [id]);

  if (!detail) {
    return (
      <main className="mx-auto w-full max-w-8xl px-4 sm:px-20 py-12 text-sm text-neutral-400">
        Loading...
      </main>
    );
  }

  return (
    <SessionView
      id={id}
      detail={detail}
      onDetailChange={setDetail}
      initialTab={TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : undefined}
    />
  );
}

function SessionView({
  id,
  detail,
  onDetailChange,
  initialTab,
}: {
  id: string;
  detail: SessionDetail;
  initialTab?: TabKey;
  onDetailChange: (
    updater: (prev: SessionDetail | null) => SessionDetail | null,
  ) => void;
}) {
  const [ending, setEnding] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [activeTab, setActiveTabState] = useState<TabKey>(
    initialTab ?? "notes",
  );
  const router = useRouter();

  // Keep the URL in sync so a refresh (or a shared link) lands back on the same tab.
  function setActiveTab(tab: TabKey) {
    setActiveTabState(tab);
    const qs = tab === "notes" ? "" : `?tab=${tab}`;
    window.history.replaceState(null, "", qs || window.location.pathname);
  }

  async function handleCreateDesign(input: CreateDesignInput) {
    const { design } = await createDesign({ sessionId: id, ...input });
    router.push(`/design/${design._id}`);
  }

  const live = useLiveSession({
    sessionId: id,
    title: detail.session.title,
    initialTranscript: detail.transcript,
    initialQuotes: detail.quotes,
    initialInsights: detail.insights,
  });

  const { session } = detail;
  const isLive = session.status === "live";
  const service =
    typeof session.service === "object" ? (session.service as Service) : null;

  // The mp3 recording finishes transcoding/uploading to Cloudinary a little after the session
  // itself ends, so poll for it briefly instead of making the user reload the page to see it.
  useEffect(() => {
    if (session.status !== "ended" || session.audioUrl) return;
    let cancelled = false;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      const updated = await getSession(id).catch(() => null);
      if (cancelled) return;
      if (updated?.session.audioUrl) {
        onDetailChange((prev) =>
          prev ? { ...prev, session: updated.session } : prev,
        );
      }
      if (updated?.session.audioUrl || attempts >= 10) clearInterval(interval);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, session.status, session.audioUrl, onDetailChange]);

  async function handleEnd() {
    if (live.isStreaming) live.stop();
    setEnding(true);
    try {
      const updated = await endSession(id);
      onDetailChange((prev) => (prev ? { ...prev, session: updated } : prev));
    } finally {
      setEnding(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-6 sm:px-20 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={service ? `/services/${service._id}` : "/"}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            &larr; {service?.name ?? "All services"}
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">
            {session.title}
          </h1>
          <p className="text-sm text-neutral-500">{session.preacher}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`Delete "${session.title}" with its transcript, quotes, reels and videos? This cannot be undone.`)) return;
              try {
                await deleteSession(id);
                router.push(service ? `/services/${service._id}` : "/");
              } catch (err) {
                alert(err instanceof Error ? err.message : "Failed to delete");
              }
            }}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            Delete
          </button>
          <button
            onClick={() => setShowTranscript(true)}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            View transcript
          </button>
          {live.isStreaming && <MicPulse stream={live.micStream} />}
          {live.reconnecting && <span className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Reconnecting…</span>}
          {live.isStarting && <StartingIndicator />}
          {isLive && !live.isStreaming && !live.isStarting && (
            <>
              <MicSelector
                devices={live.audioDevices}
                selectedDeviceId={live.selectedDeviceId}
                onChange={live.setSelectedDeviceId}
              />
              <button
                onClick={live.start}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                {live.isPaused ? "Resume streaming" : "Start streaming"}
              </button>
            </>
          )}
          {isLive && live.isStreaming && (
            <button
              onClick={live.stop}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Pause streaming
            </button>
          )}
          {isLive && (
            <button
              onClick={handleEnd}
              disabled={ending}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {ending ? "Ending..." : "End service"}
            </button>
          )}
        </div>
      </div>

      {live.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {live.error}
        </p>
      )}

      {session.status === "ended" && (
        <div className="mt-6">
          {session.audioUrl ? (
            <AudioPlayer src={session.audioUrl} title="Session recording" />
          ) : (
            <p className="rounded-lg border border-neutral-200 px-4 py-3 text-sm text-neutral-400">
              Processing session recording...
            </p>
          )}
        </div>
      )}

      <div className="mt-6 border-b border-neutral-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.filter(
            (tab) =>
              !ENDED_ONLY_TABS.includes(tab.key) || session.status === "ended",
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`min-w-fit border-b-2 px-1 pb-3 text-center text-sm font-medium ${
                activeTab === tab.key
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-400 hover:text-neutral-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6 w-full">
        {activeTab === "message" && <MessageNotesPanel session={session} />}
        {activeTab === "notes" && <InsightsPanel insights={live.insights} />}
        {activeTab === "quotes" && (
          <QuotesPanel
            quotes={live.quotes}
            onEdit={(q) =>
              handleCreateDesign({ source: "quote", sourceId: q._id, text: q.text })
            }
          />
        )}
        {activeTab === "reels" && (
          <ReelsPanel
            sessionId={id}
            audioUrl={session.audioUrl}
            title={session.title}
            serviceName={service?.name ?? ""}
            preacher={session.preacher}
          />
        )}
        {activeTab === "audiolab" && <AudioLabPanel sessionId={id} hasAudio={!!session.audioUrl} onOpenMerged={() => setActiveTab("merged")} />}
        {activeTab === "merged" && (
          <MergedPanel
            sessionId={id}
            audioUrl={session.audioUrl}
            title={session.title}
            serviceName={service?.name ?? ""}
            preacher={session.preacher}
          />
        )}
        {activeTab === "editor" && (
          <EditorLibrary
            sessionId={id}
            quotes={live.quotes}
            carousel={session.carousel ?? []}
            onOpen={(designId) => router.push(`/design/${designId}`)}
            onCreate={handleCreateDesign}
          />
        )}
      </div>

      <TranscriptDrawer
        open={showTranscript}
        onClose={() => setShowTranscript(false)}
        transcript={live.transcript}
        interimText={live.interimText}
        startedAt={session.startedAt}
        title={session.title}
      />
    </main>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "message", label: "Message Notes" },
  { key: "notes", label: "Live Notes" },
  { key: "quotes", label: "Quotes" },
  { key: "reels", label: "Reels" },
  { key: "merged", label: "Merged" },
  { key: "audiolab", label: "Audio Lab" },
  { key: "editor", label: "Editor" },
];
