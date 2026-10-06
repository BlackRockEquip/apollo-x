"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent } from "react";
import { ArrowLeft, Columns3, Download, FileText, Loader2, Mail, Maximize2, Minimize2, Pencil, Plus, Printer, RefreshCw, Save, Search, Star, Trash2, Unlink, Upload, X } from "lucide-react";
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, canMarkReturnedUnrepaired, statusStepsForJobType } from "@/lib/jobs/ui";
import { StatusStepper } from "@/components/StatusStepper";
import { PexPreviousJobsTable } from "@/components/PexPreviousJobs";
import { PexAllocatedPill, PexStatusPill, StatusPill, WarrantyStatusPill, ReturnUnrepairedPill } from "@/components/StatusPill";
import { useTenantPermissions } from "@/components/AppShell";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { partLineQuantities } from "@/lib/jobs/part-line-quantities";
import { DEFAULT_DOCUMENT_TITLES, type DocumentKind, type DocumentTitles } from "@/lib/documents/titles";
import type { DocSpec } from "@/lib/documents/pdf";
import { buildFieldReportSpec, buildJobCardSpec, buildJobDeliveryNoteSpec, buildJobHistorySpec, buildOutworkDeliveryNoteSpec, buildPartsListSpec, buildPickSlipSpec, type JobDocJob } from "@/lib/documents/job-specs";

type Row = Record<string, unknown> & { id: string };
type CustomerSelection = Row & { name: string; tradingName?: string | null; accountCode?: string | null };
type SupplierOption = Row & { name: string };
// "Mechanic Strip"/"Mechanic Assemble" (2026-09-19 user request) — the
// company's own staff list, for assigning who stripped/assembled a job.
type MechanicOption = { id: string; label: string };
type SalesRepresentativeOption = { id: string; label: string };
// Parts list — replaces the old requirement/allocation summary types above
// (see schema.prisma's JobPartLine comment). Each row carries its own
// direct status, no derived summary needed.
type PartLineRow = Row & {
  partNumber?: string | null;
  description?: string | null;
  quantity?: unknown;
  status?: string | null;
  receivedQuantity?: unknown;
  // 2026-09-29 — how much has been issued from shelf stock via a picking
  // slip so far (see PartLineStatus's PICKED value, schema.prisma), kept
  // separate from receivedQuantity above — see the Status column below.
  pickedQuantity?: unknown;
  // 2026-10-05 — how many units are being ordered from a supplier (null =
  // not set) and how many have actually been taken off the shelf so far;
  // both worked through partLineQuantities (src/lib/jobs/part-line-quantities.ts).
  orderedQuantity?: unknown;
  stockIssuedQuantity?: unknown;
  previousStatus?: string | null;
  orderNumber?: string | null;
  orderedFromSupplier?: Row & { name?: string | null };
  part?: (Row & { partNumber?: string | null; description?: string | null; unitOfMeasure?: string | null; stockBalances?: Array<{ quantityOnHand?: unknown }> }) | null;
};
// Outwork — new (see schema.prisma's OutworkItem comment). batchId groups
// every item from the same "Record outwork" submission — added 2026-09-09
// so a historical delivery note can show the whole batch, not just the one
// item that was clicked (see openDeliveryNoteForItem below).
type OutworkItemRow = Row & {
  description?: string | null;
  quantity?: unknown;
  status?: string | null;
  dateSentOut?: string | null;
  dateReceived?: string | null;
  batchId?: string | null;
  notes?: string | null;
  // vatNumber/addresses added 2026-09-16 so the delivery note (see
  // printDeliveryNote) can print the supplier's full block, not just its
  // name — see the matching include added in jobs/service.ts.
  supplier?: Row & { name?: string | null; vatNumber?: string | null; addresses?: Array<Row & { line1?: string | null; line2?: string | null; city?: string | null; province?: string | null; postalCode?: string | null }> };
};
// RFQ (request for quote) — see schema.prisma's JobRfqRequest comment.
// status is one of REQUESTED (legacy)/SENT/FAILED/SKIPPED/QUOTED — SENT
// means a real email went out, SKIPPED means it was added to the
// comparison list with no email attempt (no address, or SMTP isn't set up
// under Settings yet), FAILED means a send was attempted and didn't work
// (see lastSendError).
type RfqQuoteLineRow = Row & {
  partLineId: string;
  unitPrice?: unknown;
  available?: boolean;
  notes?: string | null;
  preferred?: boolean;
};
type RfqQuoteRow = Row & {
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: unknown;
  notes?: string | null;
  receivedAt?: string | null;
  lines: RfqQuoteLineRow[];
};
type RfqRequestRow = Row & {
  supplier: Row & { name: string; mainEmail?: string | null };
  status?: string | null;
  lastSendError?: string | null;
  requestedAt?: string | null;
  partsSummary?: string | null;
  quote?: RfqQuoteRow | null;
  // Outbound attachment metadata (the file sent WITH the RFQ, e.g. a
  // drawing or spec sheet) — added 2026-09-14. Bytes fetched on demand via
  // viewRfqAttachment below, same pattern as the quote file.
  attachmentFileName?: string | null;
};
type JobKitOption = Row & { name: string; machineMake?: string | null; machineModel?: string | null; componentType?: string | null; lineCount?: unknown; active?: boolean };
// PexRecord — replaces the old PexStockUnit/PexSupplyLink pair entirely (see
// schema.prisma's PexRecord comment). A single record now carries the whole
// supply -> return -> redeployment cycle for one unit, matching ModApp's own
// PexRecord model field-for-field.
type PexJobRef = Row & { id: string; jobNumber?: string | null; draftNumber?: string | null; status?: string | null; customer?: Row & { name?: string | null; tradingName?: string | null } };
type PexRecordSummary = Row & {
  status: string;
  unitDescription?: string | null;
  supplyDate?: string | null;
  returnDate?: string | null;
  notes?: string | null;
  consumedAt?: string | null;
  supplyJob?: PexJobRef | null;
  returnJob?: PexJobRef | null;
  consumedByJob?: PexJobRef | null;
};
// getPexRecordHistory's actual (flat) return shape — see pex/service.ts.
type PexHistoryEntry = { id: string; type: string; description: string; userName: string | null; createdAt: string };
type PexHistoryJob = { jobId: string; jobNumber: string | null; kind: "SUPPLY" | "RETURN"; deliveredAt: string | null; status: string; purchaseOrderNumber: string | null };
type PexHistoryCycle = { supplyJobNumber: string | null; supplyJobId: string | null; supplyDate: string | null; returnJobNumber: string | null; returnJobId: string | null; returnDate: string | null };
type PexHistoryResponse = {
  id: string;
  unitDescription: string | null;
  status: string;
  notes: string | null;
  supplyJobNumber: string | null;
  supplyJobId: string | null;
  supplyDate: string | null;
  returnJobNumber: string | null;
  returnJobId: string | null;
  returnDate: string | null;
  consumedByJobNumber: string | null;
  consumedByJobId: string | null;
  consumedAt: string | null;
  entries: PexHistoryEntry[];
  previousCycles: PexHistoryCycle[];
  previousJobs: PexHistoryJob[];
};
type JobComponentRow = Row & { component?: string | null; componentType?: string | null; componentPartNumber?: string | null; componentSerial?: string | null };
// Attachments — new (see schema.prisma's JobAttachment comment). Metadata
// only, same as RfqQuoteRow above — the file's bytes are fetched on demand
// by the dedicated download route (see viewAttachment below).
type JobAttachmentRow = Row & {
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: unknown;
  notes?: string | null;
  createdAt?: string | null;
  createdBy?: Row & { displayName?: string | null };
};
type JobDetail = Row & {
  jobNumber?: string | null;
  previousJobNumber?: string | null;
  draftNumber: string;
  status: keyof typeof JOB_STATUS_LABELS;
  // 2026-10-01 — see Job.returnedUnrepaired's own comment in
  // schema.prisma: an independent flag alongside `status` above, not a
  // status value of its own.
  returnedUnrepaired?: boolean;
  returnedUnrepairedReason?: string | null;
  returnedUnrepairedAt?: string | null;
  type: keyof typeof JOB_TYPE_LABELS;
  customerId: string;
  customer: CustomerSelection & { contacts?: Row[]; addresses?: Row[]; branches?: Row[] };
  company?: Row & { legalName?: string | null; tradingName?: string | null };
  notes?: string | null;
  activities: Array<Row & { actor?: { displayName?: string | null } | null }>;
  fieldServiceReport?: Row | null;
  warranty?: Row | null;
  components: JobComponentRow[];
  pexAsSupply?: PexRecordSummary | null;
  pexAsReturn?: PexRecordSummary | null;
  pexConsumedBy?: PexRecordSummary | null;
  // Resolved server-side from this (supply) job's "Previous job number" — see getJobById.
  previousPexJob?: { id: string; jobNumber?: string | null } | null;
  partLines: PartLineRow[];
  outworkItems: OutworkItemRow[];
  rfqRequests: RfqRequestRow[];
  attachments: JobAttachmentRow[];
  // Company-wide — whether SMTP is set up under Settings. Gates the "Send
  // RFQ email" / "Send follow-up" actions; when false they fall back to
  // record-only (SKIPPED) instead of silently failing.
  emailConfigured?: boolean;
};

const JOB_TYPES = Object.entries(JOB_TYPE_LABELS);
// Form keys autosaved by runFieldReportAutosave (the field-service report fields).
const FIELD_REPORT_KEYS = ["fieldTechnician", "fieldVehicle", "fieldReport", "fieldScheduledDate", "fieldHoursNormal", "fieldHoursOvertime", "fieldHoursTravelled", "fieldFindings", "fieldWorkDone", "fieldRecommendations", "fieldFollowUp", "fieldFollowUpDate"];
// 2026-10-06 — field jobs: what an attachment (usually a photo) shows. Keys match attachmentUploadInput.tag.
const ATTACHMENT_TAG_LABELS: Record<string, string> = { BEFORE: "Before", AFTER: "After", FAULT: "Fault", SERIAL_PLATE: "Serial plate", OTHER: "Other" };
const DELIVERY_TYPES = ["INTERNAL_BAKKIE", "INTERNAL_TRUCK", "INTERNAL_COURIER", "EXTERNAL_BAKKIE", "EXTERNAL_TRUCK", "EXTERNAL_COURIER"];
const PURCHASE_ORDER_STATUSES = ["TBA", "AWAIT_PAYMENT", "PARTIALLY_PAID", "PAID", "NOT_APPLICABLE"];
// Registerable/changeable/reopenable status options are a function of the
// job's type (flow family) — see statusStepsForJobType in @/lib/jobs/ui.
// The hardcoded arrays that used to live here only ever matched the main
// workshop flow, so a FIELD_SERVICE job would offer nonsensical options.

function text(value: unknown) {
  return value == null || value === "" ? "—" : String(value);
}

function decimalText(value: unknown) {
  if (value == null || value === "") return "0";
  return String(value);
}

// 2026-09-29, user request: "when in a job, adding a part checks the stock
// but does not show qty on hand." A pasted/imported part line already gets
// auto-linked to the matching catalog Part (JobPartLine.partId — see that
// model's schema comment) but nothing showed its current stock, so summed
// here from the per-location balances jobs/service.ts now includes (same
// sum-across-locations Stock Levels itself does) and rendered under the
// part number below. null (not 0) when the line isn't linked to a real
// Part at all, so "not in the catalog" reads differently from "in the
// catalog with zero on hand".
function partStockOnHand(part: PartLineRow["part"]): number | null {
  if (!part || !Array.isArray(part.stockBalances)) return null;
  return part.stockBalances.reduce((sum, b) => sum + Number(b.quantityOnHand ?? 0), 0);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// 2026-09-15 — fixes "once added, a user can not view the file, it says
// blocked" (job attachments; the exact same bug also affected RFQ quote
// files and RFQ attachments below, which used the identical pattern).
// Root cause: `window.open(\`data:${mime};base64,...\`, "_blank")` — modern
// Chrome refuses to navigate a top-level frame straight to a data: URL
// ("Not allowed to navigate top frame to data URL") and shows exactly a
// blocked page instead of the file. Fix: decode the base64 into a Blob and
// open an object URL (blob:) instead — Chrome allows top-level navigation
// to those. The object URL is revoked after a delay long enough for the
// new tab to finish loading it.
function openFileInNewTab(mimeType: string, base64: string): boolean {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) { URL.revokeObjectURL(url); return false; }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

// Days outstanding — added 2026-09-10 at the user's request ("Days
// outstanding which counts the days the outwork is out"). Counted from the
// date it went out to the date it came back, or to today while it's still
// out; no dateSentOut recorded means there's nothing to count from.
function outworkDaysOutstanding(item: { dateSentOut?: string | null; dateReceived?: string | null }): string {
  if (!item.dateSentOut) return "—";
  const start = new Date(String(item.dateSentOut));
  if (Number.isNaN(start.getTime())) return "—";
  const end = item.dateReceived ? new Date(String(item.dateReceived)) : new Date();
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
  return String(days);
}

// Cheapest quoted+available price for a part line across all suppliers who
// have submitted a quote — mirrors ModApp's QuoteComparisonSection
// cheapestFor(). Independent of the manual "preferred" flag.
function cheapestRfqQuoteId(partLineId: string, requests: RfqRequestRow[]): string | null {
  let min: number | null = null;
  let cheapestQuoteId: string | null = null;
  for (const request of requests) {
    const quote = request.quote;
    if (!quote) continue;
    const line = quote.lines.find((l) => l.partLineId === partLineId);
    if (!line || line.available === false || line.unitPrice == null || line.unitPrice === "") continue;
    const price = Number(line.unitPrice);
    if (Number.isNaN(price)) continue;
    if (min === null || price < min) { min = price; cheapestQuoteId = String(quote.id); }
  }
  return cheapestQuoteId;
}

// Sum of unitPrice × quantity across every quoted+available line on one
// supplier's quote — "if we bought the whole parts list from this one
// supplier" — used for the comparison table's per-supplier footer total.
// Mirrors ModApp's QuoteComparisonSection totalFor().
function rfqQuoteTotal(quote: RfqQuoteRow, partLines: PartLineRow[]): number {
  let total = 0;
  for (const line of quote.lines) {
    if (line.available === false || line.unitPrice == null || line.unitPrice === "") continue;
    const price = Number(line.unitPrice);
    if (Number.isNaN(price)) continue;
    const partLine = partLines.find((p) => String(p.id) === line.partLineId);
    const qty = Number(partLine?.quantity ?? 0);
    total += price * (Number.isNaN(qty) ? 0 : qty);
  }
  return total;
}

// Total cost + how many part lines have a preferred supplier picked —
// mirrors ModApp's QuoteComparisonSection preferredSummary().
function preferredPurchaseSummary(job: JobDetail): { total: number; pickedCount: number } {
  let total = 0;
  let pickedCount = 0;
  for (const line of job.partLines) {
    for (const request of job.rfqRequests) {
      const quoteLine = request.quote?.lines.find((l) => l.partLineId === String(line.id) && l.preferred);
      if (!quoteLine || quoteLine.unitPrice == null || quoteLine.unitPrice === "") continue;
      const price = Number(quoteLine.unitPrice);
      if (Number.isNaN(price)) continue;
      const qty = Number(line.quantity ?? 0);
      total += price * (Number.isNaN(qty) ? 0 : qty);
      pickedCount += 1;
    }
  }
  return { total, pickedCount };
}

function csvEscapeField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Blob + UTF-8 BOM download, same approach as ModApp's handleExportCsv —
// keeps currency symbols/special characters intact when opened in Excel.
function downloadCsv(fileName: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => csvEscapeField(cell)).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const RFQ_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Added (legacy)",
  SENT: "Emailed",
  FAILED: "Send failed",
  SKIPPED: "No email sent",
  QUOTED: "Quoted",
};

