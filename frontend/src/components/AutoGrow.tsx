"use client";

import { useEffect } from "react";

// Every text area grows and shrinks with what is typed in it, so there is no resize handle and nothing to drag. The
// `rows` a field was given is its minimum height, and a field's own max-height (or the 70vh cap in globals.css) is how far
// it grows before it scrolls. A field that sizes itself some other way opts out with data-autosize="off".
//
// One listener for the whole app rather than a wrapper around each <textarea>, so fields added later behave the same.
// Programmatic changes (the AI filling in a caption) are caught because React updates a textarea's default text, which
// shows up as a DOM mutation.
function fit(el: HTMLTextAreaElement) {
  if (el.dataset.autosize === "off" || el.getClientRects().length === 0) return; // hidden: nothing to measure yet
  el.style.height = "auto"; // the height its `rows` give it
  const rowsHeight = el.offsetHeight;
  const border = el.offsetHeight - el.clientHeight;
  el.style.height = "0px";
  const content = el.scrollHeight + border;
  el.style.height = `${Math.max(rowsHeight, content)}px`;
}

export function AutoGrow() {
  useEffect(() => {
    const widths = new WeakMap<HTMLTextAreaElement, number>();
    const queue = new Set<HTMLTextAreaElement>();
    let frame = 0;
    const flush = () => {
      frame = 0;
      for (const el of queue) {
        fit(el);
        widths.set(el, el.clientWidth);
      }
      queue.clear();
    };
    const grow = (el: HTMLTextAreaElement) => {
      queue.add(el);
      if (!frame) frame = requestAnimationFrame(flush);
    };

    // A field shown for the first time (it was in a hidden tab) or whose width changed (the window, a panel) re-wraps.
    const resizes = new ResizeObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLTextAreaElement;
        if (widths.get(el) !== el.clientWidth) grow(el);
      }
    });
    const seen = new WeakSet<HTMLTextAreaElement>();
    const adopt = (el: HTMLTextAreaElement) => {
      if (!seen.has(el)) {
        seen.add(el);
        resizes.observe(el);
      }
      grow(el);
    };
    const scan = (root: ParentNode) => root.querySelectorAll("textarea").forEach(adopt);

    const onInput = (e: Event) => e.target instanceof HTMLTextAreaElement && adopt(e.target);
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onInput, true);
    scan(document);

    const mutations = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLTextAreaElement) adopt(n);
            else if (n instanceof Element) scan(n);
          });
          // The text inside a textarea changed (React setting a new value).
          if (m.target instanceof HTMLTextAreaElement) grow(m.target);
        } else if (m.target.parentElement instanceof HTMLTextAreaElement) grow(m.target.parentElement);
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("focusin", onInput, true);
      mutations.disconnect();
      resizes.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
