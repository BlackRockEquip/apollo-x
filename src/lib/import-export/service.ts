import { Prisma, JobType, PurchaseOrderStatus, DeliveryType, type ModuleKey } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import type { TenantPermission } from "@/lib/auth/permissions";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { createMaster } from "@/lib/master-data/service";
import { receiveStock } from "@/lib/inventory/service";
import { receiptInput } from "@/lib/inventory/validation";
import { createDraftJob, registerJob, updateJob } from "@/lib/jobs/service";
import { flowFamilyForJobType } from "@/lib/jobs/ui";
import { ALL_JOB_STATUSES } from "@/lib/jobs/validation";
import { CUSTOMER_IMPORT_FIELDS, SUPPLIER_IMPORT_FIELDS, JOB_IMPORT_FIELDS, PART_IMPORT_FIELDS, type ImportFieldDef, type ImportExportKind } from "./fields";
import { ALLOWED_IMPORT_MIME_TYPES, MAX_IMPORT_FILE_BYTES, importFileInput, importRowsInput, importMapping } from "./validation";

// ---------------------------------------------------------------------------
// Settings > Import / Export — bulk spreadsheet import (with a manual
// column-linking step, since every company's own spreadsheet is laid out
// differently, per the user's explicit request) and spreadsheet export, for
// Customers, Suppliers, and Jobs.
//
// Ported from ModApp's own Settings > Import/Export
// ((dashboard)/settings/import-export-actions.ts) and adapted to Apollo X's
// architecture and data model rather than copied line for line:
//
//  - File upload: a JSON body carrying {fileName, mimeType, contentBase64},
//    decoded with Buffer.from(..., "base64") — the same convention Apollo
//    X's existing parts-list spreadsheet import already uses (see
//    addPartLinesBulk in jobs/service.ts), not ModApp's multipart FormData
//    Server Action.
//  - Customer/Supplier creation is NOT reimplemented here — every row calls
//    the real createMaster (master-data/service.ts), the same function the
//    "New customer"/"New supplier" forms use, so validation, normalized-name
//    indexing, and audit logging all stay in one place. Likewise, Job
//    creation calls the real createDraftJob + registerJob
//    (jobs/service.ts) — a row gets exactly the same PEX-record creation,
//    activity log, and audit trail a job created by hand would.
//  - Apollo X's Customer/Supplier addresses are separate child records
//    (CustomerAddress/SupplierAddress), not scalar columns on the parent the
//    way ModApp's Client/Supplier models have them — so this import offers
//    one optional inline BILLING address per row, mirroring the single
//    inline address step already on the "New customer"/"New supplier"
//    forms (see inlineAddressInput in master-data/validation.ts), rather
//    than ModApp's flat billingStreet1/billingCity/... columns.
//  - Jobs import uses two distinct number fields, per the user's explicit
//    correction — these are NOT the same thing and don't mean the same
//    thing in ModApp's own sheets either:
//     - "Job number" (JOB_IMPORT_FIELDS key "jobNumber", required) is the
//       row's own real job number (e.g. "BRE001") — used as that job's
//       actual Job.jobNumber, verbatim, INSTEAD of Apollo X's normal
//       auto-allocation from the company's own Numbering sequence (see
//       createDraftJob's literalJobNumber option). This is what lets a
//       historical-data import preserve real legacy numbers rather than
//       everything getting a fresh BRE0000xx from today's counter. A row
//       with no "Job number" mapped/filled in is skipped outright — unlike
//       every other field here, this one has no reasonable fallback.
//     - "Previous job number" (key "previousJobNumber", optional) maps onto
//       Job.previousJobNumber, the plain-text "this job relates to a
//       different job" reference — the same purpose as ModApp's own
//       "Linked Job / Project" column (also what Apollo X's PEX
//       redeployment tracking reads, see syncPexRedeployment in
//       pex/service.ts). Unrelated to the row's own identity.
//    Because "Job number" is now a real, stable external key, Jobs import
//    is no longer create-only: a row whose "Job number" matches an
//    already-existing job in this company UPDATES that job (via the real
//    updateJob) instead of creating a second one — matching ModApp's own
//    "re-importing the same job number updates that job" behavior, and
//    letting the same file be re-run safely (a partial/interrupted import,
//    or new rows appended to the same sheet later) without creating
//    duplicates.
//  - Apollo X's Job.customerId is required (not nullable) — unlike ModApp,
//    which can import a job "unassigned" when its client name doesn't
//    match. A Jobs import row here first tries the same
//    exact/trading-name/suffix-stripped/fuzzy matching ModApp's own
//    importJobs uses for its client-name column; if nothing on file is
//    close enough, rather than skipping the row, a brand-new customer is
//    created for it on the fly (via the same createMaster call the plain
//    "New customer" form uses — name only, everything else left for the
//    user to fill in afterward from the Customers screen), so importing a
//    jobs sheet never silently drops jobs just because the customer hasn't
//    been added yet. A second row later in the same file with the same
//    unmatched name reuses the customer just created rather than creating
//    a duplicate.
//  - A multi-sheet .xlsx/.xls (e.g. one sheet per year of a company's own
//    historical WIP register) can have several of its sheets selected at
//    once and combined into a single column-mapping step and a single
//    import run with one results summary, rather than only ever reading
//    the workbook's first sheet — see sheetNames on importFileInput
//    (validation.ts), resolveSheetSelection/rowsFromSheets below, and the
//    sheet-picker checkboxes in ImportExportWorkspace.tsx. Sheets that
//    aren't checked (a "Colour Codes" reference tab alongside the real job
//    data, say) are never read at all.
// ---------------------------------------------------------------------------

export class ImportExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportExportError";
  }
}

const KIND_POLICY: Record<ImportExportKind, { module: ModuleKey; view: TenantPermission; create: TenantPermission }> = {
  customers: { module: "CUSTOMERS", view: "CUSTOMERS_VIEW", create: "CUSTOMERS_CREATE" },
  suppliers: { module: "SUPPLIERS", view: "SUPPLIERS_VIEW", create: "SUPPLIERS_CREATE" },
  jobs: { module: "JOBS_WIP", view: "JOBS_VIEW", create: "JOBS_CREATE" },
  // Same module/permission pair the Parts Catalog master-data screen
  // itself uses (see the "parts" entry in master-data/service.ts's own
  // policy table) — a parts import is just a bulk version of the "New
  // Part" form, so it's gated the same way.
  parts: { module: "INVENTORY", view: "PARTS_VIEW", create: "PARTS_CREATE" },
};

function authorize(ctx: RequestContext, kind: ImportExportKind, intent: "READ" | "WRITE") {
  requireModule(ctx, KIND_POLICY[kind].module, intent);
  requireTenantPermission(ctx, intent === "READ" ? KIND_POLICY[kind].view : KIND_POLICY[kind].create);
  return ctx.companyId!;
}

// ---------------------------------------------------------------------------
// Spreadsheet reading — same approach as parts-import.ts's
// extractPartLinesFromSpreadsheet (dynamic import so the fairly heavy xlsx
// parser only loads when a file is actually uploaded), just producing full
// header-keyed rows instead of a fixed part/qty/description shape.
// ---------------------------------------------------------------------------