export function JobWorkspace({ mode, jobId }: { mode: "create" | "detail"; jobId?: string }) {
  const router = useRouter();
  // 2026-10-01 — user request ("User type: User/Mechanic — inside a job,
  // customer details section to be hidden from user" / "Users are not
  // allowed to edit fields except the following: Notes, Parts List
  // section, Outwork", clarified to also lock the status stepper and the
  // Warranty panel). canViewCustomer is permission-based (so it tracks
  // CUSTOMERS_VIEW for any role, not just this one). mechanicFieldsLocked
  // is deliberately role-specific rather than permission-based: the
  // restriction is finer-grained than JOBS_EDIT itself (which this role
  // still needs, for Notes/Parts/Outwork) — there's no separate permission
  // today for "can edit a job's other fields", so this names the role the
  // user actually described. See jobs/service.ts's requireNotMechanicRestricted
  // and updateJob for the matching server-side enforcement.
  const { tenantRole, tenantPermissions } = useTenantPermissions();
  const canViewCustomer = tenantPermissions.has("CUSTOMERS_VIEW");
  const mechanicFieldsLocked = tenantRole === "USER";
  // 2026-10-01, user request (system-wide): replaces every window.confirm()
  // in this file with the shared coloured confirm dialog — see
  // ConfirmDialog.tsx's own header comment. `dialog` is rendered once near
  // the bottom of this component's JSX.
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [job, setJob] = useState<JobDetail | null>(null);
  // 2026-10-05 — "Send to PEX Inventory" is available at any status once the
  // unit has arrived (mirrors PEX_ALLOCATE_BLOCKED_STATUSES in pex/service.ts)
  // and only to holders of PEX_STOCK_TRANSFER_IN (Admin/Manager by default).
  const canSendToPex = tenantPermissions.has("PEX_STOCK_TRANSFER_IN") && !!job && !["DRAFT", "TO_BE_COLLECTED", "TO_BE_RECEIVED", "CANCELLED"].includes(String(job.status));
  // 2026-10-05 — true while this job is sitting in PEX Inventory by way of
  // "Send to PEX Inventory" (a return record with no supply job, not
  // scrapped): drives the header "Pex" pill and the undo button.
  const pexAllocatedDirect = !!job?.pexAsReturn && !job.pexAsReturn.supplyJob && job.pexAsReturn.status !== "SCRAPPED";
  // 2026-10-05, user request: the "Pex" pill also goes on PEX Return jobs
  // still in the repair process or not yet reallocated. Shown whenever the
  // job's unit is in PEX Stock: a non-scrapped return record that hasn't
  // been redeployed to another job, on a job that has arrived — the same
  // base filter as listPexInventory. Covers direct allocations too (the pill
  // now clears once the unit is redeployed).
  const pexInStock = !!job?.pexAsReturn && job.pexAsReturn.status !== "SCRAPPED" && !job.pexAsReturn.consumedByJob && job.status !== "TO_BE_RECEIVED";
  const [loading, setLoading] = useState(mode === "detail");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<CustomerSelection[]>([]);
  const [showCustomerOptions, setShowCustomerOptions] = useState(false);
  // Inline "create a new customer" from the customer search field itself —
  // added at the user's request ("when selecting a client when adding a job
  // or changing client name in a job, add a way to create a new client if
  // not listed"), same "New supplier" pattern already used by the RFQ panel
  // further down this file (addNewSupplierAndRequestRfq), just creating a
  // plain customer via the existing master-data endpoint rather than a
  // job-scoped one — this has to work in "create" mode too, before a job
  // (and therefore a jobId) exists yet, so it can't reuse postAction/
  // putAction's "reload this job afterward" behavior the way the RFQ
  // version does.
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerAccountCode, setNewCustomerAccountCode] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  // Machine make autofill — suggests from the company's Manufacturers
  // master-data list (Inventory sidebar), same source used for supplier
  // brand matching elsewhere. Still a free-text field underneath (not a
  // hard foreign key), so typing a make not yet in the list is still fine.
  const [machineMakeOptions, setMachineMakeOptions] = useState<SupplierOption[]>([]);
  const [showMachineMakeOptions, setShowMachineMakeOptions] = useState(false);
  // "Mechanic Strip"/"Mechanic Assemble" — the company's staff list, loaded
  // once on mount (small, fixed list, not a search-as-you-type field like
  // machine make above).
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  // 2026-10-05 — Document titles (Org Admin > Configuration > Document
  // titles) are the headings of the print views and the names of the PDFs
  // saved into the job's folder ("<JOB NUMBER> - <title>.pdf").
  const [documentTitles, setDocumentTitles] = useState<DocumentTitles>(DEFAULT_DOCUMENT_TITLES);
  const [savingDocumentKey, setSavingDocumentKey] = useState<string | null>(null);
  const [documentNotice, setDocumentNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/company-settings/document-titles", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && body && !body.error) setDocumentTitles({ ...DEFAULT_DOCUMENT_TITLES, ...body }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  // "Sales representative" — 2026-09-22 user request: "add Sales
  // Representative same as mechanic field." Same admin-managed named-list
  // pattern as mechanics above, loaded once on mount the same way.
  const [salesRepresentatives, setSalesRepresentatives] = useState<SalesRepresentativeOption[]>([]);
  const [bulkPartLines, setBulkPartLines] = useState("");
  // Hides the "add parts" UI (job kit / paste box / import) behind an
  // explicit "Add parts to Job" toggle instead of showing it by default —
  // at the user's request, so the parts table itself leads on a job that
  // already has parts on it.
  const [showAddParts, setShowAddParts] = useState(false);
  const [partsImportFile, setPartsImportFile] = useState<File | null>(null);
  // "Create picking slip" — 2026-09-16 user request: pick this job's own
  // outstanding parts against warehouse stock right from the Parts list,
  // instead of going to Stock Levels and searching for the job there. See
  // createPickSlipForJob's comment (inventory/service.ts) for why this
  // updates the job's existing part lines in place rather than creating
  // new ones the way Stock Levels' own pick flow does.
  const [creatingPickSlip, setCreatingPickSlip] = useState(false);
  const [pickSlipError, setPickSlipError] = useState("");
  const [pickSlipResult, setPickSlipResult] = useState<{ pickedCount: number; outstandingCount: number; skipped?: { partNumber: string; reason: string }[]; pickSlip: { id: string; jobNumber: string | null; lines: { partNumber: string; supersededNumbers?: string; description: string | null; quantity: string; binLocationLabel: string | null }[] } | null } | null>(null);
  // 2026-09-29 — "Cancel"/"Delete" on a pick slip (user request: "need a
  // way to cancel picking slip if a error was made", later "add a delete
  // slip button and allocate stock back") — see cancelJobPickSlip below
  // and cancelPickSlip in inventory/service.ts. Keyed by pick slip id
  // (rather than a single boolean) since it now also gates each row of
  // jobPickSlips below, not just the just-created banner.
  const [cancellingPickSlipId, setCancellingPickSlipId] = useState<string | null>(null);
  // 2026-09-29 — user request: "make viewing already created pickslips
  // visible within the job self." Persistent list of every picking slip
  // ever created for this job (via either "Create picking slip" button
  // above, scoped by createPickSlipForJob, or Stock Levels' own separate
  // pick flow against this same job — listPickSlips returns both), so a
  // slip created in an earlier visit/session is still visible here, not
  // just the ephemeral pickSlipResult banner from just now.
  type JobPickSlipData = {
    id: string;
    createdAt: string;
    status: string;
    cancelledAt: string | null;
    cancelReason: string | null;
    jobNumber: string | null;
    lines: { partNumber: string; supersededNumbers?: string; description: string | null; quantity: string; binLocationLabel: string | null }[];
  };
  const [jobPickSlips, setJobPickSlips] = useState<JobPickSlipData[]>([]);
  const [jobPickSlipsLoading, setJobPickSlipsLoading] = useState(false);
  const [jobPickSlipsError, setJobPickSlipsError] = useState("");
  // RFQ moved into a popup, triggered by a button next to the parts
  // list/"Add / cross-check with stock" area — matches ModApp's RfqPanel
  // (its own request-quotes button opens a modal rather than showing the
  // comparison UI inline on the page at all times).
  const [showRfqPopup, setShowRfqPopup] = useState(false);
  const [receivingLineId, setReceivingLineId] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  // 2026-10-05 — for a line that is part from stock, part ordered: where the
  // units being received came from (see jobPartLineReceiveInput.source).
  const [receiveSource, setReceiveSource] = useState<"AUTO" | "STOCK" | "ORDER">("AUTO");
  // 2026-09-15 — orderEditLineId now marks which part-line row's supplier
  // typeahead is currently focused/open (see the "Supplier" column below),
  // not "which row is in a Save/Cancel edit form" — the "Change supplier"
  // button and the old combined order+supplier edit form it opened are
  // gone (user request: "make that the supplier field is also editable
  // without clicking the change supplier button").
  const [orderEditLineId, setOrderEditLineId] = useState("");
  const [orderSupplierQuery, setOrderSupplierQuery] = useState("");
  const [orderSupplierOptions, setOrderSupplierOptions] = useState<SupplierOption[]>([]);
  // 2026-10-05, user report: "typing into a supplier name field that is blank
  // does not pickup existing suppliers via dropdown ... Is the dropdown not
  // hidden behind a field?" The parts table sits inside .data-table-wrap
  // (overflow:auto, max-height), which CLIPS anything absolutely positioned
  // that pokes out of it, so the suggestions rendered but were cut off (and
  // only "appeared" when Tab happened to select the first one). The list is
  // now position:fixed at the input's on-screen rectangle, which no
  // overflow:auto ancestor can clip. Rect is re-measured on scroll/resize.
  const supplierBoxRef = useRef<HTMLDivElement | null>(null);
  const [supplierDropPos, setSupplierDropPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const [orderSupplierId, setOrderSupplierId] = useState("");
  // Bulk update — 2026-09-15, user request: "Parts list table, make it
  // that bulk update can be done on the parts to add supplier and order
  // number, instead of one at a time." A lightweight toolbar (not a new
  // backend endpoint): selected line ids get the same PATCH
  // /api/v1/jobs/[id]/parts/[lineId] call the single-row inline edits
  // already use, fired once per selected line.
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOrderNumber, setBulkOrderNumber] = useState("");
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [bulkSupplierQuery, setBulkSupplierQuery] = useState("");
  // 2026-09-22, user request: "Inside a job, at the part list section, add
  // a search bar to search for part number." Client-side filter over
  // job.partLines — a job's parts list is small enough that this doesn't
  // need a server round trip. Matches on part number OR description, since
  // a mechanic searching by memory may only recall one or the other.
  const [partSearchQuery, setPartSearchQuery] = useState("");
  const [bulkSupplierOptions, setBulkSupplierOptions] = useState<SupplierOption[]>([]);
  const [bulkSupplierPickerOpen, setBulkSupplierPickerOpen] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [outworkSupplierQuery, setOutworkSupplierQuery] = useState("");
  const [outworkSupplierOptions, setOutworkSupplierOptions] = useState<SupplierOption[]>([]);
  const [outworkSupplierId, setOutworkSupplierId] = useState("");
  // 2026-09-15 — fixes "on parts table, when clicking a supplier, there is
  // a glitch as i have to click twice before it actually selects the
  // supplier, also when adding outwork": see openFileInNewTab's neighbour
  // fix note above for a different bug — this one is separate. Selecting a
  // supplier sets the query to that supplier's full name; since these
  // search effects only gated on "query long enough", the query CHANGING
  // (even to the just-picked name) re-armed the 200ms debounce and
  // re-fetched, which almost always matches that same supplier and
  // re-opens the dropdown a moment after the first click closed it — so
  // the selection had actually already registered, but it looked like
  // nothing happened until a second click closed the reopened dropdown for
  // good (a second click doesn't change the query, so nothing re-fires).
  // Fix: gate each debounce effect on an explicit "picker is open" flag
  // that a selection turns off directly, instead of inferring "closed"
  // from an empty options array that a stale in-flight fetch can refill.
  const [outworkSupplierPickerOpen, setOutworkSupplierPickerOpen] = useState(false);
  // 2026-09-16 — "if not on list create new supplier to allow outwork form
  // to work": tracks the inline create-supplier POST below (createSupplierInline)
  // so the option can show "Creating…" and disable itself mid-request.
  const [outworkCreatingSupplier, setOutworkCreatingSupplier] = useState(false);
  const [outworkDateSentOut, setOutworkDateSentOut] = useState("");
  const [outworkLines, setOutworkLines] = useState<Array<{ id: string; description: string; quantity: string }>>([{ id: "row-1", description: "", quantity: "1" }]);
  const [editingOutworkId, setEditingOutworkId] = useState("");
  const [editOutworkSupplierQuery, setEditOutworkSupplierQuery] = useState("");
  const [editOutworkSupplierOptions, setEditOutworkSupplierOptions] = useState<SupplierOption[]>([]);
  const [editOutworkSupplierId, setEditOutworkSupplierId] = useState("");
  const [editOutworkSupplierPickerOpen, setEditOutworkSupplierPickerOpen] = useState(false);
  const [editOutworkCreatingSupplier, setEditOutworkCreatingSupplier] = useState(false);
  const [editOutworkDescription, setEditOutworkDescription] = useState("");
  const [editOutworkQuantity, setEditOutworkQuantity] = useState("1");
  const [editOutworkDateSentOut, setEditOutworkDateSentOut] = useState("");
  // 2026-10-01, user request ("be able to edit receive date like sent
  // date") — see editOutworkItem's comment in @/lib/jobs/service for how
  // this now also keeps `status` in sync (giving a date marks it
  // received, clearing it un-receives, same as the dedicated Mark
  // received/Undo receive actions).
  const [editOutworkDateReceived, setEditOutworkDateReceived] = useState("");
  const [editOutworkNotes, setEditOutworkNotes] = useState("");
  // Outwork's "record a new batch" form (supplier/date/items) moved into a
  // popup — 2026-09-10, user request: "make the outwork section a popup
  // screen for filling in supplier and outwork details" — matches the RFQ
  // panel's own showRfqPopup pattern below. The items table itself stays
  // inline, only the add-form is a modal now.
  const [showOutworkPopup, setShowOutworkPopup] = useState(false);
  // Attachments — new (see schema.prisma's JobAttachment comment).
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentNotes, setAttachmentNotes] = useState("");
  // 2026-10-06 — field jobs: what the photo shows (BEFORE / AFTER / ...).
  const [attachmentTag, setAttachmentTag] = useState("");
  // 2026-10-06 — field jobs: which of Parts list / Pick slips / Follow-up is open.
  const [fieldPartsTab, setFieldPartsTab] = useState<"parts" | "pickslips" | "followup">("parts");
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  // 2026-09-15, user request: "once a note is added [to an attachment],
  // allow a user to edit it as well." (Job notes themselves later moved
  // to a single autosaving field on 2026-09-16 and no longer use this
  // inline-edit pattern — attachments still do.)
  const [editingAttachmentId, setEditingAttachmentId] = useState("");
  const [editingAttachmentNotes, setEditingAttachmentNotes] = useState("");
  const [savingAttachmentNotes, setSavingAttachmentNotes] = useState(false);
  // Activity history hidden behind a toggle instead of shown by default —
  // 2026-09-10, user request ("Active history also only to be visible on
  // click, not visible from beginning").
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  // supplierAddressLines/supplierVat added 2026-09-16 — user request: print
  // the supplier's full block (name bold, address lines stacked, VAT
  // number) instead of a bare "Supplier: {name}" line. dateSentOut renamed
  // dateCaptured to match the same request's relabeled/repositioned date
  // field on the printed note (same underlying date, just relabeled).
  const [deliveryNote, setDeliveryNote] = useState<{ jobNumber: string; supplierName: string; supplierAddressLines: string[]; supplierVat: string | null; dateCaptured: string | null; make: string; model: string; serial: string; items: Array<{ description: string; quantity: number }> } | null>(null);
  // Print Delivery Note (the job's own delivery note): the line items and notes are edited here first, so what is printed and what is saved as a PDF are the same.
  const [jobDnDraft, setJobDnDraft] = useState<{ items: Array<{ description: string; quantity: string }>; notes: string } | null>(null);
  // Job header switched from position:sticky to position:fixed — 2026-09-10,
  // user request: sticky's small "catch up" scroll (it only locks in place
  // once its normal-flow position reaches the pinned offset) still visibly
  // moved on scroll, and the user wanted it stationary from the moment the
  // page loads. Fixed elements are pulled out of document flow entirely, so
  // a spacer with the header's live measured height is rendered right after
  // it (see the JSX below) to stop the rest of the job page from sliding
  // up underneath it. ResizeObserver keeps the spacer in sync as the
  // header's own height changes (Job status panel and inline error appear
  // only conditionally, and the header-action buttons can wrap).
  //
  // A callback ref (not useRef + an empty-deps effect) on purpose: this
  // component early-returns a plain "Loading job…" placeholder while
  // `loading` is true (see below), so .job-sticky-header doesn't exist in
  // the DOM at all on that first render. A useRef-based effect with `[]`
  // deps ran once against that still-null ref and then never ran again —
  // once loading finished and the real header mounted, nothing was left
  // watching it, so the spacer stayed frozen at its initial 0px and every
  // section below it (starting with Customer details) rendered hidden
  // behind the fixed header instead of below it. A callback ref re-fires
  // (and so does this effect, via stickyHeaderNode in its deps) the moment
  // React actually attaches the DOM node, whenever that happens to be.
  const [stickyHeaderNode, setStickyHeaderNode] = useState<HTMLDivElement | null>(null);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  useEffect(() => {
    if (!stickyHeaderNode) return;
    const update = () => setStickyHeaderHeight(stickyHeaderNode.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stickyHeaderNode);
    return () => observer.disconnect();
  }, [stickyHeaderNode]);
  const [rfqSupplierQuery, setRfqSupplierQuery] = useState("");
  const [rfqSupplierOptions, setRfqSupplierOptions] = useState<SupplierOption[]>([]);
  const [rfqSupplierId, setRfqSupplierId] = useState("");
  const [rfqSupplierPickerOpen, setRfqSupplierPickerOpen] = useState(false);
  const [rfqSendEmail, setRfqSendEmail] = useState(true);
  // 2026-09-29, user report: "on RFQ form inside a job, when resending an
  // email (Clicking retry) no confirmation or notification is displayed, a
  // user wont know what is happening." resendRfq used to go through the
  // generic postAction helper, which only ever surfaces a message on
  // failure (via the shared `error` banner) and reloads silently on
  // success — so a successful retry looked identical to doing nothing at
  // all, unless you happened to notice the status pill change. rfqResendId
  // drives a per-row spinner on the exact button clicked (not the whole
  // page's generic `saving` flag, so other rows stay usable); rfqResendResult
  // is a banner right above the table, same "feedback next to the action
  // that produced it" convention as the pick-slip/logo-upload banners
  // elsewhere in this app.
  const [rfqResendId, setRfqResendId] = useState("");
  const [rfqResendResult, setRfqResendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showRfqNewSupplierForm, setShowRfqNewSupplierForm] = useState(false);
  const [rfqNewSupplierName, setRfqNewSupplierName] = useState("");
  const [rfqNewSupplierEmail, setRfqNewSupplierEmail] = useState("");
  const [rfqNewSupplierSendEmail, setRfqNewSupplierSendEmail] = useState(true);
  // Outbound RFQ attachment (a drawing, spec sheet or photo sent WITH the
  // request) — added 2026-09-14. One file input shared by both the
  // "existing supplier" and "new supplier" request-quote actions below,
  // since only one of those is used per click.
  const [rfqAttachmentFile, setRfqAttachmentFile] = useState<File | null>(null);
  // 2026-09-29 — user request: "move the import quote section to its own
  // place... add a 'Compare quotes' button next to bulk update button
  // which lets the user view the suppliers requested from in table form
  // next to each other, allow user to import quote received for the
  // respective supplier or fill in amounts next to part number." Replaces
  // the old single-supplier-at-a-time "Record quote" drawer (which lived
  // inside the Request quotes (RFQ) popup, one supplier hidden behind the
  // next) with a dedicated dialog of its own, opened from the main Parts
  // list toolbar, where every requested supplier is its own editable
  // column in one table, so prices can be imported or typed in for any
  // supplier without leaving the others out of view.
  type QuoteDraftLine = { unitPrice: string; available: boolean; notes: string };
  const [showQuoteComparePopup, setShowQuoteComparePopup] = useState(false);
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, Record<string, QuoteDraftLine>>>({});
  const [quoteNotesByRequest, setQuoteNotesByRequest] = useState<Record<string, string>>({});
  const [quoteFiles, setQuoteFiles] = useState<Record<string, File | null>>({});
  const [quoteAnalyzingId, setQuoteAnalyzingId] = useState("");
  const [quoteGuessCounts, setQuoteGuessCounts] = useState<Record<string, number>>({});
  const [quoteSavingId, setQuoteSavingId] = useState("");
  // 2026-09-29 — follow-up polish on the Compare quotes dialog: the
  // read-only "Saved quotes" comparison is now tucked behind its own
  // "Compare Prices" button instead of always showing (user request:
  // "move the saved quotes section behind a button that says 'Compare
  // Prices'"), and the whole dialog can be expanded to use most of the
  // screen (user request: "make the dialog be able to maximize the
  // screen as to get a better view"). Follow-up same day: "when clicking
  // the compare Prices button, make that it opens its own dialog" — this
  // flag now gates a second, separate popup (stacked on top of the
  // Compare quotes dialog) instead of an inline expand/collapse section,
  // so it gets its own header and close button rather than sharing space
  // and scroll with the entry table above it.
  const [showSavedQuotesCompare, setShowSavedQuotesCompare] = useState(false);
  const [quoteCompareMaximized, setQuoteCompareMaximized] = useState(false);
  const [partsFollowupResult, setPartsFollowupResult] = useState<{ sent: { supplierName: string }[]; skipped: { supplierName: string; reason: string }[] } | null>(null);
  const [jobKitQuery, setJobKitQuery] = useState("");
  const [jobKitOptions, setJobKitOptions] = useState<JobKitOption[]>([]);
  const [jobKitId, setJobKitId] = useState("");
  // PexRecord linking — search for an unlinked PEX_RETURN job to attach to
  // this PEX_SUPPLY job (matches ModApp's LinkPexReturnJobForm combobox).
  const [pexReturnJobQuery, setPexReturnJobQuery] = useState("");
  const [pexReturnJobOptions, setPexReturnJobOptions] = useState<PexJobRef[]>([]);
  const [selectedPexReturnJobId, setSelectedPexReturnJobId] = useState("");
  const [pexLinkOpen, setPexLinkOpen] = useState(false);
  // Shape matches getPexRecordHistory's actual (flat, not nested) return
  // value in pex/service.ts — see PexHistoryEntry/PexHistoryCycle above.
  const [pexHistory, setPexHistory] = useState<PexHistoryResponse | null>(null);
  const [pexHistoryLoading, setPexHistoryLoading] = useState(false);
  const [dialog, setDialog] = useState<null | "register" | "close" | "reopen" | "returned-unrepaired" | "pex-scrap">(null);
  // Full autosave (2026-09-14, user request: "make it that it autosaves
  // all changes without having to click save button" — the Save button is
  // removed entirely in detail/edit mode, see header-actions below).
  // "idle"/"saving"/"error" mirrors whether the debounced PATCH below is
  // caught up, in flight, or the last attempt failed; the Back-link click
  // handler (handleBackClick) only interrupts navigation for the latter
  // two, per the user's own scoping of when the "unsaved changes" popup
  // should fire.
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "error">("idle");
  // Every load() (initial fetch, or the reload after a postAction/
  // patchAction elsewhere on the page) repopulates `form` from the
  // server's own values — without this guard, that repopulation would
  // itself look like a user edit to the autosave effect below and fire a
  // redundant, harmless-but-wasteful PATCH echoing back what the server
  // just sent. Set to true right before every setForm in load(); the
  // autosave effect consumes and clears it on the very next run instead of
  // scheduling a save.
  const skipNextAutosave = useRef(true);
  // 2026-10-06 — the field-service report fields (technician ... follow-up)
  // autosave like every other field (runFieldReportAutosave below). While any of
  // them has unsaved typing, a background reload of the job (e.g. after an
  // attachment upload) must not overwrite what is being typed; the version
  // counter lets a save that finished while the person kept typing leave the
  // newer typing marked as unsaved.
  const fieldReportDirty = useRef(false);
  const fieldReportVersion = useRef(0);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 2026-09-15 bug fix — "parts table, when changing supplier it refuses,
  // always goes back to previous one." saveOrderNumberInline and
  // saveSupplierInline both PATCH the same part-line endpoint and both have
  // to resend the *other* field's current value alongside the one they're
  // actually changing (the API resets whichever field is omitted to null),
  // so each used to read that other value off the `line` object captured at
  // render time. That's fine on its own, but the two saves fire from two
  // different inputs in the same row (typing a PO number then tabbing to
  // the supplier field is the common case) and neither waited for the
  // other — if the order-number request (carrying the *old*, not-yet-
  // -changed supplier id, correctly, since it fired before the pick) simply
  // resolved after the supplier request, it silently overwrote the fresh
  // supplier back to the old one. jobRef mirrors `job` synchronously
  // (state updates land a render later, which is too slow here) so both
  // saves can look up the other field's value fresh at the moment they
  // actually run, and partLineSaveQueue below serializes same-row saves so
  // they always apply in the order the user triggered them rather than
  // whatever order the network happens to resolve them in.
  const jobRef = useRef<JobDetail | null>(null);
  const partLineSaveQueue = useRef<Record<string, Promise<void>>>({});
  function queueRowSave(lineId: string, run: () => Promise<void>) {
    const prior = partLineSaveQueue.current[lineId] || Promise.resolve();
    const next = prior.then(run, run);
    partLineSaveQueue.current[lineId] = next;
    return next;
  }

  // 2026-10-02 — user request: "When clicking in fields that have dropdowns,
  // and i click onto another field, the dropdown does not go away." Every
  // typeahead in this file (Machine make, Customer, Apply job kit, bulk
  // Supplier, the parts-table Supplier column, RFQ supplier, Outwork
  // supplier x2, link an unlinked PEX return job) opens its own
  // .selector-results dropdown purely based on "do we currently have
  // options" — nothing ever closed it again once focus moved on, so
  // clicking straight from one of these fields into another left the
  // previous dropdown hanging open on screen. Attached as onBlur on each
  // dropdown's own wrapping element (the <label>/<td> containing both the
  // input and its .selector-results), this closes it as soon as focus moves
  // OUTSIDE that wrapper — but NOT when focus moves to one of the
  // dropdown's own option buttons (checked via relatedTarget, which the
  // browser sets to whatever element focus is moving TO), so clicking an
  // actual option still works exactly as before this fix.
  function closeDropdownUnlessWithin(close: () => void) {
    return (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      close();
    };
  }

  const [form, setForm] = useState<Record<string, string>>({
    customerId: "",
    dateReceived: "",
    customerReference: "",
    customerPo: "",
    machineMake: "",
    machineModel: "",
    machineSerial: "",
    component: "",
    componentType: "",
    componentSerial: "",
    componentPartNumber: "",
    description: "",
    type: "STANDARD_REPAIR",
    etaDate: "",
    mechanicEtaDate: "",
    stripMechanicId: "",
    buildMechanicId: "",
    relationshipNotes: "",
    quoteNumber: "",
    quoteDate: "",
    salesOrderNumber: "",
    salesOrderDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    purchaseOrderNumber: "",
    purchaseOrderDate: "",
    purchaseOrderStatus: "TBA",
    deliveryDate: "",
    deliveryType: "",
    receivingTransport: "",
    kmsTravelled: "",
    paymentDateReceived: "",
    paymentNotApplicable: "",
    machineHours: "",
    plantNumber: "",
    reportNumber: "",
    importTrackingNumber: "",
    previousJobNumber: "",
    salesRepresentativeId: "",
    registerStatus: "TO_BE_RECEIVED",
    closingOutcome: "",
    closingNote: "",
    reopenStatus: "TO_BE_RECEIVED",
    reopenReason: "",
    returnedUnrepairedReason: "",
    notes: "",
    fieldSite: "",
    fieldTechnician: "",
    fieldVehicle: "",
    fieldHours: "",
    fieldReport: "",
    siteContactName: "",
    siteContactPhone: "",
    siteAddress: "",
    accessNotes: "",
    fieldScheduledDate: "",
    fieldHoursNormal: "",
    fieldHoursOvertime: "",
    fieldHoursTravelled: "",
    fieldFindings: "",
    fieldWorkDone: "",
    fieldRecommendations: "",
    fieldFollowUp: "",
    fieldFollowUpDate: "",
    warrantyStatus: "PENDING",
    warrantyNotes: "",
    warrantyHistorical: "",
    pexScrapReason: "",
    pexNotes: "",
  });

  const load = useCallback(async (silent?: boolean) => {
    if (!jobId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load job.");
      setJob(body);
      // See jobRef's own comment above — kept in sync right here (not via
      // a useEffect keyed on `job`) so it's already current by the time a
      // queued row save reads it, with zero extra render lag.
      jobRef.current = body;
      // See skipNextAutosave's own comment above — this repopulation is
      // the server echoing back what's already saved, not a new edit.
      skipNextAutosave.current = true;
      setForm((current) => ({
        ...current,
        customerId: body.customerId || "",
        dateReceived: body.dateReceived ? String(body.dateReceived).slice(0, 10) : "",
        customerReference: body.customerReference || "",
        customerPo: body.customerPo || "",
        machineMake: body.machineMake || "",
        machineModel: body.machineModel || "",
        machineSerial: body.machineSerial || "",
        component: body.component || "",
        componentType: body.componentType || "",
        componentSerial: body.componentSerial || "",
        componentPartNumber: body.componentPartNumber || "",
        description: body.description || "",
        notes: body.notes || "",
        type: body.type || "STANDARD_REPAIR",
        etaDate: body.etaDate ? String(body.etaDate).slice(0, 10) : "",
        mechanicEtaDate: body.mechanicEtaDate ? String(body.mechanicEtaDate).slice(0, 10) : "",
        stripMechanicId: body.stripMechanicId || "",
        buildMechanicId: body.buildMechanicId || "",
        relationshipNotes: body.relationshipNotes || "",
        quoteNumber: body.quoteNumber || "",
        quoteDate: body.quoteDate ? String(body.quoteDate).slice(0, 10) : "",
        salesOrderNumber: body.salesOrderNumber || "",
        salesOrderDate: body.salesOrderDate ? String(body.salesOrderDate).slice(0, 10) : "",
        invoiceNumber: body.invoiceNumber || "",
        invoiceDate: body.invoiceDate ? String(body.invoiceDate).slice(0, 10) : "",
        purchaseOrderNumber: body.purchaseOrderNumber || body.customerPo || "",
        purchaseOrderDate: body.purchaseOrderDate ? String(body.purchaseOrderDate).slice(0, 10) : "",
        purchaseOrderStatus: body.purchaseOrderStatus || "TBA",
        deliveryDate: body.deliveryDate ? String(body.deliveryDate).slice(0, 10) : "",
        deliveryType: body.deliveryType || "",
        receivingTransport: body.receivingTransport || "",
        kmsTravelled: body.kmsTravelled != null ? String(body.kmsTravelled) : "",
        paymentDateReceived: body.paymentDateReceived ? String(body.paymentDateReceived).slice(0, 10) : "",
        paymentNotApplicable: body.paymentNotApplicable ? "true" : "",
        machineHours: body.machineHours != null ? String(body.machineHours) : "",
        plantNumber: body.plantNumber || "",
        reportNumber: body.reportNumber || "",
        importTrackingNumber: body.importTrackingNumber || "",
        previousJobNumber: body.previousJobNumber || "",
        salesRepresentativeId: body.salesRepresentativeId || "",
        registerStatus: body.status === "DRAFT" ? statusStepsForJobType(body.type)[0] : body.status,
        reopenStatus: statusStepsForJobType(body.type)[0],
        fieldSite: body.fieldServiceReport?.site ? String(body.fieldServiceReport.site) : "",
        fieldTechnician: body.fieldServiceReport?.technician ? String(body.fieldServiceReport.technician) : "",
        fieldVehicle: body.fieldServiceReport?.vehicle ? String(body.fieldServiceReport.vehicle) : "",
        fieldHours: body.fieldServiceReport?.hours ? String(body.fieldServiceReport.hours) : "",
        fieldReport: body.fieldServiceReport?.report ? String(body.fieldServiceReport.report) : "",
        siteContactName: body.siteContactName || "",
        siteContactPhone: body.siteContactPhone || "",
        siteAddress: body.siteAddress || "",
        accessNotes: body.accessNotes || "",
        fieldScheduledDate: body.fieldServiceReport?.scheduledDate ? String(body.fieldServiceReport.scheduledDate).slice(0, 10) : "",
        fieldHoursNormal: body.fieldServiceReport?.hoursNormal != null ? String(body.fieldServiceReport.hoursNormal) : "",
        fieldHoursOvertime: body.fieldServiceReport?.hoursOvertime != null ? String(body.fieldServiceReport.hoursOvertime) : "",
        fieldHoursTravelled: body.fieldServiceReport?.hoursTravelled != null ? String(body.fieldServiceReport.hoursTravelled) : "",
        fieldFindings: body.fieldServiceReport?.findings ? String(body.fieldServiceReport.findings) : "",
        fieldWorkDone: body.fieldServiceReport?.workDone ? String(body.fieldServiceReport.workDone) : "",
        fieldRecommendations: body.fieldServiceReport?.recommendations ? String(body.fieldServiceReport.recommendations) : "",
        fieldFollowUp: body.fieldServiceReport?.followUpRequired ? "true" : "",
        fieldFollowUpDate: body.fieldServiceReport?.followUpDate ? String(body.fieldServiceReport.followUpDate).slice(0, 10) : "",
        warrantyStatus: body.warranty?.status ? String(body.warranty.status) : "PENDING",
        warrantyNotes: body.warranty?.notes ? String(body.warranty.notes) : "",
        warrantyHistorical: body.warranty?.historicalSourceStatus ? String(body.warranty.historicalSourceStatus) : "",
        pexNotes: String((body.pexAsSupply?.notes ?? body.pexAsReturn?.notes) || ""),
        // Keep unsaved field-report typing (see fieldReportDirty above).
        ...(fieldReportDirty.current ? Object.fromEntries(FIELD_REPORT_KEYS.map((key) => [key, current[key]])) : {}),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load job.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  /* eslint-disable react-hooks/set-state-in-effect -- async resource loading and search result synchronization are intentional here */
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/v1/jobs/mechanics", { cache: "no-store" });
        const b = await r.json();
        if (r.ok) setMechanics(b.items || []);
      } catch {
        // Convenience list for picking an existing staff member — the
        // fields underneath still save/load fine if this fails, same
        // "options are a convenience" approach used elsewhere on this page.
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/v1/jobs/sales-representatives", { cache: "no-store" });
        const b = await r.json();
        if (r.ok) setSalesRepresentatives(b.items || []);
      } catch {
        // Convenience list, same "options are a convenience" approach as
        // the mechanics load above.
      }
    })();
  }, []);

  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2) { setCustomerOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/selections/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const b = await r.json();
      setCustomerOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/manufacturers?q=${encodeURIComponent(form.machineMake.trim())}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setMachineMakeOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [form.machineMake]);

  useEffect(() => {
    if (!orderEditLineId) { setSupplierDropPos(null); return; }
    const measure = () => {
      const el = supplierBoxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const width = Math.max(r.width, 240);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      if (below < 180 && above > below) setSupplierDropPos({ left, width, bottom: window.innerHeight - r.top + 2, maxHeight: Math.min(280, above) });
      else setSupplierDropPos({ left, width, top: r.bottom + 2, maxHeight: Math.min(280, Math.max(below, 120)) });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [orderEditLineId, orderSupplierOptions.length]);

  useEffect(() => {
    if (!orderEditLineId) { setOrderSupplierOptions([]); return; }
    const q = orderSupplierQuery.trim();
    if (q.length < 2) { setOrderSupplierOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setOrderSupplierOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [orderSupplierQuery, orderEditLineId]);

  useEffect(() => {
    if (!outworkSupplierPickerOpen) { setOutworkSupplierOptions([]); return; }
    const q = outworkSupplierQuery.trim();
    if (q.length < 2) { setOutworkSupplierOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setOutworkSupplierOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [outworkSupplierQuery, outworkSupplierPickerOpen]);

  useEffect(() => {
    if (!editingOutworkId || !editOutworkSupplierPickerOpen) { setEditOutworkSupplierOptions([]); return; }
    const q = editOutworkSupplierQuery.trim();
    if (q.length < 2) { setEditOutworkSupplierOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setEditOutworkSupplierOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [editOutworkSupplierQuery, editingOutworkId, editOutworkSupplierPickerOpen]);

  // 2026-09-29, user request: "adding a supplier field must be searchable
  // and scrollable" on the Request quote form — this used to show nothing
  // at all until 2+ characters were typed, so there was no way to just
  // browse the supplier list. /api/v1/master-data/suppliers already
  // returns every active supplier (alphabetical) when `q` is empty — see
  // listMaster's "suppliers" case in master-data/service.ts, which only
  // adds the name/code/description filter `q.q &&` — so opening the picker
  // with nothing typed now loads that first page straight away, and typing
  // narrows it the same as before. The dropdown itself (.selector-results)
  // already scrolls at 280px max-height.
  useEffect(() => {
    if (!rfqSupplierPickerOpen) { setRfqSupplierOptions([]); return; }
    const q = rfqSupplierQuery.trim();
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?${q ? `q=${encodeURIComponent(q)}&` : ""}status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setRfqSupplierOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [rfqSupplierQuery, rfqSupplierPickerOpen]);

  // Bulk part-line update — see bulkEditMode's declaration above.
  useEffect(() => {
    if (!bulkSupplierPickerOpen) { setBulkSupplierOptions([]); return; }
    const q = bulkSupplierQuery.trim();
    if (q.length < 2) { setBulkSupplierOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setBulkSupplierOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [bulkSupplierQuery, bulkSupplierPickerOpen]);

  // 2026-09-19, user request: "when selecting a kit in a job parts section,
  // the search kit dropdown is visible before even typing." This effect ran
  // on mount with jobKitQuery still empty ("") and fetched
  // /api/v1/job-kits?q=&status=active — an empty q matches every active
  // kit, not none — so jobKitOptions was already populated (and the
  // dropdown, which just renders whenever jobKitOptions.length > 0, already
  // visible) before the user typed anything. Every other search-as-you-type
  // picker in this file (bulk supplier, parts, etc.) already guards on a
  // minimum query length before fetching — this one just never had it.
  useEffect(() => {
    if (!jobId) return;
    const q = jobKitQuery.trim();
    if (q.length < 2) { setJobKitOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/job-kits?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setJobKitOptions((b.items || []).filter((item: JobKitOption) => item.active !== false));
    }, 200);
    return () => clearTimeout(timer);
  }, [jobId, jobKitQuery]);

  // Only relevant on a PEX_SUPPLY job that doesn't have a return job linked
  // yet — searches unlinked, active PEX_RETURN jobs (mirrors ModApp's
  // LinkPexReturnJobForm combobox, adapted to Apollo's own job vocabulary).
  useEffect(() => {
    if (job?.type !== "PEX_SUPPLY" || job.pexAsSupply?.returnJob) { setPexReturnJobOptions([]); return; }
    const q = pexReturnJobQuery.trim();
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/pex-tracking/unlinked-return-jobs?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const b = await r.json();
      setPexReturnJobOptions((b.items || []) as PexJobRef[]);
    }, 200);
    return () => clearTimeout(timer);
  }, [job?.type, job?.pexAsSupply?.returnJob, pexReturnJobQuery]);

  const title = useMemo(() => job?.jobNumber || job?.draftNumber || "New job", [job]);

  function updateField(key: string, value: string) {
    if (FIELD_REPORT_KEYS.includes(key)) { fieldReportDirty.current = true; fieldReportVersion.current += 1; }
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Every scalar Job field the edit form itself can set — factored out of
  // submitDraft (2026-09-14) so the new autosave path below can build the
  // exact same payload shape without a second, drifting copy of this list.
  function buildJobPayload() {
    return {
      customerId: form.customerId,
      dateReceived: form.dateReceived || null,
      customerReference: form.customerReference || null,
      customerPo: form.purchaseOrderNumber || null,
      machineMake: form.machineMake || null,
      machineModel: form.machineModel || null,
      machineSerial: form.machineSerial || null,
      component: form.component || null,
      componentType: form.componentType || null,
      componentSerial: form.componentSerial || null,
      componentPartNumber: form.componentPartNumber || null,
      description: form.description || null,
      notes: form.notes || null,
      type: form.type,
      etaDate: form.etaDate || null,
      mechanicEtaDate: form.mechanicEtaDate || null,
      stripMechanicId: form.stripMechanicId || null,
      buildMechanicId: form.buildMechanicId || null,
      relationshipNotes: form.relationshipNotes || null,
      quoteNumber: form.quoteNumber || null,
      quoteDate: form.quoteDate || null,
      salesOrderNumber: form.salesOrderNumber || null,
      salesOrderDate: form.salesOrderDate || null,
      invoiceNumber: form.invoiceNumber || null,
      invoiceDate: form.invoiceDate || null,
      purchaseOrderNumber: form.purchaseOrderNumber || null,
      purchaseOrderDate: form.purchaseOrderDate || null,
      purchaseOrderStatus: form.purchaseOrderStatus || null,
      deliveryDate: form.deliveryDate || null,
      deliveryType: form.deliveryType || null,
      receivingTransport: form.receivingTransport || null,
      kmsTravelled: form.kmsTravelled ? Number(form.kmsTravelled) : null,
      siteContactName: form.siteContactName || null,
      siteContactPhone: form.siteContactPhone || null,
      siteAddress: form.siteAddress || null,
      accessNotes: form.accessNotes || null,
      paymentDateReceived: form.paymentDateReceived || null,
      paymentNotApplicable: form.paymentNotApplicable === "true",
      machineHours: form.machineHours || null,
      plantNumber: form.plantNumber || null,
      reportNumber: form.reportNumber || null,
      importTrackingNumber: form.importTrackingNumber || null,
      previousJobNumber: form.previousJobNumber || null,
      salesRepresentativeId: form.salesRepresentativeId || null,
    };
  }

  async function submitDraft(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // In detail mode the job-edit-grid's fields autosave on their own (see
    // the effect below) and the Save button is gone — this handler stays
    // wired to the <form>'s onSubmit only so that pressing Enter inside a
    // text field harmlessly does nothing instead of falling through to the
    // browser's default form submission.
    if (mode !== "create") return;
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildJobPayload()),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save job.");
      router.push(`/jobs/${b.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save job.");
    } finally {
      setSaving(false);
    }
  }

  // Debounced full autosave for the job-edit-grid fields (2026-09-14, user
  // request — see autosaveState's own comment above for the skip-echo
  // guard this relies on). Deliberately does NOT check the shared `saving`
  // flag before firing — postAction/patchAction calls elsewhere on the
  // page already reload the job afterwards, which itself sets
  // skipNextAutosave and would just cancel out a same-tick autosave
  // attempt harmlessly; gating on `saving` risked a real edit's autosave
  // getting silently dropped instead of retried.
  async function runAutosave() {
    if (!jobId) return;
    setAutosaveState("saving");
    setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildJobPayload()),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save job.");
      setAutosaveState("idle");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save job.");
      setAutosaveState("error");
    }
  }

  useEffect(() => {
    if (mode !== "detail" || !jobId) return;
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return; }
    if (!form.customerId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { void runAutosave(); }, 1200);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // Deliberately only the job-edit-grid's own fields (matches
    // buildJobPayload above) — note/dialog/field-service/warranty/pex
    // fields on the same `form` object have their own explicit save
    // actions and must not trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode, jobId, form.customerId, form.dateReceived, form.customerReference, form.machineMake, form.machineModel,
    form.machineSerial, form.component, form.componentType, form.componentSerial, form.componentPartNumber,
    form.description, form.notes, form.type, form.etaDate, form.mechanicEtaDate, form.stripMechanicId, form.buildMechanicId, form.relationshipNotes, form.quoteNumber,
    form.quoteDate, form.salesOrderNumber, form.salesOrderDate, form.invoiceNumber, form.invoiceDate,
    form.purchaseOrderNumber, form.purchaseOrderDate, form.purchaseOrderStatus, form.deliveryDate, form.deliveryType,
    form.receivingTransport, form.kmsTravelled, form.paymentDateReceived, form.paymentNotApplicable, form.machineHours,
    form.plantNumber, form.reportNumber, form.importTrackingNumber, form.previousJobNumber, form.salesRepresentativeId,
    form.siteContactName, form.siteContactPhone, form.siteAddress, form.accessNotes,
  ]);

  // Autosave for the field-service report fields — same debounce, same
  // header indicator and same retry as the job fields above, but PUT to the
  // field-service endpoint. Kms travelled is deliberately not sent here: it
  // is a job field and autosaves with the rest of the job. No reload after
  // the save — what was typed is already what is saved.
  async function runFieldReportAutosave() {
    if (!jobId || jobRef.current?.type !== "FIELD_SERVICE" || !fieldReportDirty.current) return;
    const version = fieldReportVersion.current;
    setAutosaveState("saving");
    setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/field-service`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          technician: form.fieldTechnician || null,
          vehicle: form.fieldVehicle || null,
          report: form.fieldReport || null,
          scheduledDate: form.fieldScheduledDate || null,
          hoursNormal: form.fieldHoursNormal !== "" ? Number(form.fieldHoursNormal) : null,
          hoursOvertime: form.fieldHoursOvertime !== "" ? Number(form.fieldHoursOvertime) : null,
          hoursTravelled: form.fieldHoursTravelled !== "" ? Number(form.fieldHoursTravelled) : null,
          findings: form.fieldFindings || null,
          workDone: form.fieldWorkDone || null,
          recommendations: form.fieldRecommendations || null,
          followUpRequired: form.fieldFollowUp === "true",
          followUpDate: form.fieldFollowUp === "true" ? form.fieldFollowUpDate || null : null,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save field service details.");
      if (version === fieldReportVersion.current) fieldReportDirty.current = false;
      setAutosaveState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save field service details.");
      setAutosaveState("error");
    }
  }

  useEffect(() => {
    if (mode !== "detail" || !jobId || !fieldReportDirty.current) return;
    const timer = setTimeout(() => { void runFieldReportAutosave(); }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runFieldReportAutosave reads the latest form on every render; only the field-report values should re-arm the timer.
  }, [
    mode, jobId, form.fieldTechnician, form.fieldVehicle, form.fieldReport, form.fieldScheduledDate, form.fieldHoursNormal,
    form.fieldHoursOvertime, form.fieldHoursTravelled, form.fieldFindings, form.fieldWorkDone, form.fieldRecommendations,
    form.fieldFollowUp, form.fieldFollowUpDate,
  ]);

  // Backs up the "Save failed — retrying" wording in the header (above)
  // with an actual retry — otherwise a save that failed once (e.g. a
  // dropped connection) would just sit there until the person happened to
  // touch a field again.
  useEffect(() => {
    if (autosaveState !== "error") return;
    const timer = setTimeout(() => { void runAutosave(); if (fieldReportDirty.current) void runFieldReportAutosave(); }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAutosave closes over the latest `form`/`jobId` on every render; only autosaveState should re-arm this timer.
  }, [autosaveState]);

  // Back-link guard (2026-09-14, user request: "make a popup if any
  // unsaved info will be lost"). Narrowed to autosave's own in-flight/
  // failed states rather than a general dirty-check, per the user's
  // explicit choice ("Full autosave, Save button removed") — with
  // autosave on, "unsaved changes" should only be a real possibility while
  // a save is actually in the air or just failed.
  // 2026-10-01 — switched from window.confirm (synchronous — the browser
  // blocks right there until the person answers) to the async coloured
  // confirm dialog, which can't block like that. So this now always
  // prevents the Link's own navigation up front whenever a confirmation is
  // needed, shows the dialog, and — only on "yes" — navigates there itself
  // via the router. When no confirmation is needed (the common case,
  // autosaveState idle) nothing changes: the Link navigates normally.
  function handleBackClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (mode !== "detail") return;
    if (autosaveState !== "saving" && autosaveState !== "error") return;
    e.preventDefault();
    const message = autosaveState === "saving" ? "Your changes are still saving. Leave this job anyway?" : "Your last change failed to save. Leave anyway and lose it?";
    void confirm({ message, tone: "warning", confirmLabel: "Leave anyway" }).then((ok) => { if (ok) router.push("/jobs"); });
  }

  // 2026-10-05 — user request: confirm before "Send to PEX Inventory", and
  // a way to undo it if it was clicked by accident.
  async function sendToPexInventory() {
    if (!job) return;
    if (!(await confirm({ message: "Send this job's unit to PEX Inventory? It will show as Pex and appear on the PEX Stock page. You can undo this afterwards if it was a mistake.", tone: "warning", confirmLabel: "Send to PEX" }))) return;
    await postAction(`/api/v1/jobs/${job.id}/pex/allocate`, {});
  }
  async function undoSendToPexInventory() {
    if (!job) return;
    if (!(await confirm({ message: "Take this job's unit back out of PEX Inventory? The Pex pill will be removed and it will disappear from PEX Stock.", tone: "warning", confirmLabel: "Undo" }))) return;
    await postAction(`/api/v1/jobs/${job.id}/pex/undo-allocate`, {});
  }

  async function postAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  // Pre-fills the new-customer form's name from whatever's already typed
  // into the customer search box, so clicking "Add ... as a new customer"
  // from the results dropdown doesn't make someone retype what they just
  // searched for.
  function openNewCustomerForm() {
    setNewCustomerName(customerQuery.trim());
    setNewCustomerAccountCode("");
    setError("");
    setShowNewCustomerForm(true);
  }

  // Creates a plain customer via the same master-data endpoint the
  // Customers screen's own "New customer" form posts to (name is the only
  // required field there — see customerCreateInput in
  // master-data/validation.ts), then immediately selects it as this job's
  // customer, same as clicking an existing search result would. Deliberately
  // not postAction/putAction (see the state declarations above) — this
  // needs to work in "create" mode, before there's a job to reload.
  async function addNewCustomer() {
    const name = newCustomerName.trim();
    if (name.length < 2) {
      setError("Customer name needs at least 2 characters.");
      return;
    }
    setAddingCustomer(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { name };
      if (newCustomerAccountCode.trim()) payload.accountCode = newCustomerAccountCode.trim();
      const r = await fetch("/api/v1/master-data/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to add that customer.");
      const created = b as CustomerSelection;
      updateField("customerId", created.id);
      setCustomerQuery(created.name);
      setCustomerOptions((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
      setShowCustomerOptions(false);
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerAccountCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add that customer.");
    } finally {
      setAddingCustomer(false);
    }
  }

  async function putAction(path: string, payload: Record<string, unknown>): Promise<boolean> {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Parts list — paste box, one row per line ("partNumber, quantity[,
  // description]"), same shape as ModApp's AddPartLinesForm.
  async function addPartLines(): Promise<boolean> {
    if (!jobId || !bulkPartLines.trim()) return false;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/parts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bulkLines: bulkPartLines }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to add part lines.");
      setBulkPartLines("");
      await load(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add part lines.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // "Save to folder" — renders the same document the Print button shows as a
  // PDF on the server (company letterhead + logo), files it in the job's
  // folder as "<JOB NUMBER> - <document title>.pdf" and lists it under the
  // job's Attachments. Printing itself never saves anything.
  async function saveDocumentToFolder(key: string, kind: DocumentKind, spec: DocSpec, nameSuffix?: string) {
    if (!jobId || savingDocumentKey) return;
    setSavingDocumentKey(key);
    setDocumentNotice("");
    setError("");
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, nameSuffix: nameSuffix || undefined, spec }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save the document.");
      setDocumentNotice(`Saved as ${body.fileName} in the job folder.`);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the document.");
    } finally {
      setSavingDocumentKey(null);
    }
  }

  // Printing and saving are asked in that order: clicking a Print button
  // prints, and only then asks whether to also keep a PDF copy in the job's
  // folder (named "<JOB NUMBER> - <document title>.pdf"). Nothing is saved
  // unless the person answers yes, and nothing is asked if the print window
  // could not open.
  async function offerToSave(printed: boolean | Promise<boolean>, kind: DocumentKind, buildSpec: () => DocSpec | null, nameSuffix?: string) {
    if (!(await printed) || !jobId || savingDocumentKey) return;
    const spec = buildSpec();
    if (!spec) return;
    const fileName = `${jobDocLabel} - ${documentTitles[kind]}${nameSuffix ? ` - ${nameSuffix}` : ""}.pdf`;
    const yes = await confirm({
      title: "Save to the job folder?",
      message: `Also save a PDF copy of this document in the job's folder as "${fileName}"?`,
      tone: "neutral",
      confirmLabel: "Save to folder",
      cancelLabel: "No thanks",
    });
    if (yes) await saveDocumentToFolder(kind, kind, spec, nameSuffix);
  }

  // 2026-10-06 — Field Report: the printout for a field service job. Same look
  // as the Job History print (logo, company details, grey label tables) but
  // showing what was saved on the job — customer and site, machine, who
  // attended, hours and kms, and the work performed. The same data goes into
  // the saved PDF (buildFieldReportSpec in lib/documents/job-specs.ts).
  async function printFieldReport(): Promise<boolean> {
    if (!job) return false;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the field report."); return false; }
    const fmt = (value: string) => value ? new Date(value).toLocaleDateString("en-ZA") : "—";
    const jobLabel = job.jobNumber || job.draftNumber || "";
    const logoSrc = companyLogoImgSrc();
    const orgDetails = await fetchCompanyOrgDetails();
    const orgDetailsHtml = orgDetails ? `<div class="org-details">
        <p class="org-name">${escapeHtml(orgDetails.name)}</p>
        ${orgDetails.addressLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
        ${orgDetails.registrationNumber ? `<p>Reg: ${escapeHtml(orgDetails.registrationNumber)}</p>` : ""}
        ${orgDetails.vatNumber ? `<p>VAT: ${escapeHtml(orgDetails.vatNumber)}</p>` : ""}
        ${orgDetails.contact ? `<p>${escapeHtml(orgDetails.contact)}</p>` : ""}
        ${orgDetails.email ? `<p>${escapeHtml(orgDetails.email)}</p>` : ""}
      </div>` : "";
    const rows = (pairs: Array<[string, string]>) => pairs.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`).join("");
    const block = (label: string, value: string) => `<h2>${escapeHtml(label)}</h2><div class="box">${escapeHtml(value || "—")}</div>`;
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(`${jobLabel} - ${documentTitles.FIELD_REPORT}`)}</title><meta charset="utf-8" /><style>
      @page{size:A4;margin:12mm}
      body{font-family:Arial,Helvetica,sans-serif;padding:0;margin:0 auto;max-width:780px;color:#111;font-size:11px}
      .note-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:10px}
      h1{font-size:17px;margin:0 0 4px}
      h2{font-size:10.5px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em;color:#555;page-break-after:avoid}
      .note-left{display:flex;flex-direction:column;align-items:flex-start}
      .note-right{text-align:right}
      .logo{max-height:50px;max-width:170px;object-fit:contain;margin-bottom:5px;display:block}
      .org-details{text-align:left}
      .org-details .org-name{font-weight:bold;font-size:11px;color:#111;margin:0 0 2px}
      .org-details p{font-size:9.5px;color:#444;margin:0;line-height:1.4}
      .job-number{font-size:15px;font-weight:bold}
      table{width:100%;border-collapse:collapse;page-break-inside:avoid}
      th,td{border:1px solid #ccc;padding:4px 7px;text-align:left;font-size:11px;vertical-align:top}
      th{width:36%;background:#f6f6f6;font-weight:600}
      .box{border:1px solid #ccc;padding:5px 7px;min-height:26px;white-space:pre-wrap;font-size:10.5px;page-break-inside:avoid}
      .two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start;page-break-inside:avoid}
      .scheduled{font-size:10.5px;color:#444;margin-top:2px}
    </style></head><body>
      <div class="note-head">
        <div class="note-left">
          <img class="logo" src="${logoSrc}" alt="" onerror="this.style.display='none'" />
          ${orgDetailsHtml}
        </div>
        <div class="note-right">
          <h1>${escapeHtml(documentTitles.FIELD_REPORT)}</h1>
          <div class="job-number">Job ${escapeHtml(String(jobLabel))}</div>
          ${form.fieldScheduledDate ? `<div class="scheduled">Scheduled: ${fmt(form.fieldScheduledDate)}</div>` : ""}
        </div>
      </div>
      <div class="two-col">
        <div>
          <h2>Customer</h2>
          <table>${rows([
            ["Customer", String(job.customer?.name || "")],
            ["Date in", fmt(form.dateReceived)],
            ["Customer reference", form.customerReference],
            ["Report number", form.reportNumber],
            ["Sales representative", String(salesRepresentatives.find((s) => s.id === form.salesRepresentativeId)?.label || "—")],
          ])}</table>
        </div>
        <div>
          <h2>Site</h2>
          <table>${rows([
            ["Site contact", [form.siteContactName, form.siteContactPhone].filter(Boolean).join(" · ")],
            ["Site address", form.siteAddress],
            ["Access / induction", form.accessNotes],
          ])}</table>
        </div>
      </div>
      <div class="two-col">
        <div>
          <h2>Machine / component details</h2>
          <table>${rows([
            ["Machine make", form.machineMake],
            ["Machine model", form.machineModel],
            ["Machine serial", form.machineSerial],
            ["Component", form.component],
            ["Component serial", form.componentSerial],
            ["Plant number", form.plantNumber],
            ["Machine hours", form.machineHours],
          ])}</table>
        </div>
        <div>
          <h2>Job details</h2>
          <table>${rows([
            ["Job type", JOB_TYPE_LABELS[job.type]],
            ["Technician", form.fieldTechnician],
            ["Vehicle", form.fieldVehicle],
            ["Scheduled date", fmt(form.fieldScheduledDate)],
            ["Purchase order", form.purchaseOrderNumber],
            ["Quote / Sales order", [form.quoteNumber, form.salesOrderNumber].filter(Boolean).join(" / ")],
          ])}</table>
        </div>
      </div>
      ${block("Job description", form.description)}
      <h2>Time &amp; travel</h2>
      <table>${rows([
        ["Normal time (h)", form.fieldHoursNormal],
        ["Overtime (h)", form.fieldHoursOvertime],
        ["Travel (h)", form.fieldHoursTravelled],
        ["Total hours", fieldHoursTotal],
        ["Kms travelled", form.kmsTravelled],
      ])}</table>
      ${block("Report", form.fieldReport)}
      ${block("Findings / cause of failure", form.fieldFindings)}
      ${block("Work done", form.fieldWorkDone)}
      ${block("Recommendations", form.fieldRecommendations)}
      <h2>Follow-up visit</h2>
      <table>${rows([
        ["Follow-up needed", form.fieldFollowUp === "true" ? "Yes" : "No"],
        ["Follow-up date", form.fieldFollowUp === "true" ? fmt(form.fieldFollowUpDate) : ""],
      ])}</table>
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`);
    win.document.close();
    win.focus();
    return true;
  }

  const jobDocLabel = job ? job.jobNumber || job.draftNumber || "" : "";
  const jobDocLabels = () => ({
    jobType: job ? String(JOB_TYPE_LABELS[job.type] || "") : "",
    status: job ? String(JOB_STATUS_LABELS[job.status] || "") : "",
    salesRepresentative: String(salesRepresentatives.find((s) => s.id === form.salesRepresentativeId)?.label || "—"),
    stripMechanic: String(mechanics.find((m) => m.id === form.stripMechanicId)?.label || "—"),
    buildMechanic: String(mechanics.find((m) => m.id === form.buildMechanicId)?.label || "—"),
  });
  const jobCardSpec = () => (job ? buildJobCardSpec({ title: documentTitles.JOB_CARD, jobLabel: jobDocLabel, job: job as unknown as JobDocJob, form, labels: jobDocLabels() }) : null);
  const fieldReportSpec = () => (job ? buildFieldReportSpec({ title: documentTitles.FIELD_REPORT, jobLabel: jobDocLabel, job: job as unknown as JobDocJob, form, labels: jobDocLabels() }) : null);
  const jobHistorySpec = () => (job ? buildJobHistorySpec({ title: documentTitles.JOB_HISTORY, jobLabel: jobDocLabel, job: job as unknown as JobDocJob, form, labels: jobDocLabels() }) : null);
  const jobDeliveryNoteSpec = (draft?: { items: Array<{ description: string; quantity: string }>; notes: string }) => (job ? buildJobDeliveryNoteSpec({ title: documentTitles.JOB_DELIVERY_NOTE, jobLabel: jobDocLabel, job: job as unknown as JobDocJob, form, items: draft?.items, notes: draft?.notes }) : null);
  const partsListSpec = () => (job ? buildPartsListSpec({ title: documentTitles.PARTS_LIST, jobLabel: jobDocLabel, job: job as unknown as JobDocJob }) : null);
  const pickSlipSpec = (slip: { lines: { partNumber: string; supersededNumbers?: string; description: string | null; quantity: string; binLocationLabel: string | null }[] }) =>
    buildPickSlipSpec({ title: documentTitles.PICK_SLIP, jobLabel: jobDocLabel, lines: slip.lines });

  function printJobPickSlip(result: NonNullable<typeof pickSlipResult>["pickSlip"]): boolean {
    if (!result) return false;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return false; // popup blocked — nothing more we can do here
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
    const rows = result.lines
      .map((l) => `<tr><td>${esc(l.partNumber)}</td><td>${esc(l.supersededNumbers || "—")}</td><td>${esc(l.description || "")}</td><td class="qty">${esc(l.quantity)}</td><td class="qty"></td><td>${esc(l.binLocationLabel || "—")}</td></tr>`)
      .join("");
    const html = `<!doctype html><html><head><title>${esc(`${result.jobNumber || jobDocLabel} - ${documentTitles.PICK_SLIP}`)}</title><meta charset="utf-8" /><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827}
      h1{font-size:20px;margin:0 0 4px;color:#7a5c14;border-bottom:3px solid #7a5c14;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:18px}
      th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left}
      th{background:#f9fafb;border-bottom:2px solid #7a5c14}
      td.qty{text-align:center;font-weight:600}
    </style></head><body>
      <h1>${esc(documentTitles.PICK_SLIP)} — Job ${esc(result.jobNumber || "")}</h1>
      <table><thead><tr><th>Part number</th><th>Superseded no.</th><th>Description</th><th>Qty</th><th>Qty picked</th><th>Bin location</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    w.document.write(html);
    w.document.close();
    const doPrint = () => { try { w.focus(); w.print(); } catch { /* window may already be closed */ } };
    w.onload = doPrint;
    setTimeout(doPrint, 400);
    return true;
  }

  // 2026-09-16 — user request: "Add a Print Parts List button which
  // prints the complete parts lists table, with all headings." Mirrors
  // printJobPickSlip's own print-window pattern, but for the whole Parts
  // list table as it stands on screen (same columns/headings: Part
  // number, Description, Qty, Received, Order number, Supplier, Status)
  // rather than just what a pick slip picked.
  function printPartsList(): boolean {
    if (!job) return false;
    const w = window.open("", "_blank", "width=900,height=900");
    if (!w) return false; // popup blocked — nothing more we can do here
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
    const jobLabel = job.jobNumber || job.draftNumber || "";
    const rows = job.partLines
      .map((line) => {
        const quantity = decimalText(line.quantity);
        const received = decimalText(line.receivedQuantity ?? 0);
        const status = String(line.status || "").replaceAll("_", " ");
        return `<tr>
          <td>${esc(String(line.partNumber || ""))}</td>
          <td>${esc(String(line.description || ""))}</td>
          <td class="qty">${esc(quantity)}</td>
          <td class="qty">${esc(received)}</td>
          <td>${esc(String(line.orderNumber || ""))}</td>
          <td>${esc(String(line.orderedFromSupplier?.name || ""))}</td>
          <td>${esc(status)}</td>
        </tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><title>${esc(`${jobLabel} - ${documentTitles.PARTS_LIST}`)}</title><meta charset="utf-8" /><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827}
      h1{font-size:20px;margin:0 0 4px;color:#7a5c14;border-bottom:3px solid #7a5c14;padding-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:18px}
      th,td{border:1px solid #d1d5db;padding:7px 9px;text-align:left}
      th{background:#f9fafb;border-bottom:2px solid #7a5c14}
      td.qty{text-align:center;font-weight:600}
    </style></head><body>
      <h1>${esc(documentTitles.PARTS_LIST)} — Job ${esc(jobLabel)}</h1>
      <table><thead><tr><th>Part number</th><th>Description</th><th>Qty</th><th>Received</th><th>Order number</th><th>Supplier</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
    w.document.write(html);
    w.document.close();
    const doPrint = () => { try { w.focus(); w.print(); } catch { /* window may already be closed */ } };
    w.onload = doPrint;
    setTimeout(doPrint, 400);
    return true;
  }

  // 2026-09-29 — the persistent "Picking slips for this job" list (see
  // jobPickSlips' own comment above) — separate from load()/job's own GET
  // since PickSlip isn't part of the Job model's own nested includes.
  const loadJobPickSlips = useCallback(async () => {
    if (!jobId) return;
    setJobPickSlipsLoading(true); setJobPickSlipsError("");
    try {
      const r = await fetch(`/api/v1/inventory/pick-slips?jobId=${jobId}&pageSize=50`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to load picking slips.");
      setJobPickSlips(b.items || []);
    } catch (e) {
      setJobPickSlipsError(e instanceof Error ? e.message : "Unable to load picking slips.");
    } finally {
      setJobPickSlipsLoading(false);
    }
  }, [jobId]);
  useEffect(() => { void loadJobPickSlips(); }, [loadJobPickSlips]);

  async function createJobPickSlip() {
    if (!jobId) return;
    setCreatingPickSlip(true); setPickSlipError(""); setPickSlipResult(null);
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/pick-slip`, { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to create picking slip.");
      setPickSlipResult(b);
      await load(true);
      await loadJobPickSlips();
    } catch (e) {
      setPickSlipError(e instanceof Error ? e.message : "Unable to create picking slip.");
    } finally {
      setCreatingPickSlip(false);
    }
  }

  // 2026-09-29 — reverses a pick slip (the one just created above, via the
  // banner's own Cancel button, or an older one listed below via its row's
  // Cancel/Delete button): restores the stock it took and, where the part
  // line hasn't moved on since (see cancelPickSlip's own comment for the
  // "already marked received" case), rolls its Picked status back too.
  // Clears pickSlipResult on success if it was the one just cancelled, so
  // a stale banner (with now-dead Print/Cancel buttons) doesn't linger.
  // 2026-09-29 — user request: "deleted pickslips must delete completely
  // from the system." This permanently removes the pick slip (see
  // cancelPickSlip's own comment in inventory/service.ts) after restoring
  // the stock it took, so a confirm() guards it the same way Stock
  // Levels' own Delete button does — there's no "cancelled" state to fall
  // back into any more if this is clicked by mistake.
  async function cancelJobPickSlip(pickSlipId: string) {
    if (!(await confirm({ message: "Permanently delete this picking slip? It will be removed for good. (A slip only lists what to fetch — stock is taken when a part is marked received — so nothing moves unless the slip is an older one that already took stock, which is put back on the shelf.)", tone: "danger", confirmLabel: "Delete" }))) return;
    setCancellingPickSlipId(pickSlipId); setPickSlipError(""); setJobPickSlipsError("");
    try {
      const r = await fetch(`/api/v1/inventory/pick-slips/${pickSlipId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to delete picking slip.");
      if (pickSlipResult?.pickSlip?.id === pickSlipId) setPickSlipResult(null);
      await load(true);
      await loadJobPickSlips();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to delete picking slip.";
      setPickSlipError(message);
      setJobPickSlipsError(message);
    } finally {
      setCancellingPickSlipId(null);
    }
  }

  // Import a parts-list spreadsheet (.xlsx/.xls/.csv) — parsed server-side
  // by src/lib/jobs/parts-import.ts, same upload shape as the RFQ quote
  // file upload below (fileName/mimeType/contentBase64).
  async function importPartsFile(file: File): Promise<boolean> {
    if (!jobId) return false;
    setSaving(true); setError("");
    try {
      const contentBase64 = await fileToBase64(file);
      const r = await fetch(`/api/v1/jobs/${jobId}/parts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", contentBase64 }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to import parts file.");
      setPartsImportFile(null);
      await load(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to import parts file.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // 2026-10-01 — user request: "combine the 'Add / cross-check with stock'
  // button and 'import' button into one button called 'Add/Import Parts',
  // move the button below the choose file section." Those two buttons each
  // drove a separate input (the pasted bulkPartLines textarea vs. the
  // chosen partsImportFile) and separate handlers above — kept both
  // handlers as-is (still two different request payloads to the same
  // endpoint) and just added this single entry point: a file takes
  // priority when one's been chosen (it's the more deliberate action —
  // picking a file is a stronger signal than leftover pasted text), and
  // otherwise it falls back to the pasted lines.
  // 2026-10-06 — user request: "once the button add import parts is clicked,
  // close the add parts section automatically." Closes once the parts were
  // added/imported; if the server rejected them the section stays open so
  // what was typed or chosen isn't lost.
  async function addOrImportParts() {
    const ok = partsImportFile ? await importPartsFile(partsImportFile) : await addPartLines();
    if (ok) setShowAddParts(false);
  }

  // Downloads a blank CSV template for the parts-list import — matches the
  // columns parts-import.ts looks for (Part number / Qty / Description),
  // generated client-side (no network round-trip needed for a static
  // template) and triggered via a temporary anchor click, the standard way
  // to save generated same-origin content without a real download link.
  function downloadPartsTemplate() {
    const csv = "Part number,Qty,Description\nPN-1001,2,Hydraulic seal kit\nPN-2044,4,\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parts-list-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function receivePartLine(lineId: string) {
    if (!jobId || !receiveQty) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}/receive`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ receivedQty: Number(receiveQty), source: receiveSource }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to record received quantity.");
      setReceivingLineId(""); setReceiveQty(""); setReceiveSource("AUTO");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record received quantity.");
    } finally {
      setSaving(false);
    }
  }

  async function unreceivePartLine(lineId: string) {
    if (!jobId) return;
    await postAction(`/api/v1/jobs/${jobId}/parts/${lineId}/unreceive`, {});
  }

  async function removePartLineRow(lineId: string) {
    if (!jobId) return;
    await deleteAction(`/api/v1/jobs/${jobId}/parts/${lineId}`, {});
  }

  async function saveDescription(lineId: string) {
    if (!jobId) return;
    const description = window.prompt("Description")?.trim();
    if (!description) return;
    await patchAction(`/api/v1/jobs/${jobId}/parts/${lineId}`, { description });
  }

  // Editing the Order # cell directly in the table — matches ModApp's
  // PartLineOrderNumberField (always an editable input, no separate "edit
  // mode" click needed first). Keeps the currently-assigned supplier as-is
  // (the API resets orderedFromSupplierId to null whenever it isn't passed,
  // so it's always sent back unchanged here) — read fresh off jobRef at
  // save time, not passed in by the caller, so a supplier change queued
  // just ahead of this one (see queueRowSave) is picked up instead of a
  // stale value from whenever this save was scheduled.
  async function saveOrderNumberInline(lineId: string, value: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      const currentLine = jobRef.current?.partLines.find((l) => String(l.id) === lineId);
      const currentSupplierId = currentLine?.orderedFromSupplier?.id ? String(currentLine.orderedFromSupplier.id) : "";
      const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: value.trim() || null, orderedFromSupplierId: currentSupplierId || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save order number.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save order number.");
    } finally {
      setSaving(false);
    }
  }

  // 2026-10-05, user request: "if I pick one part which qty is 2, 1 from
  // stock and order the outstanding at another supplier, how does one work?"
  // Saves how many of the line's units are being ordered elsewhere. Like the
  // other two inline saves it resends the line's current order number and
  // supplier (the API clears either when left out), read fresh off jobRef.
  async function saveOrderedQtyInline(lineId: string, value: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      const currentLine = jobRef.current?.partLines.find((l) => String(l.id) === lineId);
      const currentOrderNumber = currentLine?.orderNumber ? String(currentLine.orderNumber) : "";
      const currentSupplierId = currentLine?.orderedFromSupplier?.id ? String(currentLine.orderedFromSupplier.id) : "";
      const trimmed = value.trim();
      const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: currentOrderNumber || null, orderedFromSupplierId: currentSupplierId || null, orderedQuantity: trimmed ? Number(trimmed) : null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save ordered quantity.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save ordered quantity.");
      await load(true);
    } finally {
      setSaving(false);
    }
  }

  // 2026-09-15, user request: "make that the supplier field is also
  // editable without clicking the change supplier button." Mirrors
  // saveOrderNumberInline exactly, the other way round: always resends the
  // line's *current* order number unchanged so picking a supplier never
  // clobbers a typed-in PO number — read fresh off jobRef at save time for
  // the same reason (see saveOrderNumberInline's comment). Closes the row's
  // picker (orderEditLineId) on completion — see that state's declaration
  // above for why this also matters for the double-click glitch fix.
  async function saveSupplierInline(lineId: string, supplierId: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      const currentLine = jobRef.current?.partLines.find((l) => String(l.id) === lineId);
      const currentOrderNumber = currentLine?.orderNumber ? String(currentLine.orderNumber) : "";
      const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: currentOrderNumber || null, orderedFromSupplierId: supplierId || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save supplier.");
      // 2026-10-05, user report: "removing a supplier and trying to type does
      // not pickup dropdown of suppliers." Closing the picker here ran AFTER
      // the save finished, so someone who cleared a supplier and went
      // straight on to type a new one had their typed text wiped and the
      // dropdown closed a moment later. Only picking a supplier (which
      // should close the picker) resets it now; clearing one leaves the
      // picker alone (the caller has already closed it where that is
      // wanted).
      if (supplierId) { setOrderEditLineId(""); setOrderSupplierId(""); setOrderSupplierQuery(""); setOrderSupplierOptions([]); }
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save supplier.");
    } finally {
      setSaving(false);
    }
  }

  // Bulk part-line update — 2026-09-15, user request: "Parts list table,
  // make it that bulk update can be done on the parts to add supplier and
  // order number, instead of one at a time." Fires the same PATCH the
  // single-row inline edits use, once per selected line, in parallel.
  // Leaving either field blank on the toolbar leaves that field unchanged
  // on every selected line (never clears it) — this is a "fill in what's
  // missing across many rows at once" tool, not a bulk-clear.
  async function applyBulkPartUpdate() {
    if (!jobId || bulkSelectedIds.size === 0) return;
    if (!bulkOrderNumber.trim() && !bulkSupplierId) { setError("Enter an order number and/or pick a supplier to apply."); return; }
    setBulkApplying(true); setError("");
    try {
      const ids = Array.from(bulkSelectedIds);
      const results = await Promise.all(ids.map(async (lineId) => {
        const line = job?.partLines.find((l) => String(l.id) === lineId);
        const body: Record<string, unknown> = {};
        if (bulkOrderNumber.trim()) body.orderNumber = bulkOrderNumber.trim();
        if (bulkSupplierId) body.orderedFromSupplierId = bulkSupplierId;
        // Always resend whichever of the two fields wasn't set on the
        // toolbar, unchanged, same "never omit means clear" API contract
        // the single-row inline edits work around.
        if (body.orderNumber === undefined) body.orderNumber = line?.orderNumber || null;
        if (body.orderedFromSupplierId === undefined) body.orderedFromSupplierId = line?.orderedFromSupplier?.id || null;
        const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return r.ok;
      }));
      const failed = results.filter((ok) => !ok).length;
      if (failed > 0) setError(`${failed} of ${ids.length} selected part line${ids.length === 1 ? "" : "s"} could not be updated.`);
      setBulkSelectedIds(new Set()); setBulkOrderNumber(""); setBulkSupplierId(""); setBulkSupplierQuery(""); setBulkSupplierOptions([]); setBulkSupplierPickerOpen(false);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to apply the bulk update.");
    } finally {
      setBulkApplying(false);
    }
  }

  // 2026-09-16 — user request: "Bulk update on parts in jobs, add a bulk
  // update to marking parts received." Same shape as applyBulkPartUpdate
  // above (fires the existing single-line action once per selected line,
  // in parallel) but calls the /receive endpoint each row's own "Mark
  // received" button already uses, defaulting to that line's full
  // outstanding quantity — same default the single-row button starts
  // with before anyone touches the quantity field. A line with nothing
  // outstanding (already fully received) is skipped, not treated as a
  // failure.
  async function applyBulkMarkReceived() {
    if (!jobId || bulkSelectedIds.size === 0) return;
    setBulkApplying(true); setError("");
    try {
      const ids = Array.from(bulkSelectedIds);
      const results = await Promise.all(ids.map(async (lineId) => {
        const line = job?.partLines.find((l) => String(l.id) === lineId);
        const outstanding = Math.max(0, Number(line?.quantity ?? 0) - Number(line?.receivedQuantity ?? 0));
        if (outstanding <= 0) return true;
        const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}/receive`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ receivedQty: outstanding }) });
        return r.ok;
      }));
      const failed = results.filter((ok) => !ok).length;
      if (failed > 0) setError(`${failed} of ${ids.length} selected part line${ids.length === 1 ? "" : "s"} could not be marked received.`);
      setBulkSelectedIds(new Set());
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to mark the selected part lines received.");
    } finally {
      setBulkApplying(false);
    }
  }

  // 2026-10-01 — user request: "When bulk updating of parts, allow to
  // delete all selected parts." Same shape as applyBulkPartUpdate/
  // applyBulkMarkReceived above (fires the existing single-line action —
  // removePartLineRow's own DELETE — once per selected line, in parallel),
  // but confirmed first since this one can't be undone (removePartLineRow's
  // own single-row "Remove" button has never asked, but deleting several
  // lines at once in one click is a bigger mistake to make silently).
  async function applyBulkDelete() {
    if (!jobId || bulkSelectedIds.size === 0) return;
    const ids = Array.from(bulkSelectedIds);
    if (!(await confirm({ message: `Delete ${ids.length} selected part line${ids.length === 1 ? "" : "s"}? This cannot be undone.`, tone: "danger", confirmLabel: "Delete" }))) return;
    setBulkApplying(true); setError("");
    try {
      const results = await Promise.all(ids.map(async (lineId) => {
        const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}`, { method: "DELETE" });
        return r.ok;
      }));
      const failed = results.filter((ok) => !ok).length;
      if (failed > 0) setError(`${failed} of ${ids.length} selected part line${ids.length === 1 ? "" : "s"} could not be deleted.`);
      setBulkSelectedIds(new Set());
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete the selected part lines.");
    } finally {
      setBulkApplying(false);
    }
  }

  // Outwork — send components out to a supplier for outwork (machining,
  // sandblasting, etc.) and track them until they come back.
  function addOutworkRow() {
    setOutworkLines((rows) => [...rows, { id: `row-${rows.length + 1}-${Date.now()}`, description: "", quantity: "1" }]);
  }
  function removeOutworkRow(id: string) {
    setOutworkLines((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  }
  function updateOutworkRow(id: string, field: "description" | "quantity", value: string) {
    setOutworkLines((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  // 2026-09-16 — "Record outwork supplier field, if not on list create new
  // supplier to allow outwork form to work." Without this, typing a
  // supplier that doesn't exist yet left outworkSupplierId empty forever —
  // Record outwork stays disabled (see its footer button below) with no
  // way to proceed short of leaving the drawer to add the supplier under
  // Suppliers first. POSTs just the name (every other field on
  // supplierCreateInput in master-data/validation.ts is optional) through
  // the same master-data endpoint the Suppliers page itself uses, then
  // treats the new supplier exactly like one picked from the search
  // results.
  async function createSupplierInline(name: string): Promise<{ id: string; name: string }> {
    const trimmed = name.trim();
    const r = await fetch("/api/v1/master-data/suppliers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: trimmed }) });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error?.message || "Unable to create supplier.");
    return { id: String(b.id), name: trimmed };
  }

  async function createOutworkSupplier() {
    if (outworkSupplierQuery.trim().length < 2) return;
    setOutworkCreatingSupplier(true); setError("");
    try {
      const created = await createSupplierInline(outworkSupplierQuery);
      setOutworkSupplierId(created.id); setOutworkSupplierQuery(created.name); setOutworkSupplierOptions([]); setOutworkSupplierPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create supplier.");
    } finally {
      setOutworkCreatingSupplier(false);
    }
  }

  async function createEditOutworkSupplier() {
    if (editOutworkSupplierQuery.trim().length < 2) return;
    setEditOutworkCreatingSupplier(true); setError("");
    try {
      const created = await createSupplierInline(editOutworkSupplierQuery);
      setEditOutworkSupplierId(created.id); setEditOutworkSupplierQuery(created.name); setEditOutworkSupplierOptions([]); setEditOutworkSupplierPickerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create supplier.");
    } finally {
      setEditOutworkCreatingSupplier(false);
    }
  }

  async function submitOutwork() {
    if (!jobId || !outworkSupplierId) return;
    const lines = outworkLines
      .map((r) => ({ description: r.description.trim(), quantity: Math.max(1, parseInt(r.quantity, 10) || 1) }))
      .filter((r) => r.description);
    if (lines.length === 0) { setError("Add at least one item with a description."); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/outwork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierId: outworkSupplierId, dateSentOut: outworkDateSentOut || null, lines }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to record outwork.");
      setOutworkSupplierId(""); setOutworkSupplierQuery(""); setOutworkSupplierOptions([]); setOutworkSupplierPickerOpen(false); setOutworkDateSentOut(""); setOutworkLines([{ id: "row-1", description: "", quantity: "1" }]);
      setShowOutworkPopup(false);
      await load(true);
      // jobRef (not the `job` state var) — same pattern autosave uses
      // elsewhere on this page — so this reads load()'s just-fetched data
      // synchronously, already carrying the supplier's address/VAT (see
      // the include added in jobs/service.ts), instead of the stale `job`
      // closure from before this batch existed.
      const freshItems = (jobRef.current?.outworkItems ?? []) as OutworkItemRow[];
      const batchItems = freshItems.filter((i) => i.batchId === b.batchId);
      if (batchItems.length > 0) buildDeliveryNote(batchItems[0], batchItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record outwork.");
    } finally {
      setSaving(false);
    }
  }

  async function markOutworkReceived(itemId: string) {
    if (!jobId) return;
    await postAction(`/api/v1/jobs/${jobId}/outwork/receive`, { itemIds: [itemId] });
  }

  async function unmarkOutworkReceived(itemId: string) {
    if (!jobId) return;
    await postAction(`/api/v1/jobs/${jobId}/outwork/${itemId}/unreceive`, {});
  }

  async function deleteOutworkRow(itemId: string) {
    if (!jobId) return;
    if (!(await confirm({ message: "Remove this outwork item?", tone: "danger", confirmLabel: "Remove" }))) return;
    await deleteAction(`/api/v1/jobs/${jobId}/outwork/${itemId}`, {});
  }

  // Attachments — new (see schema.prisma's JobAttachment comment). Upload
  // uses the same fileToBase64 helper as the parts-list import / RFQ quote
  // file uploads above; view/download opens a data: URL in a new tab, same
  // convention as viewQuoteFile below.
  async function uploadAttachment() {
    if (!jobId || !attachmentFile) return;
    setAttachmentUploading(true); setError("");
    try {
      const contentBase64 = await fileToBase64(attachmentFile);
      const r = await fetch(`/api/v1/jobs/${jobId}/attachments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: attachmentFile.name, mimeType: attachmentFile.type || "application/octet-stream", contentBase64, notes: attachmentNotes.trim() || null, tag: attachmentTag || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to upload attachment.");
      setAttachmentFile(null); setAttachmentNotes(""); setAttachmentTag("");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload attachment.");
    } finally {
      setAttachmentUploading(false);
    }
  }

  async function viewAttachment(attachmentId: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/attachments/${attachmentId}/file`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to open attachment.");
      if (!openFileInNewTab(b.mimeType, b.contentBase64)) setError("Enable pop-ups to view/download the attachment.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open attachment.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!jobId) return;
    if (!(await confirm({ message: "Remove this attachment?", tone: "danger", confirmLabel: "Remove" }))) return;
    await deleteAction(`/api/v1/jobs/${jobId}/attachments/${attachmentId}`, {});
  }

  // 2026-09-15, user request: "once a note is added [to an attachment],
  // allow a user to edit it as well." Separate savingAttachmentNotes flag
  // (not the shared `saving`), same reasoning as note-editing above.
  async function saveAttachmentNotes(attachmentId: string) {
    if (!jobId) return;
    setSavingAttachmentNotes(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/attachments/${attachmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: editingAttachmentNotes.trim() || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save the note.");
      setEditingAttachmentId(""); setEditingAttachmentNotes("");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the note.");
    } finally {
      setSavingAttachmentNotes(false);
    }
  }

  function startEditOutwork(item: OutworkItemRow) {
    setEditingOutworkId(String(item.id));
    setEditOutworkSupplierId(item.supplier?.id ? String(item.supplier.id) : "");
    setEditOutworkSupplierQuery(item.supplier?.name ? String(item.supplier.name) : "");
    setEditOutworkSupplierOptions([]);
    setEditOutworkSupplierPickerOpen(false);
    setEditOutworkDescription(item.description || "");
    setEditOutworkQuantity(decimalText(item.quantity));
    setEditOutworkDateSentOut(item.dateSentOut ? String(item.dateSentOut).slice(0, 10) : "");
    setEditOutworkDateReceived(item.dateReceived ? String(item.dateReceived).slice(0, 10) : "");
    setEditOutworkNotes(item.notes || "");
  }

  function cancelEditOutwork() {
    setEditingOutworkId(""); setEditOutworkSupplierId(""); setEditOutworkSupplierQuery(""); setEditOutworkSupplierOptions([]); setEditOutworkSupplierPickerOpen(false); setEditOutworkDescription(""); setEditOutworkQuantity("1"); setEditOutworkDateSentOut(""); setEditOutworkDateReceived(""); setEditOutworkNotes("");
  }

  async function saveOutworkEdit(itemId: string) {
    if (!jobId || !editOutworkSupplierId || !editOutworkDescription.trim()) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/outwork/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supplierId: editOutworkSupplierId,
          description: editOutworkDescription.trim(),
          quantity: Math.max(1, parseInt(editOutworkQuantity, 10) || 1),
          dateSentOut: editOutworkDateSentOut || null,
          dateReceived: editOutworkDateReceived || null,
          notes: editOutworkNotes.trim() || null,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save outwork item.");
      cancelEditOutwork();
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save outwork item.");
    } finally {
      setSaving(false);
    }
  }

  // Delivery note — unbranded, on-demand print view (no document-branding
  // subsystem in Apollo X, unlike ModApp's DeliveryNoteModal). Shown right
  // after a batch is recorded (see submitOutwork above) and also available
  // per historical item below — since 2026-09-09, OutworkItem rows carry a
  // batchId shared by everything submitted together (see schema.prisma's
  // OutworkItem comment), so clicking any item from a batch shows the
  // whole batch, the same way the transient note after submitting does.
  // Older items from before batchId existed have no batch to group by and
  // just show themselves.
  // Shared by openDeliveryNoteForItem (a historical item, already loaded
  // with its supplier's address/VAT — see the include in jobs/service.ts)
  // and submitOutwork below (which finds its just-created batch the same
  // way, once load(true) has refreshed job.outworkItems with that same
  // include). address is rendered as separate stacked lines rather than
  // one string, per the user's example ("Renjohn (Pty) Ltd / 123 Test
  // Street / Isando / Boksburg / 1401" — each its own line, blanks
  // dropped) — see printDeliveryNote/the on-screen preview below.
  function buildDeliveryNote(item: OutworkItemRow, batchItems: OutworkItemRow[]) {
    const address = item.supplier?.addresses?.[0];
    const addressLines = address ? [address.line1, address.line2, address.city, address.province, address.postalCode].filter((v): v is string => Boolean(v && String(v).trim())).map(String) : [];
    setDeliveryNote({
      jobNumber: job?.jobNumber || job?.draftNumber || "—",
      supplierName: item.supplier?.name ? String(item.supplier.name) : "—",
      supplierAddressLines: addressLines,
      supplierVat: item.supplier?.vatNumber ? String(item.supplier.vatNumber) : null,
      dateCaptured: item.dateSentOut ? String(item.dateSentOut) : null,
      make: form.machineMake || "",
      model: form.machineModel || "",
      serial: form.machineSerial || "",
      items: batchItems.map((i) => ({ description: i.description || "—", quantity: Number(i.quantity ?? 0) })),
    });
  }

  function openDeliveryNoteForItem(item: OutworkItemRow) {
    const batchItems = item.batchId ? job?.outworkItems.filter((i) => i.batchId === item.batchId) ?? [item] : [item];
    buildDeliveryNote(item, batchItems);
  }

  // Checked / Vehicle reg / Dispatched by & Received by (name, signature,
  // date) — added 2026-09-10 at the user's request. All blank lines for
  // the printed sheet to be completed by hand at dispatch and on receipt;
  // there's no digital-signature capture anywhere in Apollo X, and this
  // whole delivery note is itself an unpersisted, on-demand print view
  // (see the comment above), so nothing here is saved back.
  // 2026-09-16 — user request: embed the company logo in the print
  // window's HTML — a window.open("", "_blank") document has no real
  // origin of its own, so a plain relative <img src="/api/v1/company-
  // settings/logo"> wouldn't resolve.
  // 2026-09-19 — user report: "Fix logo display as its not pulling
  // through." Root cause: since the 2026-09-14 move to object-storage-
  // backed logos, GET /api/v1/company-settings/logo no longer streams
  // bytes itself — it redirects to a signed URL on the object-storage
  // host (see that route's own comment). This function used to fetch()
  // that URL and read the response as a blob to build a data: URL, which
  // meant following the redirect and reading a *cross-origin* response
  // body — blocked by the storage host's CORS policy (an <img> tag isn't
  // subject to that; only reading a cross-origin response's bytes via
  // fetch/canvas is), so the fetch silently failed and this always
  // returned null. Fixed by not fetching at all: just point a plain <img>
  // at the logo route's own *absolute* URL (still needed since the popup
  // has no origin of its own — see above) and let the browser follow the
  // redirect and render it the same way the sidebar's <Image> already
  // does. onerror on that <img> (in printDeliveryNote below) hides it if
  // there's genuinely no logo set (the route 404s), so no pre-check is
  // needed here.
  //
  // 2026-09-22 — user report: "Logo on delivery notes only pulls through
  // after you click close not on initial load." Root cause: the logo
  // <img> above still has to make its OWN network round trip (fetch the
  // logo route, follow its redirect to the signed object-storage URL,
  // download the bytes) after the print window's HTML is written — but
  // both printDeliveryNote and printJobDeliveryNote below used to call
  // win.print() immediately after win.document.close(), with no wait for
  // that image to actually finish loading. The browser's print
  // preview/dialog then rendered whatever was on screen at that instant —
  // almost always the logo's spot still blank — and the image only
  // finished loading a moment later, in the background, invisible until
  // the print dialog was dismissed ("click close") and the page underneath
  // was looked at again. Fixed at the call sites: an inline
  // `window.onload = () => window.print()` script is now written into the
  // print document itself instead of calling win.print() from here
  // straight after document.close(). The browser's `load` event doesn't
  // fire until every resource on the page — including this <img>, whether
  // it loads OR errors out — has finished, so the logo (when there is one)
  // is always actually painted before the print dialog opens.
  function companyLogoImgSrc(): string {
    return `${window.location.origin}/api/v1/company-settings/logo`;
  }

  // 2026-09-19 — user request: print the company's own organization
  // details (name, address, VAT, registration number, contact, email) on
  // the delivery note. See getCompanyPrintDetails's own comment
  // (company-settings-service.ts) for why this is its own lightweight,
  // non-admin-gated endpoint rather than /api/v1/company-settings.
  async function fetchCompanyOrgDetails(): Promise<{ name: string; addressLines: string[]; registrationNumber: string | null; vatNumber: string | null; contact: string | null; email: string | null } | null> {
    try {
      const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  async function printDeliveryNote(): Promise<boolean> {
    if (!deliveryNote) return false;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the delivery note."); return false; }
    const logoSrc = companyLogoImgSrc();
    const orgDetails = await fetchCompanyOrgDetails();
    const orgDetailsHtml = orgDetails ? `<div class="org-details">
        <p class="org-name">${escapeHtml(orgDetails.name)}</p>
        ${orgDetails.addressLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
        ${orgDetails.registrationNumber ? `<p>Reg: ${escapeHtml(orgDetails.registrationNumber)}</p>` : ""}
        ${orgDetails.vatNumber ? `<p>VAT: ${escapeHtml(orgDetails.vatNumber)}</p>` : ""}
        ${orgDetails.contact ? `<p>${escapeHtml(orgDetails.contact)}</p>` : ""}
        ${orgDetails.email ? `<p>${escapeHtml(orgDetails.email)}</p>` : ""}
      </div>` : "";
    const rows = deliveryNote.items.map((i) => `<tr><td>${escapeHtml(i.description)}</td><td>${i.quantity}</td><td class="checked-box"></td></tr>`).join("");
    // 2026-09-16 — user request: remove the "Supplier: " label and print
    // the supplier's own block instead (bold name, address lines stacked,
    // then VAT) — see buildDeliveryNote above for how supplierAddressLines
    // is built from the supplier's primary address. "Date sent out" is
    // relabeled "Date captured" and moved to sit under the job number
    // (previously a standalone line under "Supplier:").
    const addressRows = deliveryNote.supplierAddressLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
    const vatRow = deliveryNote.supplierVat ? `<p>VAT: ${escapeHtml(deliveryNote.supplierVat)}</p>` : "";
    const dateCapturedText = deliveryNote.dateCaptured ? new Date(deliveryNote.dateCaptured).toLocaleDateString("en-ZA") : "—";
    // File save-as name — user request: "when generating outwork file,
    // save file as eg: JobNumber - Outwork - Supplier". The browser's
    // Print > Save as PDF dialog defaults the filename to the document
    // title, so this is set here rather than anywhere the file is written
    // (this print view never writes a file itself — see the comment on
    // printDeliveryNote's neighbour, printJobCard, below).
    const noteTitle = `${deliveryNote.jobNumber} - ${documentTitles.OUTWORK_DELIVERY_NOTE} - ${deliveryNote.supplierName}`;
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(noteTitle)}</title><meta charset="utf-8" /><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111}
      .note-head{display:flex;justify-content:space-between;align-items:flex-start}
      h1{font-size:18px;margin:0 0 12px}
      .note-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
      .logo{max-height:80px;max-width:240px;object-fit:contain;margin-bottom:2px}
      .org-details{text-align:left;margin-bottom:6px}
      .org-details .org-name{font-weight:bold;font-size:13px;color:#111;margin:0 0 2px}
      .org-details p{font-size:11px;color:#444;margin:1px 0}
      .job-number{font-size:16px;font-weight:bold;text-align:right}
      .date-captured{font-size:13px;color:#444;text-align:right}
      .supplier-block{margin-top:14px}
      .supplier-name{font-weight:bold;font-size:14px;margin:0 0 2px}
      .supplier-block p{font-size:13px;color:#444;margin:1px 0}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}
      .checked-box{width:60px;text-align:center}
      .machine-line{margin:14px 0 0;font-size:11px;font-weight:bold;color:#111}
      .machine-line span{margin-right:28px}
      .vehicle-reg{margin-top:28px;font-size:13px}
      .vehicle-reg .line{display:inline-block;min-width:220px;border-bottom:1px solid #111;margin-left:8px}
      .sign-blocks{display:flex;gap:40px;margin-top:36px}
      .sign-block{flex:1}
      .sign-block h2{font-size:13px;margin:0 0 18px}
      .sign-block .field{font-size:13px;margin-top:22px;border-bottom:1px solid #111;padding-bottom:4px}
    </style></head><body>
      <div class="note-head">
        <h1>${escapeHtml(documentTitles.OUTWORK_DELIVERY_NOTE)}</h1>
        <div class="note-right">
          <img class="logo" src="${logoSrc}" alt="" onerror="this.style.display='none'" />
          ${orgDetailsHtml}
          <div class="job-number">Job ${escapeHtml(deliveryNote.jobNumber)}</div>
          <div class="date-captured">Date captured: ${dateCapturedText}</div>
        </div>
      </div>
      <div class="supplier-block">
        <p class="supplier-name">${escapeHtml(deliveryNote.supplierName)}</p>
        ${addressRows}
        ${vatRow}
      </div>
      <p class="machine-line"><span>Make: ${escapeHtml(deliveryNote.make) || "—"}</span><span>Model: ${escapeHtml(deliveryNote.model) || "—"}</span><span>Serial: ${escapeHtml(deliveryNote.serial) || "—"}</span></p>
      <table><thead><tr><th>Description</th><th>Quantity</th><th>Checked</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="vehicle-reg">Vehicle reg:<span class="line">&nbsp;</span></p>
      <div class="sign-blocks">
        <div class="sign-block">
          <h2>Dispatched by</h2>
          <div class="field">Name</div>
          <div class="field">Signature</div>
          <div class="field">Date</div>
        </div>
        <div class="sign-block">
          <h2>Received by</h2>
          <div class="field">Name</div>
          <div class="field">Signature</div>
          <div class="field">Date</div>
        </div>
      </div>
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`);
    win.document.close();
    win.focus();
    return true;
  }

  // Mechanic's job card (2026-09-14, user request: "Create a job card
  // button which prints related fields for inhouse mechanics, do not
  // include client name"). Same unpersisted, on-demand print-window
  // pattern as printDeliveryNote above. Field scope is the user's own
  // answer to the clarifying question this feature raised — "Date in,
  // machine component details, job details" — deliberately excludes the
  // customer/client name (the explicit instruction), and also excludes
  // notes, the parts list and outwork/RFQ status, none of which the user
  // picked. "Date in" is form.dateReceived — the only field on the page
  // actually labelled "Date in" (Customer details panel).
  // 2026-09-29 — user request: "make the date in field 50% width of the
  // page, make the machine component details also 50% width of the page,
  // make the Job details section as follows: job type 50% width, job
  // description heading on its own line with field details below it."
  // .half-width constrains each of those tables to half the page rather
  // than the full-width tables every other print view uses — a deliberate
  // departure just for this one document. Job description is pulled out of
  // the label/value table entirely (previously a <tr><th>/<td> row) into
  // its own heading + a plain full-width block below it, matching "on its
  // own line ... below it" literally. Component type dropped from the
  // Machine/component table — see the "Component type" removal comment on
  // the on-screen field above.
  function printJobCard(): boolean {
    if (!job) return false;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the job card."); return false; }
    const fmt = (value: string) => value ? new Date(value).toLocaleDateString("en-ZA") : "—";
    const rows = (pairs: Array<[string, string]>) => pairs.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(`${job.jobNumber || job.draftNumber || ""} - ${documentTitles.JOB_CARD}`)}</title><meta charset="utf-8" /><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111}
      .note-head{display:flex;justify-content:space-between;align-items:flex-start}
      h1{font-size:18px;margin:0 0 12px}
      h2{font-size:13px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.04em;color:#555}
      h3{font-size:13px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#555}
      .job-number{font-size:16px;font-weight:bold;text-align:right}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:7px 9px;text-align:left;font-size:13px}
      th{width:38%;background:#f6f6f6;font-weight:600}
      .description{white-space:pre-wrap}
      .half-width{width:50%}
      .description-block{white-space:pre-wrap;border:1px solid #ccc;padding:8px 9px;font-size:13px}
    </style></head><body>
      <div class="note-head">
        <h1>${escapeHtml(documentTitles.JOB_CARD)} — for workshop use</h1>
        <div class="job-number">Job ${escapeHtml(String(job.jobNumber || job.draftNumber || "—"))}</div>
      </div>
      <h2>Date in</h2>
      <div class="half-width"><table>${rows([["Date in", fmt(form.dateReceived)]])}</table></div>
      <h2>Machine / component details</h2>
      <div class="half-width"><table>${rows([
        ["Machine make", form.machineMake],
        ["Machine model", form.machineModel],
        ["Machine serial", form.machineSerial],
        ["Component", form.component],
        ["Component serial", form.componentSerial],
        ["Part number", form.componentPartNumber],
        ["Plant number", form.plantNumber],
        ["Machine hours", form.machineHours],
      ])}</table></div>
      <h2>Job details</h2>
      <div class="half-width"><table>${rows([["Job type", JOB_TYPE_LABELS[job.type]]])}</table></div>
      <h3>Job description</h3>
      <div class="description-block">${escapeHtml(form.description || "—")}</div>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    return true;
  }

  // 2026-09-19 — user request: "add a button 'Print Job History' that
  // prints all fields as displayed on the job, parts, outwork except
  // history." Despite the button's name (kept exactly as the user asked
  // for it), this deliberately excludes the Activity history section
  // further down this page — "except history" in the same request. Covers
  // every other on-screen section: Customer details, Notes, Machine/
  // component details, Job details, Commercial & logistics, the Parts
  // list table and the Outwork table, plus the job-type-specific panels
  // (Field service / Warranty) when they apply to this job — all of it is
  // "fields as displayed on the job" the same way those other sections
  // are. Follows the same unpersisted, on-demand print-window pattern as
  // printJobCard/printDeliveryNote/printPartsList above/below — nothing
  // here is saved, it only reads the already-loaded `job`/`form` state.
  // 2026-09-29 — user request: "Make Customer details and Machine component
  // details sections next to each other, Job Details and commercial &
  // logistics sections next to each other, Parts List on its own page
  // followed by outwork, Add company logo to top right (sizing consistant
  // with all logos)." The two side-by-side pairs use the same .two-col
  // flex wrapper; Notes and the Field service/Warranty panels (which used
  // to sit between/after those sections) keep their previous relative
  // order, just now sitting between the two .two-col blocks (or after the
  // second) as full-width sections rather than between individual tables.
  // Parts list gets a real page-break-before so it always starts a fresh
  // sheet; Outwork has no break of its own, so it simply continues on that
  // same page after Parts list. Logo/org details use the same markup and
  // sizing as printDeliveryNote/printJobDeliveryNote for consistency (this
  // view previously had neither) — this function is now async to fetch
  // them, and uses the same window.onload-triggers-print pattern as those
  // two (see companyLogoImgSrc's comment) since it now has an image that
  // needs to finish loading before the print dialog opens.
  async function printJobHistory(): Promise<boolean> {
    if (!job) return false;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the job record."); return false; }
    const fmt = (value: string) => value ? new Date(value).toLocaleDateString("en-ZA") : "—";
    const jobLabel = job.jobNumber || job.draftNumber || "";
    const logoSrc = companyLogoImgSrc();
    const orgDetails = await fetchCompanyOrgDetails();
    const orgDetailsHtml = orgDetails ? `<div class="org-details">
        <p class="org-name">${escapeHtml(orgDetails.name)}</p>
        ${orgDetails.addressLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
        ${orgDetails.registrationNumber ? `<p>Reg: ${escapeHtml(orgDetails.registrationNumber)}</p>` : ""}
        ${orgDetails.vatNumber ? `<p>VAT: ${escapeHtml(orgDetails.vatNumber)}</p>` : ""}
        ${orgDetails.contact ? `<p>${escapeHtml(orgDetails.contact)}</p>` : ""}
        ${orgDetails.email ? `<p>${escapeHtml(orgDetails.email)}</p>` : ""}
      </div>` : "";
    const rows = (pairs: Array<[string, string]>) => pairs.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`).join("");
    const address = (job.customer?.addresses || [])[0] as Record<string, unknown> | undefined;
    const addressLine = address ? [address.line1, address.line2, address.city, address.province, address.postalCode].filter(Boolean).map(String).join(", ") : "";
    const contact = (job.customer?.contacts || [])[0] as Record<string, unknown> | undefined;
    const contactLine = contact ? [[contact.firstName, contact.lastName].filter(Boolean).join(" "), contact.telephone || contact.mobile, contact.email].filter(Boolean).map(String).join(" · ") : "";
    const partsRows = job.partLines.map((line) => `<tr>
        <td>${escapeHtml(String(line.partNumber || ""))}</td>
        <td>${escapeHtml(String(line.description || ""))}</td>
        <td class="qty">${escapeHtml(decimalText(line.quantity))}</td>
        <td class="qty">${escapeHtml(decimalText(line.receivedQuantity ?? 0))}</td>
        <td>${escapeHtml(String(line.orderNumber || "—"))}</td>
        <td>${escapeHtml(String(line.orderedFromSupplier?.name || "—"))}</td>
        <td>${escapeHtml(String(line.status || "").replaceAll("_", " "))}</td>
      </tr>`).join("");
    const outworkRows = job.outworkItems.map((item) => `<tr>
        <td>${escapeHtml(String(item.description || ""))}</td>
        <td class="qty">${escapeHtml(String(item.quantity ?? ""))}</td>
        <td>${escapeHtml(String(item.supplier?.name || "—"))}</td>
        <td>${fmt(String(item.dateSentOut || ""))}</td>
        <td>${fmt(String(item.dateReceived || ""))}</td>
        <td>${escapeHtml(String(item.status || "").replaceAll("_", " "))}</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(`${jobLabel} - ${documentTitles.JOB_HISTORY}`)}</title><meta charset="utf-8" /><style>
      /* 2026-09-29 — user request: "fit all sections on one page, dont let
         overflow; move logo above job record heading." Padding, table cell
         padding, heading margins and font sizes are all tightened from the
         original (which matched printJobCard/printJobDeliveryNote's own
         sizing) specifically for this view — it has more sections on one
         sheet than any other print in this file (Customer + Machine,
         Job details + Commercial, plus the conditional Notes/Field
         service/Warranty blocks, all before Parts list's own page break —
         see .page-break below, unchanged from the earlier request). h2
         keeps page-break-after:avoid and .two-col/table keep
         page-break-inside:avoid so a heading or a table doesn't get split
         right at a page boundary if the content does still run long. */
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111;font-size:12px}
      .note-head{display:flex;justify-content:space-between;align-items:flex-start}
      h1{font-size:17px;margin:0 0 8px}
      h2{font-size:12px;margin:12px 0 5px;text-transform:uppercase;letter-spacing:.04em;color:#555;page-break-after:avoid}
      .note-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
      .logo{max-height:70px;max-width:220px;object-fit:contain;margin-bottom:8px;display:block}
      .org-details{text-align:left;margin-bottom:4px}
      .org-details .org-name{font-weight:bold;font-size:12px;color:#111;margin:0 0 2px}
      .org-details p{font-size:10px;color:#444;margin:0}
      .job-number{font-size:15px;font-weight:bold;text-align:right}
      table{width:100%;border-collapse:collapse;page-break-inside:avoid}
      th,td{border:1px solid #ccc;padding:4px 7px;text-align:left;font-size:12px}
      th{width:32%;background:#f6f6f6;font-weight:600}
      .description{white-space:pre-wrap}
      table.list-table th{width:auto;background:#f9fafb;border-bottom:2px solid #7a5c14}
      table.list-table td.qty{text-align:center;font-weight:600}
      table.list-table{font-size:11px}
      .two-col{display:flex;gap:18px;align-items:flex-start;page-break-inside:avoid}
      .two-col > div{flex:1;min-width:0}
      .page-break{page-break-before:always}
    </style></head><body>
      <img class="logo" src="${logoSrc}" alt="" onerror="this.style.display='none'" />
      <div class="note-head">
        <h1>${escapeHtml(documentTitles.JOB_HISTORY)}</h1>
        <div class="note-right">
          ${orgDetailsHtml}
          <div class="job-number">Job ${escapeHtml(String(jobLabel))}</div>
        </div>
      </div>
      <div class="two-col">
        <div>
          <h2>Customer details</h2>
          <table>${rows([
            ["Customer", String(job.customer?.name || "")],
            ["Trading name", String(job.customer?.tradingName || "")],
            ["Address", addressLine],
            ["Contact", contactLine],
            ["Date in", fmt(form.dateReceived)],
            ["Customer reference", form.customerReference],
            ["Sales representative", String(salesRepresentatives.find((s) => s.id === form.salesRepresentativeId)?.label || "—")],
            ["Report number", form.reportNumber],
          ])}</table>
        </div>
        <div>
          <h2>Machine / component details</h2>
          <table>${rows([
            ["Machine make", form.machineMake],
            ["Machine model", form.machineModel],
            ["Machine serial", form.machineSerial],
            ["Component", form.component],
            ["Component serial", form.componentSerial],
            ["Part number", form.componentPartNumber],
            ["Plant number", form.plantNumber],
            ["Machine hours", form.machineHours],
          ])}</table>
        </div>
      </div>
      ${form.notes ? `<h2>Notes</h2><table><tr><td class="description">${escapeHtml(form.notes)}</td></tr></table>` : ""}
      <div class="two-col">
        <div>
          <h2>Job details</h2>
          <table>
            ${rows([
              ["Job type", JOB_TYPE_LABELS[job.type]],
              ["Status", JOB_STATUS_LABELS[job.status]],
              ["ETA date", fmt(form.etaDate)],
              ["Mechanic ETA date", fmt(form.mechanicEtaDate)],
              ["Mechanic strip", String(mechanics.find((m) => m.id === form.stripMechanicId)?.label || "—")],
              ["Mechanic assemble", String(mechanics.find((m) => m.id === form.buildMechanicId)?.label || "—")],
              ["Import tracking number", form.importTrackingNumber],
              ["Previous job number", form.previousJobNumber],
            ])}
            <tr><th>Job description</th><td class="description">${escapeHtml(form.description || "—")}</td></tr>
          </table>
        </div>
        <div>
          <h2>Commercial &amp; logistics</h2>
          <table>${rows([
            ["Quote number", form.quoteNumber],
            ["Quote date", fmt(form.quoteDate)],
            ["Sales order number", form.salesOrderNumber],
            ["Sales order date", fmt(form.salesOrderDate)],
            ["Invoice number", form.invoiceNumber],
            ["Invoice date", fmt(form.invoiceDate)],
            ["Payment date received", form.paymentNotApplicable === "true" ? "N/A" : fmt(form.paymentDateReceived)],
            ["Purchase order number", form.purchaseOrderNumber],
            ["Purchase order date", fmt(form.purchaseOrderDate)],
            ["Purchase order status", form.purchaseOrderStatus.replaceAll("_", " ")],
            ["Receiving transport", form.receivingTransport.replaceAll("_", " ")],
            ["Delivery type", form.deliveryType.replaceAll("_", " ")],
            ["Delivery date", fmt(form.deliveryDate)],
          ])}</table>
        </div>
      </div>
      ${job.type === "FIELD_SERVICE" ? `<h2>Field service</h2><table>${rows([
        ["Site", form.fieldSite],
        ["Technician", form.fieldTechnician],
        ["Vehicle", form.fieldVehicle],
        ["Hours", form.fieldHours],
        ["Kms travelled", form.kmsTravelled],
      ])}<tr><th>Report</th><td class="description">${escapeHtml(form.fieldReport || "—")}</td></tr></table>` : ""}
      ${job.type === "WARRANTY" ? `<h2>Warranty</h2><table>${rows([
        ["Warranty status", form.warrantyStatus],
        ["Historical source status", form.warrantyHistorical],
      ])}<tr><th>Warranty notes</th><td class="description">${escapeHtml(form.warrantyNotes || "—")}</td></tr></table>` : ""}
      <div class="page-break">
        <h2>Parts list</h2>
        ${job.partLines.length > 0
          ? `<table class="list-table"><thead><tr><th>Part number</th><th>Description</th><th>Qty</th><th>Received</th><th>Order number</th><th>Supplier</th><th>Status</th></tr></thead><tbody>${partsRows}</tbody></table>`
          : `<p>No parts on this job.</p>`}
      </div>
      <h2>Outwork</h2>
      ${job.outworkItems.length > 0
        ? `<table class="list-table"><thead><tr><th>Description</th><th>Qty</th><th>Supplier</th><th>Date sent out</th><th>Date received</th><th>Status</th></tr></thead><tbody>${outworkRows}</tbody></table>`
        : `<p>No outwork on this job.</p>`}
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`);
    win.document.close();
    win.focus();
    return true;
  }

  // 2026-09-19 — user request: "add a button 'Print Delivery Note' that
  // prints: Customer Details; Commercial & Logistics; on its own separate
  // line print: job Type, Make, Model; next line print: Component."
  // Distinct from printDeliveryNote above (that one is the *outwork*
  // delivery note — a supplier-facing document for parts sent out for
  // outwork). This one is job-facing: what's being delivered, to whom,
  // and what it is. Same letterhead (logo + org details) as the outwork
  // note for visual consistency between the two printed documents.
  //
  // 2026-09-29 — user request: "Make Customer details and commercial &
  // logistics sections next to each other; customer details section and
  // commercial logistics sections to be same as outwork delivery note
  // format; Remove Job Type; add table like outwork delivery note that
  // capturers the following, under the description field (Make, Model,
  // Component, Serial) Qty field (will be editable by user before
  // printing, Checked column will fall away on this delivery note; add
  // signature fields like outwork delivery note; move the delivery date
  // field to below the job number." Reworked from the label/value tables
  // above into the same plain stacked-line ".info-block" style
  // printDeliveryNote uses for its supplier block (bold heading line, then
  // plain text lines, no table borders) — the two blocks now sit side by
  // side via the same .two-col wrapper printJobHistory uses. The old
  // "Job type / Make / Model" + "Component" summary lines are gone
  // entirely, replaced by the new items table below (which already covers
  // Make/Model/Component/Serial) — that's what "Remove Job Type" and the
  // new table are, together. Since Qty must stay editable *before*
  // printing, this is the one print view in this file that does NOT
  // auto-print on window.onload (see the other three above) — it opens
  // with an on-screen "Print delivery note" button (.no-print, hidden in
  // the actual printed output) instead, so the person can type a quantity
  // first and print only when ready.
  // 2026-10-06 — user request: "on print delivery note, allow to add
  // additional line items." Print Delivery Note now opens this small editor
  // first: the first line is the machine/component description (as before),
  // more lines can be added, and notes can be typed. The same lines and notes
  // go to the print window and to the saved PDF.
  function openJobDeliveryNoteDialog() {
    if (!job) return;
    const description = [form.machineMake, form.machineModel, form.component, form.componentSerial].filter(Boolean).join(" · ");
    setJobDnDraft({ items: [{ description, quantity: "1" }], notes: "" });
  }

  async function printJobDeliveryNote(draft: { items: Array<{ description: string; quantity: string }>; notes: string }): Promise<boolean> {
    if (!job) return false;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the delivery note."); return false; }
    const fmt = (value: string) => value ? new Date(value).toLocaleDateString("en-ZA") : "—";
    const jobLabel = job.jobNumber || job.draftNumber || "";
    const logoSrc = companyLogoImgSrc();
    const orgDetails = await fetchCompanyOrgDetails();
    const orgDetailsHtml = orgDetails ? `<div class="org-details">
        <p class="org-name">${escapeHtml(orgDetails.name)}</p>
        ${orgDetails.addressLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
        ${orgDetails.registrationNumber ? `<p>Reg: ${escapeHtml(orgDetails.registrationNumber)}</p>` : ""}
        ${orgDetails.vatNumber ? `<p>VAT: ${escapeHtml(orgDetails.vatNumber)}</p>` : ""}
        ${orgDetails.contact ? `<p>${escapeHtml(orgDetails.contact)}</p>` : ""}
        ${orgDetails.email ? `<p>${escapeHtml(orgDetails.email)}</p>` : ""}
      </div>` : "";
    const address = job.customer?.addresses?.[0] as Record<string, unknown> | undefined;
    const customerAddressLines = address
      ? [address.line1, address.line2, address.city, address.province, address.postalCode].filter((v): v is string => Boolean(v && String(v).trim())).map(String)
      : [];
    const contact = (job.customer?.contacts || [])[0] as Record<string, unknown> | undefined;
    const contactLine = contact ? [[contact.firstName, contact.lastName].filter(Boolean).join(" "), contact.telephone || contact.mobile, contact.email].filter(Boolean).map(String).join(" · ") : "";
    const commercialLines: string[] = [];
    if (form.quoteNumber) commercialLines.push(`Quote number: ${escapeHtml(form.quoteNumber)}`);
    if (form.salesOrderNumber) commercialLines.push(`Sales order number: ${escapeHtml(form.salesOrderNumber)}`);
    if (form.invoiceNumber) commercialLines.push(`Invoice number: ${escapeHtml(form.invoiceNumber)}`);
    if (form.purchaseOrderNumber) commercialLines.push(`Purchase order number: ${escapeHtml(form.purchaseOrderNumber)}`);
    if (form.deliveryType) commercialLines.push(`Delivery type: ${escapeHtml(form.deliveryType.replaceAll("_", " "))}`);
    // 2026-09-29 — user request: "Description field, make model component
    // serial to be on same line without the field labels." Was one <br />
    // separated line per field, each prefixed with its own label ("Make:
    // X"); now a single line, values only, "·" separated — same separator
    // convention as contactLine above and the Job Kit applicability line
    // elsewhere in this file (kit.machineMake/kit.machineModel/
    // kit.componentType joined the same way).
    const itemRows = draft.items
      .filter((item) => item.description.trim() || item.quantity.trim())
      .map((item) => `<tr><td>${escapeHtml(item.description)}</td><td class="qty-col">${escapeHtml(item.quantity)}</td></tr>`)
      .join("");
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(`${jobLabel} - ${documentTitles.JOB_DELIVERY_NOTE}`)}</title><meta charset="utf-8" /><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111}
      .note-head{display:flex;justify-content:space-between;align-items:flex-start}
      h1{font-size:18px;margin:0 0 12px}
      h2{font-size:13px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.04em;color:#555}
      .note-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
      .logo{max-height:80px;max-width:240px;object-fit:contain;margin-bottom:2px}
      .org-details{text-align:left;margin-bottom:6px}
      .org-details .org-name{font-weight:bold;font-size:13px;color:#111;margin:0 0 2px}
      .org-details p{font-size:11px;color:#444;margin:1px 0}
      .job-number{font-size:16px;font-weight:bold;text-align:right}
      .date-captured{font-size:13px;color:#444;text-align:right}
      .two-col{display:flex;gap:24px;align-items:flex-start;margin-top:14px}
      .two-col > div{flex:1;min-width:0}
      .info-block .block-name{font-weight:bold;font-size:14px;margin:0 0 2px}
      .info-block p{font-size:13px;color:#444;margin:1px 0}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}
      .qty-col{width:90px;text-align:center}
      .qty-input{width:64px;font-size:13px;border:1px solid #999;padding:3px;text-align:center}
      .description-input{width:100%;font-size:13px;border:1px solid #999;padding:3px;box-sizing:border-box;font-family:inherit}
      .notes-block{margin-top:18px}
      .notes-static{width:100%;min-height:70px;font-size:13px;border:1px solid #999;padding:6px;box-sizing:border-box;white-space:pre-wrap}
      .sign-blocks{display:flex;gap:40px;margin-top:36px}
      .sign-block{flex:1}
      .sign-block h2{font-size:13px;margin:0 0 18px}
      .sign-block .field{font-size:13px;margin-top:22px;border-bottom:1px solid #111;padding-bottom:4px}
      .no-print-bar{display:flex;justify-content:space-between;align-items:center;background:#f6f6f6;border:1px solid #ddd;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:#444}
      .print-btn{background:#155fca;color:#fff;border:none;border-radius:5px;padding:8px 16px;font-size:13px;cursor:pointer}
      @media print{.no-print{display:none}}
    </style></head><body>
      <div class="no-print-bar no-print">
        <span>Check the delivery note, then print.</span>
        <button type="button" class="print-btn" onclick="window.print()">Print delivery note</button>
      </div>
      <div class="note-head">
        <h1>${escapeHtml(documentTitles.JOB_DELIVERY_NOTE)}</h1>
        <div class="note-right">
          <img class="logo" src="${logoSrc}" alt="" onerror="this.style.display='none'" />
          ${orgDetailsHtml}
          <div class="job-number">Job ${escapeHtml(String(jobLabel))}</div>
          <div class="date-captured">Delivery date: ${fmt(form.deliveryDate)}</div>
        </div>
      </div>
      <div class="two-col">
        <div class="info-block">
          <h2>Customer details</h2>
          <p class="block-name">${escapeHtml(String(job.customer?.name || "—"))}</p>
          ${job.customer?.tradingName ? `<p>${escapeHtml(String(job.customer.tradingName))}</p>` : ""}
          ${customerAddressLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}
          ${contactLine ? `<p>${escapeHtml(contactLine)}</p>` : ""}
        </div>
        <div class="info-block">
          <h2>Commercial &amp; logistics</h2>
          ${commercialLines.length > 0 ? commercialLines.map((l) => `<p>${l}</p>`).join("") : "<p>—</p>"}
        </div>
      </div>
      <table><thead><tr><th>Description</th><th class="qty-col">Qty</th></tr></thead><tbody>
        ${itemRows}
      </tbody></table>
      <div class="notes-block">
        <h2>Notes</h2>
        <div class="notes-static">${escapeHtml(draft.notes)}</div>
      </div>
      <div class="sign-blocks">
        <div class="sign-block">
          <h2>Dispatched by</h2>
          <div class="field">Name</div>
          <div class="field">Signature</div>
          <div class="field">Date</div>
        </div>
        <div class="sign-block">
          <h2>Received by</h2>
          <div class="field">Name</div>
          <div class="field">Signature</div>
          <div class="field">Date</div>
        </div>
      </div>
    </body></html>`);
    win.document.close();
    win.focus();
    return true;
  }

  // RFQ (request for quote) — see schema.prisma's JobRfqRequest comment for
  // scope: no email is sent, prices are entered by hand from what the
  // supplier came back with (phone, email, PDF — however it arrived).
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
      reader.readAsDataURL(file);
    });
  }

  async function requestRfq() {
    if (!jobId || !rfqSupplierId) return;
    const attachment = rfqAttachmentFile
      ? { attachmentFileName: rfqAttachmentFile.name, attachmentMimeType: rfqAttachmentFile.type || "application/octet-stream", attachmentContentBase64: await fileToBase64(rfqAttachmentFile) }
      : {};
    await postAction(`/api/v1/jobs/${jobId}/rfq`, { supplierId: rfqSupplierId, sendEmail: rfqSendEmail, ...attachment });
    setRfqSupplierId(""); setRfqSupplierQuery(""); setRfqSupplierOptions([]); setRfqSupplierPickerOpen(false); setRfqSendEmail(true);
    // The attachment is deliberately kept: the same file usually goes to every supplier. Remove it with the Remove button.
  }

  // Inline "create a new supplier" from the RFQ panel — added 2026-09-09
  // (user request: "No inline 'create new supplier' from the RFQ panel").
  async function addNewSupplierAndRequestRfq() {
    if (!jobId || !rfqNewSupplierName.trim()) return;
    const attachment = rfqAttachmentFile
      ? { attachmentFileName: rfqAttachmentFile.name, attachmentMimeType: rfqAttachmentFile.type || "application/octet-stream", attachmentContentBase64: await fileToBase64(rfqAttachmentFile) }
      : {};
    await postAction(`/api/v1/jobs/${jobId}/rfq/new-supplier`, { supplierName: rfqNewSupplierName.trim(), supplierEmail: rfqNewSupplierEmail.trim() || null, sendEmail: rfqNewSupplierSendEmail, ...attachment });
    setRfqNewSupplierName(""); setRfqNewSupplierEmail(""); setRfqNewSupplierSendEmail(true); setShowRfqNewSupplierForm(false);
  }

  // Retries (or sends for the first time) the RFQ email for a request that
  // came back FAILED or was added as SKIPPED — added 2026-09-09 alongside
  // real email sending.
  async function resendRfq(rfqRequestId: string) {
    if (!jobId) return;
    const supplierName = job?.rfqRequests.find((r) => String(r.id) === rfqRequestId)?.supplier.name || "the supplier";
    setRfqResendId(rfqRequestId); setError(""); setRfqResendResult(null);
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/resend`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to resend the email.");
      const sent = b.status === "SENT";
      setRfqResendResult({ ok: sent, message: sent ? `Email sent to ${supplierName}.` : `Could not send to ${supplierName} — ${b.lastSendError || "see the error below."}` });
      await load(true);
    } catch (e) {
      setRfqResendResult({ ok: false, message: e instanceof Error ? e.message : "Unable to resend the email." });
    } finally {
      setRfqResendId("");
    }
  }

  async function removeRfq(rfqRequestId: string) {
    if (!jobId) return;
    if (!(await confirm({ message: "Remove this quote request?", tone: "danger", confirmLabel: "Remove" }))) return;
    await deleteAction(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}`, {});
  }

  // 2026-09-29 — see the QuoteDraftLine state block above: this whole
  // group replaces the old openRecordQuote/cancelRecordQuote/
  // analyzeRfqQuoteFile/saveRfqQuote quartet, which all operated on a
  // single "currently being edited" supplier at a time. These operate on
  // every requested supplier's own entry in the Compare quotes dialog at
  // once, keyed by rfqRequestId throughout.
  function openQuoteCompare() {
    const drafts: Record<string, Record<string, QuoteDraftLine>> = {};
    const notes: Record<string, string> = {};
    for (const request of job?.rfqRequests || []) {
      const requestId = String(request.id);
      const lineDrafts: Record<string, QuoteDraftLine> = {};
      for (const line of job?.partLines || []) {
        const existing = request.quote?.lines.find((l) => l.partLineId === String(line.id));
        lineDrafts[String(line.id)] = {
          unitPrice: existing?.unitPrice != null ? String(existing.unitPrice) : "",
          available: existing?.available !== false,
          notes: existing?.notes ? String(existing.notes) : "",
        };
      }
      drafts[requestId] = lineDrafts;
      notes[requestId] = request.quote?.notes || "";
    }
    setQuoteDrafts(drafts);
    setQuoteNotesByRequest(notes);
    setQuoteFiles({});
    setQuoteGuessCounts({});
    setQuoteAnalyzingId("");
    setShowRfqPopup(false);
    setShowQuoteComparePopup(true);
  }

  function closeQuoteCompare() {
    setShowQuoteComparePopup(false);
    setQuoteDrafts({});
    setQuoteNotesByRequest({});
    setQuoteFiles({});
    setQuoteGuessCounts({});
    setQuoteAnalyzingId("");
    setShowSavedQuotesCompare(false);
    setQuoteCompareMaximized(false);
  }

  function updateQuoteDraftLine(rfqRequestId: string, partLineId: string, patch: Partial<QuoteDraftLine>) {
    setQuoteDrafts((current) => {
      const requestDrafts = current[rfqRequestId] || {};
      const existing = requestDrafts[partLineId] || { unitPrice: "", available: true, notes: "" };
      return { ...current, [rfqRequestId]: { ...requestDrafts, [partLineId]: { ...existing, ...patch } } };
    });
  }

  // Best-effort price extraction — added 2026-09-09 (user request: "Prices
  // are typed in by hand, not extracted from uploaded files"). Runs as
  // soon as a file is attached (uploading it to recordRfqQuote, which both
  // stores it and returns guesses — see rfq/quote-extraction.ts) so the
  // person can see and correct the guesses in the price table *before*
  // clicking Save — nothing is treated as a real price until then. Only
  // fills in lines that are still blank; it never overwrites a price
  // someone already typed. Now scoped per supplier column (rfqRequestId)
  // so importing one supplier's file never disturbs another's in-progress
  // entry sitting right next to it.
  async function analyzeQuoteFileForRequest(rfqRequestId: string, file: File) {
    if (!jobId) return;
    setQuoteAnalyzingId(rfqRequestId); setError("");
    try {
      const contentBase64 = await fileToBase64(file);
      const r = await fetch(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", contentBase64, notes: (quoteNotesByRequest[rfqRequestId] || "").trim() || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to analyze the quote file.");
      const guesses = (b.guesses || {}) as Record<string, number>;
      let applied = 0;
      setQuoteDrafts((current) => {
        const requestDrafts = { ...(current[rfqRequestId] || {}) };
        for (const [partLineId, price] of Object.entries(guesses)) {
          const existing = requestDrafts[partLineId];
          if (existing && !existing.unitPrice) { requestDrafts[partLineId] = { ...existing, unitPrice: String(price) }; applied += 1; }
        }
        return { ...current, [rfqRequestId]: requestDrafts };
      });
      setQuoteGuessCounts((current) => ({ ...current, [rfqRequestId]: applied }));
    } catch (e) {
      // Extraction is best-effort — a failure here just means no guesses;
      // the file is still attached and priced by hand at Save time.
      setError(e instanceof Error ? e.message : "Unable to analyze the quote file.");
    } finally {
      setQuoteAnalyzingId("");
    }
  }

  async function saveQuoteForRequest(rfqRequestId: string) {
    if (!jobId) return;
    setQuoteSavingId(rfqRequestId); setError("");
    try {
      const file = quoteFiles[rfqRequestId] || null;
      let filePayload: Record<string, unknown> = {};
      if (file) {
        filePayload = { fileName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: await fileToBase64(file) };
      }
      let r = await fetch(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...filePayload, notes: (quoteNotesByRequest[rfqRequestId] || "").trim() || null }),
      });
      let b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to record quote.");

      const requestDrafts = quoteDrafts[rfqRequestId] || {};
      const lines = Object.entries(requestDrafts).map(([partLineId, draft]) => ({
        partLineId,
        unitPrice: draft.available && draft.unitPrice ? Number(draft.unitPrice) : null,
        available: draft.available,
        notes: draft.notes.trim() || null,
      }));
      if (lines.length > 0) {
        r = await fetch(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/quote/lines`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lines }),
        });
        b = await r.json();
        if (!r.ok) throw new Error(b.error?.message || "Unable to save prices.");
      }
      setQuoteFiles((current) => ({ ...current, [rfqRequestId]: null }));
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record quote.");
    } finally {
      setQuoteSavingId("");
    }
  }

  // Live (unsaved) total for one supplier's column while filling in the
  // Compare quotes grid — mirrors rfqQuoteTotal below but reads local
  // draft state instead of the server-saved quote, so the figure updates
  // as you type, before Save is clicked.
  function draftQuoteTotal(rfqRequestId: string): number {
    const requestDrafts = quoteDrafts[rfqRequestId] || {};
    let total = 0;
    for (const line of job?.partLines || []) {
      const draft = requestDrafts[String(line.id)];
      if (!draft || !draft.available || !draft.unitPrice) continue;
      const price = Number(draft.unitPrice);
      if (Number.isNaN(price)) continue;
      const qty = Number(line.quantity ?? 0);
      total += price * (Number.isNaN(qty) ? 0 : qty);
    }
    return total;
  }

  async function togglePreferred(partLineId: string, rfqQuoteId: string) {
    if (!jobId) return;
    await postAction(`/api/v1/jobs/${jobId}/rfq/preferred`, { partLineId, rfqQuoteId });
  }

  async function viewQuoteFile(rfqRequestId: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/quote/file`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "No quote file on record.");
      if (!openFileInNewTab(b.mimeType, b.contentBase64)) setError("Enable pop-ups to view the quote file.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open quote file.");
    } finally {
      setSaving(false);
    }
  }

  // Views the OUTBOUND attachment sent with an RFQ (a drawing/spec sheet),
  // not the supplier's quote file — see viewQuoteFile above for that. Added
  // 2026-09-14.
  async function viewRfqAttachment(rfqRequestId: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/rfq?rfqId=${rfqRequestId}`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "No attachment on record.");
      if (!openFileInNewTab(b.mimeType, b.contentBase64)) setError("Enable pop-ups to view the attachment.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open attachment.");
    } finally {
      setSaving(false);
    }
  }

  // Parts follow-up — added 2026-09-09 (user request: "ModApp's separate
  // 'Parts follow-up' chase-email feature wasn't built"). One bulk action:
  // email every supplier with outstanding ordered parts on this job.
  // 2026-09-16 — accepts an optional supplierId so the per-supplier
  // breakdown below (partsFollowupGroups) can offer a "Follow up" button
  // for just one supplier, not only "send to everyone".
  async function sendPartsFollowup(supplierId?: string) {
    if (!jobId) return;
    setSaving(true); setError(""); setPartsFollowupResult(null);
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/parts-followup`, {
        method: "POST",
        ...(supplierId ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId }) } : {}),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to send follow-up.");
      setPartsFollowupResult({ sent: b.sent || [], skipped: b.skipped || [] });
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send follow-up.");
    } finally {
      setSaving(false);
    }
  }

  // Per-supplier breakdown of outstanding ordered parts, computed straight
  // from job.partLines (already loaded for the Parts list table below) —
  // 2026-09-16 user request: "Parts Follow up still does not show suppliers
  // that have outstanding parts, like ModApp." Mirrors ModApp's
  // PartsFollowUpButton.tsx grouping (by orderedFromSupplier, one card per
  // supplier, an "Unknown" bucket for lines with no supplier assigned yet,
  // and an overdue flag once a line has sat on order for a week or more) so
  // the same list is visible here before anything is sent, not just in the
  // sent/skipped result after the fact.
  const partsFollowupGroups = useMemo(() => {
    const groups = new Map<string, { supplierId: string; supplierName: string; count: number; overdueDays: number }>();
    for (const line of job?.partLines ?? []) {
      const status = String(line.status ?? "");
      if (!["PENDING", "ON_ORDER", "PARTIALLY_RECEIVED", "IN_STOCK", "PICKED"].includes(status)) continue;
      // 2026-10-05 — a line that is partly from stock (IN_STOCK / PICKED) is
      // only chased when it also has something ordered, and only for the
      // units meant to come from the supplier (see partLineQuantities).
      if ((status === "IN_STOCK" || status === "PICKED") && !line.orderNumber && !line.orderedFromSupplier) continue;
      const outstanding = partLineQuantities({ quantity: line.quantity, orderedQuantity: line.orderedQuantity, orderNumber: line.orderNumber, hasSupplier: Boolean(line.orderedFromSupplier), receivedQuantity: line.receivedQuantity, stockIssuedQuantity: line.stockIssuedQuantity }).supplierOutstanding;
      if (!(outstanding > 0)) continue;
      const supplier = line.orderedFromSupplier as (Row & { name?: string | null }) | undefined;
      const supplierId = supplier?.id ? String(supplier.id) : "unknown";
      const supplierName = supplier?.name ? String(supplier.name) : "Unknown";
      const entry = groups.get(supplierId) ?? { supplierId, supplierName, count: 0, overdueDays: 0 };
      entry.count += 1;
      const orderedAt = line.orderedAt ? new Date(String(line.orderedAt)) : null;
      if (orderedAt && !Number.isNaN(orderedAt.getTime())) {
        const days = Math.floor((Date.now() - orderedAt.getTime()) / (24 * 60 * 60 * 1000));
        if (days > entry.overdueDays) entry.overdueDays = days;
      }
      groups.set(supplierId, entry);
    }
    const named = Array.from(groups.values()).filter((g) => g.supplierId !== "unknown").sort((a, b) => a.supplierName.localeCompare(b.supplierName));
    const unknown = groups.get("unknown");
    return unknown ? [...named, unknown] : named;
  }, [job?.partLines]);

  // CSV export of the quote comparison table — Blob + BOM, mirrors
  // ModApp's QuoteComparisonSection handleExportCsv().
  // 2026-09-29 — user request: "Compare prices dialog does not show qty
  // column and exporting to csv does not either (add the qty column),
  // allow a user to select csv export or excel export." Shared by both
  // exporters below (and mirrors the dialog table's own columns — see the
  // quote-comparison-table JSX) so the on-screen table, the CSV, and the
  // Excel file can never drift out of sync with each other.
  function buildQuoteComparisonExport(job: JobDetail) {
    const quotedRequests = job.rfqRequests.filter((r) => r.quote);
    const header = ["Part", "Description", "Qty", ...quotedRequests.flatMap((r) => [`${r.supplier.name} (unit)`, `${r.supplier.name} (total)`])];
    const rows = job.partLines.map((line) => {
      const qty = Number(line.quantity ?? 0);
      const cells = quotedRequests.flatMap((request) => {
        const quoteLine = request.quote!.lines.find((l) => l.partLineId === String(line.id));
        if (!quoteLine || quoteLine.available === false || quoteLine.unitPrice == null || quoteLine.unitPrice === "") return ["", ""];
        const unit = Number(quoteLine.unitPrice);
        return [unit.toFixed(2), (unit * qty).toFixed(2)];
      });
      return [text(line.partNumber), text(line.description), decimalText(line.quantity), ...cells];
    });
    return { quotedRequests, header, rows };
  }

  function exportQuoteComparisonCsv() {
    if (!job) return;
    const { quotedRequests, header, rows } = buildQuoteComparisonExport(job);
    if (quotedRequests.length === 0 || job.partLines.length === 0) return;
    downloadCsv(`quote-comparison-${job.jobNumber || job.draftNumber}.csv`, [header, ...rows]);
  }

  // Excel export — same rows as the CSV above, built into a workbook with
  // SheetJS (already a project dependency, used server-side for Settings >
  // Import/Export; loaded here via dynamic import so it's only pulled into
  // the browser bundle if this button is actually clicked). writeFile
  // triggers the browser download itself, no manual Blob/anchor needed.
  async function exportQuoteComparisonExcel() {
    if (!job) return;
    const { quotedRequests, header, rows } = buildQuoteComparisonExport(job);
    if (quotedRequests.length === 0 || job.partLines.length === 0) return;
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Quote comparison");
    XLSX.writeFile(workbook, `quote-comparison-${job.jobNumber || job.draftNumber}.xlsx`);
  }

  async function applyJobKit() {
    if (!jobId || !jobKitId) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/apply-kit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kitId: jobKitId }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to apply job kit.");
      setJobKitId("");
      setJobKitQuery("");
      setJobKitOptions([]);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to apply job kit.");
    } finally {
      setSaving(false);
    }
  }

  async function patchAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  // Fetch-on-click PEX cycle history — mirrors ModApp's PexUnitHistoryButton,
  // but renders Apollo's own JobActivity.description directly (no
  // field/oldValue/newValue mapping needed; see pex/service.ts's
  // getPexRecordHistory).
  async function openPexHistory(pexId: string) {
    setPexHistoryLoading(true);
    try {
      const r = await fetch(`/api/v1/pex/${pexId}/history`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to load PEX history.");
      setPexHistory(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load PEX history.");
    } finally {
      setPexHistoryLoading(false);
    }
  }

  if (loading) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading job…</div>;

  // 2026-10-01 — Machine/component details, Commercial & logistics and
  // Job details are kept as their own variables (rather than written
  // inline in jobFormSections below) because their relative order has
  // already changed twice today, mechanic-view-only then back to the
  // original Machine -> Job details -> Commercial order for everyone —
  // reordering three JSX blocks beats re-copying three blocks' worth of
  // (identical) field markup. The only layout difference left for a
  // Mechanic is Notes claiming the full row above instead of sharing one
  // (see Notes' own `full-row` comment).
  // 2026-10-06 — Field service jobs hide the fields that only make sense for a
  // workshop job (component part number, ETAs, mechanics, delivery logistics...).
  // Keyed off the form (not the saved job) so the create form follows the Job type
  // dropdown straight away.
  const isFieldForm = form.type === "FIELD_SERVICE";

  const machineSection = (
    <section className="detail-panel">
      <header><div><h2>Machine / component details</h2></div></header>
      {/* 2026-10-01 — locked (not hidden) for mechanicFieldsLocked:
          per the user's choice, only Notes/Parts List/Outwork remain
          editable for a Mechanic — see the hook comment above. */}
      <fieldset disabled={mechanicFieldsLocked} className="unstyled-fieldset">
      <div className="drawer-fields">
        <label className="party-selector" onBlur={closeDropdownUnlessWithin(() => setShowMachineMakeOptions(false))}>
          <span>Machine make</span>
          <div><Search size={14} /><input value={form.machineMake} onChange={(e) => { updateField("machineMake", e.target.value); setShowMachineMakeOptions(true); }} onFocus={() => setShowMachineMakeOptions(true)} placeholder="Search manufacturers or type a new one" /></div>
          {showMachineMakeOptions && machineMakeOptions.length > 0 && (
            <div className="selector-results">
              {machineMakeOptions.map((m) => <button key={m.id} type="button" onClick={() => { updateField("machineMake", m.name); setShowMachineMakeOptions(false); }}><strong>{m.name}</strong></button>)}
            </div>
          )}
        </label>
        <label><span>Machine model</span><input value={form.machineModel} onChange={(e) => updateField("machineModel", e.target.value)} /></label>
        <label><span>Machine serial</span><input value={form.machineSerial} onChange={(e) => updateField("machineSerial", e.target.value)} /></label>
        <label><span>Component</span><input value={form.component} onChange={(e) => updateField("component", e.target.value)} /></label>
        {/* 2026-09-29 — user request: "Remove the field Component type
            within jobs and remove from all printed locations." Removed
            just this input and its rows in printJobCard/printJobHistory
            below — form.componentType/buildJobPayload/the underlying
            Job.componentType column are all left completely untouched
            (still readable/writable via Import/Export, Excel sync, and
            the PEX unit-description fallback, none of which this
            request named), so nothing else relying on that data
            breaks. It simply can no longer be seen or edited here. */}
        <label><span>Component serial</span><input value={form.componentSerial} onChange={(e) => updateField("componentSerial", e.target.value)} /></label>
        {!isFieldForm && (<label><span>Part number</span><input value={form.componentPartNumber} onChange={(e) => updateField("componentPartNumber", e.target.value)} /></label>)}
        <label><span>Plant number</span><input value={form.plantNumber} onChange={(e) => updateField("plantNumber", e.target.value)} /></label>
        <label><span>Machine hours</span><input type="number" min="0" step="0.01" value={form.machineHours} onChange={(e) => updateField("machineHours", e.target.value)} /></label>
      </div>
      </fieldset>
    </section>
  );

  const commercialSection = (
    <section className="detail-panel wide-panel">
      <header><div><h2>Commercial &amp; logistics</h2></div></header>
      <fieldset disabled={mechanicFieldsLocked} className="unstyled-fieldset">
      <div className="drawer-fields commercial-fields">
        <label><span>Quote number</span><input value={form.quoteNumber} onChange={(e) => updateField("quoteNumber", e.target.value)} /></label>
        <label><span>Quote date</span><input type="date" value={form.quoteDate} onChange={(e) => updateField("quoteDate", e.target.value)} /></label>
        <label><span>Sales order number</span><input value={form.salesOrderNumber} onChange={(e) => updateField("salesOrderNumber", e.target.value)} /></label>
        <label><span>Sales order date</span><input type="date" value={form.salesOrderDate} onChange={(e) => updateField("salesOrderDate", e.target.value)} /></label>

        <label><span>Invoice number</span><input value={form.invoiceNumber} onChange={(e) => updateField("invoiceNumber", e.target.value)} /></label>
        <label><span>Invoice date</span><input type="date" value={form.invoiceDate} onChange={(e) => updateField("invoiceDate", e.target.value)} /></label>
        <label>
          <span>Payment date received</span>
          <div className="field-with-check">
            <input type="date" value={form.paymentDateReceived} onChange={(e) => updateField("paymentDateReceived", e.target.value)} />
            <label className="inline-check"><input type="checkbox" checked={form.paymentNotApplicable === "true"} onChange={(e) => updateField("paymentNotApplicable", e.target.checked ? "true" : "")} /><span>N/A</span></label>
          </div>
        </label>
        <span className="row-break" aria-hidden="true" />

        <label><span>Purchase order number</span><input value={form.purchaseOrderNumber} onChange={(e) => updateField("purchaseOrderNumber", e.target.value)} /></label>
        <label><span>Purchase order date</span><input type="date" value={form.purchaseOrderDate} onChange={(e) => updateField("purchaseOrderDate", e.target.value)} /></label>
        <label><span>Purchase order status</span><select value={form.purchaseOrderStatus} onChange={(e) => updateField("purchaseOrderStatus", e.target.value)}>{PURCHASE_ORDER_STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        {!isFieldForm && (
          <>
        <span className="row-break" aria-hidden="true" />

        <label><span>Receiving transport</span><select value={form.receivingTransport} onChange={(e) => updateField("receivingTransport", e.target.value)}><option value="">—</option>{DELIVERY_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label><span>Delivery type</span><select value={form.deliveryType} onChange={(e) => updateField("deliveryType", e.target.value)}><option value="">—</option>{DELIVERY_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label><span>Delivery date</span><input type="date" value={form.deliveryDate} onChange={(e) => updateField("deliveryDate", e.target.value)} /></label>
          </>
        )}
      </div>
      </fieldset>
    </section>
  );

  const jobDetailsSection = (
    <section className="detail-panel">
      <header><div><h2>Job details</h2></div></header>
      <fieldset disabled={mechanicFieldsLocked} className="unstyled-fieldset">
      <div className="drawer-fields">
        <label><span>Job type *</span><select value={form.type} onChange={(e) => updateField("type", e.target.value)}>{JOB_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {!isFieldForm && (
          <>
        <label><span>ETA date</span><input type="date" value={form.etaDate} onChange={(e) => updateField("etaDate", e.target.value)} /></label>
        <label><span>Mechanic ETA date</span><input type="date" value={form.mechanicEtaDate} onChange={(e) => updateField("mechanicEtaDate", e.target.value)} /></label>
        {/* 2026-09-19, user request: "add under job details sections 2
            fields, 'Mechanic Strip' and 'Mechanic Assemble'."
            Job.stripMechanicId/buildMechanicId were already fully wired
            server-side (see jobs/service.ts) — just never had a field
            here. Options come from the new JOBS_VIEW-gated
            /api/v1/jobs/mechanics list (see listMechanicOptions's own
            comment for why not /api/v1/users). */}
        <label><span>Mechanic strip</span>
          <select value={form.stripMechanicId} onChange={(e) => updateField("stripMechanicId", e.target.value)}>
            <option value="">—</option>
            {mechanics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label><span>Mechanic assemble</span>
          <select value={form.buildMechanicId} onChange={(e) => updateField("buildMechanicId", e.target.value)}>
            <option value="">—</option>
            {mechanics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label><span>Import tracking number</span><input value={form.importTrackingNumber} onChange={(e) => updateField("importTrackingNumber", e.target.value)} /></label>
        <label><span>Previous job number</span><input value={form.previousJobNumber} onChange={(e) => updateField("previousJobNumber", e.target.value)} />{job?.pexConsumedBy && <span className="muted small-line">Redeployed a PEX unit returned on {text(job?.pexConsumedBy?.returnJob?.jobNumber || job?.pexConsumedBy?.returnJob?.draftNumber)}.</span>}</label>
          </>
        )}
        <label className="wide"><span>Job description</span><textarea rows={2} value={form.description} onChange={(e) => updateField("description", e.target.value)} /></label>
      </div>
      </fieldset>
    </section>
  );

  const customerSection = (mode !== "detail" || canViewCustomer) ? (
        <section className={`detail-panel ${job && mode === "detail" ? "wide-panel" : "full-row"}`}>
          <header><div><h2>{form.type === "FIELD_SERVICE" ? "Customer & site" : "Customer details"}</h2></div></header>
          <fieldset disabled={mechanicFieldsLocked} className="unstyled-fieldset">
          <div className="drawer-fields customer-fields">
            <label className="wide party-selector" onBlur={closeDropdownUnlessWithin(() => setShowCustomerOptions(false))}>
              <span>Customer *</span>
              <div><Search size={15} /><input value={customerQuery || (job?.customer?.name ? String(job.customer.name) : "")} onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerOptions(true); if (!e.target.value) updateField("customerId", ""); }} onFocus={() => setShowCustomerOptions(true)} placeholder="Search customer name, account code or branch" /></div>
              {showCustomerOptions && customerQuery.trim().length >= 2 && (
                <div className="selector-results">
                  {customerOptions.map((customer) => <button key={customer.id} type="button" onClick={() => { updateField("customerId", customer.id); setCustomerQuery(customer.name); setShowCustomerOptions(false); }}><strong>{customer.name}</strong><span>{[customer.accountCode, customer.tradingName].filter(Boolean).join(" · ")}</span></button>)}
                  {customerOptions.length === 0 && <p style={{ padding: "9px" }}>No matches for &quot;{customerQuery.trim()}&quot;.</p>}
                  {/* Always offered, whether or not there were any matches — the customer being searched for might genuinely not be on file yet (see the state/function declarations above for why this posts straight to the master-data endpoint instead of reusing postAction/putAction). */}
                  <button type="button" onClick={() => { setShowCustomerOptions(false); openNewCustomerForm(); }}><strong><Plus size={12} style={{ verticalAlign: "-1px" }} /> Add &quot;{customerQuery.trim()}&quot; as a new customer</strong></button>
                </div>
              )}
              {showNewCustomerForm && (
                <div className="drawer-fields" style={{ marginTop: 4 }}>
                  <label><span>Customer name</span><input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} /></label>
                  <label><span>Account code (optional)</span><input value={newCustomerAccountCode} onChange={(e) => setNewCustomerAccountCode(e.target.value)} /></label>
                  <label>
                    <span>&nbsp;</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className="quiet-button" disabled={addingCustomer} onClick={() => setShowNewCustomerForm(false)}>Cancel</button>
                      <button type="button" className="gold-button" disabled={addingCustomer || newCustomerName.trim().length < 2} onClick={() => void addNewCustomer()}><Plus size={14} /> {addingCustomer ? "Adding…" : "Add customer"}</button>
                    </div>
                  </label>
                </div>
              )}
            </label>
            {/* Always available, not just when a search comes up empty — so
                someone who wants to add a new customer without searching for
                an existing one first still has an obvious way in. */}
            <label>
              <span>&nbsp;</span>
              <button type="button" className="quiet-button" onClick={() => { if (showNewCustomerForm) setShowNewCustomerForm(false); else openNewCustomerForm(); }}>
                <Plus size={15} /> {showNewCustomerForm ? "Cancel new customer" : "New customer"}
              </button>
            </label>
            <label><span>Date in</span><input type="date" value={form.dateReceived} onChange={(e) => updateField("dateReceived", e.target.value)} /></label>
            <label><span>Customer reference</span><input value={form.customerReference} onChange={(e) => updateField("customerReference", e.target.value)} /></label>
            {/* 2026-09-22, user request: "add Sales Representative same as
                mechanic field." Was a free-text <input>; now the same
                admin-managed-list <select> pattern as Mechanic strip/
                assemble below, backed by /api/v1/jobs/sales-representatives
                (see listSalesRepresentativeOptions's own comment). */}
            <label><span>Sales representative</span>
              <select value={form.salesRepresentativeId} onChange={(e) => updateField("salesRepresentativeId", e.target.value)}>
                <option value="">—</option>
                {salesRepresentatives.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label><span>Report number</span><input value={form.reportNumber} onChange={(e) => updateField("reportNumber", e.target.value)} /></label>
            {/* 2026-10-06 — field service jobs: where the work is and how to get in.
                Shown on the create form too (follows the Job type dropdown). */}
            {form.type === "FIELD_SERVICE" && (
              <>
                <p className="field-subhead wide">Site</p>
                <label><span>Site contact name</span><input value={form.siteContactName} onChange={(e) => updateField("siteContactName", e.target.value)} placeholder="Name and position" /></label>
                <label><span>Site contact phone</span><input type="tel" value={form.siteContactPhone} onChange={(e) => updateField("siteContactPhone", e.target.value)} placeholder="Mobile number" /></label>
                <label className="wide"><span>Site address</span><textarea rows={2} value={form.siteAddress} onChange={(e) => updateField("siteAddress", e.target.value)} placeholder="Street, town, GPS co-ordinates" /></label>
                <label className="wide"><span>Access / induction notes</span><textarea rows={2} value={form.accessNotes} onChange={(e) => updateField("accessNotes", e.target.value)} placeholder="Gate code, induction required, permit-to-work, escort needed" /></label>
              </>
            )}
          </div>
          </fieldset>
        </section>
  ) : null;

  const notesSection = job && mode === "detail" ? (
          <section className={mechanicFieldsLocked ? "detail-panel wide-panel full-row job-notes-panel" : "detail-panel wide-panel job-notes-panel"}>
            {/* 2026-09-16 — user request: "make the Notes field like the Job
                description field, remove the add note button, notes will
                stay in the field as you type." Replaced the old
                add/edit/delete list of separately-timestamped JobNote
                entries with one shared free-text field that autosaves
                exactly like Description (same buildJobPayload/runAutosave
                path — see form.notes above). Existing per-entry notes were
                merged into this field (oldest first) by the migration that
                added it; the JobNote rows themselves are left in the
                database, just no longer read or written here.
                2026-10-01 — user request, then narrowed to "yes only for
                mechanic view": `full-row` (grid-column: 1/-1, see
                .job-edit-grid rules in globals.css) is now only applied
                when mechanicFieldsLocked, so only a Mechanic's Notes panel
                claims the whole row — Machine/component details then
                lands alone at the start of the next row rather than
                sharing it with Job details (every other role keeps Notes
                as a normal 2-of-4-column wide-panel, same as before this
                request, so nothing below it moves). */}
            <header><div><h2>Notes</h2><p>Business-facing notes stay with the job and appear in history.</p></div></header>
            <div className="drawer-fields"><label className="wide"><span>Notes</span><textarea rows={4} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} /></label></div>
          </section>
  ) : null;

  const jobFormSections = (
    <>
      <div className="job-edit-grid">
        {/* 2026-09-14, user request: "Move notes section next to Client
            Details on the right that it is visible as soon as you open a
            job". Customer details only shrinks to half-width (wide-panel)
            in detail mode, where there's a job (and its notes) to show
            beside it — in create mode there's no job yet, so it keeps the
            full-width layout it always had. */}
        {/* 2026-10-01 — user request ("inside a job, customer details
            section to be hidden from user"): hidden entirely in detail
            mode for a viewer lacking CUSTOMERS_VIEW (e.g. a Mechanic) —
            not just visually collapsed. Still shown in create mode since
            picking a customer is required to create a job at all, and
            only roles with JOBS_CREATE (which Mechanics lack — see
            permissions.ts) ever reach create mode. The fieldset below
            additionally locks every field in here for mechanicFieldsLocked,
            covering the rare case of a role with CUSTOMERS_VIEW granted by
            an override but no JOBS_EDIT-field access. */}
        {customerSection}

        {notesSection}

        {/* 2026-10-01 — user request, then narrowed to "yes only for
            mechanic view", then: "swop Job details section and Commercial
            and logistics sections with each other" — back to Machine/
            component -> Job details -> Commercial & logistics for every
            role, Mechanic included. The only layout difference left for a
            Mechanic is Notes claiming the full row above (see its
            `full-row` class/comment) rather than sharing a row with
            whatever landed beside it; machineSection/commercialSection/
            jobDetailsSection (above) stay split into their own consts
            since a role-specific order has come back before and may
            again. */}
        {machineSection}
        {jobDetailsSection}
        {commercialSection}
      </div>
    </>
  );

  // Field service jobs (detail mode) use the field layout — see fieldJobLayout below.
  const fieldLayout = mode === "detail" && !!job && job.type === "FIELD_SERVICE";

  const partsListSection = job ? (
          <section className="detail-panel">
            <header>
              <div><h2>Parts list</h2><p>Track ordering and receiving for this job&apos;s parts.</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {job.partLines.length > 0 && (
                  <button type="button" className="quiet-button" onClick={() => { setBulkEditMode((v) => !v); setBulkSelectedIds(new Set()); }}>{bulkEditMode ? "Cancel bulk update" : "Bulk update"}</button>
                )}
                {/* 2026-09-29 — user request: "move the import quote section
                    to its own place... add a 'Compare quotes' button next
                    to bulk update button which lets the user view the
                    suppliers requested from in table form next to each
                    other, allow user to import quote received for the
                    respective supplier or fill in amounts next to part
                    number." Opens the new dedicated Compare quotes dialog
                    (see showQuoteComparePopup below) — disabled until at
                    least one supplier has actually been asked to quote. */}
                {job.partLines.length > 0 && (
                  <button type="button" className="quiet-button" disabled={job.rfqRequests.length === 0} title={job.rfqRequests.length === 0 ? "Request a quote from at least one supplier first" : undefined} onClick={openQuoteCompare}><Columns3 size={14} /> Compare quotes</button>
                )}
                {job.partLines.length > 0 && (
                  <button type="button" className="quiet-button" onClick={() => void offerToSave(printPartsList(), "PARTS_LIST", partsListSpec)}><Printer size={14} /> Print Parts List</button>
                )}
                <button type="button" className="section-action-button" onClick={() => setShowAddParts((v) => !v)}>{showAddParts ? "Cancel" : <><Plus size={15} /> Add parts to Job</>}</button>
              </div>
            </header>
            {/* 2026-09-22, user request: "Inside a job, at the part list
                section, add a search bar to search for part number." Filters
                the table below client-side; matches part number or
                description so a partial memory of either still finds the
                line. Hidden when there's nothing yet to search. */}
            {job.partLines.length > 0 && (
              <div className="drawer-fields" style={{ padding: "10px 14px 0" }}>
                <div className="search-control inventory-search-control">
                  <Search size={15} />
                  <input
                    value={partSearchQuery}
                    onChange={(e) => setPartSearchQuery(e.target.value)}
                    placeholder="Search part number or description"
                    aria-label="Search parts list by part number"
                  />
                </div>
              </div>
            )}
            {showAddParts && (
              <>
                <div className="drawer-fields">
                  <label className="wide party-selector" onBlur={closeDropdownUnlessWithin(() => setJobKitOptions([]))}><span>Apply job kit</span><div><Search size={15} /><input value={jobKitQuery} onChange={(e) => { setJobKitQuery(e.target.value); setJobKitId(""); }} placeholder="Search job kit name, make or model" /></div>{jobKitOptions.length > 0 && <div className="selector-results">{jobKitOptions.map((kit) => <button key={kit.id} type="button" onClick={() => { setJobKitId(kit.id); setJobKitQuery(`${kit.name}${kit.machineMake ? ` · ${kit.machineMake}` : ""}${kit.machineModel ? ` ${kit.machineModel}` : ""}`); setJobKitOptions([]); }}><strong>{kit.name}</strong><span>{[kit.machineMake, kit.machineModel, kit.componentType].filter(Boolean).join(" · ") || "Reusable standard kit"}</span></button>)}</div>}</label>
                  <label><span>&nbsp;</span><button type="button" className="quiet-button" disabled={saving || !jobKitId} onClick={() => void applyJobKit()}>Apply selected kit</button></label>
                  <label className="wide"><span>Paste parts list (one per line — part number and quantity are required; description is optional: &quot;PN-1001, 2, Hydraulic seal kit&quot;)</span><textarea rows={4} value={bulkPartLines} onChange={(e) => setBulkPartLines(e.target.value)} placeholder={"PN-1001, 2, Hydraulic seal kit\nPN-2044, 4"} /></label>
                  <label className="wide">
                    <span>Or import a parts list file (.xlsx, .xls or .csv — needs Part number / Qty / Description columns)</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setPartsImportFile(e.target.files?.[0] || null)} />
                      <button type="button" className="quiet-button" title="Download a blank parts-list template" aria-label="Download parts-list template" onClick={downloadPartsTemplate}><FileText size={15} /></button>
                    </div>
                  </label>
                </div>
                {/* 2026-10-01 — user request: "combine the 'Add / cross-check
                    with stock' button and 'import' button into one button
                    called 'Add/Import Parts', move the button below the
                    choose file section." See addOrImportParts above —
                    imports the chosen file when one's selected, otherwise
                    adds/cross-checks the pasted lines.
                    2026-10-01 follow-up — user request: "the add/import
                    button to be on the left, same style as the pickslip
                    button." .detail-actions is shared by every other footer
                    in this app and right-aligns by default (justify-content:
                    flex-end) — left-aligned here via an inline override
                    rather than touching that shared class. "Same style as
                    the pickslip button" = .section-action-button, the gold
                    accent style "Create picking slip" and "Add parts to Job"
                    above both already use, replacing the plain
                    .quiet-button this had. */}
                <footer className="detail-actions" style={{ justifyContent: "flex-start" }}><button type="button" className="section-action-button" disabled={saving || (!partsImportFile && !bulkPartLines.trim())} onClick={() => void addOrImportParts()}><Plus size={15} /> Add/Import Parts</button></footer>
              </>
            )}
            {/* 2026-09-15, user request: "Parts list table, make it that
                bulk update can be done on the parts to add supplier and
                order number, instead of one at a time." A row checkbox
                column appears while this toolbar is open; leaving a field
                blank here leaves it unchanged on every selected line. */}
            {bulkEditMode && (
              <div className="bulk-update-toolbar" style={{ padding: "10px 14px", background: "#fbf8f0", borderBottom: "1px solid var(--ink-150)" }}>
                <label><span>Order number (optional)</span><input value={bulkOrderNumber} onChange={(e) => setBulkOrderNumber(e.target.value)} placeholder="Applies to every selected row" /></label>
                <label className="party-selector" onBlur={closeDropdownUnlessWithin(() => setBulkSupplierPickerOpen(false))}><span>Supplier (optional)</span><div><Search size={15} /><input value={bulkSupplierQuery} onChange={(e) => { setBulkSupplierQuery(e.target.value); setBulkSupplierId(""); setBulkSupplierPickerOpen(true); }} onFocus={() => setBulkSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{bulkSupplierPickerOpen && bulkSupplierOptions.length > 0 && <div className="selector-results">{bulkSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setBulkSupplierId(s.id); setBulkSupplierQuery(s.name); setBulkSupplierOptions([]); setBulkSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}</div>}</label>
                <div className="bulk-update-actions">
                  <button type="button" className="gold-button" disabled={bulkApplying || bulkSelectedIds.size === 0 || (!bulkOrderNumber.trim() && !bulkSupplierId)} onClick={() => void applyBulkPartUpdate()}>{bulkApplying ? "Applying…" : `Apply to ${bulkSelectedIds.size} selected`}</button>
                  <button type="button" className="quiet-button" disabled={bulkApplying || bulkSelectedIds.size === 0} onClick={() => void applyBulkMarkReceived()}>{bulkApplying ? "Applying…" : `Mark received (${bulkSelectedIds.size})`}</button>
                  <button type="button" className="quiet-button danger" disabled={bulkApplying || bulkSelectedIds.size === 0} onClick={() => void applyBulkDelete()}><Trash2 size={14} /> {bulkApplying ? "Applying…" : `Delete (${bulkSelectedIds.size})`}</button>
                </div>
              </div>
            )}
            {/* 2026-10-05 — the page-level error banner sits at the very top
                of this (very long) page, so a failed Mark received / Undo
                receive / supplier save down here looked like "nothing
                happened". Shown here too, right above the table. */}
            {error ? <div className="inline-error" style={{ margin: "8px 14px" }}>{error}</div> : null}
            {(() => {
              const q = partSearchQuery.trim().toLowerCase();
              const visiblePartLines = q
                ? job.partLines.filter((line) => (line.partNumber || "").toLowerCase().includes(q) || (line.description || "").toLowerCase().includes(q))
                : job.partLines;
              return (
            <div className="data-table-wrap"><table className="data-table"><thead><tr>
              {bulkEditMode && <th><input type="checkbox" aria-label="Select all part lines" checked={bulkSelectedIds.size > 0 && bulkSelectedIds.size === visiblePartLines.length} onChange={(e) => setBulkSelectedIds(e.target.checked ? new Set(visiblePartLines.map((l) => String(l.id))) : new Set())} /></th>}
              <th>Part</th><th>Qty</th><th>Order</th><th>Supplier</th><th>Status</th><th></th>
            </tr></thead><tbody>
              {visiblePartLines.map((line) => {
                const lineId = String(line.id);
                const quantity = decimalText(line.quantity);
                const received = decimalText(line.receivedQuantity ?? 0);
                const outstanding = Math.max(0, Number(line.quantity ?? 0) - Number(line.receivedQuantity ?? 0));
                const hasReceivedSome = Number(line.receivedQuantity ?? 0) > 0;
                const fullyReceived = line.status === "RECEIVED";
                // 2026-09-29, user request: "when clicking create picking
                // slip inside a job, it should not change the status to
                // received as the part might not be in stock physically."
                // Picking now tracks its own pickedQuantity (separate from
                // receivedQuantity above, which "Mark received" still
                // owns entirely) and sets status PICKED instead of
                // (PARTIALLY_)RECEIVED — shown here as its own line and
                // its own pill tone so it reads as "pulled from the
                // shelf" rather than "confirmed on the job."
                const picked = decimalText(line.pickedQuantity ?? 0);
                const hasPickedSome = Number(line.pickedQuantity ?? 0) > 0;
                // 2026-10-05 — how the line splits between shelf stock and an
                // outside supplier (see partLineQuantities).
                const qtys = partLineQuantities({ quantity: line.quantity, orderedQuantity: line.orderedQuantity, orderNumber: line.orderNumber, hasSupplier: Boolean(line.orderedFromSupplier), receivedQuantity: line.receivedQuantity, stockIssuedQuantity: line.stockIssuedQuantity, pickedQuantity: line.pickedQuantity });
                const isSplitLine = qtys.hasOrderInfo && qtys.ordered > 0 && qtys.stockQty > 0;
                const receiveStockPart = !line.part ? 0 : receiveSource === "STOCK" ? Number(receiveQty || 0) : receiveSource === "AUTO" ? Math.min(Number(receiveQty || 0), qtys.stockRemaining) : 0;
                const statusTone = fullyReceived ? "" : line.status === "PICKED" ? "tone-blue" : "neutral";
                const supplierPickerOpenHere = orderEditLineId === lineId;
                return <tr key={line.id}>
                  {bulkEditMode && <td><input type="checkbox" aria-label={`Select ${line.partNumber}`} checked={bulkSelectedIds.has(lineId)} onChange={(e) => setBulkSelectedIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(lineId); else next.delete(lineId); return next; })} /></td>}
                  <td>
                    <strong>{text(line.partNumber)}</strong>
                    <div className="muted small-line">{line.description ? text(line.description) : <button type="button" className="quiet-button" onClick={() => void saveDescription(lineId)}>Add description</button>}</div>
                  </td>
                  <td>
                    {quantity}
                    {isSplitLine ? <div className="muted small-line">From stock {qtys.stockQty} · Ordered {qtys.ordered}</div> : null}
                    {hasPickedSome ? <div className="muted small-line">On pick slip {picked} of {qtys.hasOrderInfo ? decimalText(Math.max(qtys.stockQty, qtys.picked)) : quantity}</div> : null}
                    {hasReceivedSome ? <div className="muted small-line">Received {received} of {quantity}</div> : null}
                    {receivingLineId === lineId && <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <input type="number" min={1} max={outstanding} value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} style={{ width: 80 }} />
                      {qtys.stockRemaining > 0 && qtys.supplierOutstanding > 0 && qtys.hasOrderInfo && (
                        <select value={receiveSource} onChange={(e) => setReceiveSource(e.target.value as "AUTO" | "STOCK" | "ORDER")} aria-label="Where these units came from">
                          <option value="AUTO">Stock first</option>
                          <option value="STOCK">From stock</option>
                          <option value="ORDER">From supplier</option>
                        </select>
                      )}
                      <button type="button" className="quiet-button" disabled={saving || !receiveQty} onClick={() => void receivePartLine(lineId)}>Confirm</button>
                      <button type="button" className="quiet-button" disabled={saving} onClick={() => { setReceivingLineId(""); setReceiveQty(""); setReceiveSource("AUTO"); }}>Cancel</button>
                    </div>}
                    {receivingLineId === lineId && receiveStockPart > 0 ? <div className="muted small-line">Takes {receiveStockPart} from stock</div> : null}
                  </td>
                  <td>
                    {/* Always an editable input, matching ModApp's
                        PartLineOrderNumberField — no need to click a
                        button first. Uncontrolled (defaultValue, not
                        value) since it's one of many rows and doesn't need
                        to re-render on every keystroke; saves on blur. */}
                    {/* 2026-10-05 — user report: "when adding parts in a job,
                        doing a bulk update and adding a supplier, it does not
                        allow me to edit a supplier again." This input is
                        uncontrolled (defaultValue), and its key used to be
                        just lineId, so it never picked up a value changed
                        from OUTSIDE it — i.e. the bulk update's order
                        number. It kept showing the old (blank) text while
                        the line really had an order number, so the first
                        blur out of it looked like an edit ("" vs the stored
                        number), silently saved a blank order number back
                        over the bulk-applied one, and put the whole table
                        into `saving` (which disables the Supplier inputs)
                        right as the user clicked across to the Supplier
                        cell. Keying on the stored order number remounts the
                        input whenever the server value changes, so what it
                        shows (and compares against on blur) is always
                        current. */}
                    <input
                      key={`${lineId}:${line.orderNumber ? String(line.orderNumber) : ""}`}
                      defaultValue={line.orderNumber ? String(line.orderNumber) : ""}
                      placeholder="PO / order #"
                      disabled={saving}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next === (line.orderNumber ? String(line.orderNumber).trim() : "")) return;
                        // Queued per-row (see queueRowSave's comment above)
                        // so this can never resolve out of order with a
                        // supplier pick on the same row and clobber it.
                        void queueRowSave(lineId, () => saveOrderNumberInline(lineId, next));
                      }}
                    />
                    {/* 2026-10-05, user request: "if I pick one part which qty
                        is 2, 1 from stock and order the outstanding at another
                        supplier, how does one work?" How many of this line's
                        units are being ordered elsewhere. Defaults to the whole
                        line (less anything already taken from stock) once it
                        has an order number or supplier, so a part ordered from
                        somewhere else is never listed on a pick slip; lower it
                        to take the rest from stock. */}
                    {qtys.hasOrderInfo && (
                      <label className="muted small-line" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        Qty ordered
                        <input
                          key={`${lineId}:ordered:${qtys.ordered}`}
                          type="number"
                          min={1}
                          max={Math.max(qtys.quantity - qtys.issued, 1)}
                          step="any"
                          defaultValue={qtys.ordered}
                          disabled={saving}
                          style={{ width: 64 }}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (!next || Number(next) === qtys.ordered) return;
                            void queueRowSave(lineId, () => saveOrderedQtyInline(lineId, next));
                          }}
                        />
                      </label>
                    )}
                  </td>
                  <td
                    className="party-selector"
                    onBlur={closeDropdownUnlessWithin(() => {
                      // 2026-10-02 — user request: "when typing supplier
                      // name, prefill does not pickup supplier until i
                      // press tab." Previously the ONLY way to actually
                      // attach a supplier to this line was clicking one of
                      // the dropdown buttons below — typing the name and
                      // moving on (by any means other than a lucky Tab that
                      // happened to land focus on a matching button, which
                      // read as "it only works if I press tab") saved
                      // nothing. Now, leaving this field with the typed text
                      // an exact (case-insensitive) match for one of the
                      // currently loaded options commits it automatically,
                      // same as the Order # cell beside it already commits
                      // on blur — no click required when what was typed
                      // already names a real supplier.
                      if (!supplierPickerOpenHere) return;
                      const typed = orderSupplierQuery.trim().toLowerCase();
                      const match = typed ? orderSupplierOptions.find((s) => s.name.trim().toLowerCase() === typed) : undefined;
                      if (match) { void queueRowSave(lineId, () => saveSupplierInline(lineId, match.id)); return; }
                      // 2026-10-05, user report: "trying to remove a supplier
                      // name on parts list table still not working." Emptying
                      // the box and clicking away only ever closed the picker
                      // — nothing cleared the saved supplier, and the old
                      // name came straight back. Leaving it empty on a line
                      // that has a supplier now clears it.
                      if (!typed && line.orderedFromSupplier?.id) {
                        setOrderEditLineId(""); setOrderSupplierId(""); setOrderSupplierQuery(""); setOrderSupplierOptions([]);
                        void queueRowSave(lineId, () => saveSupplierInline(lineId, ""));
                        return;
                      }
                      setOrderEditLineId(""); setOrderSupplierId(""); setOrderSupplierQuery(""); setOrderSupplierOptions([]);
                    })}
                  >
                    {/* 2026-09-15, user request: "make that the supplier
                        field is also editable without clicking the change
                        supplier button." Always an editable typeahead, no
                        "Change supplier" click first — mirrors the Order #
                        cell's always-inline pattern. orderEditLineId marks
                        which row's picker is open (see its declaration
                        above for the double-click-glitch fix this also
                        relies on). */}
                    <div ref={supplierPickerOpenHere ? supplierBoxRef : undefined}><Search size={13} /><input
                      value={supplierPickerOpenHere ? orderSupplierQuery : (line.orderedFromSupplier?.name || "")}
                      onFocus={() => { setOrderEditLineId(lineId); setOrderSupplierQuery(line.orderedFromSupplier?.name || ""); setOrderSupplierId(""); }}
                      onChange={(e) => { setOrderSupplierQuery(e.target.value); setOrderSupplierId(""); }}
                      placeholder="Search active supplier"
                    />{line.orderedFromSupplier?.id && !supplierPickerOpenHere ? <button type="button" className="table-action" title="Remove supplier" aria-label={`Remove supplier from ${line.partNumber}`} disabled={saving} onClick={() => void queueRowSave(lineId, () => saveSupplierInline(lineId, ""))}><X size={12} /></button> : null}</div>
                    {supplierPickerOpenHere && orderSupplierOptions.length > 0 && supplierDropPos && <div className="selector-results" style={{ position: "fixed", left: supplierDropPos.left, width: supplierDropPos.width, top: supplierDropPos.top ?? "auto", bottom: supplierDropPos.bottom ?? "auto", maxHeight: supplierDropPos.maxHeight, zIndex: 40 }}>{orderSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => void queueRowSave(lineId, () => saveSupplierInline(lineId, s.id))}><strong>{s.name}</strong></button>)}</div>}
                  </td>
                  <td>
                    <span className={`status-pill ${statusTone}`}>{text(line.status).replaceAll("_", " ")}</span>
                    {/* 2026-09-29, user request: moved from under the part
                        number to here, under Status — see partStockOnHand's
                        own comment above for what this shows and why. */}
                    {(() => {
                      const onHand = partStockOnHand(line.part);
                      if (onHand == null) return null;
                      return <div className="muted small-line" style={onHand <= 0 ? { color: "var(--danger)", fontWeight: 700 } : undefined}>In stock: {onHand}</div>;
                    })()}
                  </td>
                  <td className="actions">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {hasReceivedSome && <button type="button" className="table-action" disabled={saving} onClick={() => void unreceivePartLine(lineId)}>Undo receive</button>}
                      {outstanding > 0 && receivingLineId !== lineId && <button type="button" className="table-action" disabled={saving} onClick={() => { setReceivingLineId(lineId); setReceiveQty(String(outstanding)); setReceiveSource("AUTO"); }}>{hasReceivedSome ? "Receive outstanding" : "Mark received"}</button>}
                      <button type="button" className="table-action danger" onClick={() => void removePartLineRow(lineId)}>Remove</button>
                    </div>
                  </td>
                </tr>;
              })}
              {job.partLines.length === 0 && <tr><td colSpan={bulkEditMode ? 7 : 6} className="table-state compact-empty-state">No parts on this job yet.</td></tr>}
              {job.partLines.length > 0 && visiblePartLines.length === 0 && <tr><td colSpan={bulkEditMode ? 7 : 6} className="table-state compact-empty-state">No parts match &quot;{partSearchQuery}&quot;.</td></tr>}
            </tbody></table></div>
              );
            })()}
            {job.partLines.length > 0 && (
              <div className="detail-actions" style={{ borderTop: "1px solid var(--ink-150)" }}>
                <button type="button" className="section-action-button" onClick={() => setShowRfqPopup(true)}><Mail size={15} /> Request quotes from suppliers</button>
              </div>
            )}
          </section>
  ) : null;

  const pickSlipsSection = job ? (
          <section className="detail-panel">
            <header>
              <div><h2>Generated pick slips</h2><p>Every picking slip created for this job so far.</p></div>
              {job.partLines.length > 0 && (
                <button type="button" className="section-action-button" disabled={creatingPickSlip} onClick={() => void createJobPickSlip()}>{creatingPickSlip ? <Loader2 className="spin" size={14} /> : null} {creatingPickSlip ? "Creating…" : "Create picking slip"}</button>
              )}
            </header>
            {/* 2026-09-16 — result banner for "Create picking slip" above:
                picks this job's own outstanding parts against warehouse
                stock in place (see createPickSlipForJob's comment) rather
                than sending the user to Stock Levels to search for this
                job. Shown right under the header, next to the button that
                triggered it — same "don't bury feedback at the top of a
                very long page" fix applied elsewhere on this page. */}
            {pickSlipError ? <div className="inline-error">{pickSlipError}</div> : null}
            {pickSlipResult ? (
              <div className="inline-success" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span>
                  {pickSlipResult.pickedCount > 0
                    ? `Listed ${pickSlipResult.pickedCount} part line${pickSlipResult.pickedCount === 1 ? "" : "s"} to pick from stock. Stock is taken off the shelf when each part is marked received.`
                    : "No stock was available to list right now (parts ordered from a supplier are skipped)."}
                  {pickSlipResult.outstandingCount > 0 ? ` ${pickSlipResult.outstandingCount} line${pickSlipResult.outstandingCount === 1 ? "" : "s"} still outstanding.` : ""}
                  {(pickSlipResult.skipped || []).length > 0 ? <span style={{ display: "block", marginTop: 4 }}>{(pickSlipResult.skipped || []).map((k) => `${k.partNumber}: not listed because ${k.reason}.`).join(" ")}</span> : null}
                </span>
                {pickSlipResult.pickSlip ? (
                  <span style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="quiet-button" onClick={() => { const slip = pickSlipResult.pickSlip!; void offerToSave(printJobPickSlip(slip), "PICK_SLIP", () => pickSlipSpec(slip)); }}><Printer size={13} /> Print</button>
                    <button type="button" className="quiet-button" disabled={cancellingPickSlipId === pickSlipResult.pickSlip.id} onClick={() => void cancelJobPickSlip(pickSlipResult.pickSlip!.id)}>{cancellingPickSlipId === pickSlipResult.pickSlip.id ? <Loader2 className="spin" size={13} /> : <X size={13} />} {cancellingPickSlipId === pickSlipResult.pickSlip.id ? "Deleting…" : "Delete"}</button>
                  </span>
                ) : null}
              </div>
            ) : null}
            {/* 2026-09-29 — user request: "make viewing already created
                pickslips visible within the job self." Persistent list of
                every picking slip ever created for this job (unlike the
                banner above, which only shows the one just created this
                visit) — see jobPickSlips' own comment near its useState
                for why this needs its own fetch rather than riding along
                on job's own GET. Collapsed away entirely once there's
                nothing to show and nothing still loading, so a job with no
                picking history doesn't grow an empty section. */}
            {/* 2026-09-29 — user request: "deleted pickslips must delete
                completely from the system." Delete now genuinely removes
                the PickSlip row (see cancelPickSlip's own comment in
                inventory/service.ts), so every row this list can ever
                show is by definition still active — no more Status
                column/pill, which only ever existed to distinguish a
                soft-cancelled row from an active one. */}
            {jobPickSlipsError ? <div className="inline-error">{jobPickSlipsError}</div> : null}
            {jobPickSlipsLoading || jobPickSlips.length > 0 ? (
              <div className="data-table-wrap" style={{ margin: "0 14px 10px" }}>
                <table className="data-table">
                  <thead><tr><th>Pick slip</th><th>Lines</th><th className="actions">Actions</th></tr></thead>
                  <tbody>
                    {jobPickSlipsLoading ? (
                      <tr><td colSpan={3} className="table-state compact-empty-state"><Loader2 className="spin" size={16} /> Loading…</td></tr>
                    ) : (
                      jobPickSlips.map((ps, index) => (
                        <tr key={ps.id}>
                          <td>Pickslip {jobPickSlips.length - index} — {new Date(ps.createdAt).toLocaleString()}</td>
                          <td>{ps.lines.length}</td>
                          <td className="actions">
                            <button type="button" className="table-action" onClick={() => void offerToSave(printJobPickSlip(ps), "PICK_SLIP", () => pickSlipSpec(ps))}><Printer size={13} /> Print</button>
                            <button type="button" className="table-action" disabled={cancellingPickSlipId === ps.id} onClick={() => void cancelJobPickSlip(ps.id)}>
                              {cancellingPickSlipId === ps.id ? <Loader2 className="spin" size={13} /> : <X size={13} />} {cancellingPickSlipId === ps.id ? "Deleting…" : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : jobPickSlipsLoading ? null : (
              <p className="table-state compact-empty-state">No picking slips have been generated for this job yet.</p>
            )}
          </section>
  ) : null;

  const followUpSection = job && !mechanicFieldsLocked ? (
          <section className="detail-panel">
            <header><div><h2>Parts follow-up</h2><p>Chase every supplier with outstanding ordered parts on this job — one email per supplier listing everything still outstanding from them.</p></div></header>
            {/* 2026-09-16, user request: "Parts Follow up still does not show
                suppliers that have outstanding parts, like ModApp." Lists the
                same per-supplier breakdown ModApp's PartsFollowUpButton.tsx
                shows as a card per supplier, before anything is sent, with a
                per-supplier "Follow up" button alongside the bulk one below. */}
            {partsFollowupGroups.length > 0 && (
              <div className="drawer-fields" style={{ marginTop: 4 }}>
                {partsFollowupGroups.map((g) => (
                  <div key={g.supplierId} className="wide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>
                      <strong>{g.supplierName}</strong> — {g.count} line{g.count === 1 ? "" : "s"} outstanding
                      {g.overdueDays >= 7 && <span style={{ color: "var(--danger)", fontWeight: 700, marginLeft: 8 }}>Overdue — ordered {g.overdueDays} day{g.overdueDays === 1 ? "" : "s"} ago</span>}
                    </span>
                    {g.supplierId !== "unknown" && <button type="button" className="quiet-button" disabled={saving} onClick={() => void sendPartsFollowup(g.supplierId)}><Mail size={13} /> Follow up</button>}
                  </div>
                ))}
              </div>
            )}
            <footer className="detail-actions"><button type="button" className="section-action-button" disabled={saving || partsFollowupGroups.length === 0} onClick={() => void sendPartsFollowup()}><Mail size={15} /> Send follow-up to outstanding suppliers</button></footer>
            {/* 2026-09-15, user request: "error message when clicking
                button is not noticeable, make red text to get attention to
                it." The shared `error` state already renders once at the
                very top of the page (well above this section, easy to
                miss after clicking a button down here) — repeated here,
                bold and right next to the button that triggered it. */}
            {error && <p style={{ color: "var(--danger)", fontWeight: 700, marginTop: 8 }}>{error}</p>}
            {partsFollowupResult && (
              <div className="drawer-fields" style={{ marginTop: 8 }}>
                {partsFollowupResult.sent.length > 0 && <p className="muted small-line wide">Sent to: {partsFollowupResult.sent.map((s) => s.supplierName).join(", ")}.</p>}
                {partsFollowupResult.skipped.length > 0 && (
                  <div className="wide" style={{ display: "grid", gap: 3 }}>
                    {partsFollowupResult.skipped.map((s, idx) => <div key={idx} className="muted small-line">{s.supplierName}: {s.reason}</div>)}
                  </div>
                )}
                {partsFollowupResult.sent.length === 0 && partsFollowupResult.skipped.length === 0 && <p className="muted small-line wide">No outstanding ordered parts on this job.</p>}
              </div>
            )}
          </section>
  ) : null;

  const outworkSection = job ? (
          <section className="detail-panel">
            <header>
              <div><h2>Outwork</h2><p>Components sent out to a supplier for outwork (machining, sandblasting, plating) — tracked until they come back.</p></div>
              <button type="button" className="section-action-button" onClick={() => setShowOutworkPopup(true)}><Plus size={15} /> Record outwork</button>
            </header>
            {showOutworkPopup && (
              <div className="drawer-backdrop" role="dialog" aria-modal="true">
                <aside className="form-drawer compact-dialog job-editor-drawer">
                  <header><div><h2>Record outwork</h2><p>Send components out to a supplier for outwork.</p></div><button type="button" onClick={() => setShowOutworkPopup(false)} aria-label="Close dialog"><X size={18} /></button></header>
                  <div className="drawer-fields">
                    <label className="party-selector" onBlur={closeDropdownUnlessWithin(() => setOutworkSupplierPickerOpen(false))}><span>Supplier</span><div><Search size={15} /><input value={outworkSupplierQuery} onChange={(e) => { setOutworkSupplierQuery(e.target.value); setOutworkSupplierId(""); setOutworkSupplierPickerOpen(true); }} onFocus={() => setOutworkSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{outworkSupplierPickerOpen && outworkSupplierQuery.trim().length >= 2 && <div className="selector-results">{outworkSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setOutworkSupplierId(s.id); setOutworkSupplierQuery(s.name); setOutworkSupplierOptions([]); setOutworkSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}<button type="button" disabled={outworkCreatingSupplier} onClick={() => void createOutworkSupplier()}><Plus size={13} style={{ verticalAlign: "-2px" }} /> {outworkCreatingSupplier ? "Creating…" : `Create supplier "${outworkSupplierQuery.trim()}"`}</button></div>}</label>
                    <label><span>Date sent out</span><input type="date" value={outworkDateSentOut} onChange={(e) => setOutworkDateSentOut(e.target.value)} /></label>
                    <div className="wide">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Items being sent</span>
                        <button type="button" className="quiet-button" onClick={addOutworkRow}><Plus size={14} /> Add line</button>
                      </div>
                      {outworkLines.map((row) => <div key={row.id} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                        <input value={row.description} onChange={(e) => updateOutworkRow(row.id, "description", e.target.value)} placeholder="e.g. Compressor housing" style={{ flex: 1 }} />
                        <input type="number" min={1} value={row.quantity} onChange={(e) => updateOutworkRow(row.id, "quantity", e.target.value)} style={{ width: 80 }} />
                        {outworkLines.length > 1 && <button type="button" className="table-action danger" onClick={() => removeOutworkRow(row.id)}>Remove</button>}
                      </div>)}
                    </div>
                  </div>
                  <footer className="detail-actions"><button type="button" className="gold-button" disabled={saving || !outworkSupplierId} onClick={() => void submitOutwork()}><Plus size={15} /> Record outwork</button></footer>
                </aside>
              </div>
            )}
            {/* Days outstanding sits immediately left of Status, and Notes
                immediately right of it — both added 2026-09-10 at the
                user's request ("next to status field" / "next to Status on
                the left side"), see outworkDaysOutstanding() above. */}
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Description</th><th>Qty</th><th>Supplier</th><th>Sent / received</th><th>Days outstanding</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>
              {job.outworkItems.map((item) => {
                const editing = editingOutworkId === String(item.id);
                if (editing) {
                  return <tr key={item.id}>
                    <td><input value={editOutworkDescription} onChange={(e) => setEditOutworkDescription(e.target.value)} /></td>
                    <td><input type="number" min={1} value={editOutworkQuantity} onChange={(e) => setEditOutworkQuantity(e.target.value)} style={{ width: 70 }} /></td>
                    <td className="party-selector" onBlur={closeDropdownUnlessWithin(() => setEditOutworkSupplierPickerOpen(false))}><div><Search size={14} /><input value={editOutworkSupplierQuery} onChange={(e) => { setEditOutworkSupplierQuery(e.target.value); setEditOutworkSupplierId(""); setEditOutworkSupplierPickerOpen(true); }} onFocus={() => setEditOutworkSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{editOutworkSupplierPickerOpen && editOutworkSupplierQuery.trim().length >= 2 && <div className="selector-results">{editOutworkSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setEditOutworkSupplierId(s.id); setEditOutworkSupplierQuery(s.name); setEditOutworkSupplierOptions([]); setEditOutworkSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}<button type="button" disabled={editOutworkCreatingSupplier} onClick={() => void createEditOutworkSupplier()}><Plus size={12} style={{ verticalAlign: "-2px" }} /> {editOutworkCreatingSupplier ? "Creating…" : `Create supplier "${editOutworkSupplierQuery.trim()}"`}</button></div>}</td>
                    {/* 2026-10-01, user request ("be able to edit receive
                        date like sent date") — Date received added
                        alongside Date sent out, same cell as the "Sent /
                        received" column shows both as stacked muted lines
                        in the non-editing row below. Clearing this reverts
                        the item to SENT_OUT, setting it marks RECEIVED —
                        see editOutworkItem's comment in @/lib/jobs/service. */}
                    <td className="outwork-edit-dates">
                      <div className="outwork-edit-date-row"><span>Sent</span><input type="date" value={editOutworkDateSentOut} onChange={(e) => setEditOutworkDateSentOut(e.target.value)} /></div>
                      <div className="outwork-edit-date-row"><span>Received</span><input type="date" value={editOutworkDateReceived} onChange={(e) => setEditOutworkDateReceived(e.target.value)} /></div>
                    </td>
                    <td>{outworkDaysOutstanding(item)}</td>
                    <td><span className={`status-pill ${item.status === "RECEIVED" ? "" : "neutral"}`}>{text(item.status).replaceAll("_", " ")}</span></td>
                    <td><input value={editOutworkNotes} onChange={(e) => setEditOutworkNotes(e.target.value)} placeholder="Note" style={{ width: 140 }} /></td>
                    <td className="actions">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button type="button" className="table-action" disabled={saving || !editOutworkSupplierId || !editOutworkDescription.trim()} onClick={() => void saveOutworkEdit(String(item.id))}>Save</button>
                        <button type="button" className="table-action" disabled={saving} onClick={cancelEditOutwork}>Cancel</button>
                      </div>
                    </td>
                  </tr>;
                }
                return <tr key={item.id}>
                  <td><strong>{text(item.description)}</strong></td>
                  <td>{decimalText(item.quantity)}</td>
                  <td>{text(item.supplier?.name)}</td>
                  <td>
                    {item.dateSentOut ? <div className="muted small-line">Sent {new Date(String(item.dateSentOut)).toLocaleDateString("en-ZA")}</div> : null}
                    {item.dateReceived ? <div className="muted small-line">Received {new Date(String(item.dateReceived)).toLocaleDateString("en-ZA")}</div> : null}
                  </td>
                  <td>{outworkDaysOutstanding(item)}</td>
                  <td><span className={`status-pill ${item.status === "RECEIVED" ? "" : "neutral"}`}>{text(item.status).replaceAll("_", " ")}</span></td>
                  <td className="muted small-line">{text(item.notes)}</td>
                  <td className="actions">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {item.status === "SENT_OUT" && <button type="button" className="table-action" disabled={saving} onClick={() => void markOutworkReceived(String(item.id))}>Mark received</button>}
                      {item.status === "RECEIVED" && <button type="button" className="table-action" disabled={saving} onClick={() => void unmarkOutworkReceived(String(item.id))}>Undo receive</button>}
                      <button type="button" className="table-action" onClick={() => openDeliveryNoteForItem(item)}>View delivery note</button>
                      <button type="button" className="table-action" disabled={saving} onClick={() => startEditOutwork(item)}>Edit</button>
                      <button type="button" className="table-action danger" onClick={() => void deleteOutworkRow(String(item.id))}>Remove</button>
                    </div>
                  </td>
                </tr>;
              })}
              {job.outworkItems.length === 0 && <tr><td colSpan={8} className="table-state compact-empty-state">No outwork recorded on this job yet.</td></tr>}
            </tbody></table></div>
          </section>
  ) : null;

  const attachmentsSection = job ? (
            <section className="detail-panel">
              <header>
                <div><h2>{fieldLayout ? "Photos & attachments" : "Attachments"}</h2><p>Photos, documents and other files kept with this job — stored with the job record itself (an object-storage move is planned; see the storage-architecture decision doc).</p></div>
              </header>
              <div className="drawer-fields">
                <label><span>Upload a file (max 8MB)</span><input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} /></label>
                {fieldLayout && (
                  <label><span>Tag</span>
                    <select value={attachmentTag} onChange={(e) => setAttachmentTag(e.target.value)}>
                      <option value="">—</option>
                      {Object.entries(ATTACHMENT_TAG_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                )}
                <label><span>Notes (optional)</span><input value={attachmentNotes} onChange={(e) => setAttachmentNotes(e.target.value)} placeholder="What is this file?" /></label>
                <label><span>&nbsp;</span><button type="button" className="gold-button" disabled={!attachmentFile || attachmentUploading} onClick={() => void uploadAttachment()}>{attachmentUploading && <Loader2 className="spin" size={14} />} <Plus size={15} /> Upload</button></label>
              </div>
              <div className="record-list">
                {job.attachments.length === 0 && <div className="table-state compact-empty-state">No attachments uploaded yet.</div>}
                {job.attachments.map((file) => {
                  const fileId = String(file.id);
                  const isEditingNote = editingAttachmentId === fileId;
                  return (
                  <article key={fileId}>
                    <div className="record-icon"><FileText size={14} /></div>
                    <div>
                      <strong><button type="button" className="table-action" onClick={() => void viewAttachment(fileId)}>{text(file.fileName)}</button></strong>
                      {file.tag ? <span className="field-tag-chip">{ATTACHMENT_TAG_LABELS[String(file.tag)] || String(file.tag)}</span> : null}
                      <span>{file.sizeBytes ? `${Math.max(1, Math.round(Number(file.sizeBytes) / 1024))} KB` : "—"} · {file.createdBy?.displayName || "System"}</span>
                      {isEditingNote ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                          <input value={editingAttachmentNotes} onChange={(e) => setEditingAttachmentNotes(e.target.value)} placeholder="What is this file?" style={{ flex: 1 }} />
                          <button type="button" className="quiet-button" disabled={savingAttachmentNotes} onClick={() => { setEditingAttachmentId(""); setEditingAttachmentNotes(""); }}>Cancel</button>
                          <button type="button" className="gold-button" disabled={savingAttachmentNotes} onClick={() => void saveAttachmentNotes(fileId)}>{savingAttachmentNotes ? "Saving…" : "Save"}</button>
                        </div>
                      ) : (
                        <span>{file.notes ? text(file.notes) : <em className="muted">No note</em>} <button type="button" className="table-action" title="Edit note" aria-label="Edit note" onClick={() => { setEditingAttachmentId(fileId); setEditingAttachmentNotes(file.notes ? String(file.notes) : ""); }}><Pencil size={12} /></button></span>
                      )}
                    </div>
                    <span>{file.createdAt ? new Date(String(file.createdAt)).toLocaleDateString("en-ZA") : "—"}</span>
                    <button type="button" className="table-action" onClick={() => void viewAttachment(fileId)}><Download size={14} /> Download</button>
                    <button type="button" className="table-action danger" onClick={() => void deleteAttachment(fileId)}>Delete</button>
                  </article>
                  );
                })}
              </div>
            </section>
  ) : null;

  const activitySection = job && !mechanicFieldsLocked ? (
          <section className="detail-panel">
            <header>
              <div><h2>Activity history</h2><p>Chronological workflow history from the Jobs service.</p></div>
              <button type="button" className="section-action-button" onClick={() => setShowActivityHistory((v) => !v)}>{showActivityHistory ? "Hide" : "View activity history"}</button>
            </header>
            {showActivityHistory && (
              <div className="history-list">{job.activities.map((activity) => <article key={activity.id}><strong>{text(activity.description)}</strong><span>{text(activity.type).replaceAll("_", " ")} · {activity.actor?.displayName || "System"}</span><time>{new Date(String(activity.createdAt)).toLocaleString("en-ZA")}</time></article>)}
              {job.activities.length === 0 && <p className="table-state compact-empty-state">No activity recorded yet.</p>}</div>
            )}
          </section>
  ) : null;

  // ---------------------------------------------------------------------
  // 2026-10-06 — Field service job layout. Only jobs whose saved type is
  // FIELD_SERVICE use it (every other type keeps the layout above/below
  // unchanged). Built from the same section consts as the standard layout,
  // arranged as a main column + a sidebar.
  // ---------------------------------------------------------------------
  const fieldHoursParts = [form.fieldHoursNormal, form.fieldHoursOvertime, form.fieldHoursTravelled];
  const fieldHoursTotal = fieldHoursParts.every((value) => !value) ? "" : String(Math.round(fieldHoursParts.reduce((sum, value) => sum + (Number(value) || 0), 0) * 100) / 100);
  const fieldSiteLine = (form.siteAddress || form.fieldSite || "").split("\n")[0];

  const fieldSummaryStrip = job && fieldLayout ? (
    <section className="detail-panel field-summary-strip">
      <div><b>Customer</b><span>{job.customer?.name ? String(job.customer.name) : "—"}</span></div>
      <div><b>Site</b><span>{fieldSiteLine || "—"}</span></div>
      <div><b>Scheduled</b><span>{form.fieldScheduledDate ? new Date(form.fieldScheduledDate).toLocaleDateString("en-ZA") : "—"}</span></div>
      <div><b>Technician</b><span>{form.fieldTechnician || "—"}</span></div>
      <div><b>Machine</b><span>{[form.machineMake, form.machineModel].filter(Boolean).join(" ") || "—"}</span></div>
      <div><b>Total hours</b><span>{fieldHoursTotal || "—"}</span></div>
    </section>
  ) : null;

  const workRequestedSection = job && fieldLayout ? (
    <section className="detail-panel">
      <header><div><h2>Work requested</h2><p>What the customer wants done, and the machine it is on.</p></div></header>
      <fieldset disabled={mechanicFieldsLocked} className="unstyled-fieldset">
      <div className="drawer-fields">
        <label><span>Job type *</span><select value={form.type} onChange={(e) => updateField("type", e.target.value)}>{JOB_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="wide"><span>Job description</span><textarea rows={3} value={form.description} onChange={(e) => updateField("description", e.target.value)} /></label>
        <p className="field-subhead wide">Machine / component</p>
        <label className="party-selector" onBlur={closeDropdownUnlessWithin(() => setShowMachineMakeOptions(false))}>
          <span>Machine make</span>
          <div><Search size={14} /><input value={form.machineMake} onChange={(e) => { updateField("machineMake", e.target.value); setShowMachineMakeOptions(true); }} onFocus={() => setShowMachineMakeOptions(true)} placeholder="Search manufacturers or type a new one" /></div>
          {showMachineMakeOptions && machineMakeOptions.length > 0 && (
            <div className="selector-results">
              {machineMakeOptions.map((m) => <button key={m.id} type="button" onClick={() => { updateField("machineMake", m.name); setShowMachineMakeOptions(false); }}><strong>{m.name}</strong></button>)}
            </div>
          )}
        </label>
        <label><span>Machine model</span><input value={form.machineModel} onChange={(e) => updateField("machineModel", e.target.value)} /></label>
        <label><span>Machine serial</span><input value={form.machineSerial} onChange={(e) => updateField("machineSerial", e.target.value)} /></label>
        <label><span>Plant number</span><input value={form.plantNumber} onChange={(e) => updateField("plantNumber", e.target.value)} /></label>
        <label><span>Machine hours</span><input type="number" min="0" step="0.01" value={form.machineHours} onChange={(e) => updateField("machineHours", e.target.value)} /></label>
        <label><span>Component</span><input value={form.component} onChange={(e) => updateField("component", e.target.value)} /></label>
        <label><span>Component serial</span><input value={form.componentSerial} onChange={(e) => updateField("componentSerial", e.target.value)} /></label>
      </div>
      </fieldset>
    </section>
  ) : null;

  const fieldServiceSection = job && fieldLayout ? (
    <section className="detail-panel">
      <header><div><h2>Field service</h2><p>Who is going, when, and what was done.</p></div></header>
      <fieldset disabled={mechanicFieldsLocked} className="unstyled-fieldset">
      <div className="drawer-fields">
        <label><span>Technician</span><input value={form.fieldTechnician} onChange={(e) => updateField("fieldTechnician", e.target.value)} /></label>
        <label><span>Vehicle</span><input value={form.fieldVehicle} onChange={(e) => updateField("fieldVehicle", e.target.value)} /></label>
        <label><span>Scheduled date</span><input type="date" value={form.fieldScheduledDate} onChange={(e) => updateField("fieldScheduledDate", e.target.value)} /></label>
        <label><span>Kms travelled</span><input type="number" min="0" value={form.kmsTravelled} onChange={(e) => updateField("kmsTravelled", e.target.value)} /></label>
        <label><span>Hours worked, normal time</span><input type="number" min="0" step="0.25" value={form.fieldHoursNormal} onChange={(e) => updateField("fieldHoursNormal", e.target.value)} /></label>
        <label><span>Hours worked, overtime</span><input type="number" min="0" step="0.25" value={form.fieldHoursOvertime} onChange={(e) => updateField("fieldHoursOvertime", e.target.value)} /></label>
        <label><span>Hours travelled</span><input type="number" min="0" step="0.25" value={form.fieldHoursTravelled} onChange={(e) => updateField("fieldHoursTravelled", e.target.value)} /></label>
        <label><span>Total hours</span><input readOnly value={fieldHoursTotal} className="field-readonly" aria-label="Total hours (calculated)" /></label>
        <p className="field-subhead wide">Work performed</p>
        <label className="wide"><span>Report</span><textarea rows={3} value={form.fieldReport} onChange={(e) => updateField("fieldReport", e.target.value)} /></label>
        <label className="wide"><span>Findings / cause of failure</span><textarea rows={3} value={form.fieldFindings} onChange={(e) => updateField("fieldFindings", e.target.value)} /></label>
        <label className="wide"><span>Work done</span><textarea rows={3} value={form.fieldWorkDone} onChange={(e) => updateField("fieldWorkDone", e.target.value)} /></label>
        <label className="wide"><span>Recommendations</span><textarea rows={3} value={form.fieldRecommendations} onChange={(e) => updateField("fieldRecommendations", e.target.value)} /></label>
        <label className="inline-check"><input type="checkbox" checked={form.fieldFollowUp === "true"} onChange={(e) => updateField("fieldFollowUp", e.target.checked ? "true" : "")} /><span>Follow-up visit needed</span></label>
        {form.fieldFollowUp === "true" && <label><span>Follow-up date</span><input type="date" value={form.fieldFollowUpDate} onChange={(e) => updateField("fieldFollowUpDate", e.target.value)} /></label>}
      </div>
      </fieldset>
    </section>
  ) : null;

  // Pick slips only once parts are added; Follow-up only while ordered parts
  // are outstanding (same groups the Follow-up section itself lists).
  const showPickSlipsTab = !!job && (job.partLines.length > 0 || jobPickSlips.length > 0);
  const showFollowupTab = !!job && !mechanicFieldsLocked && partsFollowupGroups.length > 0;
  const activePartsTab = fieldPartsTab === "pickslips" && showPickSlipsTab ? "pickslips" : fieldPartsTab === "followup" && showFollowupTab ? "followup" : "parts";
  const fieldPartsBlock = job && fieldLayout ? (
    <div className="field-parts-block">
      <div className="field-tabs" role="tablist" aria-label="Parts">
        <button type="button" role="tab" aria-selected={activePartsTab === "parts"} className={activePartsTab === "parts" ? "field-tab active" : "field-tab"} onClick={() => setFieldPartsTab("parts")}>Parts list <span className="field-tab-count">{job.partLines.length}</span></button>
        {showPickSlipsTab && <button type="button" role="tab" aria-selected={activePartsTab === "pickslips"} className={activePartsTab === "pickslips" ? "field-tab active" : "field-tab"} onClick={() => setFieldPartsTab("pickslips")}>Pick slips <span className="field-tab-count">{jobPickSlips.length}</span></button>}
        {showFollowupTab && <button type="button" role="tab" aria-selected={activePartsTab === "followup"} className={activePartsTab === "followup" ? "field-tab active" : "field-tab"} onClick={() => setFieldPartsTab("followup")}>Follow-up <span className="field-tab-count">{partsFollowupGroups.length}</span></button>}
      </div>
      {activePartsTab === "parts" && partsListSection}
      {activePartsTab === "pickslips" && pickSlipsSection}
      {activePartsTab === "followup" && followUpSection}
    </div>
  ) : null;

  const fieldJobLayout = job && fieldLayout ? (
    <div className="field-job-layout">
      {fieldSummaryStrip}
      <div className="field-job-grid">
        <div className="field-job-main">
          <div className="job-edit-grid field-stack">{customerSection}{workRequestedSection}{fieldServiceSection}</div>
          {attachmentsSection}
          {outworkSection}
          {fieldPartsBlock}
        </div>
        <div className="field-job-side">
          <div className="job-edit-grid field-stack">{notesSection}{commercialSection}</div>
          {activitySection}
        </div>
      </div>
    </div>
  ) : null;


  return (
    <div className="job-workspace">
      <div className="job-sticky-header" ref={setStickyHeaderNode}>
        <header className="page-header compact">
          <div>
            <Link href="/jobs" className="back-link" onClick={handleBackClick}><ArrowLeft size={15} /> Back to jobs</Link>
            <p className="eyebrow">Jobs</p>
            {/* Status pill moved up next to the job number, and the status
                stepper (below, still inside .job-sticky-header) moved from
                its own separate "Job status" section up to sit directly
                under this header block — both 2026-09-29, user request
                ("mockup of how the job status slider will look inline with
                the job number field"). The plain-text " · <status label>"
                that used to follow the job type below has been dropped
                since the pill now carries that same information. */}
            <div className="header-title-row">
              <h1>{title}</h1>
              {/* 2026-10-01 — user request ("let it add a status pill next
                  to the job status 'Return Unrepaired' and once the job is
                  completed the status will become 'Completed /
                  Unrepaired'"): the flag shows as its own pill alongside
                  the normal status pill right up until the job reaches
                  COMPLETE, at which point it's folded into the main pill's
                  own label instead (jobStatusLabel in StatusPill.tsx) —
                  see ReturnUnrepairedPill's own comment there. */}
              {job && <StatusPill status={job.status} returnedUnrepaired={job.returnedUnrepaired} />}
              {job && job.returnedUnrepaired && job.status !== "COMPLETE" && <ReturnUnrepairedPill />}
              {pexInStock && <PexAllocatedPill />}
            </div>
            {/* 2026-10-01 — gated by canViewCustomer alongside the
                Customer details section itself (see jobFormSections
                above); this clickable name is also customer information. */}
            {mode === "detail" && job?.customer && canViewCustomer && (
              <p className="header-customer-line"><Link href={`/customers/${job.customer.id}`}>{job.customer.name}</Link></p>
            )}
            <p>
              {mode === "create" ? "The job number is allocated immediately, using your Numbering settings." : JOB_TYPE_LABELS[(job?.type || "STANDARD_REPAIR") as keyof typeof JOB_TYPE_LABELS]}
              {/* 2026-10-01, user request — warranty status shown next to
                  the job type, only for Warranty-type jobs. job.warranty is
                  only set once a JobWarranty row exists (saved from the
                  Warranty panel below); defaults to PENDING same as that
                  panel's own form.warrantyStatus default until then. */}
              {mode === "detail" && job?.type === "WARRANTY" && <> · <WarrantyStatusPill status={job.warranty?.status ? String(job.warranty.status) : "PENDING"} /></>}
            </p>
          </div>
          <div className="header-actions">
            {mode === "create" ? (
              <button type="submit" form="job-edit-form" className="gold-button" disabled={saving || !form.customerId}><Save size={15} />{saving ? "Creating…" : "Create draft"}</button>
            ) : (
              // Save button removed in detail mode (2026-09-14, user
              // request) — every field autosaves on its own (see the
              // effect above); this just reflects that status back to the
              // person instead of asking them to trigger it.
              <span className={`autosave-indicator ${autosaveState}`}>
                {autosaveState === "saving" ? <><Loader2 className="spin" size={13} /> Saving…</> : autosaveState === "error" ? "Save failed — retrying" : <><Save size={13} /> All changes saved</>}
              </span>
            )}
            {job && mode === "detail" && (
              <>
                {/* 2026-10-01 — user request: "mechanic user - remove the
                    print job card, job history, delivery note buttons from
                    job views." Hidden (not just locked) for
                    mechanicFieldsLocked, same tenantRole === "USER" flag as
                    every other Mechanic-only restriction on this page. */}
                {/* 2026-10-06 — field service jobs print a Field Report (what was saved
                    on the job) instead of the workshop job card. */}
                {!mechanicFieldsLocked && job.type === "FIELD_SERVICE" && <button type="button" className="table-action" onClick={() => void offerToSave(printFieldReport(), "FIELD_REPORT", fieldReportSpec)}><Printer size={14} /> Print Field Report</button>}
                {!mechanicFieldsLocked && job.type !== "FIELD_SERVICE" && <button type="button" className="table-action" onClick={() => void offerToSave(printJobCard(), "JOB_CARD", jobCardSpec)}><Printer size={14} /> Print job card</button>}
                {/* 2026-09-19, user request — see printJobHistory/
                    printJobDeliveryNote's own comments above for scope. */}
                {!mechanicFieldsLocked && <button type="button" className="table-action" onClick={() => void offerToSave(printJobHistory(), "JOB_HISTORY", jobHistorySpec)}><Printer size={14} /> Print Job History</button>}
                {!mechanicFieldsLocked && <button type="button" className="table-action" onClick={openJobDeliveryNoteDialog}><Printer size={14} /> Print Delivery Note</button>}
                {/* 2026-10-01 — every button below changes job.status (the
                    same action the status stepper performs, just via a
                    dedicated dialog/confirm instead of a stepper click), so
                    they're hidden together with it for mechanicFieldsLocked
                    — leaving them visible would let a Mechanic route around
                    the locked stepper. Server-side: requireNotMechanicRestricted
                    in jobs/service.ts rejects all of these regardless. */}
                {!mechanicFieldsLocked && job.status === "DRAFT" && <button type="button" className="gold-button" onClick={() => setDialog("register")}><Plus size={14} /> Register</button>}
                {/* 2026-10-01 — no longer excludes a "RETURNED_UNREPAIRED"
                    status (that status is retired — see
                    Job.returnedUnrepaired's own comment in schema.prisma);
                    instead hidden once the flag itself is already set,
                    since the job can only be flagged once. */}
                {!mechanicFieldsLocked && canMarkReturnedUnrepaired(job.type) && !job.returnedUnrepaired && !["DRAFT", "CLOSED", "CANCELLED", "COMPLETE"].includes(job.status) && <button type="button" className="table-action" onClick={() => setDialog("returned-unrepaired")}>Mark returned unrepaired</button>}
                {/* 2026-10-01, user request: "Mark return unrepaired button,
                    allow to undo once clicked." Shown whenever the flag is
                    set, including once the job has reached COMPLETE (it's
                    showing as "Completed / Unrepaired" by then — see
                    ReturnUnrepairedPill), since it was still set by mistake
                    and should still be clearable. */}
                {!mechanicFieldsLocked && job.returnedUnrepaired && !["CLOSED", "CANCELLED"].includes(job.status) && <button type="button" className="table-action" onClick={() => { void confirm({ message: "Undo \"Returned unrepaired\" on this job?", tone: "neutral", confirmLabel: "Undo" }).then((ok) => { if (ok) void postAction(`/api/v1/jobs/${job.id}/returned-unrepaired/undo`, {}); }); }}>Undo returned unrepaired</button>}
                {!mechanicFieldsLocked && !["DRAFT", "CLOSED", "CANCELLED", "COMPLETE"].includes(job.status) && <button type="button" className="table-action danger" onClick={() => { void confirm({ message: "Cancel this job?", tone: "danger", confirmLabel: "Cancel job" }).then((ok) => { if (ok) void postAction(`/api/v1/jobs/${job.id}/status`, { status: "CANCELLED", reason: null }); }); }}>Cancel job</button>}
                {!mechanicFieldsLocked && !["DRAFT", "CLOSED", "CANCELLED", "COMPLETE"].includes(job.status) && <button type="button" className="table-action" onClick={() => setDialog("close")}>Close job</button>}
                {!mechanicFieldsLocked && ["CLOSED", "CANCELLED", "COMPLETE"].includes(job.status) && <button type="button" className="table-action" onClick={() => setDialog("reopen")}>Reopen job</button>}
              </>
            )}
          </div>
        </header>

        {error && <div className="inline-error">{error}</div>}
        {documentNotice && <div className="inline-success">{documentNotice}</div>}

        {job && job.status !== "DRAFT" && (
          <div className="job-header-stepper">
            {["CLOSED", "CANCELLED"].includes(job.status) ? (
              <p className="status-stepper-note">
                This job isn&apos;t on the normal status flow right now ({JOB_STATUS_LABELS[job.status]}) — use Reopen above to bring it back onto the stepper.
              </p>
            ) : (
              <>
                {/* 2026-10-01 — user's explicit choice: lock the status
                    stepper for a Mechanic (tenantRole === "USER"), not
                    just hide its hint text. disabled below additionally
                    covers `saving`, same as before. */}
                <p className="job-header-stepper-hint">{mechanicFieldsLocked ? "Status changes for this job are managed by your office/admin team." : "Click a stage to move the job straight there — saves immediately."}</p>
                <StatusStepper
                  // TO_BE_COLLECTED is deliberately left OUT of this call's
                  // `steps` only — @/lib/jobs/ui's MAIN_WORKSHOP_STATUS_STEPS
                  // itself is untouched, so the "Initial status"/"Reopen to
                  // status" dropdowns below (which read that same array
                  // directly) still offer "To be collected" as its own
                  // choice. This is purely a stepper *display* merge
                  // (2026-09-29, user request: "combine to be received and
                  // to be collected as they are the same thing") — a job
                  // actually registered as TO_BE_COLLECTED keeps that exact
                  // status (and its own "To be collected" label everywhere
                  // else: the pill above, the Jobs list, prints) and just
                  // shows as the current stage on TO_BE_RECEIVED's node
                  // here, same mechanism as WAITING_FOR_PARTS/AWAIT_OUTWORK
                  // below.
                  steps={statusStepsForJobType(job.type).filter((step) => step !== "TO_BE_COLLECTED")}
                  // Relabels only the merged node for this stepper — the
                  // shared JOB_STATUS_LABELS.TO_BE_RECEIVED entry itself is
                  // untouched, so every other place a TO_BE_RECEIVED job's
                  // status is shown (pill, Jobs list, prints) still just
                  // reads "To be received".
                  labels={{ ...JOB_STATUS_LABELS, TO_BE_RECEIVED: "To be received/collected" }}
                  // WAITING_FOR_PARTS was folded into the AWAIT_OUTWORK
                  // stepper stage on 2026-09-10, and TO_BE_COLLECTED folded
                  // into TO_BE_RECEIVED on 2026-09-29 (see the `steps`/
                  // `labels` comments above) — normalize both here so a job
                  // still sitting on either merged-away status highlights on
                  // its surviving stepper stage instead of showing no
                  // current stage at all (StatusStepper's currentIndex is
                  // steps.indexOf(status)).
                  status={
                    job.status === "WAITING_FOR_PARTS"
                      ? "AWAIT_OUTWORK"
                      : job.status === "TO_BE_COLLECTED"
                        ? "TO_BE_RECEIVED"
                        : job.status
                  }
                  disabled={saving || mechanicFieldsLocked}
                  onSelect={(step) => void postAction(`/api/v1/jobs/${job.id}/status`, { status: step, reason: null })}
                />
              </>
            )}
          </div>
        )}
      </div>
      {/* Reserves the space the now-fixed header above no longer occupies
          in normal flow — see stickyHeaderHeight's ResizeObserver above. */}
      <div style={{ height: stickyHeaderHeight }} aria-hidden="true" />

      {mode === "create" && (
        <form className="job-layout" id="job-edit-form" onSubmit={submitDraft}>{jobFormSections}</form>
      )}

      {job && (
        <>
          {fieldLayout ? fieldJobLayout : (
          <form className="job-layout" id="job-edit-form" onSubmit={submitDraft}>{jobFormSections}</form>
          )}

          {dialog === "register" && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog">
                <header><div><p className="eyebrow">Jobs</p><h2>Register job</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  <label><span>Initial status</span><select value={form.registerStatus} onChange={(e) => updateField("registerStatus", e.target.value)}>{statusStepsForJobType(job.type).map((value) => <option key={value} value={value}>{JOB_STATUS_LABELS[value as keyof typeof JOB_STATUS_LABELS]}</option>)}</select></label>
                </div>
                <footer className="detail-actions"><button type="button" className="gold-button" disabled={saving} onClick={() => { void postAction(`/api/v1/jobs/${job.id}/register`, { initialStatus: form.registerStatus }).then(() => setDialog(null)); }}>Register job</button></footer>
              </aside>
            </div>
          )}

          {dialog === "close" && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog">
                <header><div><p className="eyebrow">Jobs</p><h2>Close job</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  <label><span>Outcome</span><input value={form.closingOutcome} onChange={(e) => updateField("closingOutcome", e.target.value)} /></label>
                  <label className="wide"><span>Closing note</span><textarea rows={3} value={form.closingNote} onChange={(e) => updateField("closingNote", e.target.value)} /></label>
                </div>
                <footer className="detail-actions"><button type="button" className="gold-button" disabled={saving || form.closingOutcome.length < 2 || form.closingNote.length < 2} onClick={() => { void postAction(`/api/v1/jobs/${job.id}/close`, { outcome: form.closingOutcome, closingNote: form.closingNote }).then(() => setDialog(null)); }}>Close job</button></footer>
              </aside>
            </div>
          )}

          {dialog === "reopen" && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog">
                <header><div><p className="eyebrow">Jobs</p><h2>Reopen job</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  <label><span>Reopen to status</span><select value={form.reopenStatus} onChange={(e) => updateField("reopenStatus", e.target.value)}>{statusStepsForJobType(job.type).map((value) => <option key={value} value={value}>{JOB_STATUS_LABELS[value as keyof typeof JOB_STATUS_LABELS]}</option>)}</select></label>
                  <label className="wide"><span>Reason (optional)</span><input value={form.reopenReason} onChange={(e) => updateField("reopenReason", e.target.value)} /></label>
                </div>
                <footer className="detail-actions"><button type="button" className="gold-button" disabled={saving} onClick={() => { void postAction(`/api/v1/jobs/${job.id}/reopen`, { status: form.reopenStatus, reason: form.reopenReason || null }).then(() => setDialog(null)); }}>Reopen job</button></footer>
              </aside>
            </div>
          )}

          {dialog === "returned-unrepaired" && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog">
                <header><div><p className="eyebrow">Jobs</p><h2>Mark returned unrepaired</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  {/* 2026-10-01 — user request: this no longer closes the
                      job or changes its status — it just adds a "Return
                      Unrepaired" pill next to the normal status pill, and
                      the job keeps moving through its usual stepper as
                      before. Once it reaches Completed, the pill folds into
                      that status instead, reading "Completed / Unrepaired". */}
                  <p className="muted small-line">This flags the job as returned unrepaired — it keeps moving through its normal status stepper. A &quot;Return Unrepaired&quot; pill shows next to its status until the job is completed, at which point the status itself reads &quot;Completed / Unrepaired&quot;.</p>
                  <label className="wide"><span>Reason</span><textarea rows={3} value={form.returnedUnrepairedReason} onChange={(e) => updateField("returnedUnrepairedReason", e.target.value)} /></label>
                </div>
                <footer className="detail-actions"><button type="button" className="gold-button" disabled={saving || form.returnedUnrepairedReason.trim().length < 2} onClick={() => { void postAction(`/api/v1/jobs/${job.id}/returned-unrepaired`, { reason: form.returnedUnrepairedReason }).then(() => setDialog(null)); }}>Mark returned unrepaired</button></footer>
              </aside>
            </div>
          )}

          {dialog === "pex-scrap" && job.pexAsReturn && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog">
                <header><div><p className="eyebrow">PEX</p><h2>Scrap PEX unit</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  <p className="muted small-line">This marks the unit as scrapped and closes off its PEX cycle. It cannot be undone.</p>
                  <label className="wide"><span>Reason</span><textarea rows={3} value={form.pexScrapReason} onChange={(e) => updateField("pexScrapReason", e.target.value)} /></label>
                </div>
                <footer className="detail-actions"><button type="button" className="gold-button" disabled={saving || form.pexScrapReason.trim().length < 2} onClick={() => { void postAction(`/api/v1/pex/${job.pexAsReturn?.id}/scrap`, { reason: form.pexScrapReason }).then(() => { updateField("pexScrapReason", ""); setDialog(null); }); }}>Scrap unit</button></footer>
              </aside>
            </div>
          )}

          {pexHistory && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog pex-previous-jobs-dialog">
                <header><div><p className="eyebrow">PEX</p><h2>Previous jobs</h2></div><button type="button" onClick={() => setPexHistory(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <PexPreviousJobsTable jobs={pexHistory.previousJobs} />
              </aside>
            </div>
          )}

          {!fieldLayout && partsListSection}

          {showRfqPopup && (
          <div className="drawer-backdrop" role="dialog" aria-modal="true">
          <aside className="form-drawer compact-dialog job-editor-drawer" style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <header><div><h2>Request quotes (RFQ)</h2><p>Ask suppliers to quote this job&apos;s parts list, then compare their prices side by side.</p></div><button type="button" onClick={() => setShowRfqPopup(false)} aria-label="Close dialog"><X size={18} /></button></header>

            {job.emailConfigured === false && (
              <div className="inline-error" style={{ marginBottom: 12 }}>
                Email isn&apos;t set up for this company yet, so RFQ requests are added to the list without sending anything — set up SMTP under Company Settings to send real emails.
              </div>
            )}

            <div className="drawer-fields">
              <label className="wide party-selector" onBlur={closeDropdownUnlessWithin(() => setRfqSupplierPickerOpen(false))}><span>Add existing supplier</span><div><Search size={15} /><input value={rfqSupplierQuery} onChange={(e) => { setRfqSupplierQuery(e.target.value); setRfqSupplierId(""); setRfqSupplierPickerOpen(true); }} onFocus={() => setRfqSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{rfqSupplierPickerOpen && rfqSupplierOptions.length > 0 && <div className="selector-results">{rfqSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setRfqSupplierId(s.id); setRfqSupplierQuery(s.name); setRfqSupplierOptions([]); setRfqSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}</div>}</label>
              <label>
                <span>&nbsp;</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="inline-check"><input type="checkbox" checked={rfqSendEmail} onChange={(e) => setRfqSendEmail(e.target.checked)} /><span>Send email now</span></label>
                  <button type="button" className="quiet-button" disabled={saving || !rfqSupplierId} onClick={() => void requestRfq()}><Mail size={15} /> Request quote</button>
                </div>
              </label>
              <label><span>&nbsp;</span><button type="button" className="quiet-button" onClick={() => setShowRfqNewSupplierForm((v) => !v)}><Plus size={15} /> {showRfqNewSupplierForm ? "Cancel new supplier" : "New supplier"}</button></label>
              <label className="wide"><span>Attachment (optional)</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {rfqAttachmentFile ? (
                    <span className="attachment-chip" style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid var(--ink-300)", borderRadius: 7, padding: "4px 8px", background: "white" }}>
                      <FileText size={14} /> <strong>{rfqAttachmentFile.name}</strong> <span className="muted small-line">({Math.max(1, Math.round(rfqAttachmentFile.size / 1024))} KB)</span>
                      <button type="button" className="quiet-button" onClick={() => setRfqAttachmentFile(null)}><X size={13} /> Remove</button>
                    </span>
                  ) : (
                    <input type="file" onChange={(e) => setRfqAttachmentFile(e.target.files?.[0] || null)} />
                  )}
                </div>
                <p className="muted small-line">Sent with the RFQ email (a drawing, spec sheet or photo). It stays here for every supplier you request a quote from, until you remove it.</p>
              </label>
            </div>

            {showRfqNewSupplierForm && (
              <div className="drawer-fields" style={{ marginTop: 4 }}>
                <label><span>Supplier name</span><input value={rfqNewSupplierName} onChange={(e) => setRfqNewSupplierName(e.target.value)} /></label>
                <label><span>Email (optional)</span><input value={rfqNewSupplierEmail} onChange={(e) => setRfqNewSupplierEmail(e.target.value)} /></label>
                <label>
                  <span>&nbsp;</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <label className="inline-check"><input type="checkbox" checked={rfqNewSupplierSendEmail} onChange={(e) => setRfqNewSupplierSendEmail(e.target.checked)} /><span>Send email now</span></label>
                    <button type="button" className="quiet-button" disabled={saving || rfqNewSupplierName.trim().length < 2} onClick={() => void addNewSupplierAndRequestRfq()}><Plus size={15} /> Add supplier &amp; request quote</button>
                  </div>
                </label>
              </div>
            )}

            {rfqResendResult && (
              <div className={rfqResendResult.ok ? "inline-success" : "inline-error"} style={{ marginBottom: 8 }}>{rfqResendResult.message}</div>
            )}

            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Supplier</th><th>Status</th><th>Requested</th><th>Attachment sent</th><th>Quote file</th><th></th></tr></thead><tbody>
              {job.rfqRequests.map((request) => {
                const status = String(request.status || "SKIPPED");
                const tone = status === "QUOTED" ? "tone-green" : status === "SENT" ? "tone-blue" : status === "FAILED" ? "tone-red" : "neutral";
                return <tr key={request.id}>
                  <td><strong>{text(request.supplier.name)}</strong>{request.supplier.mainEmail ? <div className="muted small-line">{text(request.supplier.mainEmail)}</div> : null}</td>
                  <td>
                    <span className={`status-pill ${tone}`}>{RFQ_STATUS_LABELS[status] || status.replaceAll("_", " ")}</span>
                    {status === "FAILED" && request.lastSendError ? <div className="muted small-line">{text(request.lastSendError)}</div> : null}
                  </td>
                  <td>{request.requestedAt ? new Date(String(request.requestedAt)).toLocaleDateString("en-ZA") : "—"}</td>
                  <td>{request.attachmentFileName ? <button type="button" className="table-action" onClick={() => void viewRfqAttachment(String(request.id))}>{text(request.attachmentFileName)}</button> : "—"}</td>
                  <td>{request.quote?.fileName ? <button type="button" className="table-action" onClick={() => void viewQuoteFile(String(request.id))}>{text(request.quote.fileName)}</button> : "—"}</td>
                  <td className="actions">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {/* 2026-09-29 — user request: "when sending RFQs to suppliers via
                          rfq form, if i click send email and it sends, allow a user to
                          resend the rfq again via a resend button." resendRfqRequest
                          (rfq/service.ts) only ever refused a QUOTED request
                          (RFQ_ALREADY_QUOTED) — SENT was already resendable
                          server-side, this button just never offered it. Left QUOTED
                          out on purpose, same as before: nothing to resend once a
                          supplier's actually quoted. */}
                      {(status === "FAILED" || status === "SKIPPED" || status === "SENT") && <button type="button" className="table-action" disabled={!!rfqResendId} onClick={() => void resendRfq(String(request.id))}>{rfqResendId === String(request.id) ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />} {rfqResendId === String(request.id) ? "Sending…" : status === "FAILED" ? "Retry" : status === "SENT" ? "Resend" : "Send email"}</button>}
                      {/* 2026-09-29 — user request: "move the import quote
                          section to its own place... add a 'Compare
                          quotes' button..." Used to open a single-supplier
                          "Record quote" drawer right here; that whole
                          flow now lives in the dedicated Compare quotes
                          dialog (openQuoteCompare below), reachable from
                          the Parts list toolbar or this shortcut. */}
                      <button type="button" className="table-action" onClick={() => openQuoteCompare()}>Compare quotes</button>
                      <button type="button" className="table-action danger" onClick={() => void removeRfq(String(request.id))}>Remove</button>
                    </div>
                  </td>
                </tr>;
              })}
              {job.rfqRequests.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No suppliers have been asked to quote this job yet.</td></tr>}
            </tbody></table></div>
          </aside>
          </div>
          )}

          {/* 2026-09-29 — user request: "move the import quote section to
              its own place. Eg: add a 'Compare quotes' button next to
              bulk update button which lets the user view the suppliers
              requested from in table form next to each other, allow user
              to import quote received for the respective supplier or
              fill in amounts next to part number." This dialog replaces
              the old single-supplier "Record quote" drawer and the
              read-only "Quote comparison" section that both used to live
              inside the Request quotes (RFQ) popup above — every
              requested supplier is now its own editable column in one
              table, so prices can be imported or typed in for any of
              them without the others being out of view. The read-only
              star-pick/cheapest-highlight comparison (once at least one
              quote is actually saved) is kept below it, unchanged. */}
          {showQuoteComparePopup && (
          <div className="drawer-backdrop" role="dialog" aria-modal="true">
          <aside className={`form-drawer compact-dialog job-editor-drawer quote-compare-dialog${quoteCompareMaximized ? " maximized" : ""}`} style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <header>
              <div><h2>Compare quotes</h2><p>Every supplier asked to quote this job, side by side — import a received quote file or type prices in directly.</p></div>
              {/* user request: "make the dialog be able to maximize the
                  screen as to get a better view" */}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <button type="button" onClick={() => setQuoteCompareMaximized((v) => !v)} aria-label={quoteCompareMaximized ? "Restore dialog size" : "Maximize dialog"} title={quoteCompareMaximized ? "Restore" : "Maximize"}>
                  {quoteCompareMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button type="button" onClick={closeQuoteCompare} aria-label="Close dialog"><X size={18} /></button>
              </div>
            </header>

            <div className="quote-compare-body">
            {job.rfqRequests.length === 0 ? (
              <p className="table-state compact-empty-state">No suppliers have been asked to quote this job yet — use &quot;Request quotes (RFQ)&quot; first.</p>
            ) : job.partLines.length === 0 ? (
              <p className="table-state compact-empty-state">This job has no parts to price yet.</p>
            ) : (
              <>
                <div className="data-table-wrap">
                  <table className="data-table quote-entry-table">
                    {/* user request: "parts table is to far left aligned,
                        space correctly as well as columns should be
                        equally spaced" — fixed widths for Part/Qty, every
                        supplier column shares the rest equally (see
                        .quote-entry-table{{table-layout:fixed}} in
                        globals.css). */}
                    <colgroup>
                      <col style={{ width: 170 }} />
                      <col style={{ width: 64 }} />
                      {job.rfqRequests.map((r) => <col key={r.id} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        {/* user request: "parts table does not show
                            headers (Qty, Part number/Description, Unit,
                            etc)" */}
                        <th rowSpan={2}>Part</th>
                        <th rowSpan={2} className="quote-entry-qty">Qty</th>
                        {job.rfqRequests.map((request) => {
                          const requestId = String(request.id);
                          const status = String(request.status || "SKIPPED");
                          const tone = status === "QUOTED" ? "tone-green" : status === "SENT" ? "tone-blue" : status === "FAILED" ? "tone-red" : "neutral";
                          const analyzing = quoteAnalyzingId === requestId;
                          const guessCount = quoteGuessCounts[requestId] || 0;
                          const importedFile = quoteFiles[requestId];
                          return (
                            <th key={request.id} className="supplier-group-start quote-entry-head">
                              <div className="quote-entry-head-inner">
                                <strong>{text(request.supplier.name)}</strong>
                                {/* user request: "move the save button next
                                    to the status field" */}
                                <div className="quote-entry-head-row">
                                  <span className={`status-pill ${tone}`}>{RFQ_STATUS_LABELS[status] || status.replaceAll("_", " ")}</span>
                                  <button type="button" className="table-action" disabled={quoteSavingId === requestId} onClick={() => void saveQuoteForRequest(requestId)}>{quoteSavingId === requestId ? <Loader2 className="spin" size={12} /> : <Save size={12} />} {quoteSavingId === requestId ? "Saving…" : "Save"}</button>
                                </div>
                                <label className="quote-entry-import">
                                  <Upload size={12} />
                                  <span>{importedFile ? importedFile.name : "Import quote file"}</span>
                                  <input type="file" onChange={(e) => { const file = e.target.files?.[0] || null; setQuoteFiles((c) => ({ ...c, [requestId]: file })); if (file) void analyzeQuoteFileForRequest(requestId, file); }} />
                                </label>
                                {analyzing && <span className="muted small-line">Analyzing file for prices…</span>}
                                {!analyzing && guessCount > 0 && <span className="muted small-line">Guessed {guessCount} price{guessCount === 1 ? "" : "s"} — review below.</span>}
                                <input className="quote-entry-notes" value={quoteNotesByRequest[requestId] || ""} onChange={(e) => setQuoteNotesByRequest((c) => ({ ...c, [requestId]: e.target.value }))} placeholder="Notes (optional)" />
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                      {/* className so this row can be un-stuck in CSS —
                          see .quote-entry-subhead in globals.css, user
                          report: "the unit price header when scrolling
                          goes over the supplier name". */}
                      <tr className="quote-entry-subhead">
                        {job.rfqRequests.map((request) => <th key={request.id} className="supplier-group-start">Unit price</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {job.partLines.map((line) => (
                        <tr key={line.id}>
                          <td>{text(line.partNumber)}{line.description ? <div className="muted small-line">{text(line.description)}</div> : null}</td>
                          <td className="quote-entry-qty">{text(line.quantity)}</td>
                          {job.rfqRequests.map((request) => {
                            const requestId = String(request.id);
                            const draft = quoteDrafts[requestId]?.[String(line.id)] || { unitPrice: "", available: true, notes: "" };
                            return (
                              <td key={request.id} className="supplier-group-start">
                                <div className="quote-entry-cell">
                                  <input type="number" min="0" step="0.01" disabled={!draft.available} value={draft.unitPrice} onChange={(e) => updateQuoteDraftLine(requestId, String(line.id), { unitPrice: e.target.value })} placeholder="R0.00" />
                                  <label className="inline-check quote-entry-unavailable" title="Not available from this supplier">
                                    <input type="checkbox" checked={!draft.available} onChange={(e) => updateQuoteDraftLine(requestId, String(line.id), { available: !e.target.checked })} />
                                    <span>N/A</span>
                                  </label>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}><strong>Total (unsaved)</strong></td>
                        {job.rfqRequests.map((request) => <td key={request.id} className="supplier-group-start"><strong>R{draftQuoteTotal(String(request.id)).toFixed(2)}</strong></td>)}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="muted small-line" style={{ marginTop: 8 }}>Prices are only saved once you click Save on that supplier&apos;s column — importing a file fills in blanks only, it never overwrites a price you&apos;ve already typed.</p>
              </>
            )}

            {/* user request: "move the saved quotes section behind a
                button that says 'Compare Prices' which will then bring
                up the table shown" — still only offered once at least one
                quote has actually been saved. Follow-up: "when clicking
                the compare Prices button, make that it opens its own
                dialog" — see the separate popup below, rendered as a
                sibling of this one, instead of expanding inline here. */}
            {job.rfqRequests.some((r) => r.quote) && job.partLines.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button type="button" className="quiet-button" onClick={() => setShowSavedQuotesCompare(true)}>
                  <Columns3 size={14} /> Compare Prices
                </button>
              </div>
            )}
            </div>
          </aside>
          </div>
          )}

          {/* user request: "when clicking the compare Prices button, make
              that it opens its own dialog" — was an inline expand/collapse
              section inside the Compare quotes dialog above; now its own
              popup (same .drawer-backdrop/.form-drawer pattern as every
              other dialog in this app), stacked on top so it gets its own
              header and close button rather than sharing scroll space with
              the entry table above it. Kept as its own conditional block
              (not nested inside the dialog above) so it can stay open even
              if the Compare quotes dialog behind it is later closed. */}
          {showSavedQuotesCompare && job.rfqRequests.some((r) => r.quote) && job.partLines.length > 0 && (() => {
            const quotedRequests = job.rfqRequests.filter((r) => r.quote);
            const { total: preferredTotal, pickedCount } = preferredPurchaseSummary(job);
            return (
              <div className="drawer-backdrop" role="dialog" aria-modal="true">
                <aside className="form-drawer compact-dialog job-editor-drawer quote-compare-dialog" style={{ maxHeight: "90vh", overflowY: "auto" }}>
                  <header>
                    <div><h2>Saved quotes</h2><p>Every supplier with a saved quote on this job, compared side by side.</p></div>
                    <button type="button" onClick={() => setShowSavedQuotesCompare(false)} aria-label="Close dialog"><X size={18} /></button>
                  </header>
                  <div className="quote-compare-body">
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button type="button" className="quiet-button" onClick={exportQuoteComparisonCsv}><Download size={14} /> Export CSV</button>
                      <button type="button" className="quiet-button" onClick={() => void exportQuoteComparisonExcel()}><Download size={14} /> Export Excel</button>
                    </div>
                    <div className="data-table-wrap" style={{ marginTop: 12 }}><table className="data-table quote-comparison-table"><thead>
                      <tr>
                        <th rowSpan={2}>Part</th>
                        <th rowSpan={2}>Qty</th>
                        {quotedRequests.map((r) => <th key={r.id} colSpan={2} className="supplier-group-start">{text(r.supplier.name)}</th>)}
                      </tr>
                      <tr>
                        {quotedRequests.map((r) => <Fragment key={r.id}><th className="supplier-group-start">Unit</th><th>Total</th></Fragment>)}
                      </tr>
                    </thead><tbody>
                      {job.partLines.map((line) => {
                        const cheapestQuoteId = cheapestRfqQuoteId(String(line.id), job.rfqRequests);
                        const qty = Number(line.quantity ?? 0);
                        return <tr key={line.id}>
                          <td>{text(line.partNumber)}{line.description ? <div className="muted small-line">{text(line.description)}</div> : null}</td>
                          <td>{decimalText(line.quantity)}</td>
                          {quotedRequests.map((request) => {
                            const quote = request.quote!;
                            const quoteLine = quote.lines.find((l) => l.partLineId === String(line.id));
                            const quoted = !!quoteLine && quoteLine.available !== false && quoteLine.unitPrice != null && quoteLine.unitPrice !== "";
                            const isCheapest = quoted && String(quote.id) === cheapestQuoteId;
                            const isPreferred = !!quoteLine?.preferred;
                            const unit = quoted ? Number(quoteLine!.unitPrice) : null;
                            const cellStyle = isCheapest ? { background: "rgba(59,130,246,0.1)" } : undefined;
                            return <Fragment key={request.id}>
                              <td className="supplier-group-start" style={cellStyle}>
                                {quoteLine && quoteLine.available === false ? <span className="muted small-line">Unavailable</span> : quoted ? (
                                  <button type="button" className="table-action" style={isPreferred ? { fontWeight: 700 } : undefined} onClick={() => void togglePreferred(String(line.id), String(quote.id))}>
                                    <Star size={12} fill={isPreferred ? "currentColor" : "none"} /> R{unit!.toFixed(2)}
                                  </button>
                                ) : <span className="muted small-line">—</span>}
                              </td>
                              <td style={cellStyle}>{quoted ? `R${(unit! * qty).toFixed(2)}` : <span className="muted small-line">—</span>}</td>
                            </Fragment>;
                          })}
                        </tr>;
                      })}
                    </tbody><tfoot>
                      <tr>
                        <td colSpan={2}><strong>Quote total</strong></td>
                        {quotedRequests.map((request) => <Fragment key={request.id}><td className="supplier-group-start" /><td><strong>R{rfqQuoteTotal(request.quote!, job.partLines).toFixed(2)}</strong></td></Fragment>)}
                      </tr>
                      {/* 2026-09-15, user request: "add total field to compare
                          parts table" — the per-supplier "Quote total" row
                          above already existed; this adds the combined total
                          across whichever supplier's price is picked per part
                          (the star toggle), previously only shown as plain
                          text below the table, now also as a row in the table
                          itself. */}
                      <tr>
                        <td colSpan={2}><strong>Preferred total ({pickedCount} of {job.partLines.length} picked)</strong></td>
                        <td colSpan={Math.max(1, quotedRequests.length * 2)}><strong>R{preferredTotal.toFixed(2)}</strong></td>
                      </tr>
                    </tfoot></table></div>
                    <p className="muted small-line" style={{ marginTop: 8 }}>Click <Star size={11} style={{ verticalAlign: "-1px" }} /> a price to mark it preferred for that part — this also fills in the part&apos;s &quot;ordered from&quot; supplier.</p>
                  </div>
                </aside>
              </div>
            );
          })()}

          {/* 2026-10-01 — user request: "generated pickslips (label each
              'Pickslip 1 date etc' not just date and time (For all users),
              move buttons more inline with actions header; move generated
              pickslips to above the parts follow up section." Previously
              embedded inside the Parts list section (sharing its header's
              already-crowded button row); now its own section with its own
              header — "Create picking slip" moved here, right next to this
              section's own title, instead of competing for space in Parts
              list's header. Each row is labelled "Pickslip N" ahead of the
              date — N counts up from the oldest slip (jobPickSlips comes
              back newest-first from listPickSlips, so N is the row's
              position counting from the end of the array) so a job with
              several slips can be talked about by number ("Pickslip 2")
              instead of only by timestamp. */}
          {!fieldLayout && pickSlipsSection}

          {/* 2026-10-01 — user request: "mechanic user - remove parts follow
              up section from view." Whole section hidden for
              mechanicFieldsLocked, same tenantRole === "USER" flag as every
              other Mechanic-only restriction on this page. Server-side,
              POST /api/v1/jobs/[id]/parts-followup already requires
              whatever permission gates this for role-based API protection
              — this is just the UI-level hide. */}
          {!fieldLayout && followUpSection}

          {!fieldLayout && outworkSection}

          {/* 2026-10-06 — user request: Attachments and Send to PEX side by
              side. The PEX panels (mutually exclusive: Send job to PEX / In PEX
              Inventory) moved up to sit directly beside Attachments; when
              neither applies Attachments simply fills the row. */}
          {!fieldLayout && (
          <div className="job-pair-row">
            {attachmentsSection}
            {/* 2026-10-06 — user request: simplified PEX Supply panel, beside
                Attachments. Chain of Previous PEX return -> Current supply job
                -> New PEX return; buttons under the New PEX return card (Unlink
                only while a return job is linked; Create / Link to existing
                only while none is). View history opens the previous-jobs list. */}
            {job.type === "PEX_SUPPLY" && job.pexAsSupply && <section className="detail-panel">
              <header><div><h2>PEX Supply</h2></div><PexStatusPill status={job.pexAsSupply.status} /></header>
              <div className="pex-chain">
                <div className="pex-chain-tile"><span>Previous PEX return</span>
                  {job.previousPexJob?.id
                    ? <Link href={`/jobs/${job.previousPexJob.id}`} className="pex-chain-number">{text(job.previousPexJob.jobNumber)}</Link>
                    : job.previousJobNumber ? <strong className="pex-chain-number">{text(job.previousJobNumber)}</strong> : <strong className="pex-chain-number muted">—</strong>}
                </div>
                <div className="pex-chain-arrow" aria-hidden="true">→</div>
                <div className="pex-chain-tile current"><span>Current supply job</span><strong className="pex-chain-number">{text(job.jobNumber || job.draftNumber)}</strong></div>
                <div className="pex-chain-arrow" aria-hidden="true">→</div>
                <div className={`pex-chain-tile${job.pexAsSupply.returnJob ? "" : " empty"}`}><span>New PEX return</span>
                  {job.pexAsSupply.returnJob?.id
                    ? <Link href={`/jobs/${job.pexAsSupply.returnJob.id}`} className="pex-chain-number">{text(job.pexAsSupply.returnJob.jobNumber || job.pexAsSupply.returnJob.draftNumber)}</Link>
                    : <span className="muted small-line pex-chain-none">Not linked</span>}
                </div>
              </div>
              <div className="pex-chain-actions">
                {job.pexAsSupply.returnJob ? (
                  <button type="button" className="section-action-button" disabled={saving} onClick={() => { void confirm({ message: "Unlink the return job? It will not be deleted — you can relink or create a new one afterwards.", tone: "warning", confirmLabel: "Unlink" }).then((ok) => { if (ok) void deleteAction(`/api/v1/jobs/${job.id}/pex/link-return`, {}); }); }}><Unlink size={15} /> Unlink return job</button>
                ) : (
                  <>
                    <button type="button" className="section-action-button" disabled={saving} onClick={() => void postAction(`/api/v1/jobs/${job.id}/pex/create-return`, {})}><Plus size={15} /> Create return job</button>
                    <button type="button" className="section-action-button" disabled={saving} onClick={() => setPexLinkOpen((v) => !v)}><Search size={15} /> Link to existing PEX return</button>
                  </>
                )}
              </div>
              {!job.pexAsSupply.returnJob && pexLinkOpen && <div className="drawer-fields pex-link-search">
                <label className="wide party-selector" onBlur={closeDropdownUnlessWithin(() => setPexReturnJobOptions([]))}><span>Link an existing unlinked PEX return job</span><div><Search size={14} /><input value={pexReturnJobQuery} onChange={(e) => { setPexReturnJobQuery(e.target.value); setSelectedPexReturnJobId(""); }} placeholder="Search unlinked PEX return jobs…" /></div>{pexReturnJobOptions.length > 0 && <div className="selector-results">{pexReturnJobOptions.map((option) => <button type="button" key={option.id} onClick={() => { setSelectedPexReturnJobId(option.id); setPexReturnJobQuery(text(option.jobNumber || option.draftNumber)); setPexReturnJobOptions([]); }}><strong>{text(option.jobNumber || option.draftNumber)}</strong><span>{text(option.customer?.name || option.customer?.tradingName)}</span></button>)}</div>}</label>
                <div className="stack-row"><button type="button" className="section-action-button" disabled={saving || !selectedPexReturnJobId} onClick={() => void postAction(`/api/v1/jobs/${job.id}/pex/link-return`, { returnJobId: selectedPexReturnJobId }).then(() => { setSelectedPexReturnJobId(""); setPexReturnJobQuery(""); setPexLinkOpen(false); })}>Link return job</button><button type="button" className="quiet-button" onClick={() => { setPexLinkOpen(false); setSelectedPexReturnJobId(""); setPexReturnJobQuery(""); }}>Cancel</button></div>
              </div>}
              <div className="pex-chain-footer">
                <p>{job.pexAsSupply.returnJob ? "Remove link if incorrectly linked." : "No return job linked yet — it is created automatically once this job is completed, or link/create one using the buttons above."}</p>
                <div><button type="button" className="table-action" disabled={saving} onClick={() => void openPexHistory(String(job.pexAsSupply?.id))}>View history</button></div>
              </div>
            </section>}

            {/* 2026-09-16 — user request: was gated on COMPLETE, moved to
                Delivered - awaiting payment (matches allocateJobToPexInventory's
                own gate in pex/service.ts) — the unit's physically done and
                ready to shelve well before payment/closing catches up. */}
            {canSendToPex && !job.pexAsSupply && !job.pexAsReturn && <section className="detail-panel"><header><div><h2>Send job to PEX Inventory</h2><p>Once the unit is in the workshop — even mid-repair — it can be allocated directly into PEX Inventory, without a supply/return chain. Admins and Managers only.</p></div></header>
              <footer className="detail-actions"><button type="button" className="section-action-button" disabled={saving} onClick={() => void sendToPexInventory()}>Send to PEX Inventory</button></footer>
              {/* 2026-09-16 — user report: "BRE1014 was allocated to pex but is
                  not showing" on PEX Stock. The shared `error` state from
                  postAction() was only ever rendered once, near the top of
                  this (very long) job page — easy to miss after clicking a
                  button this far down, same class of bug already fixed for
                  Parts follow-up. If allocation actually fails here (job
                  already linked to a PEX record, a stale/duplicate record,
                  etc.) the section stays visible with no visible reason why,
                  so it looks like nothing happened rather than showing the
                  real error — repeating it locally, right at the button. */}
              {error ? <div className="inline-error" style={{ marginTop: 10 }}>{error}</div> : null}
            </section>}

            {/* 2026-10-05 — undo for "Send to PEX Inventory" (user request).
                A PEX_RETURN-type job shows its own PEX Return panel above, so
                the undo button lives there instead of a second section. */}
            {pexAllocatedDirect && job.type !== "PEX_RETURN" && canSendToPex && !job.pexAsReturn?.consumedByJob && <section className="detail-panel"><header><div><h2>In PEX Inventory</h2><p>This job's unit was sent to PEX Inventory. If that was a mistake you can take it back out.</p></div></header>
              <footer className="detail-actions"><button type="button" className="section-action-button" disabled={saving} onClick={() => void undoSendToPexInventory()}>Undo send to PEX</button></footer>
              {error ? <div className="inline-error" style={{ marginTop: 10 }}>{error}</div> : null}
            </section>}
          </div>
          )}

          {jobDnDraft && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog delivery-note-dialog">
                <header><div><p className="eyebrow">Job {jobDocLabel}</p><h2>{documentTitles.JOB_DELIVERY_NOTE}</h2><p className="muted small-line">Add or change line items, then print.</p></div><button type="button" onClick={() => setJobDnDraft(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  <div className="data-table-wrap wide"><table className="data-table"><thead><tr><th>Description</th><th style={{ width: 90 }}>Qty</th><th style={{ width: 40 }} /></tr></thead><tbody>
                    {jobDnDraft.items.map((item, idx) => (
                      <tr key={idx}>
                        <td><input style={{ width: "100%" }} value={item.description} placeholder="Description" onChange={(e) => setJobDnDraft((d) => (d ? { ...d, items: d.items.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row)) } : d))} /></td>
                        <td><input style={{ width: 70 }} type="number" min="0" step="1" value={item.quantity} onChange={(e) => setJobDnDraft((d) => (d ? { ...d, items: d.items.map((row, i) => (i === idx ? { ...row, quantity: e.target.value } : row)) } : d))} /></td>
                        <td><button type="button" className="table-action" aria-label="Remove line" disabled={jobDnDraft.items.length === 1} onClick={() => setJobDnDraft((d) => (d ? { ...d, items: d.items.filter((_, i) => i !== idx) } : d))}><X size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody></table></div>
                  <div className="wide"><button type="button" className="quiet-button" onClick={() => setJobDnDraft((d) => (d ? { ...d, items: [...d.items, { description: "", quantity: "1" }] } : d))}><Plus size={14} /> Add line item</button></div>
                  <label className="wide"><span>Notes</span><textarea rows={3} value={jobDnDraft.notes} onChange={(e) => setJobDnDraft((d) => (d ? { ...d, notes: e.target.value } : d))} /></label>
                </div>
                <footer className="detail-actions">
                  <button type="button" className="gold-button" onClick={() => { const draft = jobDnDraft; setJobDnDraft(null); void offerToSave(printJobDeliveryNote(draft), "JOB_DELIVERY_NOTE", () => jobDeliveryNoteSpec(draft)); }}>Print</button>
                  <button type="button" className="quiet-button" onClick={() => setJobDnDraft(null)}>Close</button>
                </footer>
              </aside>
            </div>
          )}

          {deliveryNote && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog delivery-note-dialog">
                <header><div><p className="eyebrow">Outwork</p><h2>Delivery note</h2><p className="muted small-line">Job {deliveryNote.jobNumber}</p></div><button type="button" onClick={() => setDeliveryNote(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  {/* 2026-09-16 — matches printDeliveryNote's own layout:
                      bold name + stacked address lines instead of a
                      "Supplier: " line, and "Date captured" instead of
                      "Date sent out".
                      2026-09-29 — user report: "make the suppliers details
                      more together, they are spaced very far apart making
                      it look ugly." These used to be separate <p> "wide"
                      grid items — each one its own row in .drawer-fields'
                      grid, so on top of the grid's own 12px row-gap, every
                      line ALSO carried the browser's default <p> margin
                      (~1em top+bottom), which doesn't collapse between
                      separate CSS grid items the way it would in normal
                      flow — stacking up to ~30-40px between lines. Now one
                      "wide" grid item (a single row) with the address
                      lines packed at a tight 3px gap like a real address
                      block, same "small-line as a <div>, no default
                      margin" convention already used everywhere else in
                      this app (e.g. the RFQ table's supplier email line) —
                      this dialog was the one place still using <p>. */}
                  <div className="wide" style={{ display: "grid", gap: 3 }}>
                    <div className="muted small-line" style={{ fontWeight: 700, color: "var(--ink-900)" }}>{deliveryNote.supplierName}</div>
                    {deliveryNote.supplierAddressLines.map((l, idx) => <div key={idx} className="muted small-line">{l}</div>)}
                    {deliveryNote.supplierVat && <div className="muted small-line">VAT: {deliveryNote.supplierVat}</div>}
                    <div className="muted small-line" style={{ marginTop: 4 }}>Date captured: {deliveryNote.dateCaptured ? new Date(deliveryNote.dateCaptured).toLocaleDateString("en-ZA") : "—"}</div>
                  </div>
                  {/* 2026-09-29 — user report: "the table is still cramped
                      not the width of the window." This div was missing
                      the "wide" class, so within .drawer-fields' 2-column
                      grid it only ever got ONE column (roughly half the
                      dialog's width) no matter how wide the dialog itself
                      was made — the table's own width:100% just filled
                      that half-width box, and .data-table-wrap's
                      overflow-x:auto kicked in and clipped it. */}
                  {/* 2026-10-06 — user request: "On outwork delivery notes, add
                      fields Make, Model and Serial above the description
                      column." Filled from the job's machine details; editable
                      here and printed/saved above the description table. */}
                  <label><span>Make</span><input value={deliveryNote.make} onChange={(e) => setDeliveryNote((n) => (n ? { ...n, make: e.target.value } : n))} /></label>
                  <label><span>Model</span><input value={deliveryNote.model} onChange={(e) => setDeliveryNote((n) => (n ? { ...n, model: e.target.value } : n))} /></label>
                  <label className="wide"><span>Serial</span><input value={deliveryNote.serial} onChange={(e) => setDeliveryNote((n) => (n ? { ...n, serial: e.target.value } : n))} /></label>
                  <div className="data-table-wrap wide"><table className="data-table"><thead><tr><th>Description</th><th>Quantity</th><th>Checked</th></tr></thead><tbody>
                    {deliveryNote.items.map((i, idx) => <tr key={idx}><td>{i.description}</td><td>{i.quantity}</td><td></td></tr>)}
                  </tbody></table></div>
                  {/* Vehicle reg + signature fields are print-only (see
                      printDeliveryNote) — this on-screen preview is just for
                      reviewing the batch before printing, not a form to
                      fill in on screen. */}
                </div>
                <footer className="detail-actions">
                  <button type="button" className="gold-button" onClick={() => { const note = deliveryNote; void offerToSave(printDeliveryNote(), "OUTWORK_DELIVERY_NOTE", () => buildOutworkDeliveryNoteSpec({ title: documentTitles.OUTWORK_DELIVERY_NOTE, note }), note.supplierName); }}>Print</button>
                  <button type="button" className="quiet-button" onClick={() => setDeliveryNote(null)}>Close</button>
                </footer>
              </aside>
            </div>
          )}

          {/* 2026-10-01 — both panels below now wrapped in a disabled
              fieldset (and their own Save button) for mechanicFieldsLocked
              — "everything except Notes/Parts List/Outwork" is locked for
              a Mechanic, and these job-type-specific detail panels are
              that same kind of field, same as Customer/Machine/Job/
              Commercial details above. Server-side: upsertJobFieldService
              and upsertJobWarranty both reject this role via
              requireNotMechanicRestricted regardless. */}

          {job.type === "WARRANTY" && <section className="detail-panel"><header><div><h2>Warranty</h2><p>Capture the current warranty state supported by Phase 4A.</p></div></header><fieldset disabled={mechanicFieldsLocked} className="unstyled-fieldset"><div className="drawer-fields"><label><span>Warranty status</span><select value={form.warrantyStatus} onChange={(e) => updateField("warrantyStatus", e.target.value)}><option value="PENDING">Pending</option><option value="GRANTED">Granted</option><option value="DECLINED">Declined</option></select></label><label><span>Historical source status</span><input value={form.warrantyHistorical} onChange={(e) => updateField("warrantyHistorical", e.target.value)} /></label><label className="wide"><span>Warranty notes</span><textarea rows={4} value={form.warrantyNotes} onChange={(e) => updateField("warrantyNotes", e.target.value)} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || mechanicFieldsLocked} onClick={() => void putAction(`/api/v1/jobs/${job.id}/warranty`, { status: form.warrantyStatus, notes: form.warrantyNotes || null, historicalSourceStatus: form.warrantyHistorical || null })}>Save warranty info</button></footer></fieldset></section>}

          {job.type === "PEX_RETURN" && job.pexAsReturn && <section className="detail-panel"><header><div><h2>PEX Return</h2><p>This job is the return leg of a PEX cycle. Status follows the job's own workflow status automatically.</p></div></header>
            <div className="record-list pex-record-list"><article>
              <div className="record-icon">RT</div>
              <div><strong>{text(job.pexAsReturn.supplyJob?.jobNumber || job.pexAsReturn.supplyJob?.draftNumber)}</strong><span>{text(job.pexAsReturn.unitDescription || job.component)}</span></div>
              <PexStatusPill status={job.pexAsReturn.status} />
              <div className="stack-grid pex-link-stack">
                {job.pexAsReturn.supplyJob?.id && <Link href={`/jobs/${job.pexAsReturn.supplyJob.id}`} className="table-action">Open supply job</Link>}
                {job.pexAsReturn.consumedByJob && <span className="muted small-line">Redeployed on {text(job.pexAsReturn.consumedByJob.jobNumber || job.pexAsReturn.consumedByJob.draftNumber)}.</span>}
              </div>
              <div className="stack-row">
                <button type="button" className="quiet-button" disabled={saving} onClick={() => void openPexHistory(String(job.pexAsReturn?.id))}>View history</button>
                {job.pexAsReturn.status !== "SCRAPPED" && !job.pexAsReturn.consumedByJob && <button type="button" className="table-action danger" disabled={saving} onClick={() => setDialog("pex-scrap")}>Scrap unit</button>}
                {pexAllocatedDirect && canSendToPex && !job.pexAsReturn.consumedByJob && <button type="button" className="quiet-button" disabled={saving} onClick={() => void undoSendToPexInventory()}>Undo send to PEX</button>}
              </div>
            </article></div>
            <div className="drawer-fields"><label className="wide"><span>PEX notes</span><textarea rows={3} value={form.pexNotes} onChange={(e) => updateField("pexNotes", e.target.value)} /></label></div>
            <footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving} onClick={() => void patchAction(`/api/v1/pex/${job.pexAsReturn?.id}/notes`, { notes: form.pexNotes || null })}>Save PEX notes</button></footer>
          </section>}


          {/* Notes now render beside Customer details, at the top of
              jobFormSections above — see the job-notes-panel section
              there (2026-09-14, user request: "Move notes section next to
              Client Details on the right that it is visible as soon as
              you open a job"). */}

          {/* 2026-10-01 — user request: "mechanic user - remove active
              history from view" (Activity history, per showActivityHistory
              above). Whole section hidden for mechanicFieldsLocked, same
              tenantRole === "USER" flag as every other Mechanic-only
              restriction on this page. */}
          {!fieldLayout && activitySection}
        </>
      )}
      {confirmDialog}
    </div>
  );
}
/* eslint-enable react-hooks/set-state-in-effect */

function Info({ title, values }: { title: string; values: Array<[string, unknown]> }) {
  return <section className="info-card"><header><h2>{title}</h2></header><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{text(value)}</dd></div>)}</dl></section>;
}