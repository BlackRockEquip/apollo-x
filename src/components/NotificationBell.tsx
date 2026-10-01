"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getNotificationSoundPrefs, playNotificationSound } from "@/lib/notification-sound";

// 2026-09-19 — user request: "notifications move to icon next to the
// support link at the top of page, always visible from every page, once
// clicked will have its own page that a user can view all notifications."
// Rendered from AppShell's topbar (always visible on every tenant page —
// see AppShell.tsx), so this only needs to own its own polling for the
// unread badge; clicking it just navigates to /notifications (the "own
// page" from the request) rather than opening a dropdown here.
//
// Polls the lightweight /api/v1/notifications/unread-count route (not the
// full list) on an interval, same visibility-gated pattern as
// AutoRefresh.tsx, so a backgrounded tab isn't polling for no one to see.
//
// 2026-10-01 — user request: "Make a sound when a notification is
// received." Since this only ever sees the unread *count* (not the rows
// themselves), "received" is detected as the count going up between two
// polls — not just being nonzero, which would replay on every single poll
// for as long as anything stayed unread. The very first poll after mount
// just seeds the baseline (hasPolled) so reopening a tab with existing
// unread notifications doesn't itself play a sound.
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const previousCount = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/v1/notifications/unread-count", { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const body = await r.json();
        const nextCount = Number(body.count) || 0;
        if (cancelled) return;
        if (previousCount.current !== null && nextCount > previousCount.current) {
          const prefs = getNotificationSoundPrefs();
          if (prefs.enabled) playNotificationSound(prefs.sound);
        }
        previousCount.current = nextCount;
        setCount(nextCount);
      } catch {
        // Best-effort — a failed poll just leaves the last-known count.
      }
    }
    void poll();
    const timer = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <Link href="/notifications" className="table-action notification-bell" aria-label={count > 0 ? `${count} unread notification${count === 1 ? "" : "s"}` : "Notifications"}>
      <Bell size={14} />
      {count > 0 && <span className="notification-badge">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
