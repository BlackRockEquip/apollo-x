import { z } from "zod";

// Pure helpers for the Jobs & WIP table email (kept free of database imports so they can be unit tested).

const MAX_RECIPIENTS = 5;

export function parseRecipients(raw: string): string[] {
  const parts = raw.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const unique = Array.from(new Set(parts));
  if (unique.length === 0 || unique.length > MAX_RECIPIENTS) throw new Error("INVALID_RECIPIENTS");
  const email = z.string().email().max(254);
  for (const address of unique) if (!email.safeParse(address).success) throw new Error("INVALID_RECIPIENTS");
  return unique;
}

// Column widths follow the longest text in each column (capped), so short columns such as Status stay narrow.
export function columnWeights(headers: string[], rows: string[][]): number[] {
  return headers.map((header, i) => {
    let longest = header.length;
    for (const row of rows.slice(0, 300)) longest = Math.max(longest, (row[i] ?? "").length);
    return Math.min(30, Math.max(6, longest));
  });
}
