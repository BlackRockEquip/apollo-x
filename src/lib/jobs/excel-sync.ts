// Workshop WIP Excel auto-sync — watches a local (e.g. OneDrive-synced)
// copy of the WIP workbook and automatically creates/updates Jobs to match
// it, no manual "Settings > Import/Export" upload needed. Ported from the
// equivalent feature already proven in the sibling ModApp codebase
// (src/lib/jobSync.ts + src/instrumentation.ts there), adapted to run
// against Apollo X's own multi-tenant schema and to reuse Apollo X's real
// job/customer service functions (createDraftJob/registerJob/updateJob/
// createMaster) instead of writing to Prisma directly — so a sync-created
// or sync-updated job gets exactly the same activity log, audit trail, and
// validation a job entered by hand (or through the manual Settings >
// Import/Export importer) would.
//
// Requested 2026-09-14 ("auto sync with the WIP excel file and update
// changes made on Excel to system"). Scoping decisions made with the user
// up front, via three rounds of clarifying questions:
//  - Runs *locally* for now (chosen over polling OneDrive/SharePoint via
//    Microsoft Graph, or a separate local-watcher-pushes-to-API script) —
//    same mechanism as ModApp: a file watcher inside the app itself,
//    started on server boot (see src/instrumentation.ts). Apollo X's
//    eventual move to Render (see
//    claude/decision-storage-architecture-render-plus-object-storage.md,
//    a stateless host with no access to a file on this machine) will need
//    this piece revisited — flagged, not solved, here.
//  - One-way: Excel -> Apollo X only, same as ModApp. Nothing here ever
//    writes back to the spreadsheet.
//  - Column mapping and behavior otherwise follows ModApp's own
//    already-tuned rules as closely as possible: free text is APPENDED on
//    update rather than overwritten (so typing directly into a job in
//    Apollo X survives the next sync instead of being silently replaced),
//    while dates/customer/the "never guess" enums are straight overwrites
//    from the sheet every run — EXCEPT: unlike ModApp (which deliberately
//    never touches Job Status), this sync DOES map the sheet's Status
//    column onto Apollo X's JobStatus, matched "as close as possible" per
//    the user's explicit follow-up request — see mapStatusBestEffort below.
//
// Reuses, rather than re-implements, several pieces already built and
// tuned for Apollo X's *manual* Settings > Import/Export Jobs importer
// (src/lib/import-export/service.ts, exported for this purpose 2026-09-14):
// excelSerialToDate, normalizeEnumValue, NameCandidate, findBestNameMatch.
// Field scope (which Job columns are synced at all) mirrors
// JOB_IMPORT_FIELDS (src/lib/import-export/fields.ts) closely, including
// that importer's own deliberate omissions — stripMechanicId/
// buildMechanicId aren't set from the sheet's Technician/Mechanic Strip/
// Mechanic Assemble columns here either, for the same reason given there:
// resolving free-text names to real UserIdentity records isn't something
// either importer attempts (see that file's header comment).
//
// NOT SMOKE-TESTED — written and reasoned from the schema/service code,
// same caveat as everything else in this engagement written without local
// Node/DB toolchain access. Needs `npm run typecheck` (after `npm install`
// picks up the new chokidar dependency) and a real run against the user's
// actual WIP workbook before this is trusted the way the manual importer
// now is. See claude/workshop-track-progress-*-excel-auto-sync.md for the
// full write-up and what to check first.

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { ModuleKey, TenantRole, JobType, PurchaseOrderStatus, DeliveryType, type Job } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/passwords";
import { DEFAULT_TENANT_PERMISSIONS, mergePermissionOverrides, type TenantPermission } from "@/lib/auth/permissions";
import { evaluateModuleAccess, type ModuleAccessMode } from "@/lib/entitlements/policy";
import type { RequestContext } from "@/lib/auth/context-types";
import { createDraftJob, registerJob, updateJob } from "@/lib/jobs/service";
import { flowFamilyForJobType } from "@/lib/jobs/ui";
import { ALL_JOB_STATUSES } from "@/lib/jobs/validation";
import { createMaster } from "@/lib/master-data/service";
import { excelSerialToDate, normalizeEnumValue, findBestNameMatch, type NameCandidate } from "@/lib/import-export/service";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const JOBS_SYNC_FILE_PATH = process.env.JOBS_SYNC_FILE_PATH || "";
export const JOBS_SYNC_COMPANY_NAME = process.env.JOBS_SYNC_COMPANY_NAME || "";

export function jobSyncIsConfigured(): boolean {
  return Boolean(JOBS_SYNC_FILE_PATH && JOBS_SYNC_COMPANY_NAME);
}

// ---------------------------------------------------------------------------
// Spreadsheet reading — same "every sheet named Jobs*" convention as
// ModApp's jobSync.ts, which is what actually matches the real WIP
// workbook's "Jobs1 - 999" / "Jobs 1000-up" sheets (and skips "Colour
// Codes"/"Charts"). Keyed by header TEXT (SheetJS's sheet_to_json), not
// column letter, since the two Jobs sheets don't line up column-for-column
// (confirmed in this engagement's own multi-sheet import work).
// ---------------------------------------------------------------------------

type SheetRow = Record<string, unknown>;

