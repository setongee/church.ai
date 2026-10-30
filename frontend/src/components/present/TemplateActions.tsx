"use client";

import { useState } from "react";
import { CalendarPlus, Eye, LayoutPanelLeft, Play, Sparkles, X } from "lucide-react";
import type { Background, PresentStyle, ScheduleItemInput, Slide, TemplateScene } from "@/lib/present";
import { SceneEditor } from "./SceneEditor";
import { btnGhost, btnPrimary } from "./ui";

export interface TemplateHandlers {
  onStage: (s: Slide) => void;
  onLive: (s: Slide) => void;
  onAdd: (item: ScheduleItemInput) => void;
  // Use the template as the Logo screen (press L) or as the background behind every slide.
  onLogo: (s: Slide) => void;
  onBackground: (s: Slide | null) => void;
  // Put a scene (custom template) on the screen.
  onScene: (scene: TemplateScene) => void;
  onClearLogo: () => void;
  hasBackground: boolean;
  hasLogo: boolean;
  // The screen's current look, the starting point when setting up a scene.
  look: { background: Background; style: PresentStyle };
}

// How to use a template: show it right now, stage it first, make it the logo screen, make it the
// background, or add it to the schedule.
export function TemplateActions({ slide, title, subtitle, h }: { slide: Slide | null; title: string; subtitle: string; h: TemplateHandlers }) {
  const [scening, setScening] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button disabled={!slide} onClick={() => slide && h.onLive(slide)} className={btnPrimary}>
          <Play size={15} fill="currentColor" /> Show now
        </button>
        <button disabled={!slide} onClick={() => slide && h.onStage(slide)} className={btnGhost}>
          <Eye size={15} /> Stage
        </button>
        <button disabled={!slide} onClick={() => slide && h.onAdd({ type: "template", title, subtitle, slides: [slide] })} className={btnGhost}>
          <CalendarPlus size={15} /> Add to schedule
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!slide} onClick={() => slide && h.onLogo(slide)} className={btnGhost}>
          <Sparkles size={15} /> Use as logo screen
        </button>
        <button disabled={!slide} onClick={() => setScening(true)} title="Place scripture, songs and text around this template, then save it to the schedule" className={btnGhost}>
          <LayoutPanelLeft size={15} /> Set up as scene…
        </button>
      </div>
      {(h.hasLogo || h.hasBackground) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {h.hasLogo && (
            <button onClick={h.onClearLogo} className="inline-flex items-center gap-1 font-medium text-neutral-500 hover:text-orange-600">
              <X size={12} /> Remove template logo screen
            </button>
          )}
          {h.hasBackground && (
            <button onClick={() => h.onBackground(null)} className="inline-flex items-center gap-1 font-medium text-neutral-500 hover:text-orange-600">
              <X size={12} /> Remove template background
            </button>
          )}
        </div>
      )}
      {scening && slide && (
        <SceneEditor
          slide={slide}
          look={h.look}
          onClose={() => setScening(false)}
          onSave={({ scene }) => {
            h.onAdd({ type: "template", title, subtitle: subtitle ? `${subtitle} · scene` : "Scene", slides: [slide], scene });
            setScening(false);
          }}
        />
      )}
    </div>
  );
}
