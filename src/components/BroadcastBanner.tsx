"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Megaphone, Wrench, X } from "lucide-react";

type BroadcastRow = { id: string; title: string; message: string; link: string | null; kind: "INFORMATION" | "IMPORTANT" | "MAINTENANCE"; requireAck: boolean; fromPlatform: boolean } | null;

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
//
// 2026-10-27, user request: platform admin broadcasts (Platform > Broadcasts) arrive through this same banner. Their kind picks
// the colour and icon (information / important / maintenance), an optional link shows as "More", and when the sender asked
// for acknowledgement the cross is replaced by an "I have read this" button.
export function BroadcastBanner() {
  const [broadcast, setBroadcast] = useState<BroadcastRow>(null);
  const [dismissing, setDismissing] = useState(false);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch("/api/v1/notifications/active-broadcast", { cache: "no-store" });
      if (!r.ok) return;
      const body = await r.json();
      setBroadcast(body && body.id ? { id: body.id, title: body.title, message: body.message, link: body.link ?? null, kind: body.kind ?? "INFORMATION", requireAck: Boolean(body.requireAck), fromPlatform: Boolean(body.fromPlatform) } : null);
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

  const Icon = broadcast.kind === "MAINTENANCE" ? Wrench : broadcast.kind === "IMPORTANT" ? AlertTriangle : Megaphone;
  const safeLink = broadcast.link && /^https?:\/\//i.test(broadcast.link) ? broadcast.link : null;
  return (
    <div className={`org-broadcast-banner bc-${broadcast.kind.toLowerCase()}`} role={broadcast.kind === "INFORMATION" ? "status" : "alert"}>
      <style>{BANNER_STYLES}</style>
      <Icon size={16} />
      <div>
        <strong>{broadcast.title}</strong>
        <span>{broadcast.message}</span>
        {broadcast.fromPlatform ? <em className="bc-from">From Flo X</em> : null}
      </div>
      {safeLink ? <a className="bc-more" href={safeLink} target="_blank" rel="noopener noreferrer">More</a> : null}
      {broadcast.requireAck
        ? <button type="button" className="bc-ack" disabled={dismissing} onClick={() => void dismiss()}>I have read this</button>
        : <button type="button" aria-label="Dismiss" disabled={dismissing} onClick={() => void dismiss()}><X size={16} /></button>}
    </div>
  );
}

// Colours for the three kinds. The base look (.org-broadcast-banner) is unchanged from the Org Admin version; these only
// override the colours, so an Org Admin message still looks as it always did.
const BANNER_STYLES = `
.org-broadcast-banner.bc-important{background:#fdf0d2;border-color:#e6c36a;color:#5b4310}
.org-broadcast-banner.bc-maintenance{background:#0c1a2c;border-color:#0c1a2c;color:#e9eef6}
.org-broadcast-banner.bc-maintenance button{color:#e9eef6}
.org-broadcast-banner .bc-from{display:block;margin-top:2px;font-size:11px;font-style:normal;opacity:.7}
.org-broadcast-banner .bc-more{flex:none;align-self:center;margin-left:auto;padding:4px 10px;border-radius:6px;border:1px solid currentColor;color:inherit;font-size:12px;font-weight:700;text-decoration:none}
.org-broadcast-banner .bc-ack{flex:none;align-self:center;padding:6px 12px;border-radius:7px;border:0;background:#d6a83b;color:#1c1405;font-size:12px;font-weight:800;cursor:pointer;width:auto;height:auto}
`;
