"use client";

import { ITEM_FILTER_ALL, ITEM_FILTER_JOB, itemOptionLabel, itemTag } from "@/lib/jobs/item-model";

// 2026-10-29, "link parts, specs, photos etc" to an item (Engineering multi-item jobs). The small pieces the Parts, Outwork,
// Photos, Attachments and Specifications screens share: a picker ("For item"), a tag chip, and a filter row. On a job with no
// items none of them draws anything, so ordinary jobs look exactly as before.
export type LinkItem = { id: string; sequence: number; component?: string | null; componentModel?: string | null };

type SelectProps = {
  items: LinkItem[];
  jobNumber: string | null | undefined;
  value: string;
  onChange: (itemId: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  /** What the empty choice is called. */
  wholeJobLabel?: string;
  className?: string;
};

export function ItemSelect({ items, jobNumber, value, onChange, disabled, ariaLabel, wholeJobLabel = "Whole job", className }: SelectProps) {
  if (items.length === 0) return null;
  return (
    <select className={className ?? "ji-link-select"} value={value} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
      <option value="">{wholeJobLabel}</option>
      {items.map((item) => <option key={item.id} value={item.id}>{itemOptionLabel(item, jobNumber)}</option>)}
    </select>
  );
}

// "For item" form field: label + picker, only when the job has items.
export function ItemField({ items, jobNumber, value, onChange, disabled, label = "For item", wide }: Omit<SelectProps, "ariaLabel" | "className"> & { label?: string; wide?: boolean }) {
  if (items.length === 0) return null;
  return (
    <label className={wide ? "wide" : undefined}>
      <span>{label}</span>
      <ItemSelect items={items} jobNumber={jobNumber} value={value} onChange={onChange} disabled={disabled} ariaLabel={label} className="ji-link-field" />
    </label>
  );
}

// The tag of the item a record belongs to; nothing for a whole-job record.
export function ItemChip({ items, jobNumber, itemId }: { items: LinkItem[]; jobNumber: string | null | undefined; itemId: string | null | undefined }) {
  if (!itemId) return null;
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return null;
  return <span className="ji-tag ji-chip" title={itemOptionLabel(item, jobNumber)}>{itemTag(jobNumber, item.sequence)}</span>;
}

// A record's item as a small picker that saves on change (people who can edit), or just the chip (view only).
export function ItemLinkControl({ items, jobNumber, itemId, canEdit, busy, onChange, subject }: { items: LinkItem[]; jobNumber: string | null | undefined; itemId: string | null | undefined; canEdit: boolean; busy?: boolean; onChange: (itemId: string) => void; subject: string }) {
  if (items.length === 0) return null;
  if (!canEdit) return <ItemChip items={items} jobNumber={jobNumber} itemId={itemId} />;
  return <ItemSelect items={items} jobNumber={jobNumber} value={itemId ?? ""} onChange={onChange} disabled={busy} ariaLabel={`Item for ${subject}`} />;
}

// All / one item / whole job. `count(filter)` gives the number of records each choice would show.
export function ItemFilterBar({ items, jobNumber, value, onChange, count }: { items: LinkItem[]; jobNumber: string | null | undefined; value: string; onChange: (filter: string) => void; count: (filter: string) => number }) {
  if (items.length === 0) return null;
  const choices: Array<[string, string]> = [[ITEM_FILTER_ALL, "All items"], ...items.map((item): [string, string] => [item.id, itemTag(jobNumber, item.sequence)]), [ITEM_FILTER_JOB, "Whole job"]];
  return (
    <div className="ji-filter" role="group" aria-label="Show records for item">
      <span className="ji-filter-label">Item</span>
      <div className="jw-chips">
        {choices.map(([key, label]) => (
          <button key={key} type="button" className={value === key ? "jw-chip active" : "jw-chip"} aria-pressed={value === key} onClick={() => onChange(key)}>{label}<span>{count(key)}</span></button>
        ))}
      </div>
    </div>
  );
}
