// 2026-10-29, user request (Engineering): one job can hold several items a customer sent in together (e.g. Blackrock sends 5 items
// to Hi-Gear). Pure rules for those items - tags, the "Mixed" job status, pasted lists - with no database or React in here so
// they can be tested on their own. See the JobItem model in prisma/schema.prisma for how the rows are stored.

// A job with no item rows is a normal one-item job. Rows exist only on Engineering jobs that were created with several items
// (or had a second item added later).
export const MAX_ITEMS_PER_JOB = 200;

// Item tag = job number + "-" + the item's position, e.g. BRE1122-3. Falls back to the position alone before a number exists.
export function itemTag(jobNumber: string | null | undefined, sequence: number): string {
  const number = (jobNumber ?? "").trim();
  return number ? `${number}-${sequence}` : `#${sequence}`;
}

// Ready to deliver, or already past that step.
const READY_STATUSES: readonly string[] = ["TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT", "AWAIT_PAYMENT", "COMPLETE", "CLOSED"];
export function isItemReady(status: string): boolean {
  return READY_STATUSES.includes(status);
}

export type ItemStatusCount = { status: string; count: number };

export type ItemRollup = {
  total: number;
  /** Items that are ready to deliver (or beyond). */
  ready: number;
  /** True when the items are not all at the same status - the job then shows "Mixed". */
  mixed: boolean;
  /** The job's own status: the least advanced item, so the job never looks further along than its slowest item. */
  status: string | null;
  /** How many items sit at each status, in flow order (statuses outside the flow, e.g. cancelled, come last). */
  counts: ItemStatusCount[];
};

// `steps` is the job type's flow (statusStepsForJobType). Cancelled items are ignored for the job's status while any other item is
// still going; if every item is cancelled the job is cancelled.
export function summarizeItemStatuses(statuses: readonly string[], steps: readonly string[]): ItemRollup {
  const total = statuses.length;
  if (total === 0) return { total: 0, ready: 0, mixed: false, status: null, counts: [] };
  const tally = new Map<string, number>();
  for (const status of statuses) tally.set(status, (tally.get(status) ?? 0) + 1);
  const rank = (status: string) => {
    const index = steps.indexOf(status);
    return index === -1 ? steps.length : index;
  };
  const counts = [...tally.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => rank(a.status) - rank(b.status) || a.status.localeCompare(b.status));
  const live = statuses.filter((status) => status !== "CANCELLED");
  let status: string;
  if (live.length === 0) status = "CANCELLED";
  else {
    // Least advanced = lowest position in the flow. A status the flow does not list (should not happen) never wins.
    const listed = live.filter((s) => steps.includes(s));
    const pool = listed.length > 0 ? listed : live;
    status = pool.reduce((lowest, current) => (rank(current) < rank(lowest) ? current : lowest));
  }
  return {
    total,
    ready: statuses.filter(isItemReady).length,
    mixed: tally.size > 1,
    status,
    counts,
  };
}

// The job-level fields that mirror item 1, so the Jobs list, search, PEX unit description and printed documents (which read
// the job's own machine / component fields) keep working for a multi-item job.
export type ItemMachineFields = {
  component?: string | null;
  componentModel?: string | null;
  componentSerial?: string | null;
  componentPartNumber?: string | null;
  machineMake?: string | null;
  machineModel?: string | null;
  machineSerial?: string | null;
  plantNumber?: string | null;
  machineHours?: string | number | null;
};

export function jobFieldsFromFirstItem(item: ItemMachineFields | undefined) {
  return {
    component: item?.component ?? null,
    componentModel: item?.componentModel ?? null,
    componentSerial: item?.componentSerial ?? null,
    componentPartNumber: item?.componentPartNumber ?? null,
    machineMake: item?.machineMake ?? null,
    machineModel: item?.machineModel ?? null,
    machineSerial: item?.machineSerial ?? null,
    plantNumber: item?.plantNumber ?? null,
    machineHours: item?.machineHours ?? null,
  };
}