// 2026-09-14 (Render prep) — split out of the old readWorkbookJobRows so a
// buffer that arrived over HTTP (the bridge script's upload, see
// scripts/excel-sync-bridge.ts and the /api/v1/integrations/excel-sync
// route) can be parsed exactly the same way as a buffer read from local
// disk. Neither this function nor its caller cares where the bytes came
// from.
function parseWorkbookJobRows(buffer: Buffer): SheetRow[] {
  const workbook = XLSX.read(buffer, { cellDates: true });
  const rows: SheetRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (!/^jobs/i.test(sheetName)) continue;
    rows.push(...XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { defval: "" }));
  }
  return rows;
}

// Local-file path — only taken by the in-process watcher (see
// src/instrumentation.ts), i.e. local dev, or anywhere Apollo X happens to
// run with real access to the file's own filesystem. Once deployed to
// Render (no access to a file on the user's PC), JOBS_SYNC_FILE_PATH is
// simply left unset there and this function is never called — see
// runJobExcelSync's fileBuffer path instead, fed by
// scripts/excel-sync-bridge.ts running on the user's own machine.
function readWorkbookJobRows(filePath: string): SheetRow[] {
  // Read the buffer ourselves rather than XLSX.readFile(path) directly, so
  // a real fs error (ENOENT, EBUSY while OneDrive/Excel is mid-save, EPERM)
  // surfaces as-is instead of SheetJS's generic "Cannot access file X".
  return parseWorkbookJobRows(fs.readFileSync(filePath));
}

// Resolves a value by trying each header alias in turn against the row's
// own (case/whitespace-tolerant) header set — same {key -> aliases} shape
// as JOB_IMPORT_FIELDS, just resolved directly against the sheet instead of
// through a user-confirmed mapping (there's no one here to run the
// column-linking UI step for an unattended background sync).
function buildHeaderIndex(row: SheetRow): Map<string, string> {
  const index = new Map<string, string>();
  for (const key of Object.keys(row)) index.set(key.trim().toLowerCase(), key);
  return index;
}

function cellStr(row: SheetRow, headerIndex: Map<string, string>, aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const realHeader = headerIndex.get(alias.trim().toLowerCase());
    if (!realHeader) continue;
    const value = row[realHeader];
    if (value === null || value === undefined) continue;
    const str = value instanceof Date ? value.toISOString() : String(value).trim();
    if (str) return str;
  }
  return null;
}

// NOTE on blank cells and dates: a blank/unmapped date column comes back
// null here, and null is passed straight through to createDraftJob/
// updateJob (not coerced to undefined) — same convention Apollo X's own
// manual importer already uses (mappedDate in import-export/service.ts,
// called unconditionally in importJobs's payload). That means a blank date
// cell CLEARS an already-set date on update, not "leaves it alone" — this
// matches the proven manual importer's existing behavior exactly, but is
// worth knowing given this sync can re-run on every save rather than once:
// if the live WIP file has a blank date column for jobs that already carry
// a real date in Apollo X, that date will be wiped on the next sync. Flag
// this to the user if it turns out to matter in practice.
function cellDate(row: SheetRow, headerIndex: Map<string, string>, aliases: readonly string[]): Date | null {
  for (const alias of aliases) {
    const realHeader = headerIndex.get(alias.trim().toLowerCase());
    if (!realHeader) continue;
    const raw = row[realHeader];
    if (raw === null || raw === undefined || raw === "") continue;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === "number") return excelSerialToDate(raw);
    const text = String(raw).trim();
    if (!text) continue;
    if (/^\d+(\.\d+)?$/.test(text) && Number(text) >= 10000) return excelSerialToDate(Number(text));
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      if (year >= 1900 && year <= 2200) return date;
    }
  }
  return null;
}

