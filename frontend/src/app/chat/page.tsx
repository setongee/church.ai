"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatInner />
    </Suspense>
  );
}

function ChatInner() {
  const room = useSearchParams().get("room");
  return (
    <main className="mx-auto h-[calc(100dvh-4.5rem)] w-full max-w-8xl px-3 py-3 sm:h-[calc(100dvh-73px)] sm:px-6 sm:py-5 lg:px-20">
      <ChatPanel key={room ?? "none"} initialRoomId={room} />
    </main>
  );
}