// "Paste from spreadsheet": one item per line, columns separated by tabs (a straight copy out of Excel) or semicolons/commas when
// there are no tabs. Column order: Component, Component model, Component serial, Machine make, Machine model, Work requested.
// A first line that is clearly a header row is skipped; empty lines are dropped.
export type PastedItem = {
  component: string;
  componentModel: string;
  componentSerial: string;
  machineMake: string;
  machineModel: string;
  workRequested: string;
};

const PASTE_COLUMNS: Array<keyof PastedItem> = ["component", "componentModel", "componentSerial", "machineMake", "machineModel", "workRequested"];
const HEADER_WORDS = ["component", "model", "serial", "machine", "make", "work", "description", "item"];

export function parseItemsPaste(text: string): PastedItem[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, "")).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : lines.some((line) => line.includes(";")) ? ";" : ",";
  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1")));
  const first = rows[0].map((cell) => cell.toLowerCase());
  const looksLikeHeader = first.length >= 2 && first.every((cell) => cell === "" || HEADER_WORDS.some((word) => cell.includes(word)));
  const body = looksLikeHeader ? rows.slice(1) : rows;
  return body
    .map((cells) => {
      const item = { component: "", componentModel: "", componentSerial: "", machineMake: "", machineModel: "", workRequested: "" } as PastedItem;
      PASTE_COLUMNS.forEach((key, index) => { item[key] = (cells[index] ?? "").slice(0, key === "workRequested" ? 4000 : 500); });
      return item;
    })
    .filter((item) => PASTE_COLUMNS.some((key) => item[key].length > 0))
    .slice(0, MAX_ITEMS_PER_JOB);
}

// ----------------------------------------------------------------------------
// 2026-10-29, per-item delivery notes: a customer's items are rarely ready on the same day, so a delivery note lists only the
// items going out on it. Each delivery is its own note (own date, own item lines); items that go out on it are then moved to
// Delivered / Await payment, so the next note starts from the items still waiting.
// ----------------------------------------------------------------------------
export const READY_TO_DELIVER_STATUS = "TO_BE_DELIVERED";
export const DELIVERED_STATUS = "DELIVERED_AWAITING_PAYMENT";

export type DeliveryItem = ItemMachineFields & { id: string; sequence: number; status: string };

// The line a delivery note shows for an item: its tag, then what it is. Empty parts are left out.
export function itemDeliveryLine(item: DeliveryItem, jobNumber: string | null | undefined): string {
  const machine = [item.machineMake, item.machineModel].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
  const serial = (item.componentSerial ?? "").trim();
  return [
    itemTag(jobNumber, item.sequence),
    (item.component ?? "").trim(),
    (item.componentModel ?? "").trim(),
    serial ? `S/N ${serial}` : "",
    machine,
  ].filter(Boolean).join(" · ");
}

// Items to tick when a delivery note opens: the ones ready to go out and not yet delivered.
export function defaultDeliveryPicks(items: readonly DeliveryItem[]): string[] {
  return items.filter((item) => item.status === READY_TO_DELIVER_STATUS).map((item) => item.id);
}

// After the note is printed, only the ticked items that were ready are moved on to Delivered. A ticked item that was not ready
// (e.g. goes out early on the customer's say-so) stays where it is.
export function itemsToMarkDelivered(items: readonly DeliveryItem[], pickedIds: readonly string[]): string[] {
  const picked = new Set(pickedIds);
  return items.filter((item) => picked.has(item.id) && item.status === READY_TO_DELIVER_STATUS).map((item) => item.id);
}

// Added to the saved PDF's name so one delivery note does not replace another, e.g. "Items 1, 3".
export function deliveryNoteSuffix(items: readonly DeliveryItem[], pickedIds: readonly string[]): string | undefined {
  const picked = new Set(pickedIds);
  const sequences = items.filter((item) => picked.has(item.id)).map((item) => item.sequence).sort((a, b) => a - b);
  if (sequences.length === 0) return undefined;
  return `${sequences.length === 1 ? "Item" : "Items"} ${sequences.join(", ")}`;
}

