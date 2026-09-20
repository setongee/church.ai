"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { endSession, getSession } from "@/lib/api";
import { useLiveSession } from "@/lib/useLiveSession";
import { TranscriptDrawer } from "@/components/TranscriptDrawer";
import { QuotesPanel } from "@/components/QuotesPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ExportsTab } from "@/components/ExportsTab";
import { MicPulse } from "@/components/MicPulse";
import { MicSelector } from "@/components/MicSelector";
import { StartingIndicator } from "@/components/StartingIndicator";
import { SummaryPanel } from "@/components/SummaryPanel";
import { CarouselPanel } from "@/components/CarouselPanel";
import { ChatPanel } from "@/components/ChatPanel";
import type { Service, SessionDetail } from "@/lib/types";

type TabKey = "summary" | "chat" | "notes" | "quotes" | "posts" | "exports";

const ENDED_ONLY_TABS: TabKey[] = ["summary", "chat"];

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    getSession(id)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [id]);

  if (!detail) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12 text-sm text-neutral-400">
        Loading...
      </main>
    );
  }

  return <SessionView id={id} detail={detail} onDetailChange={setDetail} />;
}

function SessionView({
  id,
  detail,
  onDetailChange,
}: {
  id: string;
  detail: SessionDetail;
  onDetailChange: (
    updater: (prev: SessionDetail | null) => SessionDetail | null,
  ) => void;
}) {
  const [ending, setEnding] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(
    detail.session.status === "ended" ? "summary" : "notes",
  );

  const live = useLiveSession({
    sessionId: id,
    initialTranscript: detail.transcript,
    initialQuotes: detail.quotes,
    initialInsights: detail.insights,
  });

  const { session, chatMessages } = detail;
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
    <main className="mx-auto w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTranscript(true)}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            View transcript
          </button>
          {live.isStreaming && <MicPulse stream={live.micStream} />}
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
                Start streaming
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
        <div className="mt-6 rounded-lg border border-neutral-200 px-4 py-3">
          {session.audioUrl ? (
            <>
              <p className="mb-2 text-sm font-medium text-neutral-700">
                Session recording
              </p>
              <audio controls src={session.audioUrl} className="w-full" />
            </>
          ) : (
            <p className="text-sm text-neutral-400">
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
        {activeTab === "summary" &&
          (session.summary ? (
            <SummaryPanel
              summary={session.summary}
              title={session.title}
              preacher={session.preacher}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
              No summary was generated for this session.
            </div>
          ))}
        {activeTab === "chat" && (
          <ChatPanel sessionId={id} initialMessages={chatMessages} />
        )}
        {activeTab === "notes" && <InsightsPanel insights={live.insights} />}
        {activeTab === "quotes" && <QuotesPanel quotes={live.quotes} />}
        {activeTab === "posts" &&
          (session.carousel && session.carousel.length > 0 ? (
            <CarouselPanel slides={session.carousel} />
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-400">
              Carousel slides are generated from the session summary once the
              service has ended.
            </div>
          ))}
        {activeTab === "exports" && (
          <ExportsTab quotes={live.quotes} onUpdate={live.updateQuote} />
        )}
      </div>

      <TranscriptDrawer
        open={showTranscript}
        onClose={() => setShowTranscript(false)}
        transcript={live.transcript}
        interimText={live.interimText}
      />
    </main>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "chat", label: "Chat" },
  { key: "notes", label: "Notes" },
  { key: "quotes", label: "Quotes" },
  { key: "posts", label: "Posts" },
  { key: "exports", label: "Exports" },
];
