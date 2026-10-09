"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// 2026-10-09, user request: "When clicking back, let it remember where you
// were". The Jobs list keeps its search / view / type / status in the URL, so
// the browser's own Back button already returns to the filtered list — but the
// in-page "Back to jobs" link on a job always went to a bare /jobs and threw
// the filters away. This pair fixes that: <RememberListUrl> (rendered on the
// list page) records the list's current path + query in sessionStorage, and
// useRememberedListUrl() (used by the record page's Back link) reads it back.
// Per-tab on purpose (sessionStorage), same reasoning as list-state.ts.

const PREFIX = "apollox.listUrl.";

export function RememberListUrl({ storageKey }: { storageKey: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    try {
      window.sessionStorage.setItem(PREFIX + storageKey, search ? `${pathname}?${search}` : pathname);
    } catch {
      // Storage blocked — the Back link just falls back to the bare list.
    }
  }, [storageKey, pathname, search]);
  return null;
}

export function useRememberedListUrl(storageKey: string, fallback: string): string {
  // Starts as the fallback so server + first client render match; the saved
  // value is applied right after mount.
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(PREFIX + storageKey);
      // Only ever send the user back to the same list (guards a tampered value).
      if (saved && (saved === fallback || saved.startsWith(fallback + "?"))) setHref(saved);
    } catch {
      // keep fallback
    }
  }, [storageKey, fallback]);
  return href;
}