// ----------------------------------------------------------------------------
// 2026-10-29, delivery note register (Engineering): every job delivery note is recorded when it is printed, with a number that
// counts up per job (BRE1122-DN1, BRE1122-DN2 ...), so it can be found again and reprinted exactly as it was issued.
// ----------------------------------------------------------------------------
export function deliveryNoteNumber(jobNumber: string | null | undefined, sequence: number): string {
  const number = (jobNumber ?? "").trim();
  return `${number || "JOB"}-DN${sequence}`;
}

export type DeliveryNoteLine = { description: string; quantity: string; itemId?: string };

// The lines are stored as JSON; read them back defensively so one odd row can never break the register or a reprint.
export function readDeliveryNoteLines(value: unknown): DeliveryNoteLine[] {
  if (!Array.isArray(value)) return [];
  const lines: DeliveryNoteLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const description = typeof row.description === "string" ? row.description : "";
    const quantity = typeof row.quantity === "string" ? row.quantity : typeof row.quantity === "number" ? String(row.quantity) : "";
    if (!description.trim() && !quantity.trim()) continue;
    lines.push({ description, quantity, ...(typeof row.itemId === "string" && row.itemId ? { itemId: row.itemId } : {}) });
  }
  return lines;
}

// How many job items are on a note (lines tied to an item), for the register's "Items" column.
export function deliveryNoteItemCount(lines: readonly DeliveryNoteLine[]): number {
  return new Set(lines.map((line) => line.itemId).filter(Boolean)).size;
}

// ----------------------------------------------------------------------------
// 2026-10-29, "link parts, specs, photos etc" to an item (Engineering multi-item jobs). Part lines, outwork, photos / attachments
// and specification reports each carry an optional itemId: empty means the whole job (what everything already on file is),
// otherwise it is the item the record is for. Pick slips follow the part lines on them.
// ----------------------------------------------------------------------------
export const ITEM_LINK_KINDS = ["part", "outwork", "attachment", "dimension"] as const;
export type ItemLinkKind = (typeof ITEM_LINK_KINDS)[number];

// The view filter on the job screen: every record, only the whole-job ones, or one item's.
export const ITEM_FILTER_ALL = "all";
export const ITEM_FILTER_JOB = "job";

export function matchesItemFilter(itemId: string | null | undefined, filter: string): boolean {
  if (filter === ITEM_FILTER_ALL) return true;
  if (filter === ITEM_FILTER_JOB) return !itemId;
  return itemId === filter;
}

// A filter that points at an item that is no longer there (removed in the meantime) falls back to showing everything.
export function normalizeItemFilter(filter: string, itemIds: readonly string[]): string {
  if (filter === ITEM_FILTER_ALL || filter === ITEM_FILTER_JOB) return filter;
  return itemIds.includes(filter) ? filter : ITEM_FILTER_ALL;
}

// What the select shows for an item: its tag, then what it is.
export function itemOptionLabel(item: { sequence: number; component?: string | null; componentModel?: string | null }, jobNumber: string | null | undefined): string {
  const what = [item.component, item.componentModel].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
  return what ? `${itemTag(jobNumber, item.sequence)} · ${what}` : itemTag(jobNumber, item.sequence);
}

export type ItemLinkCounts = { parts: number; outwork: number; photos: number; files: number; reports: number };

type Linked = { itemId?: string | null };

// How many records are tied to each item, for the item list ("3 parts · 1 outwork"). Whole-job records are not counted.
export function countItemLinks(records: { parts: readonly Linked[]; outwork: readonly Linked[]; attachments: ReadonlyArray<Linked & { isPhoto?: boolean | null }>; reports?: readonly Linked[] }): Record<string, ItemLinkCounts> {
  const counts: Record<string, ItemLinkCounts> = {};
  const slot = (id: string) => (counts[id] ??= { parts: 0, outwork: 0, photos: 0, files: 0, reports: 0 });
  for (const row of records.parts) if (row.itemId) slot(row.itemId).parts++;
  for (const row of records.outwork) if (row.itemId) slot(row.itemId).outwork++;
  for (const row of records.attachments) if (row.itemId) { if (row.isPhoto) slot(row.itemId).photos++; else slot(row.itemId).files++; }
  for (const row of records.reports ?? []) if (row.itemId) slot(row.itemId).reports++;
  return counts;
}

