"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  newId,
  updateSchedule,
  type Schedule,
  type ScheduleItem,
  type ScheduleItemInput,
  type ScheduleSettings,
  type ScheduleSummary,
} from "./present";

const SAVE_DELAY = 500;

interface Options {
  // The schedule the service was started with.
  startId: string;
  // The screen's current look, used to seed a new schedule.
  current: () => ScheduleSettings;
  // Put a schedule's look on the screen (called when switching to it).
  apply: (s: ScheduleSettings) => void;
  // The running service moved to another schedule.
  onActive?: (id: string) => void;
  // The schedule the service was running on no longer exists (so the service should end).
  onGone?: () => void;
}

// Schedules and the one currently running. Edits are applied instantly and saved shortly after.
export function useSchedules({ startId, current, apply, onActive, onGone }: Options) {
  const [list, setList] = useState<ScheduleSummary[]>([]);
  const [active, setActive] = useState<Schedule | null>(null);
  const [error, setError] = useState("");
  const activeRef = useRef<Schedule | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef({ current, apply, onActive, onGone });
  useEffect(() => {
    cb.current = { current, apply, onActive, onGone };
  });

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong");

  const save = useCallback(async () => {
    timer.current = null;
    const s = activeRef.current;
    if (!s) return;
    try {
      await updateSchedule(s._id, { name: s.name, items: s.items, settings: s.settings });
    } catch (e) {
      fail(e);
    }
  }, []);
  const queueSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY);
  }, [save]);
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      await save();
    }
  }, [save]);

  const show = useCallback((s: Schedule, applyLook = true) => {
    activeRef.current = s;
    setActive(s);
    // Any saved look is applied (even just "no wrapper"), so moving between schedules never keeps the last one's wrapper.
    if (applyLook && s.settings && Object.keys(s.settings).length) cb.current.apply(s.settings);
  }, []);

  // Open the schedule the service was started with. Nothing is created automatically: a service always
  // begins from a schedule the operator chose or made on the landing page.
  useEffect(() => {
    (async () => {
      try {
        const [summaries, schedule] = await Promise.all([listSchedules(), getSchedule(startId)]);
        setList(summaries);
        show(schedule);
      } catch {
        cb.current.onGone?.();
      }
    })();
  }, [show, startId]);

  const mutate = useCallback(
    (fn: (s: Schedule) => Schedule) => {
      const s = activeRef.current;
      if (!s) return;
      const next = fn(s);
      activeRef.current = next;
      setActive(next);
      setList((l) => l.map((x) => (x._id === next._id ? { ...x, name: next.name, count: next.items.length } : x)));
      queueSave();
    },
    [queueSave],
  );

  const addItem = useCallback(
    (item: ScheduleItemInput) => {
      if (!activeRef.current) return false;
      mutate((s) => ({ ...s, items: [...s.items, { ...item, _id: newId() }] }));
      return true;
    },
    [mutate],
  );
  const removeItem = useCallback((id: string) => mutate((s) => ({ ...s, items: s.items.filter((i) => i._id !== id) })), [mutate]);
  const moveItem = useCallback(
    (from: number, to: number) =>
      mutate((s) => {
        if (from === to || to < 0 || to >= s.items.length) return s;
        const items: ScheduleItem[] = [...s.items];
        items.splice(to, 0, items.splice(from, 1)[0]);
        return { ...s, items };
      }),
    [mutate],
  );
  // The wrapper (and the look from before it) stay on the schedule unless the caller says otherwise (pass
  // `wrapperId: undefined` to remove it).
  const saveSettings = useCallback(
    (settings: ScheduleSettings) =>
      mutate((s) => {
        const prev = s.settings;
        return { ...s, settings: { ...settings, ...("wrapperId" in settings || !prev?.wrapperId ? {} : { wrapperId: prev.wrapperId }), ...("wrapperBefore" in settings || !prev?.wrapperBefore ? {} : { wrapperBefore: prev.wrapperBefore }) } };
      }),
    [mutate],
  );
  const rename = useCallback((name: string) => name.trim() && mutate((s) => ({ ...s, name: name.trim() })), [mutate]);

  const switchTo = useCallback(
    async (id: string) => {
      if (id === activeRef.current?._id) return;
      try {
        await flush();
        show(await getSchedule(id));
        cb.current.onActive?.(id);
      } catch (e) {
        fail(e);
      }
    },
    [flush, show],
  );

  // A new schedule starts with the screen's current look, so it isn't a jarring reset.
  const create = useCallback(
    async (name: string, from?: Schedule) => {
      try {
        await flush();
        const s = await createSchedule({
          name,
          items: from?.items.map((i) => ({ type: i.type, title: i.title, subtitle: i.subtitle, slides: i.slides, show: i.show, scene: i.scene })),
          settings: from?.settings ?? cb.current.current(),
        });
        setList((l) => [...l, { _id: s._id, name: s.name, count: s.items.length }]);
        show(s, false);
        cb.current.onActive?.(s._id);
      } catch (e) {
        fail(e);
      }
    },
    [flush, show],
  );

  const duplicate = useCallback(() => {
    const s = activeRef.current;
    if (s) create(`${s.name} copy`, s);
  }, [create]);

  // Deleting the schedule the service is running on ends the service.
  const removeActive = useCallback(async () => {
    const s = activeRef.current;
    if (!s) return;
    try {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      await deleteSchedule(s._id);
      cb.current.onGone?.();
    } catch (e) {
      fail(e);
    }
  }, []);

  return { list, active, error, clearError: () => setError(""), addItem, removeItem, moveItem, saveSettings, rename, switchTo, create, duplicate, removeActive };
}
