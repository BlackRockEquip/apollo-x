"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

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
export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/v1/notifications/unread-count", { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const body = await r.json();
        if (!cancelled) setCount(Number(body.count) || 0);
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
