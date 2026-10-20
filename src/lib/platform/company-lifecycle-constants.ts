// Shared by the platform company screens (client) and the lifecycle service (server).
// 2026-10-20, user request: reset button needs "Reset Company" typed; clone appends "- copy".
export const RESET_CONFIRM_PHRASE = "Reset Company";
export const COMPANY_COPY_SUFFIX = " - copy";

/** "Acme" -> "Acme - copy" (never added twice in a row for the same source name). */
export function companyCopyName(name: string) {
  return `${name.trim()}${COMPANY_COPY_SUFFIX}`;
}

/** First free internal code: BASE-COPY, BASE-COPY2, BASE-COPY3 ... (case-insensitive against the codes already taken). */
export function pickFreeCopyCode(baseCode: string, taken: string[]) {
  const used = new Set(taken.map((code) => code.toUpperCase()));
  const base = baseCode.trim().toUpperCase();
  let candidate = `${base}-COPY`;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-COPY${n}`;
  return candidate;
}

/** True when the typed text is exactly the reset phrase (surrounding spaces ignored). */
export function isResetPhrase(typed: string) {
  return typed.trim() === RESET_CONFIRM_PHRASE;
}
