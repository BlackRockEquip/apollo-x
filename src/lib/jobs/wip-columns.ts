// ---------------------------------------------------------------------------
// Jobs & WIP list — user-customizable columns: the plain column catalog and
// selection-normalizing logic, with NO server-only imports (no prisma, no
// auth guards) — deliberately kept importable from a client component (the
// picker UI in src/components/JobsWipColumnPicker.tsx) as well as the
// server page (src/app/(tenant)/jobs/page.tsx). The actual persistence
// (read/save/reset against the database, auth-gated) lives in the sibling
// wip-columns-service.ts, which imports from here rather than the other way
// around — that split is what keeps this file safe to import into a client
// bundle at all; merging the two back into one file would pull prisma into
// the browser build the moment the picker imports JOBS_WIP_COLUMNS.
//
// At the user's direct request ("make the jobs/wip table headings
// customizable, a user can select there own headings they want to see"):
// every user picks their own subset of this table's columns, saved to their
// account (see wip-columns-service.ts) so the choice follows them to any
// device/browser rather than resetting per-browser.
// ---------------------------------------------------------------------------

export const JOBS_WIP_TABLE_KEY = "jobs-wip";

export type JobsWipColumnId =
  | "jobNumber"
  | "customerName"
  | "customerTradingName"
  | "customerReference"
  | "customerPo"
  | "type"
  | "status"
  | "dateReceived"
  | "machineMake"
  | "machineModel"
  | "machineSerial"
  | "component"
  | "componentType"
  | "componentSerial"
  | "componentPartNumber"
  | "description"
  | "etaDate"
  | "mechanicEtaDate"
  | "relationshipNotes"
  | "quoteNumber"
  | "quoteDate"
  | "salesOrderNumber"
  | "salesOrderDate"
  | "invoiceNumber"
  | "invoiceDate"
  | "purchaseOrderNumber"
  | "purchaseOrderDate"
  | "purchaseOrderStatus"
  | "deliveryDate"
  | "deliveryType"
  | "receivingTransport"
  | "kmsTravelled"
  | "paymentDateReceived"
  | "machineHours"
  | "plantNumber"
  | "reportNumber"
  | "importTrackingNumber"
  | "previousJobNumber"
  | "salesRepresentative"
  | "createdAt"
  | "updatedAt";

export type JobsWipColumnDef = {
  id: JobsWipColumnId;
  label: string;
  // Always shown, never offered as a checkbox in the picker — this is the
  // row's own identity and the column that carries the whole-row click
  // target (see the stretched-link on it in page.tsx), so hiding it would
  // leave a row with nothing to click or tell rows apart by.
  locked?: boolean;
  // Pre-checked the first time a user opens the picker (and restored by
  // "Reset to default") — chosen to land as close to this table's
  // original fixed 7-column set as an atomic-per-field picker allows.
  defaultVisible?: boolean;
};

// Every scalar Job field worth showing as its own column — deliberately the
// same scope as JOB_IMPORT_FIELDS (src/lib/import-export/fields.ts): every
// field the New Job form itself can set, minus the internal cuid references
// (stripMechanicId/buildMechanicId/relatedJobId) that aren't practical to
// show in a list. Labels are written independently (not imported from
// fields.ts) since the two lists serve different UIs and shouldn't have to
// change in lockstep, but are worded to match wherever the same field is
// named elsewhere in the app.
export const JOBS_WIP_COLUMNS: JobsWipColumnDef[] = [
  { id: "jobNumber", label: "Job #", locked: true, defaultVisible: true },
  { id: "customerName", label: "Customer", defaultVisible: true },
  { id: "customerTradingName", label: "Customer trading name" },
  { id: "customerReference", label: "Customer reference" },
  { id: "customerPo", label: "Customer PO" },
  { id: "type", label: "Job type", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "dateReceived", label: "Date received" },
  { id: "machineMake", label: "Machine make" },
  { id: "machineModel", label: "Machine model", defaultVisible: true },
  { id: "machineSerial", label: "Machine serial" },
  { id: "component", label: "Component", defaultVisible: true },
  { id: "componentType", label: "Component type" },
  { id: "componentSerial", label: "Component serial" },
  { id: "componentPartNumber", label: "Component part number" },
  { id: "description", label: "Description" },
  { id: "etaDate", label: "Client ETA" },
  { id: "mechanicEtaDate", label: "Mechanic ETA" },
  { id: "relationshipNotes", label: "Notes" },
  { id: "quoteNumber", label: "Quote number" },
  { id: "quoteDate", label: "Quote date" },
  { id: "salesOrderNumber", label: "Sales order number" },
  { id: "salesOrderDate", label: "Sales order date" },
  { id: "invoiceNumber", label: "Invoice number" },
  { id: "invoiceDate", label: "Invoice date" },
  { id: "purchaseOrderNumber", label: "Purchase order number" },
  { id: "purchaseOrderDate", label: "Purchase order date" },
  { id: "purchaseOrderStatus", label: "Purchase order status" },
  { id: "deliveryDate", label: "Delivery date" },
  { id: "deliveryType", label: "Delivery transport" },
  { id: "receivingTransport", label: "Receiving transport" },
  { id: "kmsTravelled", label: "Kms travelled" },
  { id: "paymentDateReceived", label: "Payment date received" },
  { id: "machineHours", label: "Machine hours" },
  { id: "plantNumber", label: "Plant number" },
  { id: "reportNumber", label: "Report number" },
  { id: "importTrackingNumber", label: "Import tracking number" },
  { id: "previousJobNumber", label: "Previous job number" },
  { id: "salesRepresentative", label: "Sales representative" },
  { id: "createdAt", label: "Created" },
  { id: "updatedAt", label: "Updated", defaultVisible: true },
];

const VALID_COLUMN_IDS = new Set<string>(JOBS_WIP_COLUMNS.map((c) => c.id));
const LOCKED_COLUMN_IDS: JobsWipColumnId[] = JOBS_WIP_COLUMNS.filter((c) => c.locked).map((c) => c.id);
export const JOBS_WIP_DEFAULT_COLUMNS: JobsWipColumnId[] = JOBS_WIP_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

// Filters a saved/submitted list down to real, currently-known column ids
// (an older saved selection can't retain a column this build has since
// removed), always includes every locked column whether or not it was
// submitted, and always returns them in the table's own fixed left-to-right
// order rather than whatever order they were submitted in — column ORDER
// isn't user-customizable in this version, only which ones are checked.
export function normalizeJobsWipColumns(raw: unknown): JobsWipColumnId[] {
  const requested = Array.isArray(raw)
    ? raw.filter((value): value is JobsWipColumnId => typeof value === "string" && VALID_COLUMN_IDS.has(value))
    : [];
  const selected = new Set<JobsWipColumnId>([...LOCKED_COLUMN_IDS, ...requested]);
  return JOBS_WIP_COLUMNS.filter((c) => selected.has(c.id)).map((c) => c.id);
}
