"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 2026-09-15, user request: "Refresh faster with changes" — clarified to
// mean shared list/overview pages should pick up other people's changes on
// their own, rather than someone having to manually reload the browser to
// see them. This page (src/app/(tenant)/jobs/page.tsx is a server
// component — it fetches its data once per request, then just sits there.
// Mounting this (renders nothing) makes it call router.refresh() on an
// interval, which re-runs the page's server-side data fetch and re-renders
// with fresh data in place — the same mechanism JobsWipColumnPicker.tsx
// already uses after a column change — rather than a full page navigation,
// so the URL/search params/filters and scroll position aren't disturbed.
// Skips the tick while the tab isn't visible so a background tab isn't
// polling the server for no one to see.
//
// A client-fetched page (Dashboard, Outwork, etc.) doesn't need this — it
// already owns its own fetch() call and can poll that directly with its own
// setInterval + a "silent" reload flag, same pattern as JobWorkspace's own
// load(silent) already uses after a save. This component is specifically
// for server components, which have no fetch call of their own to re-run.
export function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
