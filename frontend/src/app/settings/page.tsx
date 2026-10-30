"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Download, Monitor, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useIsApp } from "@/lib/downloads";
import { SkinPicker } from "@/components/SkinPicker";
import { askDesktopAlerts, desktopAlertState, getEmailPrefs, setEmailPrefs, setSoundOn, soundOn, type EmailPrefs } from "@/lib/notifications";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/push";
import { CHAT_SKINS, setPersonalChatSkin, usePersonalChatSkin } from "@/lib/chatSkins";

type Theme = "light" | "dark" | "auto";

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    if (t === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  } catch {}
}

const card = "rounded-2xl bg-white p-6 sm:p-7";
const chip = (active: boolean) => `inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${active ? "bg-orange-600 text-[#ffffff]" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`;

export default function SettingsPage() {
  const { user } = useAuth();
  const isApp = useIsApp();
  const [theme, setTheme] = useState<Theme>("auto");
  const [sound, setSound] = useState(true);
  const [push, setPush] = useState<PushStatus>("unsupported");
  const [alerts, setAlerts] = useState<string>("unsupported");
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<EmailPrefs | null>(null);
  const chatSkin = usePersonalChatSkin();

  // Everything here lives in this browser, so it's read once the page is on screen.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser-only values, readable only after mount */
    try {
      const t = localStorage.getItem("theme");
      setTheme(t === "dark" || t === "light" ? t : "auto");
    } catch {}
    setSound(soundOn());
    setAlerts(desktopAlertState());
    /* eslint-enable react-hooks/set-state-in-effect */
    void pushStatus().then(setPush);
    getEmailPrefs()
      .then(setPrefs)
      .catch(() => {});
  }, []);

  if (!user) return null;
  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-6 sm:py-10 lg:px-20">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">How the app looks and how it keeps you posted. Light/dark and sound are saved on this device; your skin follows your account.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Appearance</h2>
          <p className="mt-1 text-sm text-neutral-500">Light, dark, or follow your device.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
                ["auto", "Automatic", Monitor],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                aria-pressed={theme === id}
                onClick={() => {
                  setTheme(id);
                  applyTheme(id);
                }}
                className={chip(theme === id)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Chat skin</h2>
          <p className="mt-1 text-sm text-neutral-500">How the team chat looks for you. A service wrapper can set its own while a service is running.</p>
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
            {CHAT_SKINS.map((s) => (
              <button key={s.id} onClick={() => setPersonalChatSkin(s.id)} aria-pressed={chatSkin === s.id} title={s.hint} className={`overflow-hidden rounded-xl border-2 text-left ${chatSkin === s.id ? "border-orange-500" : "border-neutral-200 hover:border-neutral-300"}`}>
                <span className="block p-2" style={{ background: s.bg }}>
                  <span className="mb-1 block h-2 w-3/4 rounded-full" style={{ background: s.ink, opacity: 0.55 }} />
                  <span className="block h-4 w-full rounded-md" style={{ background: s.accent }} />
                </span>
                <span className="block truncate px-2 py-1 text-xs font-medium text-neutral-800">{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={`${card} lg:col-span-2`}>
          <h2 className="text-sm font-semibold text-neutral-900">Skin</h2>
          <p className="mt-1 text-sm text-neutral-500">The look of the whole app — colours and surfaces — just for you, on every device you sign in on.</p>
          <div className="mt-4">
            <SkinPicker />
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-500">Roster changes and team chat, even when the app is closed.</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3">
              <span className="text-sm">
                <b className="text-neutral-900">Push notifications</b>
                <span className="block text-xs text-neutral-500">
                  {push === "on" ? "On for this device" : push === "denied" ? "Blocked — allow them in your browser settings" : push === "ios-install" ? "On iPhone, add the app to your Home Screen first" : push === "unsupported" ? (alerts === "granted" ? "Desktop alerts are on while the app is open" : "Not available on this device") : "Off for this device"}
                </span>
              </span>
              {push === "on" ? (
                <button disabled={busy} onClick={async () => (setBusy(true), await disablePush(), setPush(await pushStatus()), setBusy(false))} className="rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600">
                  Turn off
                </button>
              ) : push === "off" ? (
                <button disabled={busy} onClick={async () => (setBusy(true), setPush(await enablePush()), setBusy(false))} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
                  <BellRing size={15} /> Turn on
                </button>
              ) : push === "unsupported" && alerts === "default" ? (
                <button onClick={async () => setAlerts(await askDesktopAlerts())} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
                  <BellRing size={15} /> Turn on
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3">
              <span className="text-sm">
                <b className="text-neutral-900">Sound</b>
                <span className="block text-xs text-neutral-500">A soft ping when something arrives while you’re in the app</span>
              </span>
              <button onClick={() => (setSoundOn(!sound), setSound(!sound))} aria-pressed={sound} className={chip(sound)}>
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />} {sound ? "On" : "Off"}
              </button>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Email notifications</h2>
          <p className="mt-1 text-sm text-neutral-500">Emails to {user.email}, on top of the alerts in the app.</p>
          <div className="mt-4 space-y-3">
            {(
              [
                ["tasks", "Task changes", "When a task you’re on is given to you, moved, updated or commented on"],
                ["reminders", "Due-date reminders", "Before and when a task you’re on is due, and if it runs late"],
                ["chat", "Unread chat", "When you’ve been tagged or have unread messages and you’re away from the app"],
                ...(user.isAdmin ? [["calls", "Call requests", "When a member asks to start a group call"]] : []),
              ] as [keyof EmailPrefs, string, string][]
            ).map(([k, title, hint]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3">
                <span className="text-sm">
                  <b className="text-neutral-900">{title}</b>
                  <span className="block text-xs text-neutral-500">{hint}</span>
                </span>
                <button
                  disabled={!prefs}
                  aria-pressed={prefs?.[k] ?? true}
                  onClick={async () => {
                    if (!prefs) return;
                    const next = { ...prefs, [k]: !prefs[k] };
                    setPrefs(next); // shows at once; put back if it couldn’t be saved
                    setEmailPrefs({ [k]: next[k] }).catch(() => setPrefs(prefs));
                  }}
                  className={chip(prefs?.[k] ?? true)}
                >
                  {(prefs?.[k] ?? true) ? "On" : "Off"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {user.name} · {user.email}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/profile" className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700">
              View profile &amp; change password
            </Link>
          </div>
        </section>

        {!isApp && (
          <section className={card}>
            <h2 className="text-sm font-semibold text-neutral-900">Get the app</h2>
            <p className="mt-1 text-sm text-neutral-500">Install it on your computer or phone to open it like any other app.</p>
            <Link href="/download" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
              <Download size={16} /> Download the app
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
