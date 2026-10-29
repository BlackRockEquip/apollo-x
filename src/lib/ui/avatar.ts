// Small presentation helpers shared by Reports, Customers and Suppliers (2026-10-29 redesign): the initials and soft colour used for a
// name's avatar tile, and "share of total" text. Pure so they can be unit tested.

const TONES: Array<{ bg: string; fg: string }> = [
  { bg: "#e8f0fc", fg: "#1d4fa3" },
  { bg: "#fff1d6", fg: "#8a5200" },
  { bg: "#e3f5ec", fg: "#066a4a" },
  { bg: "#eeeafc", fg: "#5b3fc4" },
];

/** "Gold1 - NKGM" -> "GN", "Danoher" -> "DA", "" -> "?". Punctuation is ignored. */
export function initialsOf(name: string): string {
  const words = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

/** The same name always gets the same colour (a simple string hash, not an index into the current list). */
export function avatarTone(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (const ch of String(seed || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/** 213 of 366 -> "58.2%". Returns "0%" when the total is 0 so nothing shows NaN. */
export function sharePercent(part: number, total: number, digits = 1): string {
  if (!total || total <= 0) return "0%";
  return `${((part / total) * 100).toFixed(digits)}%`;
}
