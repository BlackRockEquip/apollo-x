"use client";

import { useEffect } from "react";

// 2026-09-15, user request: "Back button to take you back to where you last
// were." Pairs with list-state.ts's filter persistence — that fixes the
// search/status/page resetting; this fixes the scroll position resetting.
// Next's App Router only restores *window* scroll on a back/forward
// navigation, but every data table on this site scrolls inside its own
// `.data-table-wrap` (see globals.css) rather than the page itself, which
// the browser's own restoration doesn't reach — so clicking into a
// record and then clicking Back always used to land back at the very top
// of the list. Restores + continuously persists that element's scrollTop
// in sessionStorage instead, keyed by pathname-ish caller-supplied key so
// it survives the remount a real back-navigation causes to a component's
// own state.
//
// Render this only once the list it targets has actually rendered its rows
// (e.g. `{!loading && <ScrollRestore .../>}`) — otherwise its one-time
// `document.querySelector` at mount can run before the target element
// exists yet, or land in the same call the previous render did nothing.
export function ScrollRestore({ selector, storageKey }: { selector: string; storageKey: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    const key = `apollox.scroll.${storageKey}`;

    // 2026-10-09 — restores again a moment later (unless the user has touched the
    // table in the meantime): the Excel-style column filters (TableColumnFilters)
    // hide rows right after the list first renders, which shortens the table and
    // would otherwise clamp the position restored here.
    const timers: ReturnType<typeof setTimeout>[] = [];
    let touched = false;
    const markTouched = () => { touched = true; };
    el.addEventListener("wheel", markTouched, { passive: true });
    el.addEventListener("touchstart", markTouched, { passive: true });
    el.addEventListener("mousedown", markTouched);
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const y = Number(saved);
        if (Number.isFinite(y)) {
          el.scrollTop = y;
          for (const delay of [80, 250]) timers.push(setTimeout(() => { if (!touched && Math.abs(el.scrollTop - y) > 1) el.scrollTop = y; }, delay));
        }
      }
    } catch {
      // Private browsing / storage blocked — just skip restoring.
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        try { sessionStorage.setItem(key, String(el!.scrollTop)); } catch { /* best-effort */ }
        ticking = false;
      });
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", markTouched);
      el.removeEventListener("touchstart", markTouched);
      el.removeEventListener("mousedown", markTouched);
      timers.forEach(clearTimeout);
    };
  }, [selector, storageKey]);

  return null;
}