function cellNumber(row: SheetRow, headerIndex: Map<string, string>, aliases: readonly string[]): number | null {
  const raw = cellStr(row, headerIndex, aliases);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Column aliases — mirrors JOB_IMPORT_FIELDS (import-export/fields.ts)
// closely for every field that importer already maps, so this sync's
// column-matching behaves as close to the proven manual importer as
// possible, plus a couple of extra real-file aliases confirmed against
// ModApp's own already-tuned mapping of the same physical WIP workbook
// (componentPartNumber <- "RFQ #"; type <- "Repair Type") that Apollo X's
// own aliases list doesn't happen to carry yet.
// ---------------------------------------------------------------------------

const COL = {
  jobNumber: ["Job #", "JOB #", "Job No", "Job Number"],
  customerName: ["Client", "Client Name", "Company"],
  type: ["Type", "Repair Type"],
  status: ["Status", "Job Status"],
  customerReference: ["Customer Reference", "Reference"],
  customerPo: ["Customer PO", "Customer Purchase Order"],
  dateReceived: ["Date Received", "Date In", "Received Date"],
  machineMake: ["Machine Make", "Make"],
  machineModel: ["Machine Model", "Model"],
  machineSerial: ["Machine Serial", "Serial Number"],
  component: ["Component"],
  componentType: ["Component Type", "Unit Type"],
  componentSerial: ["Component Serial", "Component Serial Number"],
  componentPartNumber: ["Component Part Number", "Part Number", "Part #", "RFQ #"],
  description: ["Description", "Scope of Work"],
  etaDate: ["Client ETA", "ETA"],
  mechanicEtaDate: ["Mechanic ETA"],
  relationshipNotes: ["Notes", "Comments"],
  quoteNumber: ["Quote Number", "Quote #"],
  quoteDate: ["Quote Date"],
  salesOrderNumber: ["Sales Order Number", "SO Number", "Proforma"],
  salesOrderDate: ["Sales Order Date"],
  invoiceNumber: ["Invoice Number", "Invoice #"],
  invoiceDate: ["Invoice Date"],
  purchaseOrderNumber: ["Purchase Order Number", "PO Number", "PO #"],
  purchaseOrderDate: ["Purchase Order Date", "PO Date"],
  purchaseOrderStatus: ["Purchase Order Status", "PO Status"],
  deliveryDate: ["Delivery Date", "POD"],
  deliveryType: ["Delivery Transport", "Transport Out"],
  receivingTransport: ["Receiving Transport", "Transport In"],
  kmsTravelled: ["Kms Travelled", "Kilometers"],
  paymentDateReceived: ["Payment Date Received", "Payment Received", "RCT Date"],
  machineHours: ["Machine Hours", "Hours"],
  plantNumber: ["Plant Number", "Plant No", "Asset Number"],
  reportNumber: ["Report Number", "Report #"],
  importTrackingNumber: ["Import Tracking Number", "Tracking Number", "Tracking #"],
  previousJobNumber: ["Previous Job Number", "Linked Job", "Linked Job / Project", "Linked Project", "Previous Job No"],
  salesRepresentative: ["Sales Representative", "Sales Rep"],
} as const;

// ---------------------------------------------------------------------------
// Status matching — "as close as possible" per the user's explicit request
// (2026-09-14), unlike ModApp's jobSync.ts which deliberately never touches
// Job Status at all. Tries an exact match against Apollo X's real JobStatus
// spelling first (the same normalizeEnumValue the manual importer uses),
// then falls back to best-effort keyword matching adapted from mapStatus in
// scripts/import-black-rock-history.ts (that script's own historical-import
// text-matching logic), extended here to cover Apollo X's full modern
// 24-value JobStatus set rather than that script's older ~10-bucket
// collapse. Ordered most-specific phrase first, so e.g. "Delivered,
// awaiting payment" hits DELIVERED_AWAITING_PAYMENT before the bare
// "delivered" rule further down would send it to COMPLETE. Still returns
// null (never forces a guess) for genuinely unrecognized text — see
// unmappedStatus tracking in runJobExcelSync for how that surfaces in a
// run's summary. Tune these rules further once real free-text Status
// values from the live file are seen in practice — this is a best effort,
// not a claim of exhaustive coverage.
// ---------------------------------------------------------------------------

type Status = (typeof ALL_JOB_STATUSES)[number];

const STATUS_KEYWORD_RULES: [RegExp, Status][] = [
  [/\bdraft\b/, "DRAFT"],
  [/to be collected|collect(ed)? from client|on[\s-]?site\b/, "TO_BE_COLLECTED"],
  [/to come in|to be received|to receive|not received/, "TO_BE_RECEIVED"],
  [/to strip\b/, "TO_STRIP"],
  [/\bstrip(ping)?\b/, "STRIPPING"],
  [/quote in progress|to quote|quoting/, "QUOTE_IN_PROGRESS"],
  [/awai?t(ing)? go[\s-]?ahead|awai?t(ing)? approval|\bquoted\b/, "AWAITING_GO_AHEAD"],
  [/awai?t(ing)? outwork|\boutwork\b|sent out/, "AWAIT_OUTWORK"],
  [/awai?t(ing)? parts|waiting (for )?parts/, "WAITING_FOR_PARTS"],
  [/assembl|\bbuild\b/, "ASSEMBLY"],
  [/\btest(ing)?\b/, "TESTING"],
  [/\bpaint\b|\bwrap\b/, "TO_PAINT_WRAP"],
  [/delivered.*(await|owing).*payment|(await|owing).*payment.*delivered/, "DELIVERED_AWAITING_PAYMENT"],
  [/to be delivered|ready for delivery|\bdispatch/, "TO_BE_DELIVERED"],
  [/returned unrepaired|unrepaired return|declined.*return/, "RETURNED_UNREPAIRED"],
  [/\bcancel/, "CANCELLED"],
  [/\bclosed\b/, "CLOSED"],
  [/complete|\bdone\b|invoiced|delivered|paid in full/, "COMPLETE"],
  [/to attend/, "TO_ATTEND"],
  [/on route|en route|on the way/, "ON_ROUTE"],
  [/awai?t(ing)? payment/, "AWAIT_PAYMENT"],
  [/\binspect/, "INSPECTING"],
  [/\breceived\b/, "RECEIVED"],
  [/in progress/, "IN_PROGRESS"],
];

function mapStatusBestEffort(raw: string | null): Status | null {
  if (!raw) return null;
  const exact = normalizeEnumValue(raw, ALL_JOB_STATUSES);
  if (exact) return exact;
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  for (const [pattern, status] of STATUS_KEYWORD_RULES) if (pattern.test(text)) return status;
  return null;
}

// ---------------------------------------------------------------------------
// Row -> Job field mapping
// ---------------------------------------------------------------------------

// Every free-text field this sync manages on UPDATE gets APPENDED to
// (mergeAppend below), never overwritten — same rule and reasoning as
// ModApp's own jobSync.ts (APPEND_TEXT_FIELDS): typing something directly
// into a job in Apollo X must survive the next sync instead of being
// silently replaced. previousJobNumber is deliberately excluded (it's an
// exact-match linking key elsewhere — PEX redeployment matching, see
// syncPexRedeployment in pex/service.ts — appending a second job number
// onto it would break that, not just look untidy, same reasoning ModApp's
// own file gives for excluding it there). customerId, dates, status, type,
// and the "never guess" enums (purchaseOrderStatus/deliveryType/
// receivingTransport) are all straight overwrites from the sheet on every
// run, same as ModApp.
const APPEND_TEXT_FIELDS = [
  "customerReference",
  "customerPo",
  "machineMake",
  "machineModel",
  "machineSerial",
  "component",
  "componentType",
  "componentSerial",
  "componentPartNumber",
  "description",
  "relationshipNotes",
  "quoteNumber",
  "salesOrderNumber",
  "invoiceNumber",
  "purchaseOrderNumber",
  "reportNumber",
  "importTrackingNumber",
  "plantNumber",
  "salesRepresentative",
] as const;

const APPEND_SEPARATOR = " | ";

// Appends `incoming` onto `existingValue` instead of replacing it — a blank
// sheet cell (incoming falsy) never touches the existing value, nothing in
// Apollo X yet just takes the sheet's value directly, and re-syncing the
// same unchanged cell twice is a no-op (checked by exact segment match, not
// substring) rather than piling up duplicate entries.
function mergeAppend(existingValue: unknown, incoming: string | null | undefined): string | null | undefined {
  if (!incoming) return existingValue as string | null | undefined;
  const existing = typeof existingValue === "string" ? existingValue : null;
  if (!existing) return incoming;
  const segments = existing.split(APPEND_SEPARATOR).map((s) => s.trim());
  if (segments.includes(incoming)) return existing;
  return `${existing}${APPEND_SEPARATOR}${incoming}`;
}

type RowPayload = Record<string, unknown>;

function mapRowToPayload(row: SheetRow, headerIndex: Map<string, string>, customerId: string): RowPayload {
  return {
    customerId,
    customerReference: cellStr(row, headerIndex, COL.customerReference) ?? undefined,
    customerPo: cellStr(row, headerIndex, COL.customerPo) ?? undefined,
    dateReceived: cellDate(row, headerIndex, COL.dateReceived),
    machineMake: cellStr(row, headerIndex, COL.machineMake) ?? undefined,
    machineModel: cellStr(row, headerIndex, COL.machineModel) ?? undefined,
    machineSerial: cellStr(row, headerIndex, COL.machineSerial) ?? undefined,
    component: cellStr(row, headerIndex, COL.component) ?? undefined,
    componentType: cellStr(row, headerIndex, COL.componentType) ?? undefined,
    componentSerial: cellStr(row, headerIndex, COL.componentSerial) ?? undefined,
    componentPartNumber: cellStr(row, headerIndex, COL.componentPartNumber) ?? undefined,
    description: cellStr(row, headerIndex, COL.description) ?? undefined,
    etaDate: cellDate(row, headerIndex, COL.etaDate),
    mechanicEtaDate: cellDate(row, headerIndex, COL.mechanicEtaDate),
    relationshipNotes: cellStr(row, headerIndex, COL.relationshipNotes) ?? undefined,
    quoteNumber: cellStr(row, headerIndex, COL.quoteNumber) ?? undefined,
    quoteDate: cellDate(row, headerIndex, COL.quoteDate),
    salesOrderNumber: cellStr(row, headerIndex, COL.salesOrderNumber) ?? undefined,
    salesOrderDate: cellDate(row, headerIndex, COL.salesOrderDate),
    invoiceNumber: cellStr(row, headerIndex, COL.invoiceNumber) ?? undefined,
    invoiceDate: cellDate(row, headerIndex, COL.invoiceDate),
    purchaseOrderNumber: cellStr(row, headerIndex, COL.purchaseOrderNumber) ?? undefined,
    purchaseOrderDate: cellDate(row, headerIndex, COL.purchaseOrderDate),
    purchaseOrderStatus: normalizeEnumValue(cellStr(row, headerIndex, COL.purchaseOrderStatus) ?? "", PURCHASE_ORDER_STATUS_VALUES) ?? undefined,
    deliveryDate: cellDate(row, headerIndex, COL.deliveryDate),
    deliveryType: normalizeEnumValue(cellStr(row, headerIndex, COL.deliveryType) ?? "", DELIVERY_TYPE_VALUES) ?? undefined,
    receivingTransport: normalizeEnumValue(cellStr(row, headerIndex, COL.receivingTransport) ?? "", DELIVERY_TYPE_VALUES) ?? undefined,
    kmsTravelled: (() => {
      const n = cellNumber(row, headerIndex, COL.kmsTravelled);
      return n !== null ? Math.trunc(n) : undefined;
    })(),
    paymentDateReceived: cellDate(row, headerIndex, COL.paymentDateReceived),
    machineHours: cellNumber(row, headerIndex, COL.machineHours) ?? undefined,
    plantNumber: cellStr(row, headerIndex, COL.plantNumber) ?? undefined,
    reportNumber: cellStr(row, headerIndex, COL.reportNumber) ?? undefined,
    importTrackingNumber: cellStr(row, headerIndex, COL.importTrackingNumber) ?? undefined,
    previousJobNumber: cellStr(row, headerIndex, COL.previousJobNumber) ?? undefined,
    salesRepresentative: cellStr(row, headerIndex, COL.salesRepresentative) ?? undefined,
  };
}

function applyAppendMerge(existing: Job, payload: RowPayload): RowPayload {
  const merged: RowPayload = { ...payload };
  const existingRecord = existing as unknown as Record<string, unknown>;
  for (const field of APPEND_TEXT_FIELDS) {
    merged[field] = mergeAppend(existingRecord[field], payload[field] as string | null | undefined);
  }
  return merged;
}

function datesEqual(a: unknown, b: unknown): boolean {
  const aDate = a instanceof Date ? a : null;
  const bDate = b instanceof Date ? b : null;
  if (!aDate && !bDate) return a === b;
  if (!aDate || !bDate) return false;
  return aDate.getTime() === bDate.getTime();
}

// True if any field `next` actually sets differs from what's already on
// `existing` — skips a genuinely no-op prisma update for a row that hasn't
// really changed, so re-saving the spreadsheet doesn't bump updatedAt (and
// "recently updated" views) on every job just because one of them actually
// changed. Same reasoning as ModApp's jobDataDiffers. machineHours gets its
// own comparison since it's a Prisma Decimal on the existing row but a
// plain JS number in `next` — comparing them directly would always report
// "different" and defeat the point of this check.
function jobDataDiffers(existing: Job, next: RowPayload): boolean {
  const existingRecord = existing as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const current = existingRecord[key];
    if (key === "machineHours") {
      const currentNum = current === null || current === undefined ? null : Number(current as unknown as string);
      if (currentNum !== value) return true;
      continue;
    }
    if (value instanceof Date || current instanceof Date) {
      if (!datesEqual(value, current)) return true;
    } else if (current !== value) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Per-field conflict protection (2026-09-14, user request: "if changes on
// the system have been made, spreadsheet must not overwrite them when
// syncing"). Applies only to the "straight overwrite" fields below — the
// APPEND_TEXT_FIELDS above already never overwrite anything (a manual edit
// there just gets the sheet's text appended onto it), so they need no
// protection of their own.
//
// Mechanism: Job.excelSyncSnapshot (new JSONB column, see its own comment in
// schema.prisma) records, per field, the value THIS sync engine itself last
// wrote. On every run, before applying the sheet's value for a field, this
// compares the job's current live value against that snapshot: if they
// still match, nothing but sync has touched this field since last time, so
// the sheet's value is applied as normal (and the snapshot is refreshed to
// match). If they've diverged, someone changed it by hand in Apollo X since
// the last sync — that field is left alone this run, the sheet's value for
// it is dropped, AND the snapshot entry is deliberately left at its old
// (stale) value rather than refreshed to the live one. That last part
// matters: refreshing it to the live value would only protect the field for
// one cycle (the very next differing sheet value would then look like a
// fresh, legitimate change again); leaving it stale means the divergence
// keeps being detected — and the field keeps being protected — on every
// future run until something in this sync engine changes.
// ---------------------------------------------------------------------------

const OVERWRITE_FIELDS = [
  "customerId",
  "dateReceived",
  "etaDate",
  "mechanicEtaDate",
  "quoteDate",
  "salesOrderDate",
  "invoiceDate",
  "purchaseOrderDate",
  "purchaseOrderStatus",
  "deliveryDate",
  "deliveryType",
  "receivingTransport",
  "kmsTravelled",
  "paymentDateReceived",
  "machineHours",
  "previousJobNumber",
  "type",
  "status",
] as const;

// Reduces a raw Job column value (as read off the Prisma row, or as staged
// in a row payload before being sent to createDraftJob/updateJob) to a
// plain JSON-storable, directly-comparable primitive — Dates become ISO
// strings and Prisma's Decimal (machineHours) becomes a plain number, same
// normalization jobDataDiffers above needs for the same reason.
function normalizeForSnapshot(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>) && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return Number((value as { toString(): string }).toString());
  }
  return value;
}

function snapshotValuesEqual(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

// Which of OVERWRITE_FIELDS have diverged from what sync itself last wrote
// — see this section's own header comment for the full reasoning. Returns
// an empty set for a job with no snapshot yet (nothing to compare against,
// so nothing is protected — this run establishes the baseline instead).
function computeProtectedFields(existing: Job): Set<(typeof OVERWRITE_FIELDS)[number]> {
  const protectedFields = new Set<(typeof OVERWRITE_FIELDS)[number]>();
  const snapshot = existing.excelSyncSnapshot as Record<string, unknown> | null;
  if (!snapshot) return protectedFields;
  const existingRecord = existing as unknown as Record<string, unknown>;
  for (const field of OVERWRITE_FIELDS) {
    if (!(field in snapshot)) continue;
    if (!snapshotValuesEqual(snapshot[field], normalizeForSnapshot(existingRecord[field]))) protectedFields.add(field);
  }
  return protectedFields;
}

// Builds the full replacement excelSyncSnapshot after this row's decisions
// are made — always emits every OVERWRITE_FIELDS key, in the same fixed
// order, whether this is a brand-new job's first-ever snapshot (oldSnapshot
// null, protectedFields empty) or an update. `finalPayload` is whatever was
// actually staged to be written this run (the create payload, or the
// post-append-merge/post-protection-filter update payload) — a field
// missing from it (undefined) means "left untouched", so the live existing
// value is what the new baseline should record instead.
function buildNextSnapshot(
  oldSnapshot: Record<string, unknown> | null,
  existingRecord: Record<string, unknown>,
  protectedFields: Set<(typeof OVERWRITE_FIELDS)[number]>,
  finalPayload: RowPayload,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of OVERWRITE_FIELDS) {
    if (protectedFields.has(field)) {
      // Deliberately NOT refreshed — see this section's header comment.
      if (oldSnapshot && field in oldSnapshot) next[field] = oldSnapshot[field];
      continue;
    }
    const staged = finalPayload[field];
    next[field] = normalizeForSnapshot(staged !== undefined ? staged : existingRecord[field]);
  }
  return next;
}

// Writes excelSyncSnapshot directly via raw SQL rather than through
// updateJob/a normal prisma.job.update — this is purely internal
// bookkeeping and must NOT bump Job.updatedAt (Prisma's @updatedAt fires on
// any update() call to the row regardless of which columns actually
// change), which would otherwise falsely mark a genuinely-unchanged job as
// "recently updated" on every single sync run, defeating jobDataDiffers'
// whole purpose above.
async function writeSyncSnapshot(jobId: string, snapshot: Record<string, unknown>): Promise<void> {
  await prisma.$executeRaw`UPDATE "Job" SET "excelSyncSnapshot" = ${JSON.stringify(snapshot)}::jsonb WHERE "id" = ${jobId}`;
}

// ---------------------------------------------------------------------------
// Synthetic RequestContext for the background sync — createDraftJob/
// registerJob/updateJob/createMaster are plain exported functions (no HTTP
// layer involved) but each internally zod-parses its input AND requires a
// populated RequestContext for its own auth checks (requireModule/
// requireTenantPermission), same as a real logged-in session would supply.
// There's no session/cookie here, so one is built directly: a dedicated
// "system" UserIdentity + CompanyMembership(role: COMPANY_ADMIN) is
// upserted (same established pattern as ensureImporterUser in
// scripts/import-black-rock-history.ts — every background script that
// needs its own actor for createdById/updatedById follows this pattern,
// there's no single shared system user in this codebase), then the same
// permission/module-access computation session.ts's resolveSessionToken
// performs for a real session is repeated here against that membership,
// so this sync gets exactly the access a COMPANY_ADMIN logging in normally
// would — nothing more, nothing hand-waved.
// ---------------------------------------------------------------------------

const SYNC_SYSTEM_EMAIL = "workshop-excel-sync@apollox.internal";

async function ensureSyncUser(companyId: string) {
  const user = await prisma.userIdentity.upsert({
    where: { email: SYNC_SYSTEM_EMAIL },
    update: { active: true },
    create: {
      email: SYNC_SYSTEM_EMAIL,
      displayName: "Workshop Excel Sync",
      // Never used to log in interactively — just needs to satisfy the
      // NOT NULL passwordHash column, same as ensureImporterUser's own
      // SYSTEM_PASSWORD constant serves no purpose beyond that either.
      passwordHash: await hashPassword(randomUUID()),
    },
  });
  await prisma.companyMembership.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    update: { status: "ACTIVE", role: TenantRole.COMPANY_ADMIN },
    create: { userId: user.id, companyId, status: "ACTIVE", role: TenantRole.COMPANY_ADMIN },
  });
  return user;
}