export function itemLinkSummary(counts: ItemLinkCounts | undefined): string {
  if (!counts) return "";
  const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    counts.parts ? noun(counts.parts, "part", "parts") : "",
    counts.outwork ? `${counts.outwork} outwork` : "",
    counts.reports ? noun(counts.reports, "report", "reports") : "",
    counts.photos ? noun(counts.photos, "photo", "photos") : "",
    counts.files ? noun(counts.files, "file", "files") : "",
  ].filter(Boolean).join(" · ");
}

export function itemLinkTotal(counts: ItemLinkCounts | undefined): number {
  return counts ? counts.parts + counts.outwork + counts.photos + counts.files + (counts.reports ?? 0) : 0;
}

// Pick slips and delivery notes print the item in front of the line's own text, e.g. "[BRE1122-2] Seal kit".
export function withItemTag(tag: string | null | undefined, text: string | null | undefined): string {
  const body = (text ?? "").trim();
  return tag ? (body ? `[${tag}] ${body}` : `[${tag}]`) : body;
}

// ----------------------------------------------------------------------------
// 2026-10-29, user request: the job screen's status stepper shows "where the items are". One circle per step with the number of
// items sitting on it; steps before the least advanced item are complete. The display folds two statuses the way the old
// stepper did (TO_BE_COLLECTED shows on TO_BE_RECEIVED, WAITING_FOR_PARTS on AWAIT_OUTWORK).
// ----------------------------------------------------------------------------
export function stepperDisplayStatus(status: string): string {
  if (status === "WAITING_FOR_PARTS") return "AWAIT_OUTWORK";
  if (status === "TO_BE_COLLECTED") return "TO_BE_RECEIVED";
  return status;
}

export type StepperNodeState = "done" | "current" | "ahead" | "idle";
export type StepperNode = {
  step: string;
  /** Items on this step. */
  count: number;
  /** done = before the least advanced item; current = the least advanced item's step; ahead = a later step that has items; idle = empty. */
  state: StepperNodeState;
  /** The step the selected item is on (when one is selected). */
  selected: boolean;
};

export function buildStepperNodes(steps: readonly string[], statuses: readonly string[], selectedStatus?: string | null): StepperNode[] {
  const shown = statuses.filter((status) => status !== "CANCELLED").map(stepperDisplayStatus);
  const counts = new Map<string, number>();
  for (const status of shown) counts.set(status, (counts.get(status) ?? 0) + 1);
  const lowest = shown.reduce((best, status) => {
    const index = steps.indexOf(status);
    return index === -1 ? best : best === -1 || index < best ? index : best;
  }, -1);
  const chosen = selectedStatus ? stepperDisplayStatus(selectedStatus) : null;
  return steps.map((step, index) => {
    const count = counts.get(step) ?? 0;
    const state: StepperNodeState = lowest === -1 ? "idle" : index < lowest ? "done" : index === lowest ? "current" : count > 0 ? "ahead" : "idle";
    return { step, count, state, selected: chosen === step };
  });
}

// Activity entries that belong to one item carry its id in their metadata; the rest are about the whole job. With an item selected
// its own entries and the job-wide ones show; "whole job" shows only the job-wide ones.
export function activityMatchesItemFilter(metadata: unknown, filter: string): boolean {
  if (filter === ITEM_FILTER_ALL) return true;
  const itemId = metadata && typeof metadata === "object" ? (metadata as { itemId?: unknown }).itemId : undefined;
  const own = typeof itemId === "string" && itemId ? itemId : null;
  if (filter === ITEM_FILTER_JOB) return !own;
  return !own || own === filter;
}
