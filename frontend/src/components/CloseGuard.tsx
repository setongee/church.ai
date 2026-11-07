"use client";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";

// Stops a form from being thrown away by accident. Closing a guarded panel (the X, Escape, a click on the backdrop, or its
// Cancel button) asks first if anything in it was changed; nothing is asked when nothing was.
//
// Whether something was changed is read from the form itself: each field's value is noted when the panel opens (or the
// moment a field is first focused, if it appeared later) and compared when closing. Typing something and typing it back
// counts as no change. `extra` covers state that isn't in a field (a generated plan that hasn't been saved yet); a form that
// already knows what is unsaved passes that as `extra` with `fields: false`.

const FIELDS = 'input:not([type="button"]):not([type="submit"]):not([type="file"]):not([type="hidden"]), textarea, select';
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const read = (el: Field) => (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? String(el.checked) : el.value);
const CANCEL = /^\s*(cancel|close|discard)\s*$/i;

export function useCloseGuard(onClose: () => void, { enabled = true, extra = false, fields = true }: { enabled?: boolean; extra?: boolean | (() => boolean); fields?: boolean } = {}) {
  // Hand this to the panel as its `ref`. (Not named `ref` itself, which the React lint rules read as a ref object.)
  const [root, bindPanel] = useState<HTMLElement | null>(null);
  const [initial] = useState(() => new Map<Field, string>());
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!root || !enabled) return;
    const note = (el: Field) => initial.has(el) || initial.set(el, read(el));
    // After the first paint, so fields filled in by an effect on open count as the starting point.
    const t = setTimeout(() => root.querySelectorAll<Field>(FIELDS).forEach(note), 0);
    const onFocus = (e: Event) => e.target instanceof Element && e.target.matches(FIELDS) && note(e.target as Field);
    root.addEventListener("focusin", onFocus);
    return () => {
      clearTimeout(t);
      root.removeEventListener("focusin", onFocus);
    };
  }, [root, enabled, initial]);

  const dirty = useCallback(() => {
    if (!enabled) return false;
    if (typeof extra === "function" ? extra() : extra) return true;
    if (fields) for (const [el, was] of initial) if (el.isConnected && read(el) !== was) return true;
    return false;
  }, [enabled, fields, extra, initial]);

  // Asks first when there is something to lose; otherwise just closes.
  const request = useCallback(() => (dirty() ? setAsking(true) : onClose()), [dirty, onClose]);
  // For the Escape key: it dismisses the question if one is showing, otherwise it is a close request.
  const escape = useCallback(() => (asking ? setAsking(false) : request()), [asking, request]);

  // A Cancel button inside the panel normally calls the page's own close and skips the check; catch it on the way down.
  const onClickCapture = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;
      const b = (e.target as Element).closest?.("button");
      if (b && !b.closest("[data-close-guard-dialog]") && !b.hasAttribute("data-no-guard") && CANCEL.test(b.textContent ?? "") && dirty()) {
        e.preventDefault();
        e.stopPropagation();
        setAsking(true);
      }
    },
    [enabled, dirty],
  );

  const dialog: ReactNode = asking ? (
    <div data-close-guard-dialog className="fixed inset-0 z-[200] grid place-items-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="close-guard-title" onMouseDown={(e) => e.stopPropagation()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h3 id="close-guard-title" className="text-base font-semibold text-neutral-900">Close without saving?</h3>
        <p className="mt-1.5 text-sm text-neutral-600">You have changes that haven’t been saved. If you close this now, they’ll be lost.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" data-no-guard autoFocus onClick={() => setAsking(false)} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-orange-700">
            Keep editing
          </button>
          <button
            type="button"
            data-no-guard
            onClick={() => {
              setAsking(false);
              onClose();
            }}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Discard &amp; close
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { bindPanel, request, escape, dialog, onClickCapture };
}
