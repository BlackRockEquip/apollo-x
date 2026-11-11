// 2026-11-11, user request: "when adding parts with descriptions, it should override the description 'imported part...'".
// A part number pasted into a kit that is not in the Parts Catalog yet is created there with the stand-in description
// "Imported part PN1001". When the same number is pasted again with a real description, the real one replaces the
// stand-in (on the catalog part and on the kit line). A real description is never overwritten.
//
// Pure helpers (no database) so the rule is tested on its own.

/** The stand-in description given to a catalog part created from a pasted number that came without a description. */
export function placeholderDescription(partNumber: string): string {
  return `Imported part ${partNumber}`;
}

/** True when the description is empty or still the "Imported part ..." stand-in. */
export function isPlaceholderDescription(description: string | null | undefined): boolean {
  const value = (description ?? "").trim();
  return value === "" || /^imported part\b/i.test(value);
}

/** A typed description worth saving: trimmed, at least two characters. Anything shorter counts as "no description". */
export function typedDescription(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return value.length >= 2 ? value : null;
}

/** The description to keep: the typed one when the current one is empty or a stand-in, otherwise the current one. */
export function descriptionAfterTyped(current: string | null | undefined, typed: string | null | undefined): string | null {
  const next = typedDescription(typed);
  if (next && isPlaceholderDescription(current)) return next;
  const keep = (current ?? "").trim();
  return keep || null;
}
