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
  type ScheduleSession,
  type TriggerMap,
  type ScheduleSettings,
  type ScheduleSummary,
} from "./present";
import { isNetworkError, saveLocalSchedule } from "./offline/offline";

const SAVE_DELAY = 500;
// Links that start or end at something that has been removed go with it.
const pruneMap = (m: TriggerMap | undefined, gone: string): TriggerMap | undefined => (m ? { ...m, links: m.links.filter((l) => l.from !== gone && l.to !== gone) } : m);
// The session id if the schedule still has it, else "" (no session).
const s0 = (s: Schedule | null, id: string) => (id && s?.sessions?.some((x) => x._id === id) ? id : "");

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
  const unsent = useRef(false); // edits are waiting for the connection to come back
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
      await updateSchedule(s._id, { name: s.name, items: s.items, sessions: s.sessions ?? [], triggerMap: s.triggerMap, settings: s.settings });
      unsent.current = false;
    } catch (e) {
      // No connection: the schedule is already kept on this device; it is sent again as soon as the server can be reached.
      if (isNetworkError(e) || (e as { status?: number }).status! >= 500) unsent.current = true;
      else fail(e);
    }
  }, []);
  useEffect(() => {
    const retry = () => {
      if (unsent.current && !timer.current) void save();
    };
    const t = setInterval(retry, 15_000);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", retry);
    };
  }, [save]);
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
      void saveLocalSchedule(next); // the copy on this device is always the latest, connected or not
      queueSave();
    },
    [queueSave],
  );

  const addItem = useCallback(
    (item: ScheduleItemInput, sessionId = "") => {
      if (!activeRef.current) return false;
      const session = s0(activeRef.current, sessionId);
      mutate((s) => ({ ...s, items: [...s.items, { ...item, session, _id: newId() }] }));
      return true;
    },
    [mutate],
  );
  const removeItem = useCallback((id: string) => mutate((s) => ({ ...s, items: s.items.filter((i) => i._id !== id), triggerMap: pruneMap(s.triggerMap, id) })), [mutate]);
  const saveTriggerMap = useCallback((triggerMap: TriggerMap) => mutate((s) => ({ ...s, triggerMap })), [mutate]);
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
  const addSession = useCallback(
    (input: { name: string; description?: string; color?: string }) => {
      const name = input.name.trim().slice(0, 60);
      if (!name) return;
      mutate((s) => ({ ...s, sessions: [...(s.sessions ?? []), { _id: newId(), name, description: (input.description ?? "").trim().slice(0, 300), color: input.color ?? "" }] }));
    },
    [mutate],
  );
  const updateSession = useCallback(
    (id: string, patch: Partial<Pick<ScheduleSession, "name" | "description" | "color">>) =>
      mutate((s) => ({ ...s, sessions: (s.sessions ?? []).map((x) => (x._id === id ? { ...x, ...patch, name: (patch.name ?? x.name).trim().slice(0, 60) || x.name, description: (patch.description ?? x.description ?? "").slice(0, 300) } : x)) })),
    [mutate],
  );
  const moveSession = useCallback(
    (from: number, to: number) =>
      mutate((s) => {
        const list = [...(s.sessions ?? [])];
        if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return s;
        list.splice(to, 0, list.splice(from, 1)[0]);
        return { ...s, sessions: list };
      }),
    [mutate],
  );
  // Deleting a session keeps its items (they just stop being in one), unless `withItems`.
  const removeSession = useCallback(
    (id: string, withItems = false) => mutate((s) => ({ ...s, sessions: (s.sessions ?? []).filter((x) => x._id !== id), items: withItems ? s.items.filter((i) => i.session !== id) : s.items.map((i) => (i.session === id ? { ...i, session: "" } : i)), triggerMap: pruneMap(s.triggerMap, id) })),
    [mutate],
  );
  const assignItem = useCallback((itemId: string, session: string) => mutate((s) => ({ ...s, items: s.items.map((i) => (i._id === itemId ? { ...i, session } : i)) })), [mutate]);
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
          items: from?.items.map((i) => ({ type: i.type, title: i.title, subtitle: i.subtitle, slides: i.slides, show: i.show, scene: i.scene, session: i.session, _id: i._id })),
          sessions: from?.sessions,
          triggerMap: from?.triggerMap,
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

  return { list, active, error, saveTriggerMap, addSession, updateSession, moveSession, removeSession, assignItem, clearError: () => setError(""), addItem, removeItem, moveItem, saveSettings, rename, switchTo, create, duplicate, removeActive };
}