async function buildSyncContext(companyId: string): Promise<RequestContext> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: { entitlements: true, settings: true },
  });
  const user = await ensureSyncUser(companyId);
  const membership = await prisma.companyMembership.findUniqueOrThrow({
    where: { userId_companyId: { userId: user.id, companyId } },
    include: { permissions: true },
  });

  const tenantPermissions = mergePermissionOverrides<TenantPermission>(
    DEFAULT_TENANT_PERMISSIONS[membership.role],
    membership.permissions
  );

  const moduleAccess = new Map<ModuleKey, ModuleAccessMode>();
  const now = new Date();
  const entitlementMap = new Map(company.entitlements.filter((row) => row.product === "WORKSHOP").map((row) => [row.module, row]));
  for (const moduleKey of Object.values(ModuleKey)) {
    const row = entitlementMap.get(moduleKey);
    moduleAccess.set(
      moduleKey,
      evaluateModuleAccess(
        {
          companyInternalCode: company.internalCode,
          companyActive: company.status === "ACTIVE",
          module: moduleKey,
          status: row?.status,
          effectiveFrom: row?.effectiveFrom,
          expiresAt: row?.expiresAt,
          gracePeriodDays: row?.gracePeriodDays ?? company.defaultGracePeriodDays,
          readOnlyOverrideUntil: row?.readOnlyOverrideUntil,
        },
        now
      )
    );
  }

  return {
    userId: user.id,
    displayName: user.displayName,
    companyId: company.id,
    companyInternalCode: company.internalCode,
    companyName: company.tradingName ?? company.legalName,
    tenantRole: membership.role,
    tenantPermissions,
    platformPermissions: new Set(),
    supportAccessId: null,
    supportMode: null,
    themeColor: company.settings?.themeColor ?? null,
    accentColor: company.settings?.accentColor ?? null,
    secondaryColor: company.settings?.secondaryColor ?? null,
    hasCompanyLogo: Boolean(company.settings?.logoMimeType),
    moduleAccess,
    correlationId: randomUUID(),
  };
}