type UploadedFile = { mimeType: string; contentBase64: string; sheetNames?: string[] };

// Split out from readUploadedRows so previewImportFile can list every sheet
// the workbook actually has (for the sheet-picker UI) without duplicating
// the decode/parse step — a .csv always comes back as a single "Sheet1"
// from SheetJS, so this same path handles both without a format branch.
async function loadWorkbook(input: { mimeType: string; contentBase64: string }) {
  if (!ALLOWED_IMPORT_MIME_TYPES.includes(input.mimeType)) {
    throw new ImportExportError("Choose a valid .xlsx, .xls, or .csv file.");
  }
  const data = Buffer.from(input.contentBase64, "base64");
  if (data.length === 0) throw new ImportExportError("Choose a spreadsheet file first.");
  if (data.length > MAX_IMPORT_FILE_BYTES) throw new ImportExportError("That file is too large (8 MB max).");

  const XLSX = await import("xlsx");
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    // cellDates: true hands back a real JS Date for a date-formatted xlsx
    // cell instead of the raw Excel serial number — mappedDate below still
    // has to handle the serial-number case itself for a .csv, which has no
    // cell-level date formatting to signal "this is a date" at all.
    workbook = XLSX.read(data, { type: "buffer", cellDates: true });
  } catch {
    throw new ImportExportError("Couldn't read that file — make sure it's a valid .xlsx, .xls, or .csv.");
  }
  return { XLSX, workbook };
}

function rowsFromSheets(XLSX: Awaited<ReturnType<typeof loadWorkbook>>["XLSX"], workbook: Awaited<ReturnType<typeof loadWorkbook>>["workbook"], sheetNames: string[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    rows.push(...XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
  }
  return rows;
}

// Which sheets to actually read: the caller's requested list, filtered down
// to sheets the workbook really has (a stale/renamed selection shouldn't
// blow up the whole import) — falling back to just the first sheet when
// nothing was requested, or nothing requested survived that filter, same
// as this reader's original single-sheet-only behavior.
function resolveSheetSelection(workbook: { SheetNames: string[] }, requested: string[] | undefined): string[] {
  const valid = (requested ?? []).filter((name) => workbook.SheetNames.includes(name));
  return valid.length > 0 ? valid : workbook.SheetNames.slice(0, 1);
}

async function readUploadedRows(input: UploadedFile): Promise<Record<string, unknown>[]> {
  const { XLSX, workbook } = await loadWorkbook(input);
  const selected = resolveSheetSelection(workbook, input.sheetNames);
  return rowsFromSheets(XLSX, workbook, selected);
}

function toPlainPreviewValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toLocaleDateString("en-ZA");
  return String(value);
}

function sanitizeRowForPreview(row: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(row)) clean[key] = toPlainPreviewValue(value);
  return clean;
}

export type PreviewResult = {
  headers: string[];
  previewRows: Record<string, string | number | boolean | null>[];
  // Every sheet the uploaded workbook actually has (a .csv always comes
  // back as one entry) — drives the sheet-picker UI once there's more than
  // one, so a multi-sheet file like a year-spanning "Jobs1 - 999" /
  // "Jobs 1000-up" workbook doesn't silently import only the first sheet.
  sheetNames: string[];
  // Which of the above this particular response's headers/previewRows were
  // actually read from — the caller's own requested list when it sent one
  // (echoed back post-filter), or just the first sheet when it didn't, so
  // the client can seed its checkboxes from a real answer rather than
  // guessing what "no selection yet" defaulted to.
  selectedSheetNames: string[];
};

// Reads the header row + first 3 data rows of the selected sheet(s) for the
// column-mapping UI (see ImportExportWorkspace.tsx) — called once with no
// sheetNames right after a file is chosen (defaults to the first sheet),
// and again whenever the user changes which sheets are checked, so the
// mapping step and its preview rows reflect the combined selection.
// Gated on the same VIEW-tier permission as the module itself — reading a
// file's headers back isn't sensitive, but a user with no access to a
// module at all shouldn't be able to probe it via this endpoint either.
export async function previewImportFile(ctx: RequestContext, kind: ImportExportKind, raw: unknown): Promise<PreviewResult> {
  authorize(ctx, kind, "READ");
  const input = importFileInput.parse(raw);
  const { XLSX, workbook } = await loadWorkbook(input);
  const selectedSheetNames = resolveSheetSelection(workbook, input.sheetNames);
  const rows = rowsFromSheets(XLSX, workbook, selectedSheetNames);
  if (rows.length === 0) throw new ImportExportError("That file doesn't have any data rows under its header row.");
  // Union of every row's own keys, not just the first row's — sheets being
  // combined here aren't guaranteed to have byte-identical columns (one
  // year's sheet picking up an extra column partway through, say), so this
  // catches a column that only shows up once a later sheet's rows are
  // scanned rather than silently leaving it unmappable.
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return { headers, previewRows: rows.slice(0, 3).map(sanitizeRowForPreview), sheetNames: workbook.SheetNames, selectedSheetNames };
}

// ---------------------------------------------------------------------------
// Column-mapping lookups — same shape/behaviour as ModApp's own
// mappedValue/mappedDate/excelSerialToDate/mappedNumber
// (settings/import-export-actions.ts): a blank or unmapped cell always comes
// back null/empty rather than a coerced default, so an import never
// accidentally zeroes out a field the sheet simply had no opinion on.
// ---------------------------------------------------------------------------

type RowMapping = z.infer<typeof importMapping>;

function mappedValue(row: Record<string, unknown>, mapping: RowMapping, fieldKey: string): string {
  const column = mapping[fieldKey];
  if (!column) return "";
  const value = row[column];
  return value != null ? String(value).trim() : "";
}

function rawMappedValue(row: Record<string, unknown>, mapping: RowMapping, fieldKey: string): unknown {
  const column = mapping[fieldKey];
  if (!column) return null;
  const value = row[column];
  return value === "" ? null : value;
}

// Excel's date epoch is Dec 30, 1899 (serial 0) — the same "1900 was a leap
// year" compatibility quirk every spreadsheet program replicates, and the
// same conversion SheetJS's own cellDates option performs internally.
// 2026-09-14 — exported (was module-private) so the new WIP Excel
// auto-sync watcher (src/lib/jobs/excel-sync.ts) can reuse this exact
// date/enum/name-matching logic instead of re-implementing it — same
// reasoning that already had this manual importer share createDraftJob/
// registerJob/updateJob/createMaster with the rest of the app. See
// excelSerialToDate / normalizeEnumValue / NameCandidate / findBestNameMatch
// below, all now exported for that one caller.
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mappedDate(row: Record<string, unknown>, mapping: RowMapping, fieldKey: string): Date | null {
  const raw = rawMappedValue(row, mapping, fieldKey);
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") return excelSerialToDate(raw);

  const text = String(raw).trim();
  if (!text) return null;

  // A bare-digits string (no cell-level date formatting, e.g. a .csv) is
  // almost always an Excel serial rather than a literal year once it's 5+
  // digits (43831 = Jan 1 2020) — misreading it as a year is what used to
  // produce a garbage multi-thousand-year date.
  if (/^\d+(\.\d+)?$/.test(text)) {
    const asNumber = Number(text);
    if (asNumber >= 10000) return excelSerialToDate(asNumber);
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 2200) return null;
  return date;
}

