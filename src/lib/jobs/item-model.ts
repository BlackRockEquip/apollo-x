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
