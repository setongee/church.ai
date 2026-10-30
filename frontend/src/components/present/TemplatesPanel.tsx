"use client";

import { useState } from "react";
import { ArrowLeft, HandCoins, Mic, PartyPopper } from "lucide-react";
import { CustomTemplates } from "./CustomTemplates";
import { GivingPanel } from "./GivingPanel";
import { MinisteringPanel } from "./MinisteringPanel";
import type { TemplateHandlers } from "./TemplateActions";
import { WelcomePanel } from "./WelcomePanel";

const KINDS = [
  { id: "ministering", name: "Speaker intro", description: "Animated “Ministering” promo with the preacher's photo and name.", icon: Mic },
  { id: "giving", name: "Offering and Tithe", description: "Livestream overlay with the account number and bank.", icon: HandCoins },
  { id: "welcome", name: "Welcome screen", description: "Looping holding screen with a photo carousel and scrolling line.", icon: PartyPopper },
] as const;
type KindId = (typeof KINDS)[number]["id"];

// Animated screen templates. The cards are the templates; opening one goes to its setup, where you fill in
// the details and stage it, show it, or use it as the logo screen or background.
export function TemplatesPanel(props: TemplateHandlers) {
  const [kind, setKind] = useState<KindId | null>(null);
  const open = KINDS.find((k) => k.id === kind);

  if (!open) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className="group flex flex-col items-start gap-3 rounded-2xl bg-white p-5 text-left transition hover:border-orange-300 hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600 transition group-hover:bg-orange-100">
                <k.icon size={22} />
              </span>
              <span>
                <span className="block text-base font-semibold text-neutral-900">{k.name}</span>
                <span className="mt-1 block text-sm text-neutral-500">{k.description}</span>
              </span>
              <span className="mt-auto text-xs font-semibold text-orange-600">Set up →</span>
            </button>
          ))}
        </div>
        <CustomTemplates h={props} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-3">
        <button onClick={() => setKind(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
          <ArrowLeft size={13} /> All templates
        </button>
        <span className="text-sm font-semibold text-neutral-900">{open.name}</span>
      </div>
      <div className="min-h-0 flex-1">{kind === "ministering" ? <MinisteringPanel {...props} /> : kind === "giving" ? <GivingPanel {...props} /> : <WelcomePanel {...props} />}</div>
    </div>
  );
}