function mappedNumber(row: Record<string, unknown>, mapping: RowMapping, fieldKey: string): number | null {
  const raw = mappedValue(row, mapping, fieldKey);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Matches free text like "standard repair" or "PARTIAL-REPAIR" against a
// Prisma enum's real values, so a spreadsheet doesn't have to spell things
// exactly the app's internal enum-case way. Returns null (never a guess) if
// nothing matches.
export function normalizeEnumValue<T extends string>(raw: string, allowed: readonly T[]): T | null {
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/g, "");
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : null;
}

// ---------------------------------------------------------------------------
// Best-effort name matching for Jobs import's customer-name column — same
// exact -> trading-name -> suffix-stripped -> fuzzy tiers, and the same
// "must be clearly the best candidate" guard, as ModApp's own
// findBestClientMatch, just generalized over {id, name, tradingName} so it
// works for Apollo X's Customer shape without a second copy.
// ---------------------------------------------------------------------------

export type NameCandidate = { id: string; name: string; tradingName: string | null };
const COMPANY_SUFFIX_RE = /\b(pty ltd|proprietary limited|ltd|limited|inc|incorporated|cc|corp|corporation|co|llc)\b/g;

function normalizeCompanyName(raw: string): string {
  return raw.toLowerCase().replace(/[.,()]/g, " ").replace(COMPANY_SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

function nameSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

const FUZZY_NAME_MATCH_THRESHOLD = 0.82;

export function findBestNameMatch(rawName: string, candidates: NameCandidate[]): { id: string; name: string; fuzzy: boolean } | null {
  const trimmed = rawName.trim();
  if (!trimmed || candidates.length === 0) return null;
  const lower = trimmed.toLowerCase();

  const exact = candidates.find((c) => c.name.toLowerCase() === lower);
  if (exact) return { id: exact.id, name: exact.name, fuzzy: false };
  const exactTrading = candidates.find((c) => (c.tradingName ?? "").toLowerCase() === lower);
  if (exactTrading) return { id: exactTrading.id, name: exactTrading.name, fuzzy: false };

  const normalizedTarget = normalizeCompanyName(trimmed);
  if (normalizedTarget) {
    const normalizedMatch = candidates.find(
      (c) => normalizeCompanyName(c.name) === normalizedTarget || (c.tradingName && normalizeCompanyName(c.tradingName) === normalizedTarget),
    );
    if (normalizedMatch) return { id: normalizedMatch.id, name: normalizedMatch.name, fuzzy: true };
  }

  let best: { candidate: NameCandidate; score: number } | null = null;
  let runnerUpScore = 0;
  for (const c of candidates) {
    const score = Math.max(
      nameSimilarity(normalizedTarget, normalizeCompanyName(c.name)),
      c.tradingName ? nameSimilarity(normalizedTarget, normalizeCompanyName(c.tradingName)) : 0,
    );
    if (!best || score > best.score) {
      runnerUpScore = best?.score ?? 0;
      best = { candidate: c, score };
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }
  if (best && best.score >= FUZZY_NAME_MATCH_THRESHOLD && best.score - runnerUpScore >= 0.05) {
    return { id: best.candidate.id, name: best.candidate.name, fuzzy: true };
  }
  return null;
}

// Friendly names for the handful of unique fields a row's underlying
// create could actually collide on, across all three import kinds — used
// below to build an accurate P2002 message instead of a guess. Falls back
// to the raw column name for anything not listed here.
const UNIQUE_FIELD_LABELS: Record<string, string> = {
  accountCodeNormalized: "account code",
  nameNormalized: "name",
  codeNormalized: "code",
  jobNumber: "job number",
  draftNumber: "draft number",
};

function describeRowError(err: unknown): string {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    return first ? `${first.path.join(".") || "value"}: ${first.message}` : "That row didn't pass validation.";
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    // err.meta.target names the actual column(s) that collided — a P2002
    // can come from several different unique constraints depending on
    // where in the row's create chain it fired (the customer/supplier
    // being created, or the job itself), so a single hardcoded guess here
    // was actively misleading whenever it wasn't actually about an
    // account code. companyId is part of every one of these constraints
    // as the tenant-scoping column — never the interesting part of the
    // message, so it's dropped.
    const rawTarget = err.meta?.target;
    const columns = (Array.isArray(rawTarget) ? rawTarget : typeof rawTarget === "string" ? [rawTarget] : [])
      .filter((c): c is string => typeof c === "string" && c !== "companyId");
    const fields = columns.map((c) => UNIQUE_FIELD_LABELS[c] ?? c).join(", ");
    return fields ? `A record with the same ${fields} already exists.` : "A duplicate record already exists (unique field conflict).";
  }
  if (err instanceof Error) return err.message;
  return "Could not import this row.";
}

export type ImportRowResult = { label: string; status: "created" | "updated" | "skipped"; detail: string };
// updated is always 0 for Customers/Suppliers (create-only, matching their
// own "already exists" duplicate check) — only Jobs import can update an
// existing row, since "Job number" gives it a real, stable external key
// (see the file header comment). Kept on the shared type/summary shape
// rather than a Jobs-only variant so the client component's results table
// doesn't need a separate code path per module.
export type ImportSummary = { total: number; created: number; updated: number; skipped: number; rows: ImportRowResult[] };

function inlineAddressFromRow(row: Record<string, unknown>, mapping: RowMapping) {
  const line1 = mappedValue(row, mapping, "addressLine1");
  if (!line1) return undefined;
  return {
    type: "BILLING" as const,
    line1,
    line2: mappedValue(row, mapping, "addressLine2") || undefined,
    city: mappedValue(row, mapping, "addressCity") || undefined,
    province: mappedValue(row, mapping, "addressProvince") || undefined,
    postalCode: mappedValue(row, mapping, "addressPostalCode") || undefined,
    countryCode: mappedValue(row, mapping, "addressCountryCode") || undefined,
  };
}

// ---------------------------------------------------------------------------
// Import — Customers
// ---------------------------------------------------------------------------

export async function importCustomers(ctx: RequestContext, raw: unknown): Promise<ImportSummary> {
  const companyId = authorize(ctx, "customers", "WRITE");
  const input = importRowsInput.parse(raw);
  const rows = await readUploadedRows(input);

  let created = 0;
  let skipped = 0;
  const rowResults: ImportRowResult[] = [];

  for (const row of rows) {
    const name = mappedValue(row, input.mapping, "name");
    if (!name) {
      skipped++;
      rowResults.push({ label: "(blank)", status: "skipped", detail: "Missing customer name — row skipped." });
      continue;
    }

    // Same case-insensitive, per-company duplicate check as ModApp's own
    // Suppliers/Clients import — a bulk import shouldn't be able to create a
    // second row for a customer that's already on file.
    const duplicate = await prisma.customer.findFirst({ where: { companyId, name: { equals: name, mode: "insensitive" } } });
    if (duplicate) {
      skipped++;
      rowResults.push({ label: name, status: "skipped", detail: "A customer with this name already exists." });
      continue;
    }

    const payload: Record<string, unknown> = {
      name,
      tradingName: mappedValue(row, input.mapping, "tradingName") || undefined,
      accountCode: mappedValue(row, input.mapping, "accountCode") || undefined,
      registrationNumber: mappedValue(row, input.mapping, "registrationNumber") || undefined,
      vatNumber: mappedValue(row, input.mapping, "vatNumber") || undefined,
      mainTelephone: mappedValue(row, input.mapping, "mainTelephone") || undefined,
      mainEmail: mappedValue(row, input.mapping, "mainEmail") || undefined,
      website: mappedValue(row, input.mapping, "website") || undefined,
      currencyCode: mappedValue(row, input.mapping, "currencyCode") || undefined,
      creditLimit: mappedNumber(row, input.mapping, "creditLimit") ?? undefined,
      notes: mappedValue(row, input.mapping, "notes") || undefined,
      address: inlineAddressFromRow(row, input.mapping),
    };

    try {
      await createMaster(ctx, "customers", payload);
      created++;
      rowResults.push({ label: name, status: "created", detail: "Imported." });
    } catch (err) {
      skipped++;
      rowResults.push({ label: name, status: "skipped", detail: describeRowError(err) });
    }
  }

  return { total: rows.length, created, updated: 0, skipped, rows: rowResults };
}

// ---------------------------------------------------------------------------
// Import — Suppliers
// ---------------------------------------------------------------------------

export async function importSuppliers(ctx: RequestContext, raw: unknown): Promise<ImportSummary> {
  const companyId = authorize(ctx, "suppliers", "WRITE");
  const input = importRowsInput.parse(raw);
  const rows = await readUploadedRows(input);

  let created = 0;
  let skipped = 0;
  const rowResults: ImportRowResult[] = [];

  for (const row of rows) {
    const name = mappedValue(row, input.mapping, "name");
    if (!name) {
      skipped++;
      rowResults.push({ label: "(blank)", status: "skipped", detail: "Missing supplier name — row skipped." });
      continue;
    }

    const duplicate = await prisma.supplier.findFirst({ where: { companyId, name: { equals: name, mode: "insensitive" } } });
    if (duplicate) {
      skipped++;
      rowResults.push({ label: name, status: "skipped", detail: "A supplier with this name already exists." });
      continue;
    }

    const payload: Record<string, unknown> = {
      name,
      accountCode: mappedValue(row, input.mapping, "accountCode") || undefined,
      registrationNumber: mappedValue(row, input.mapping, "registrationNumber") || undefined,
      vatNumber: mappedValue(row, input.mapping, "vatNumber") || undefined,
      mainTelephone: mappedValue(row, input.mapping, "mainTelephone") || undefined,
      mainEmail: mappedValue(row, input.mapping, "mainEmail") || undefined,
      website: mappedValue(row, input.mapping, "website") || undefined,
      currencyCode: mappedValue(row, input.mapping, "currencyCode") || undefined,
      notes: mappedValue(row, input.mapping, "notes") || undefined,
      address: inlineAddressFromRow(row, input.mapping),
    };

    try {
      await createMaster(ctx, "suppliers", payload);
      created++;
      rowResults.push({ label: name, status: "created", detail: "Imported." });
    } catch (err) {
      skipped++;
      rowResults.push({ label: name, status: "skipped", detail: describeRowError(err) });
    }
  }

  return { total: rows.length, created, updated: 0, skipped, rows: rowResults };
}

// ---------------------------------------------------------------------------
// Import — Parts catalog
// ---------------------------------------------------------------------------

// 2026-09-11 — user request: rather than a bin location code with nothing
// to match silently staying unmapped (or, worse, auto-creating locations
// nobody asked for), the client calls this first once the column mapping
// is confirmed and shows a confirmation box listing exactly which codes
// are new before the real import runs. Read-only — creates nothing itself,
// just tells the caller what would need creating. Deduplicated (a code
// repeated across many rows is only listed once) and keeps each code's
// original casing for display, even though the actual matching (here and
// in importParts) is case-insensitive.
export async function previewNewBinLocations(ctx: RequestContext, raw: unknown): Promise<{ newLocationCodes: string[] }> {
  const companyId = authorize(ctx, "parts", "WRITE");
  const input = importRowsInput.parse(raw);
  if (!input.mapping.binLocationCode) return { newLocationCodes: [] };
  const rows = await readUploadedRows(input);
  const locations = await prisma.storageLocation.findMany({ where: { companyId, active: true }, select: { code: true } });
  const known = new Set(locations.map((l) => l.code.trim().toLowerCase()));
  const seen = new Set<string>();
  const newLocationCodes: string[] = [];
  for (const row of rows) {
    const code = mappedValue(row, input.mapping, "binLocationCode");
    if (!code) continue;
    const normalizedCode = code.trim().toLowerCase();
    if (known.has(normalizedCode) || seen.has(normalizedCode)) continue;
    seen.add(normalizedCode);
    newLocationCodes.push(code);
  }
  return { newLocationCodes };
}

export async function importParts(ctx: RequestContext, raw: unknown): Promise<ImportSummary> {
  const companyId = authorize(ctx, "parts", "WRITE");
  // A row whose "Manufacturer" name doesn't match anyone on file gets a new
  // Manufacturer created for it instead of being skipped (see below) — same
  // "don't silently drop the row" behavior Jobs import gives an unmatched
  // customer name. MANUFACTURERS_CREATE checked once up front (same
  // INVENTORY module the "parts" authorize() call above already confirmed
  // is licensed), so a user who can import parts but not create
  // manufacturers fails the whole import cleanly instead of partway
  // through the file.
  requireTenantPermission(ctx, "MANUFACTURERS_CREATE");
  const input = importRowsInput.parse(raw);
  const rows = await readUploadedRows(input);

  // Fetched once, matched in-memory per row — same reasoning as Jobs
  // import's customerCandidates (findBestNameMatch needs every candidate
  // name in hand to compare against). Manufacturer has no trading name of
  // its own, so tradingName is just null for every candidate here; the
  // matcher already treats a null tradingName as "nothing to match on
  // that tier" for every row.
  const manufacturerCandidates: NameCandidate[] = await prisma.manufacturer.findMany({
    where: { companyId, active: true },
    select: { id: true, name: true },
  }).then((list) => list.map((m) => ({ id: m.id, name: m.name, tradingName: null as string | null })));

  // Tax codes aren't fuzzy-matched or auto-created (they carry their own
  // rate/effective-date rules a spreadsheet cell can't supply) — just an
  // exact, case-insensitive lookup by this company's own tax code.
  const taxCodes = await prisma.taxCode.findMany({ where: { companyId, active: true }, select: { id: true, code: true } });
  const taxCodeByNormalizedCode = new Map(taxCodes.map((t) => [t.code.trim().toLowerCase(), t.id]));

  // 2026-09-11 — user request: parts import had no way to seed opening
  // stock or a bin location, so every imported part landed with zero stock
  // everywhere until someone went and received it by hand afterward. "Bin
  // location" is matched the same way "Tax code" above is — an exact,
  // case-insensitive lookup against this company's own Storage Locations,
  // never auto-created (a location carries its own required `type`, which
  // a spreadsheet cell can't safely infer). "Quantity" only gets posted as
  // opening stock when a matching location was found for that row; see the
  // per-row handling below for what happens when it isn't.
  const locations = await prisma.storageLocation.findMany({ where: { companyId, active: true }, select: { id: true, code: true } });
  const locationByNormalizedCode = new Map(locations.map((l) => [l.code.trim().toLowerCase(), l.id]));
  // Only demanded when the sheet actually has a Quantity column mapped — a
  // catalog-only import (no stock column linked) shouldn't need
  // INVENTORY_RECEIVE on top of the PARTS_CREATE already checked above.
  if (input.mapping.quantity) requireTenantPermission(ctx, "INVENTORY_RECEIVE");
  // 2026-09-11 — user request: locations often aren't set up yet before a
  // first parts import, so an unmatched bin location code should be
  // offered as "create it" rather than just "left unmapped" forever. Never
  // auto-created unconditionally, though (unlike an unmatched manufacturer
  // name) — the client calls previewNewBinLocations first, shows the user
  // exactly which codes are new, and only sets this flag on the real
  // import once they've confirmed. Checked once up front, same pattern as
  // MANUFACTURERS_CREATE/INVENTORY_RECEIVE above, so a user who confirmed
  // creating locations but lacks STORAGE_LOCATIONS_CREATE fails the whole
  // import cleanly instead of partway through the file.
  if (input.createMissingLocations && input.mapping.binLocationCode) {
    requireModule(ctx, "STORAGE", "WRITE");
    requireTenantPermission(ctx, "STORAGE_LOCATIONS_CREATE");
  }

  let created = 0;
  let skipped = 0;
  const rowResults: ImportRowResult[] = [];

  for (const row of rows) {
    const partNumber = mappedValue(row, input.mapping, "partNumber");
    if (!partNumber) {
      skipped++;
      rowResults.push({ label: "(blank)", status: "skipped", detail: "Missing part number — row skipped." });
      continue;
    }

    const description = mappedValue(row, input.mapping, "description");
    if (!description) {
      skipped++;
      rowResults.push({ label: partNumber, status: "skipped", detail: "Missing description — row skipped." });
      continue;
    }

    // Create-only, same as Customers/Suppliers — matches ModApp's own
    // Import behaviour for master-data catalogs, and avoids a stale sheet
    // silently overwriting a part's current pricing/reorder settings on
    // re-import (see the file header comment).
    const duplicate = await prisma.part.findFirst({ where: { companyId, partNumber: { equals: partNumber, mode: "insensitive" } } });
    if (duplicate) {
      skipped++;
      rowResults.push({ label: partNumber, status: "skipped", detail: "A part with this part number already exists." });
      continue;
    }

    const manufacturerName = mappedValue(row, input.mapping, "manufacturerName");
    let manufacturerId: string | undefined;
    let manufacturerNote = "";
    if (manufacturerName) {
      let match = findBestNameMatch(manufacturerName, manufacturerCandidates);
      if (!match) {
        try {
          // Same createMaster call the "New manufacturer" form uses (name
          // only) — keeps normalization, audit logging, and validation in
          // one place rather than writing the row here directly.
          const newManufacturer = (await createMaster(ctx, "manufacturers", { name: manufacturerName })) as { id: string; name: string };
          match = { id: newManufacturer.id, name: newManufacturer.name, fuzzy: false };
          manufacturerCandidates.push({ id: newManufacturer.id, name: newManufacturer.name, tradingName: null });
          manufacturerNote = ` — "${manufacturerName}" wasn't on file, so it was added as a new manufacturer.`;
        } catch (err) {
          skipped++;
          rowResults.push({ label: partNumber, status: "skipped", detail: `Couldn't add "${manufacturerName}" as a new manufacturer — ${describeRowError(err)}` });
          continue;
        }
      } else if (match.fuzzy) {
        manufacturerNote = ` — manufacturer "${manufacturerName}" matched to existing "${match.name}" (closest match, not exact — double-check this one).`;
      }
      manufacturerId = match.id;
    }

    const taxCodeRaw = mappedValue(row, input.mapping, "taxCode");
    const taxCodeId = taxCodeRaw ? taxCodeByNormalizedCode.get(taxCodeRaw.trim().toLowerCase()) : undefined;
    const taxCodeNote = taxCodeRaw && !taxCodeId ? ` — tax code "${taxCodeRaw}" wasn't found, left unmapped.` : "";

    // Resolved up front (not just when posting opening stock below) so a
    // matched bin location also becomes the part's own default bin — the
    // same field the Stock Levels drawer's bin-location picker sets —
    // regardless of whether a quantity was also given for this row.
    const binLocationCode = mappedValue(row, input.mapping, "binLocationCode");
    let binLocationId = binLocationCode ? locationByNormalizedCode.get(binLocationCode.trim().toLowerCase()) : undefined;
    let binLocationNote = "";
    if (binLocationCode && !binLocationId) {
      if (input.createMissingLocations) {
        try {
          // Same createMaster call the "New location" form uses. Defaulted
          // to type "Bin" (name set to the code itself) since a spreadsheet
          // cell can't tell us which of the other seven location types it
          // should be — the user can retype/rename it afterward from the
          // Storage Locations tab like any other location.
          const newLocation = (await createMaster(ctx, "storage-locations", { code: binLocationCode, name: binLocationCode, type: "BIN" })) as { id: string };
          binLocationId = newLocation.id;
          locationByNormalizedCode.set(binLocationCode.trim().toLowerCase(), newLocation.id);
          binLocationNote = ` — "${binLocationCode}" wasn't on file, so it was added as a new bin location (type: Bin).`;
        } catch (err) {
          binLocationNote = ` — bin location "${binLocationCode}" couldn't be created — ${describeRowError(err)}`;
        }
      } else {
        binLocationNote = ` — bin location "${binLocationCode}" wasn't found, left unmapped.`;
      }
    }

    const payload: Record<string, unknown> = {
      partNumber,
      description,
      manufacturerId,
      manufacturerPartNumber: mappedValue(row, input.mapping, "manufacturerPartNumber") || undefined,
      category: mappedValue(row, input.mapping, "category") || undefined,
      unitOfMeasure: mappedValue(row, input.mapping, "unitOfMeasure") || undefined,
      notes: mappedValue(row, input.mapping, "notes") || undefined,
      binLocationId,
      defaultPurchaseCost: mappedNumber(row, input.mapping, "defaultPurchaseCost") ?? undefined,
      defaultSellingPrice: mappedNumber(row, input.mapping, "defaultSellingPrice") ?? undefined,
      taxCodeId,
      reorderMinimum: mappedNumber(row, input.mapping, "reorderMinimum") ?? undefined,
      reorderMaximum: mappedNumber(row, input.mapping, "reorderMaximum") ?? undefined,
      reorderQuantity: mappedNumber(row, input.mapping, "reorderQuantity") ?? undefined,
    };

    let newPart: { id: string };
    try {
      newPart = await createMaster(ctx, "parts", payload);
    } catch (err) {
      skipped++;
      rowResults.push({ label: partNumber, status: "skipped", detail: describeRowError(err) });
      continue;
    }
    created++;

    // Opening stock is posted as a real RECEIPT movement through the same
    // receiveStock() every manual "Receive stock" action uses — not a raw
    // StockBalance write — so it shows up on the part's own movement
    // history instead of appearing out of nowhere. Best-effort: a part
    // that was successfully created still counts as created even if its
    // opening stock couldn't be posted (no bin location match, or some
    // other failure) — the row's detail explains why rather than the row
    // failing outright over a secondary step.
    let stockNote = "";
    const quantity = mappedNumber(row, input.mapping, "quantity");
    if (quantity != null && quantity > 0) {
      if (!binLocationId) {
        stockNote = " — quantity not imported: no bin location was resolved for this row.";
      } else {
        try {
          await receiveStock(ctx, receiptInput.parse({ partId: newPart.id, locationId: binLocationId, quantity, referenceNumber: "Import", notes: "Opening stock from import" }));
          stockNote = ` — opening stock of ${quantity} posted to ${binLocationCode}.`;
        } catch (err) {
          stockNote = ` — part created, but opening stock couldn't be posted: ${describeRowError(err)}`;
        }
      }
    }

    rowResults.push({ label: partNumber, status: "created", detail: `Imported.${manufacturerNote}${taxCodeNote}${binLocationNote}${stockNote}` });
  }

  return { total: rows.length, created, updated: 0, skipped, rows: rowResults };
}

// ---------------------------------------------------------------------------
// Import — Jobs
// ---------------------------------------------------------------------------

export async function importJobs(ctx: RequestContext, raw: unknown): Promise<ImportSummary> {
  const companyId = authorize(ctx, "jobs", "WRITE");
  // Every created row is immediately registered too (see below), and a row
  // whose "Job number" already exists goes through the real updateJob
  // instead — both need JOBS_EDIT on top of the JOBS_CREATE authorize()
  // just checked. Verified once up front, before any row is written, so a
  // user who can create but not edit/register jobs fails the whole import
  // cleanly instead of leaving a trail of unregistered DRAFT jobs behind
  // (one per row, each reported as "skipped" only after already being
  // created) once registerJob starts rejecting every row mid-loop.
  requireTenantPermission(ctx, "JOBS_EDIT");
  // A row whose customer name doesn't match anyone on file now gets a new
  // customer created for it instead of being skipped (see the loop below)
  // — that's CUSTOMERS_CREATE on top of the JOBS_CREATE/JOBS_EDIT checks
  // above, checked here too so the whole import fails cleanly up front for
  // a user who can create jobs but not customers, rather than partway
  // through the file.
  authorize(ctx, "customers", "WRITE");
  const input = importRowsInput.parse(raw);
  const rows = await readUploadedRows(input);

  // Fetched once, matched in-memory per row (see findBestNameMatch above)
  // rather than a per-row exact-match query — best-effort matching needs
  // every candidate name in hand to compare against.
  const customerCandidates: NameCandidate[] = await prisma.customer.findMany({
    where: { companyId, active: true },
    select: { id: true, name: true, tradingName: true },
  });

  const jobTypeValues = Object.values(JobType);
  const purchaseOrderStatusValues = Object.values(PurchaseOrderStatus);
  const deliveryTypeValues = Object.values(DeliveryType);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const rowResults: ImportRowResult[] = [];

  for (const row of rows) {
    // "Job number" is this row's own real identity — required (see the
    // file header comment), and the label every row result below shows,
    // rather than the customer name (a job's customer can change on
    // update; its number is what a person actually looks a row up by).
    const jobNumberValue = mappedValue(row, input.mapping, "jobNumber");
    if (!jobNumberValue) {
      skipped++;
      rowResults.push({ label: "(blank)", status: "skipped", detail: "Missing job number — row skipped (every row needs its own job number for this import)." });
      continue;
    }

    const customerName = mappedValue(row, input.mapping, "customerName");
    if (!customerName) {
      skipped++;
      rowResults.push({ label: jobNumberValue, status: "skipped", detail: "Missing customer — row skipped." });
      continue;
    }

    let match = findBestNameMatch(customerName, customerCandidates);
    let customerCreated = false;
    if (!match) {
      // Nothing on file is close enough — add this customer rather than
      // skipping the job (see the file header comment). Same createMaster
      // call the "New customer" form uses, name only; the row is pushed
      // into customerCandidates immediately so a later row in this same
      // file with the same unmatched name matches it exactly instead of
      // creating a second customer.
      try {
        const newCustomer = (await createMaster(ctx, "customers", { name: customerName })) as { id: string; name: string };
        match = { id: newCustomer.id, name: newCustomer.name, fuzzy: false };
        customerCandidates.push({ id: newCustomer.id, name: newCustomer.name, tradingName: null });
        customerCreated = true;
      } catch (err) {
        skipped++;
        rowResults.push({
          label: jobNumberValue,
          status: "skipped",
          detail: `Couldn't add "${customerName}" as a new customer — ${describeRowError(err)}`,
        });
        continue;
      }
    }

    const typeRaw = mappedValue(row, input.mapping, "type");
    const type = normalizeEnumValue(typeRaw, jobTypeValues);
    if (!type) {
      skipped++;
      rowResults.push({
        label: jobNumberValue,
        status: "skipped",
        detail: typeRaw ? `"${typeRaw}" isn't a recognized job type — row skipped.` : "Missing job type — row skipped.",
      });
      continue;
    }

    // Job.previousJobNumber — the plain-text "this job relates to a
    // different job" reference (ModApp's own "Linked Job / Project"), not
    // this row's own identity — see the file header comment.
    const previousJobNumber = mappedValue(row, input.mapping, "previousJobNumber") || undefined;

    const kmsTravelled = mappedNumber(row, input.mapping, "kmsTravelled");
    const statusRaw = mappedValue(row, input.mapping, "status");
    // No forced fallback here (unlike the create path below) — an update
    // with a blank/unrecognized Status column simply leaves whatever
    // status the existing job already has alone. Checked against every
    // real JobStatus, not just this type's stepper flow: updateJob writes
    // status directly, with no transition validation, so a historical
    // "Closed"/"Cancelled" row can be set exactly as the sheet says
    // instead of only the values reachable one step at a time through the
    // ordinary UI.
    const targetStatus = normalizeEnumValue(statusRaw, ALL_JOB_STATUSES);

    const payload: Record<string, unknown> = {
      customerId: match.id,
      type,
      customerReference: mappedValue(row, input.mapping, "customerReference") || undefined,
      customerPo: mappedValue(row, input.mapping, "customerPo") || undefined,
      dateReceived: mappedDate(row, input.mapping, "dateReceived"),
      machineMake: mappedValue(row, input.mapping, "machineMake") || undefined,
      machineModel: mappedValue(row, input.mapping, "machineModel") || undefined,
      machineSerial: mappedValue(row, input.mapping, "machineSerial") || undefined,
      component: mappedValue(row, input.mapping, "component") || undefined,
      componentType: mappedValue(row, input.mapping, "componentType") || undefined,
      componentSerial: mappedValue(row, input.mapping, "componentSerial") || undefined,
      componentPartNumber: mappedValue(row, input.mapping, "componentPartNumber") || undefined,
      description: mappedValue(row, input.mapping, "description") || undefined,
      etaDate: mappedDate(row, input.mapping, "etaDate"),
      mechanicEtaDate: mappedDate(row, input.mapping, "mechanicEtaDate"),
      relationshipNotes: mappedValue(row, input.mapping, "relationshipNotes") || undefined,
      quoteNumber: mappedValue(row, input.mapping, "quoteNumber") || undefined,
      quoteDate: mappedDate(row, input.mapping, "quoteDate"),
      salesOrderNumber: mappedValue(row, input.mapping, "salesOrderNumber") || undefined,
      salesOrderDate: mappedDate(row, input.mapping, "salesOrderDate"),
      invoiceNumber: mappedValue(row, input.mapping, "invoiceNumber") || undefined,
      invoiceDate: mappedDate(row, input.mapping, "invoiceDate"),
      purchaseOrderNumber: mappedValue(row, input.mapping, "purchaseOrderNumber") || undefined,
      purchaseOrderDate: mappedDate(row, input.mapping, "purchaseOrderDate"),
      purchaseOrderStatus: normalizeEnumValue(mappedValue(row, input.mapping, "purchaseOrderStatus"), purchaseOrderStatusValues) ?? undefined,
      deliveryDate: mappedDate(row, input.mapping, "deliveryDate"),
      deliveryType: normalizeEnumValue(mappedValue(row, input.mapping, "deliveryType"), deliveryTypeValues) ?? undefined,
      receivingTransport: normalizeEnumValue(mappedValue(row, input.mapping, "receivingTransport"), deliveryTypeValues) ?? undefined,
      kmsTravelled: kmsTravelled !== null ? Math.trunc(kmsTravelled) : undefined,
      paymentDateReceived: mappedDate(row, input.mapping, "paymentDateReceived"),
      machineHours: mappedNumber(row, input.mapping, "machineHours") ?? undefined,
      plantNumber: mappedValue(row, input.mapping, "plantNumber") || undefined,
      reportNumber: mappedValue(row, input.mapping, "reportNumber") || undefined,
      importTrackingNumber: mappedValue(row, input.mapping, "importTrackingNumber") || undefined,
      previousJobNumber,
      salesRepresentative: mappedValue(row, input.mapping, "salesRepresentative") || undefined,
    };

    const customerNote = customerCreated
      ? ` — "${customerName}" wasn't on file, so it was added as a new customer (fill in its details from the Customers screen).`
      : match.fuzzy
      ? ` — "${customerName}" matched to existing customer "${match.name}" (closest match, not exact — double-check this one).`
      : "";

    try {
      // "Job number" is a real, stable external key now (see the file
      // header comment) — a row whose number already belongs to a job in
      // this company updates that job (matching ModApp's own re-import
      // behavior) instead of failing on Job.jobNumber's unique constraint
      // or silently creating a duplicate.
      const existingJob = await prisma.job.findFirst({ where: { companyId, jobNumber: jobNumberValue }, select: { id: true } });
      if (existingJob) {
        await updateJob(ctx, existingJob.id, { ...payload, ...(targetStatus ? { status: targetStatus } : {}) });
        updated++;
        rowResults.push({ label: jobNumberValue, status: "updated", detail: `Updated existing job ${jobNumberValue}.${customerNote}` });
      } else {
        // literalJobNumber preserves this row's own real number instead of
        // Apollo X's normal auto-allocation (see createDraftJob) — the
        // whole reason this import can carry historical job numbers over
        // at all.
        const job = await createDraftJob(ctx, payload, { literalJobNumber: jobNumberValue });
        // New jobs start in DRAFT (see createDraftJob) — register with a
        // safe, always-valid starting step first (registerJob's own
        // jobRegisterInput rejects terminal statuses like
        // Closed/Cancelled as an *initial* status), then, if the sheet's
        // own Status column names something more specific (including a
        // terminal one), set it directly right after via the same
        // no-transition-check updateJob path the update branch above
        // uses — so a historical "Complete" or "Closed" row ends up
        // exactly where the sheet says, not just wherever registration
        // alone would land it.
        const initialStatus = flowFamilyForJobType(type) === "FIELD_SERVICE" ? "TO_ATTEND" : "TO_BE_RECEIVED";
        await registerJob(ctx, job.id, { initialStatus });
        if (targetStatus && targetStatus !== initialStatus) await updateJob(ctx, job.id, { status: targetStatus });
        created++;
        rowResults.push({ label: jobNumberValue, status: "created", detail: `Imported as job ${jobNumberValue}.${customerNote}` });
      }
    } catch (err) {
      skipped++;
      rowResults.push({ label: jobNumberValue, status: "skipped", detail: describeRowError(err) });
    }
  }

  return { total: rows.length, created, updated, skipped, rows: rowResults };
}

export async function importModule(ctx: RequestContext, kind: ImportExportKind, raw: unknown): Promise<ImportSummary> {
  if (kind === "customers") return importCustomers(ctx, raw);
  if (kind === "suppliers") return importSuppliers(ctx, raw);
  if (kind === "parts") return importParts(ctx, raw);
  return importJobs(ctx, raw);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function toExportRow(fields: ImportFieldDef[], values: Record<string, string | number | null | undefined>): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  for (const field of fields) row[field.label] = values[field.key] ?? "";
  return row;
}

function fmtExportDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

async function buildWorkbookBuffer(rows: Record<string, string | number>[], sheetName: string, format: "xlsx" | "csv"): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  return XLSX.write(workbook, { bookType: format, type: "buffer" }) as Buffer;
}

export type ExportResult = { buffer: Buffer; fileName: string; mimeType: string };

export async function exportModuleData(ctx: RequestContext, kind: ImportExportKind, format: "xlsx" | "csv"): Promise<ExportResult> {
  const companyId = authorize(ctx, kind, "READ");

  let rows: Record<string, string | number>[];
  if (kind === "customers") {
    const customers = await prisma.customer.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: { addresses: { where: { type: "BILLING" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } },
    });
    rows = customers.map((c) => {
      const address = c.addresses[0];
      return toExportRow(CUSTOMER_IMPORT_FIELDS, {
        name: c.name,
        tradingName: c.tradingName ?? "",
        accountCode: c.accountCode ?? "",
        registrationNumber: c.registrationNumber ?? "",
        vatNumber: c.vatNumber ?? "",
        mainTelephone: c.mainTelephone ?? "",
        mainEmail: c.mainEmail ?? "",
        website: c.website ?? "",
        currencyCode: c.currencyCode,
        creditLimit: c.creditLimit ? c.creditLimit.toString() : "",
        notes: c.notes ?? "",
        addressLine1: address?.line1 ?? "",
        addressLine2: address?.line2 ?? "",
        addressCity: address?.city ?? "",
        addressProvince: address?.province ?? "",
        addressPostalCode: address?.postalCode ?? "",
        addressCountryCode: address?.countryCode ?? "",
      });
    });
  } else if (kind === "suppliers") {
    const suppliers = await prisma.supplier.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: { addresses: { where: { type: "BILLING" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } },
    });
    rows = suppliers.map((s) => {
      const address = s.addresses[0];
      return toExportRow(SUPPLIER_IMPORT_FIELDS, {
        name: s.name,
        accountCode: s.accountCode ?? "",
        registrationNumber: s.registrationNumber ?? "",
        vatNumber: s.vatNumber ?? "",
        mainTelephone: s.mainTelephone ?? "",
        mainEmail: s.mainEmail ?? "",
        website: s.website ?? "",
        currencyCode: s.currencyCode,
        notes: s.notes ?? "",
        addressLine1: address?.line1 ?? "",
        addressLine2: address?.line2 ?? "",
        addressCity: address?.city ?? "",
        addressProvince: address?.province ?? "",
        addressPostalCode: address?.postalCode ?? "",
        addressCountryCode: address?.countryCode ?? "",
      });
    });
  } else if (kind === "parts") {
    const parts = await prisma.part.findMany({
      where: { companyId },
      orderBy: { partNumber: "asc" },
      include: { manufacturer: { select: { name: true } }, taxCode: { select: { code: true } }, binLocation: { select: { code: true } } },
    });
    // 2026-09-11 — "Bin location"/"Quantity on hand" added alongside the
    // import-side fields (see PART_IMPORT_FIELDS) so an exported sheet
    // still doubles as a working template for reimport (per this file's
    // header comment). Bin location exports the part's own default bin
    // (Part.binLocationId, the same field the Stock Levels drawer sets) —
    // not "wherever it has the most stock" — since that's the one place a
    // part keeps a single location of its own; a part stocked across
    // several locations still only exports one. Quantity exports the true
    // total on hand across every location, via one grouped query rather
    // than N StockBalance lookups.
    const balances = await prisma.stockBalance.groupBy({ by: ["partId"], where: { companyId, partId: { in: parts.map((p) => p.id) } }, _sum: { quantityOnHand: true } });
    const onHandByPartId = new Map(balances.map((b) => [b.partId, b._sum.quantityOnHand ?? new Prisma.Decimal(0)]));
    rows = parts.map((p) =>
      toExportRow(PART_IMPORT_FIELDS, {
        partNumber: p.partNumber,
        description: p.description,
        manufacturerName: p.manufacturer?.name ?? "",
        manufacturerPartNumber: p.manufacturerPartNumber ?? "",
        category: p.category ?? "",
        unitOfMeasure: p.unitOfMeasure,
        binLocationCode: p.binLocation?.code ?? "",
        quantity: (onHandByPartId.get(p.id) ?? new Prisma.Decimal(0)).toString(),
        defaultPurchaseCost: p.defaultPurchaseCost ? p.defaultPurchaseCost.toString() : "",
        defaultSellingPrice: p.defaultSellingPrice ? p.defaultSellingPrice.toString() : "",
        taxCode: p.taxCode?.code ?? "",
        reorderMinimum: p.reorderMinimum ? p.reorderMinimum.toString() : "",
        reorderMaximum: p.reorderMaximum ? p.reorderMaximum.toString() : "",
        reorderQuantity: p.reorderQuantity ? p.reorderQuantity.toString() : "",
        notes: p.notes ?? "",
      }),
    );
  } else {
    const jobs = await prisma.job.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      include: { customer: { select: { name: true } } },
    });
    rows = jobs.map((j) =>
      toExportRow(JOB_IMPORT_FIELDS, {
        // jobNumber is nullable in the schema (String? — see schema.prisma)
        // even though createDraftJob always sets a real value in practice;
        // draftNumber is the fallback only a job created before that fix
        // could still lack one for.
        jobNumber: j.jobNumber ?? j.draftNumber,
        customerName: j.customer?.name ?? "",
        type: j.type,
        status: j.status,
        customerReference: j.customerReference ?? "",
        customerPo: j.customerPo ?? "",
        dateReceived: fmtExportDate(j.dateReceived),
        machineMake: j.machineMake ?? "",
        machineModel: j.machineModel ?? "",
        machineSerial: j.machineSerial ?? "",
        component: j.component ?? "",
        componentType: j.componentType ?? "",
        componentSerial: j.componentSerial ?? "",
        componentPartNumber: j.componentPartNumber ?? "",
        description: j.description ?? "",
        etaDate: fmtExportDate(j.etaDate),
        mechanicEtaDate: fmtExportDate(j.mechanicEtaDate),
        relationshipNotes: j.relationshipNotes ?? "",
        quoteNumber: j.quoteNumber ?? "",
        quoteDate: fmtExportDate(j.quoteDate),
        salesOrderNumber: j.salesOrderNumber ?? "",
        salesOrderDate: fmtExportDate(j.salesOrderDate),
        invoiceNumber: j.invoiceNumber ?? "",
        invoiceDate: fmtExportDate(j.invoiceDate),
        purchaseOrderNumber: j.purchaseOrderNumber ?? "",
        purchaseOrderDate: fmtExportDate(j.purchaseOrderDate),
        purchaseOrderStatus: j.purchaseOrderStatus,
        deliveryDate: fmtExportDate(j.deliveryDate),
        deliveryType: j.deliveryType ?? "",
        receivingTransport: j.receivingTransport ?? "",
        kmsTravelled: j.kmsTravelled ?? "",
        paymentDateReceived: fmtExportDate(j.paymentDateReceived),
        machineHours: j.machineHours ? j.machineHours.toString() : "",
        plantNumber: j.plantNumber ?? "",
        reportNumber: j.reportNumber ?? "",
        importTrackingNumber: j.importTrackingNumber ?? "",
        previousJobNumber: j.previousJobNumber ?? "",
        salesRepresentative: j.salesRepresentative ?? "",
      }),
    );
  }

  if (rows.length === 0) throw new ImportExportError(`No ${kind} to export yet.`);

  const buffer = await buildWorkbookBuffer(rows, kind, format);
  const extension = format === "csv" ? "csv" : "xlsx";
  const mimeType = format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const dateStamp = new Date().toISOString().slice(0, 10);
  return { buffer, fileName: `${kind}-${dateStamp}.${extension}`, mimeType };
}
