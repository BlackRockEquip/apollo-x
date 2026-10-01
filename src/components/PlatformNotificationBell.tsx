"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

// 2026-10-01 — user request: "when clicking the support button... if Org
// Admins click support then it should go to System Admin, a proper system
// flow." Platform-side counterpart of NotificationBell.tsx — same
// always-visible-badge/polling pattern, rendered from PlatformShell.tsx's
// topbar, pointed at the platform notification routes
// (lib/platform/notifications.ts) instead of the tenant ones.
export function PlatformNotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/v1/platform/notifications/unread-count", { cache: "no-store" });
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
    <Link href="/platform/notifications" className="table-action notification-bell" aria-label={count > 0 ? `${count} unread notification${count === 1 ? "" : "s"}` : "Notifications"}>
      <Bell size={14} />
      {count > 0 && <span className="notification-badge">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
