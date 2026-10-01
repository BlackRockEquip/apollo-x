"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";

type BroadcastRow = { id: string; title: string; message: string } | null;

// 2026-10-01 — user request: "Allow a Org Admin to send out a message to
// all users/individual users (Notification banner that popsup)." Rendered
// from AppShell.tsx (every tenant page), same visibility-gated polling
// pattern as NotificationBell.tsx — polls the lightweight
// /api/v1/notifications/active-broadcast route (the newest unread
// ORG_BROADCAST notification addressed to the signed-in user, if any) and
// shows it as a dismissible banner until it's closed or read elsewhere.
// Dismissing here marks it read (same endpoint NotificationsList.tsx uses
// for any other notification) so it won't pop up again on the next poll or
// next page load, but it still shows up in the normal notifications list
// for later reference.
export function BroadcastBanner() {
  const [broadcast, setBroadcast] = useState<BroadcastRow>(null);
  const [dismissing, setDismissing] = useState(false);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch("/api/v1/notifications/active-broadcast", { cache: "no-store" });
      if (!r.ok) return;
      const body = await r.json();
      setBroadcast(body && body.id ? { id: body.id, title: body.title, message: body.message } : null);
    } catch {
      // Best-effort — a failed poll just leaves the banner as it was.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void poll();
    const timer = setInterval(() => { if (!cancelled) void poll(); }, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [poll]);

  async function dismiss() {
    if (!broadcast) return;
    setDismissing(true);
    const id = broadcast.id;
    setBroadcast(null);
    try {
      await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
    } catch {
      // Best-effort — worst case it pops back up on the next poll.
    } finally {
      setDismissing(false);
    }
  }

  if (!broadcast) return null;

  return (
    <div className="org-broadcast-banner" role="status">
      <Megaphone size={16} />
      <div><strong>{broadcast.title}</strong><span>{broadcast.message}</span></div>
      <button type="button" aria-label="Dismiss" disabled={dismissing} onClick={() => void dismiss()}><X size={16} /></button>
    </div>
  );
}