// ---------------------------------------------------------------------------
// Sync run
// ---------------------------------------------------------------------------

const JOB_TYPE_VALUES = Object.values(JobType);
const PURCHASE_ORDER_STATUS_VALUES = Object.values(PurchaseOrderStatus);
const DELIVERY_TYPE_VALUES = Object.values(DeliveryType);

export type JobExcelSyncSummary = {
  ok: boolean;
  error?: string;
  totalRows?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  skipped?: number;
  skippedBlankJobNumber?: number;
  skippedDuplicateJobNumber?: number;
  customersCreated?: number;
  unmappedType?: string[];
  unmappedStatus?: string[];
  unmappedPurchaseOrderStatus?: string[];
  unmappedTransport?: string[];
  // Per-field conflict protection (2026-09-14) — see this file's own
  // "Per-field conflict protection" section. protectedFields counts every
  // individual field, across every row, that was left alone this run
  // because it had diverged from what sync itself last wrote (i.e. someone
  // edited it in Apollo X); protectedJobs counts the distinct jobs that had
  // at least one such field this run.
  protectedFields?: number;
  protectedJobs?: number;
};

export type JobExcelSyncInput = {
  // Falls back to JOBS_SYNC_COMPANY_NAME when omitted. The in-process
  // watcher (instrumentation.ts) never passes this. The bridge-facing
  // route (/api/v1/integrations/excel-sync) always does — the deployed
  // server has no JOBS_SYNC_COMPANY_NAME of its own; that env var
  // describes the *bridge script's local machine*, not the server.
  companyName?: string;
  // When provided, parsed directly instead of reading JOBS_SYNC_FILE_PATH
  // from local disk — the path a buffer uploaded by
  // scripts/excel-sync-bridge.ts takes. See parseWorkbookJobRows /
  // readWorkbookJobRows above.
  fileBuffer?: Buffer;
};

