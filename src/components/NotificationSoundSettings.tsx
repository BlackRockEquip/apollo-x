"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { getNotificationSoundPrefs, setNotificationSoundPrefs, playNotificationSound, NOTIFICATION_SOUNDS, type NotificationSoundPrefs } from "@/lib/notification-sound";

// 2026-10-01 — user request: "Make a sound when a notification is received
// (Allow to be put on/off via settings, also allow user to change sound via
// dropdown)." Rendered at the bottom of the /notifications page (see
// NotificationsList.tsx) — there's no dedicated account/preferences
// settings screen in this app yet, so "via settings" lands here, next to
// the notifications it controls, rather than inventing a new settings
// destination just for this one toggle. See notification-sound.ts for why
// this is all client-side (localStorage + generated tones, no schema/API).
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
    <section className="detail-panel">
      <header><div><h2><Volume2 size={15} /> Notification sound</h2><p>Plays when a new notification arrives while this tab is open. Saved on this device/browser.</p></div></header>
      <div className="drawer-fields compact-form-fields">
        <label>
          <span>Sound</span>
          <select value={prefs.enabled ? "on" : "off"} onChange={(e) => update({ ...prefs, enabled: e.target.value === "on" })}>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label>
          <span>Tone</span>
          <select value={prefs.sound} disabled={!prefs.enabled} onChange={(e) => { const next = { ...prefs, sound: e.target.value as NotificationSoundPrefs["sound"] }; update(next); if (next.enabled) playNotificationSound(next.sound); }}>
            {NOTIFICATION_SOUNDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label><span>&nbsp;</span><button type="button" className="quiet-button" disabled={!prefs.enabled} onClick={() => playNotificationSound(prefs.sound)}>Test sound</button></label>
      </div>
    </section>
  );
}
