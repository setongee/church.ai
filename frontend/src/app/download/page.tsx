"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Laptop, MonitorSmartphone, Share, SquarePlus } from "lucide-react";
import { INSTALLERS, usePlatform, useIsApp } from "@/lib/downloads";
import { useInstall } from "@/lib/pwa";

export default function DownloadPage() {
  const platform = usePlatform();
  const isApp = useIsApp();
  const { canPrompt, iosHelp, install } = useInstall();
  const desktop = platform === "mac" || platform === "windows";
  const phone = platform === "ios" || platform === "android";
  // A QR code so a phone can open this page straight from the computer screen.
  const [qr, setQr] = useState("");
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/download`, { width: 240, margin: 1, color: { dark: "#171717", light: "#ffffff" } })
      .then(setQr)
      .catch(() => {});
  }, []);
  const main = platform === "windows" ? INSTALLERS.windows : INSTALLERS.macArm;
  const others = platform === "windows" ? [INSTALLERS.macArm, INSTALLERS.macIntel] : platform === "mac" ? [INSTALLERS.macIntel, INSTALLERS.windows] : [INSTALLERS.macArm, INSTALLERS.macIntel, INSTALLERS.windows];

  return (
    <main className="mx-auto w-full max-w-8xl px-4 py-8 sm:px-6 sm:py-10 lg:px-20">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Get the app</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">Open FAFC Media Engine from your dock, taskbar or home screen, in its own window. It’s the same platform and the same account, and it updates itself whenever the site does.</p>
      </div>
      {isApp && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">You’re already using the app.</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="rounded-2xl bg-white p-6 sm:p-8">
          {desktop ? (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-orange-700">
                <Laptop size={24} />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-neutral-900">Download for {main.label}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {main.detail} · {main.size}
              </p>
              <a href={main.url} download className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
                <Download size={18} /> Download now
              </a>
              <p className="mt-3 text-xs text-neutral-500">One click starts the download. When it finishes, open the file to install.</p>
            </>
          ) : (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-orange-700">
                <MonitorSmartphone size={24} />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-neutral-900">On your phone</h2>
              {canPrompt ? (
                <>
                  <p className="mt-1 text-sm text-neutral-500">Add it to your home screen to open it full screen, like any other app.</p>
                  <button onClick={() => void install()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
                    <Download size={18} /> Install the app
                  </button>
                </>
              ) : iosHelp ? (
                <ol className="mt-3 space-y-2.5 text-sm text-neutral-700">
                  <li className="flex items-center gap-2">
                    <b className="grid h-6 w-6 place-items-center rounded-full bg-neutral-100 text-xs">1</b> Tap <Share size={16} className="inline" /> <b>Share</b> in Safari’s toolbar
                  </li>
                  <li className="flex items-center gap-2">
                    <b className="grid h-6 w-6 place-items-center rounded-full bg-neutral-100 text-xs">2</b> Choose <SquarePlus size={16} className="inline" /> <b>Add to Home Screen</b>
                  </li>
                  <li className="flex items-center gap-2">
                    <b className="grid h-6 w-6 place-items-center rounded-full bg-neutral-100 text-xs">3</b> Tap <b>Add</b>
                  </li>
                </ol>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">Open this page in Chrome (Android) or Safari (iPhone/iPad) and use “Add to Home Screen” from the browser menu. On a Mac or Windows computer, you can download the desktop app below.</p>
              )}
              <p className="mt-4 text-xs text-neutral-500">Once it’s on your home screen, open it from there and allow notifications when asked — that’s how roster and chat alerts reach you even when the app is closed.</p>
            </>
          )}
        </section>

        {!phone && <section className="rounded-2xl bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-neutral-900">{desktop ? "Other computers" : "Desktop app for a computer"}</h2>
          <ul className="mt-3 divide-y divide-neutral-100">
            {others.map((o) => (
              <li key={o.label} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900">{o.label}</span>
                  <span className="block text-xs text-neutral-500">
                    {o.detail} · {o.size}
                  </span>
                </span>
                <a href={o.url} download className="shrink-0 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:border-orange-300 hover:text-orange-700">
                  Download
                </a>
              </li>
            ))}
          </ul>
          {desktop && canPrompt && (
            <div className="mt-5 rounded-xl bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">Prefer no download?</p>
              <p className="mt-0.5 text-xs text-neutral-500">Install straight from the browser — it adds the app in one click, with nothing to open afterwards.</p>
              <button onClick={() => void install()} className="mt-3 rounded-lg bg-[#171717] px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-[#404040]">
                Install from the browser
              </button>
            </div>
          )}
        </section>}
      </div>

      {!phone && <section className="mt-5 grid gap-6 rounded-2xl bg-white p-6 sm:p-8 md:grid-cols-[auto_minmax(0,1fr)]">
        {desktop && qr && (
          <div className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code that opens this page on your phone" className="h-40 w-40 rounded-xl border border-neutral-100 bg-white p-1.5" />
            <p className="mt-2 text-xs text-neutral-500">Scan with your phone’s camera</p>
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">On your phone</h2>
          <p className="mt-1 text-sm text-neutral-500">Phones don’t download an app file — you add the site to your home screen and it becomes an app with its own icon, full screen, and notifications.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">iPhone / iPad</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm text-neutral-600">
                <li>Open this page in <b>Safari</b></li>
                <li>Tap <b>Share</b>, then <b>Add to Home Screen</b>, then <b>Add</b></li>
                <li>Open the app from your home screen and allow <b>notifications</b></li>
              </ol>
            </div>
            <div className="rounded-xl bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">Android</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm text-neutral-600">
                <li>Open this page in <b>Chrome</b></li>
                <li>Tap <b>Install app</b> (or the menu, then <b>Install app</b>)</li>
                <li>Open it from your home screen and allow <b>notifications</b></li>
              </ol>
            </div>
          </div>
        </div>
      </section>}

      {!phone && <section className="mt-5 rounded-2xl bg-white p-6 sm:p-8">
        <h2 className="text-sm font-semibold text-neutral-900">First time you open it</h2>
        <p className="mt-1 text-sm text-neutral-500">The app isn’t signed with a paid developer certificate yet, so your computer asks you to confirm once. It’s safe — it just opens this site in its own window.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-900">Mac</p>
            <p className="mt-1 text-sm text-neutral-600">Open the download and drag the app into Applications. The first time, right-click the app and choose <b>Open</b>, then <b>Open</b> again.</p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-900">Windows</p>
            <p className="mt-1 text-sm text-neutral-600">Run the installer. If “Windows protected your PC” appears, click <b>More info</b>, then <b>Run anyway</b>.</p>
          </div>
        </div>
      </section>}
    </main>
  );
}
