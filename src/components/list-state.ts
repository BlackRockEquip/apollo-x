// 2026-09-15, user request: "Back button to take you back to where you last
// were." Clicking into a record from a list and then clicking the
// browser's own Back button used to always land back on a blank/default
// list — search text, status filter and page number all reset, because
// none of them live anywhere the browser's own history can see: they're
// just React state, and Next's client-side router remounts the list
// component on a back-navigation rather than reusing the previous one.
// sessionStorage sidesteps that: it survives the remount.
//
// Deliberately sessionStorage, not localStorage — this is "where you left
// off *this browsing session*", not a standing preference; a fresh tab (or
// a day later) should start from a clean list. Same "this one's per-browser
// on purpose" reasoning JobsWipColumnResize.tsx gives for its own (in that
// case deliberately persistent) localStorage use, just the other duration.

const PREFIX = "apollox.listState.";

export function readListState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    // Private browsing / storage blocked / corrupt value — a list that
    // doesn't remember its filters is a much smaller problem than one that
    // throws on every keystroke.
    return fallback;
  }
}

export function writeListState<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Best-effort, see readListState's comment.
  }
}
