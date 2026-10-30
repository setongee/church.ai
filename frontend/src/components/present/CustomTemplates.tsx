"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { deleteSceneTemplate, listSceneTemplates, saveSceneTemplate, sceneOf, type SceneTemplate } from "@/lib/present";
import { BackgroundThumb } from "./BackgroundPicker";
import { SceneEditor, sectionSummary } from "./SceneEditor";
import type { TemplateHandlers } from "./TemplateActions";

// Templates the team builds: a background plus where the text sits. Create, edit, put live, or add to the schedule.
// `kind="prayer"` lists and saves the looks prayers use (opened from the Prayers tab) instead of the general ones.
export function CustomTemplates({ h, kind = "general" }: { h: TemplateHandlers; kind?: "general" | "prayer" }) {
  const prayer = kind === "prayer";
  const [items, setItems] = useState<SceneTemplate[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SceneTemplate | "new" | null>(null);

  useEffect(() => {
    listSceneTemplates(kind)
      .then(setItems)
      .catch((e) => {
        setError(e.message);
        setItems([]);
      });
  }, [kind]);

  async function save(name: string, scene: ReturnType<typeof sceneOf>) {
    try {
      const saved = await saveSceneTemplate({ name, kind, background: scene.background ?? null, frame: scene.style.frame, frameBg: scene.style.frameBg, align: scene.style.align, scale: scene.style.scale, sections: scene.sections ?? null }, editing && editing !== "new" ? editing._id : undefined);
      setItems((l) => {
        const rest = (l ?? []).filter((x) => x._id !== saved._id);
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save the template");
    }
  }
  async function remove(t: SceneTemplate) {
    if (!window.confirm(`Delete the template “${t.name}”? Schedule items made from it keep working.`)) return;
    try {
      await deleteSceneTemplate(t._id);
      setItems((l) => (l ?? []).filter((x) => x._id !== t._id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t delete it");
    }
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700";

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">{prayer ? "Prayer templates" : "My templates"}</h3>
        <button onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700">
          <Plus size={14} /> New template
        </button>
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {items && items.length === 0 && (
        <button onClick={() => setEditing("new")} className="w-full rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 hover:border-orange-300 hover:text-orange-700">
          {prayer ? "Build a look for prayers: choose a background, then place where the prayer text sits, how big it is and how it lines up." : "Build your own: choose a background, then place where scripture and songs sit on it."}
        </button>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items?.map((t) => (
          <div key={t._id} className="overflow-hidden rounded-2xl bg-white">
            <div className="relative aspect-video bg-neutral-900">
              <BackgroundThumb bg={t.background ?? h.look.background} className="h-full w-full" />
              {t.frame && <span className="absolute border-2 border-dashed border-white/80 bg-white/15" style={{ left: `${(t.frame.x / 1920) * 100}%`, top: `${(t.frame.y / 1080) * 100}%`, width: `${(t.frame.w / 1920) * 100}%`, height: `${(t.frame.h / 1080) * 100}%` }} />}
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-semibold text-neutral-900">{t.name}</p>
              {!prayer && sectionSummary(t).length > 0 && <p className="mt-0.5 truncate text-[11px] text-neutral-500">Own look: {sectionSummary(t).join(", ")}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => h.onScene(sceneOf(t))} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-orange-700">
                  <Play size={12} fill="currentColor" /> {prayer ? "Try on screen" : "Go live"}
                </button>
                {!prayer && (
                  <button onClick={() => h.onAdd({ type: "template", title: t.name, subtitle: "Template", slides: [], scene: sceneOf(t) })} className={btn}>
                    <CalendarPlus size={13} /> Schedule
                  </button>
                )}
                <button onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} className={btn}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => remove(t)} aria-label={`Delete ${t.name}`} className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <SceneEditor
          prayer={prayer}
          look={h.look}
          initial={editing === "new" ? undefined : { name: editing.name, background: editing.background, style: { frame: editing.frame, frameBg: editing.frameBg, align: editing.align, scale: editing.scale }, sections: editing.sections }}
          onClose={() => setEditing(null)}
          onSave={({ name, scene }) => void save(name, scene)}
        />
      )}
    </section>
  );
}