export async function runJobExcelSync(input?: JobExcelSyncInput): Promise<JobExcelSyncSummary> {
  const companyName = input?.companyName || JOBS_SYNC_COMPANY_NAME;
  if (!companyName) {
    return { ok: false, error: "No company name provided and JOBS_SYNC_COMPANY_NAME not set — sync disabled." };
  }

  // Matches against either the legal name or the trading name, same as
  // ModApp's own jobSync.ts — whoever sets JOBS_SYNC_COMPANY_NAME has no
  // reason to know which one a given company was entered under.
  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { legalName: { equals: companyName, mode: "insensitive" } },
        { tradingName: { equals: companyName, mode: "insensitive" } },
      ],
    },
  });
  if (!company) {
    const all = await prisma.company.findMany({ select: { legalName: true, tradingName: true } });
    const listing = all.length
      ? all.map((c) => (c.tradingName ? `"${c.legalName}" (trading as "${c.tradingName}")` : `"${c.legalName}"`)).join(", ")
      : "(no companies exist yet)";
    return {
      ok: false,
      error: `No company with legal or trading name = "${companyName}" found. Companies that do exist: ${listing}`,
    };
  }

  let rawRows: SheetRow[];
  try {
    if (input?.fileBuffer) {
      rawRows = parseWorkbookJobRows(input.fileBuffer);
    } else {
      if (!JOBS_SYNC_FILE_PATH) return { ok: false, error: "No file provided and JOBS_SYNC_FILE_PATH not set — sync disabled." };
      rawRows = readWorkbookJobRows(JOBS_SYNC_FILE_PATH);
    }
  } catch (err) {
    return { ok: false, error: `Couldn't read the spreadsheet: ${err instanceof Error ? err.message : String(err)}` };
  }

  const ctx = await buildSyncContext(company.id);

  // First occurrence of a Job # wins; later duplicate rows for the same
  // number in this run are ignored — same rule as ModApp's jobSync.ts (the
  // real historical sheet has ~8 known duplicate job numbers).
  const byJobNumber = new Map<string, SheetRow>();
  let skippedBlankJobNumber = 0;
  let skippedDuplicateJobNumber = 0;
  for (const row of rawRows) {
    const headerIndex = buildHeaderIndex(row);
    const jobNumber = cellStr(row, headerIndex, COL.jobNumber);
    if (!jobNumber) {
      skippedBlankJobNumber++;
      continue;
    }
    if (byJobNumber.has(jobNumber)) {
      skippedDuplicateJobNumber++;
      continue;
    }
    byJobNumber.set(jobNumber, row);
  }

  // Load everything that already exists for this company up front — a
  // handful of queries total, rather than one round trip per spreadsheet
  // row (which, at 1,000+ rows every time the file changes, would make even
  // a one-cell edit take far longer than it needs to).
  const [existingJobs, existingCustomers] = await Promise.all([
    prisma.job.findMany({ where: { companyId: company.id } }),
    prisma.customer.findMany({ where: { companyId: company.id, active: true }, select: { id: true, name: true, tradingName: true } }),
  ]);
  const existingJobsByNumber = new Map(existingJobs.filter((j): j is Job & { jobNumber: string } => Boolean(j.jobNumber)).map((j) => [j.jobNumber, j]));
  const customerCandidates: NameCandidate[] = [...existingCustomers];

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let customersCreated = 0;
  let protectedFieldTotal = 0;
  let protectedJobTotal = 0;
  const unmappedType = new Set<string>();
  const unmappedStatus = new Set<string>();
  const unmappedPurchaseOrderStatus = new Set<string>();
  const unmappedTransport = new Set<string>();

  for (const [jobNumber, row] of byJobNumber) {
    const headerIndex = buildHeaderIndex(row);
    try {
      const customerName = cellStr(row, headerIndex, COL.customerName);
      if (!customerName) {
        skipped++;
        continue;
      }

      let match = findBestNameMatch(customerName, customerCandidates);
      if (!match) {
        const newCustomer = (await createMaster(ctx, "customers", { name: customerName })) as { id: string; name: string };
        match = { id: newCustomer.id, name: newCustomer.name, fuzzy: false };
        customerCandidates.push({ id: newCustomer.id, name: newCustomer.name, tradingName: null });
        customersCreated++;
      }

      const typeRaw = cellStr(row, headerIndex, COL.type);
      const type = typeRaw ? normalizeEnumValue(typeRaw, JOB_TYPE_VALUES) : null;
      if (typeRaw && !type) unmappedType.add(typeRaw);

      const statusRaw = cellStr(row, headerIndex, COL.status);
      const targetStatus = mapStatusBestEffort(statusRaw);
      if (statusRaw && !targetStatus) unmappedStatus.add(statusRaw);

      const poStatusRaw = cellStr(row, headerIndex, COL.purchaseOrderStatus);
      if (poStatusRaw && !normalizeEnumValue(poStatusRaw, PURCHASE_ORDER_STATUS_VALUES)) unmappedPurchaseOrderStatus.add(poStatusRaw);
      const transportInRaw = cellStr(row, headerIndex, COL.receivingTransport);
      if (transportInRaw && !normalizeEnumValue(transportInRaw, DELIVERY_TYPE_VALUES)) unmappedTransport.add(transportInRaw);
      const transportOutRaw = cellStr(row, headerIndex, COL.deliveryType);
      if (transportOutRaw && !normalizeEnumValue(transportOutRaw, DELIVERY_TYPE_VALUES)) unmappedTransport.add(transportOutRaw);

      const rawPayload = mapRowToPayload(row, headerIndex, match.id);
      const existing = existingJobsByNumber.get(jobNumber);

      if (!existing) {
        // A brand-new job needs a real job type to be created at all — same
        // "no reasonable fallback, skip the row" rule the manual importer
        // uses (importJobs in import-export/service.ts): unlike ModApp's
        // jobSync.ts (which defaults an unmapped Repair Type to REBUILD on
        // create), Apollo X's own JobType set has no obviously-safe default,
        // and the manual importer already established "skip, don't guess"
        // as this company's accepted behavior for this exact situation.
        if (!type) {
          skipped++;
          continue;
        }
        const job = await createDraftJob(ctx, { ...rawPayload, type }, { literalJobNumber: jobNumber });
        const initialStatus = flowFamilyForJobType(type) === "FIELD_SERVICE" ? "TO_ATTEND" : "TO_BE_RECEIVED";
        await registerJob(ctx, job.id, { initialStatus });
        const finalStatus = targetStatus && targetStatus !== initialStatus ? targetStatus : initialStatus;
        if (finalStatus !== initialStatus) await updateJob(ctx, job.id, { status: finalStatus });
        created++;
        // First-ever snapshot for this job — nothing protected yet, so
        // every OVERWRITE_FIELDS value just written becomes the baseline
        // future runs compare against. Re-fetched rather than trusting
        // createDraftJob/registerJob/updateJob's own return values chained
        // together, so any DB-level default a field this run left
        // undefined actually fell back to (e.g. purchaseOrderStatus's
        // @default(NOT_APPLICABLE)) is captured correctly instead of being
        // recorded as null — which would otherwise make that field look
        // "changed by a person" on the very next run even though nobody
        // touched it.
        const createdJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        const createdRecord = createdJob as unknown as Record<string, unknown>;
        await writeSyncSnapshot(job.id, buildNextSnapshot(null, createdRecord, new Set(), createdRecord));
      } else {
        // Unlike the manual importer (which skips an update row outright if
        // Job Type doesn't map), an unrecognized/blank Repair Type on an
        // ALREADY-EXISTING job just leaves `type` untouched here — same
        // "never guess, don't block everything else" rule already applied
        // to purchaseOrderStatus/deliveryType/receivingTransport, and a
        // better fit for a background sync that reruns on every save than
        // for a one-shot deliberate import.
        const merged = applyAppendMerge(existing, rawPayload);
        const updatePayload: RowPayload = {
          ...merged,
          ...(type ? { type } : {}),
          ...(targetStatus ? { status: targetStatus } : {}),
        };

        // Per-field conflict protection ("if changes on the system have
        // been made, spreadsheet must not overwrite them") — see this
        // file's own header comment on OVERWRITE_FIELDS/computeProtectedFields.
        // Drop any field that's diverged from sync's own last-written value
        // (i.e. someone edited it by hand in Apollo X) from this run's
        // payload entirely, BEFORE checking whether anything actually
        // changed or calling updateJob, so a protected field can never be
        // written by this sync and never counts toward "updated".
        const existingRecord = existing as unknown as Record<string, unknown>;
        const oldSnapshot = existing.excelSyncSnapshot as Record<string, unknown> | null;
        const protectedFields = computeProtectedFields(existing);
        for (const field of protectedFields) delete updatePayload[field];
        if (protectedFields.size > 0) {
          protectedFieldTotal += protectedFields.size;
          protectedJobTotal++;
        }

        const changed = jobDataDiffers(existing, updatePayload);
        if (changed) {
          await updateJob(ctx, existing.id, updatePayload);
          updated++;
        } else {
          unchanged++;
        }
        // Refresh the baseline for every non-protected field to whatever
        // is now actually on the job (whether this run changed it or it
        // already matched) — keeps future runs' comparisons accurate even
        // when this run itself made no changes. Protected fields are
        // deliberately left at their old (stale) snapshot value — see
        // buildNextSnapshot's own comment.
        await writeSyncSnapshot(existing.id, buildNextSnapshot(oldSnapshot, existingRecord, protectedFields, updatePayload));
      }
    } catch (err) {
      skipped++;
      console.error(`[excel-sync] row "${jobNumber}" failed:`, err);
    }
  }

  return {
    ok: true,
    totalRows: rawRows.length,
    created,
    updated,
    unchanged,
    skipped,
    skippedBlankJobNumber,
    skippedDuplicateJobNumber,
    customersCreated,
    unmappedType: [...unmappedType],
    unmappedStatus: [...unmappedStatus],
    unmappedPurchaseOrderStatus: [...unmappedPurchaseOrderStatus],
    unmappedTransport: [...unmappedTransport],
    protectedFields: protectedFieldTotal,
    protectedJobs: protectedJobTotal,
  };
}
