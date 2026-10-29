// Pure helpers for the Ratios tab (2026-10-29 redesign): splitting a ratio into a big number and a small unit, and grouping the ratio
// cards. Kept out of ReportsWorkspace.tsx so they can be unit tested.

export type RatioStatLike = { key: string; label: string; format: "percent" | "days" | "currency" | "count"; value: number | null; detail: string };

/** 75 -> { value: "75.0", unit: "%" }; 23.4 days -> { "23.4", "days" }; money -> { "R 18 420,00", "" }; no data -> { "—", "" }. */
export function splitRatioValue(stat: RatioStatLike): { value: string; unit: string } {
  if (stat.value == null) return { value: "—", unit: "" };
  switch (stat.format) {
    case "percent": return { value: stat.value.toFixed(1), unit: "%" };
    case "days": return { value: stat.value.toFixed(1), unit: "days" };
    case "currency": return { value: new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(stat.value), unit: "" };
    default: return { value: Math.round(stat.value).toLocaleString("en-ZA"), unit: "" };
  }
}

/** Width (0-100) of a percent ratio's progress bar; anything that is not a percent has no bar. */
export function ratioBarPercent(stat: RatioStatLike): number | null {
  if (stat.format !== "percent" || stat.value == null) return null;
  return Math.max(0, Math.min(100, stat.value));
}

const DELIVERY_KEYS = ["warranty-ratio", "completion-rate", "on-time-delivery", "avg-turnaround-days"];
const CUSTOMER_KEYS = ["repeat-customer-rate", "job-rfq-response-rate", "general-rfq-response-rate", "avg-parts-cost-per-job"];

/** Two named groups in a fixed order; any ratio the backend adds later lands in a third "More" group instead of disappearing. */
export function ratioGroups<T extends RatioStatLike>(stats: T[]): Array<{ title: string; note: string; items: T[] }> {
  const byKey = new Map(stats.map((s) => [s.key, s] as const));
  const pick = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((s): s is T => Boolean(s));
  const known = new Set([...DELIVERY_KEYS, ...CUSTOMER_KEYS]);
  const groups = [
    { title: "Delivery and quality", note: "How jobs move through the workshop.", items: pick(DELIVERY_KEYS) },
    { title: "Customers and procurement", note: "Repeat business and supplier responsiveness.", items: pick(CUSTOMER_KEYS) },
    { title: "More", note: "", items: stats.filter((s) => !known.has(s.key)) },
  ];
  return groups.filter((g) => g.items.length > 0);
}
