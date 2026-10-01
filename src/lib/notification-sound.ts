// 2026-10-01 — user request: "Make a sound when a notification is received
// (Allow to be put on/off via settings, also allow user to change sound via
// dropdown)." No audio asset files exist anywhere in this app, and there's
// no per-user settings/preferences table in the schema to persist this
// server-side (see NotificationSoundSettings.tsx's own comment) — so both
// the sounds themselves and the on/off + choice are handled entirely
// client-side: tones generated on the fly with the Web Audio API (no file
// to fetch/ship), preference stored in localStorage (per-browser, same as
// every other "remembered on this device" setting in this codebase would
// be if one existed — there just isn't a precedent here since this is the
// first one).
export type NotificationSoundId = "chime" | "ping" | "bell" | "none";

export const NOTIFICATION_SOUNDS: { id: NotificationSoundId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "ping", label: "Ping" },
  { id: "bell", label: "Soft bell" },
  { id: "none", label: "No sound" },
];

export type NotificationSoundPrefs = { enabled: boolean; sound: NotificationSoundId };

const STORAGE_KEY = "apollox:notificationSound";
const DEFAULT_PREFS: NotificationSoundPrefs = { enabled: true, sound: "chime" };

export function getNotificationSoundPrefs(): NotificationSoundPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    const sound = NOTIFICATION_SOUNDS.some((s) => s.id === parsed.sound) ? parsed.sound : DEFAULT_PREFS.sound;
    return { enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_PREFS.enabled, sound };
  } catch {
    // Private-browsing / blocked storage / corrupt value — just fall back
    // to the default rather than breaking the bell.
    return DEFAULT_PREFS;
  }
}

export function setNotificationSoundPrefs(prefs: NotificationSoundPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Best-effort — see getNotificationSoundPrefs above.
  }
}

// Each "sound" is a tiny procedurally-generated tone sequence — a couple of
// short oscillator notes with a quick fade-out envelope, not a sample.
// Deliberately short and quiet; this fires in the background from a 30s
// poll, so it should be noticeable, not jarring.
const SOUND_SEQUENCES: Record<Exclude<NotificationSoundId, "none">, { freq: number; start: number; duration: number }[]> = {
  chime: [
    { freq: 880, start: 0, duration: 0.14 },
    { freq: 1318.5, start: 0.1, duration: 0.22 },
  ],
  ping: [{ freq: 1480, start: 0, duration: 0.16 }],
  bell: [
    { freq: 660, start: 0, duration: 0.35 },
    { freq: 990, start: 0.02, duration: 0.3 },
  ],
};

export function playNotificationSound(sound: NotificationSoundId) {
  if (sound === "none") return;
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;
    for (const note of SOUND_SEQUENCES[sound]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.freq;
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.duration + 0.02);
    }
    // Tear the context down once every note has finished playing —
    // otherwise each notification leaks a new AudioContext.
    const longest = Math.max(...SOUND_SEQUENCES[sound].map((n) => n.start + n.duration));
    setTimeout(() => { void ctx.close().catch(() => {}); }, (longest + 0.1) * 1000);
  } catch {
    // Autoplay-policy rejection, no audio hardware, etc. — a missed sound
    // is never worth surfacing as an error.
  }
}
