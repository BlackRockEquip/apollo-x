"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { getNotificationSoundPrefs, setNotificationSoundPrefs, playNotificationSound, NOTIFICATION_SOUNDS, type NotificationSoundPrefs } from "@/lib/notification-sound";

// 2026-10-01 — user request: "Make a sound when a notification is received
// (Allow to be put on/off via settings, also allow user to change sound via
// dropdown)." There's no dedicated account/preferences settings screen in
// this app yet, so "via settings" lands here, next to the notifications it
// controls, rather than inventing a new settings destination just for this
// one toggle. See notification-sound.ts for why this is all client-side
// (localStorage + generated tones, no schema/API).
//
// 2026-10-01 — user request: "Notifications sound section, move to small
// section at top right inline with header." Was its own full-width
// .detail-panel section below the notifications list (NotificationsList.tsx)
// — now a compact inline row rendered inside the /notifications page's own
// header (see app/(tenant)/notifications/page.tsx), which sits top-right
// automatically via .page-header's justify-content: space-between, same as
// any other page's header-actions button.
export function NotificationSoundSettings() {
  // Read from localStorage only after mount — reading it during the
  // server-rendered first pass would mismatch between server and client
  // and isn't safe anyway (window isn't available server-side).
  const [prefs, setPrefs] = useState<NotificationSoundPrefs>({ enabled: true, sound: "chime" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(getNotificationSoundPrefs());
    setReady(true);
  }, []);

  function update(next: NotificationSoundPrefs) {
    setPrefs(next);
    setNotificationSoundPrefs(next);
  }

  if (!ready) return null;

  return (
    <div className="notification-sound-inline" title="Notification sound — plays when a new notification arrives while this tab is open. Saved on this device/browser.">
      <Volume2 size={14} />
      <select value={prefs.enabled ? "on" : "off"} onChange={(e) => update({ ...prefs, enabled: e.target.value === "on" })} aria-label="Notification sound">
        <option value="on">Sound on</option>
        <option value="off">Sound off</option>
      </select>
      <select value={prefs.sound} disabled={!prefs.enabled} onChange={(e) => { const next = { ...prefs, sound: e.target.value as NotificationSoundPrefs["sound"] }; update(next); if (next.enabled) playNotificationSound(next.sound); }} aria-label="Notification tone">
        {NOTIFICATION_SOUNDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <button type="button" className="quiet-button" disabled={!prefs.enabled} onClick={() => playNotificationSound(prefs.sound)}>Test</button>
    </div>
  );
}
