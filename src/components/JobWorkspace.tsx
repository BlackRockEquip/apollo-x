"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, Loader2, Mail, Pencil, Plus, Printer, RefreshCw, Save, Search, Star, Trash2, X } from "lucide-react";
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, canMarkReturnedUnrepaired, statusStepsForJobType } from "@/lib/jobs/ui";
import { StatusStepper } from "@/components/StatusStepper";
import { PexStatusPill } from "@/components/StatusPill";

type Row = Record<string, unknown> & { id: string };
type CustomerSelection = Row & { name: string; tradingName?: string | null; accountCode?: string | null };
type SupplierOption = Row & { name: string };
// Parts list — replaces the old requirement/allocation summary types above
// (see schema.prisma's JobPartLine comment). Each row carries its own
// direct status, no derived summary needed.
type PartLineRow = Row & {
  partNumber?: string | null;
  description?: string | null;
  quantity?: unknown;
  status?: string | null;
  receivedQuantity?: unknown;
  previousStatus?: string | null;
  orderNumber?: string | null;
  orderedFromSupplier?: Row & { name?: string | null };
  part?: (Row & { partNumber?: string | null; description?: string | null; unitOfMeasure?: string | null }) | null;
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
  supplier?: Row & { name?: string | null };
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
  draftNumber: string;
  status: keyof typeof JOB_STATUS_LABELS;
  type: keyof typeof JOB_TYPE_LABELS;
  customerId: string;
  customer: CustomerSelection & { contacts?: Row[]; addresses?: Row[]; branches?: Row[] };
  company?: Row & { legalName?: string | null; tradingName?: string | null };
  notes: Array<Row & { createdBy?: { displayName?: string | null } | null }>;
  activities: Array<Row & { actor?: { displayName?: string | null } | null }>;
  fieldServiceReport?: Row | null;
  warranty?: Row | null;
  components: JobComponentRow[];
  pexAsSupply?: PexRecordSummary | null;
  pexAsReturn?: PexRecordSummary | null;
  pexConsumedBy?: PexRecordSummary | null;
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
  const [job, setJob] = useState<JobDetail | null>(null);
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
  const [bulkPartLines, setBulkPartLines] = useState("");
  // Hides the "add parts" UI (job kit / paste box / import) behind an
  // explicit "Add parts to Job" toggle instead of showing it by default —
  // at the user's request, so the parts table itself leads on a job that
  // already has parts on it.
  const [showAddParts, setShowAddParts] = useState(false);
  const [partsImportFile, setPartsImportFile] = useState<File | null>(null);
  // RFQ moved into a popup, triggered by a button next to the parts
  // list/"Add / cross-check with stock" area — matches ModApp's RfqPanel
  // (its own request-quotes button opens a modal rather than showing the
  // comparison UI inline on the page at all times).
  const [showRfqPopup, setShowRfqPopup] = useState(false);
  const [receivingLineId, setReceivingLineId] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  // 2026-09-15 — orderEditLineId now marks which part-line row's supplier
  // typeahead is currently focused/open (see the "Supplier" column below),
  // not "which row is in a Save/Cancel edit form" — the "Change supplier"
  // button and the old combined order+supplier edit form it opened are
  // gone (user request: "make that the supplier field is also editable
  // without clicking the change supplier button").
  const [orderEditLineId, setOrderEditLineId] = useState("");
  const [orderSupplierQuery, setOrderSupplierQuery] = useState("");
  const [orderSupplierOptions, setOrderSupplierOptions] = useState<SupplierOption[]>([]);
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
  const [outworkDateSentOut, setOutworkDateSentOut] = useState("");
  const [outworkLines, setOutworkLines] = useState<Array<{ id: string; description: string; quantity: string }>>([{ id: "row-1", description: "", quantity: "1" }]);
  const [editingOutworkId, setEditingOutworkId] = useState("");
  const [editOutworkSupplierQuery, setEditOutworkSupplierQuery] = useState("");
  const [editOutworkSupplierOptions, setEditOutworkSupplierOptions] = useState<SupplierOption[]>([]);
  const [editOutworkSupplierId, setEditOutworkSupplierId] = useState("");
  const [editOutworkSupplierPickerOpen, setEditOutworkSupplierPickerOpen] = useState(false);
  const [editOutworkDescription, setEditOutworkDescription] = useState("");
  const [editOutworkQuantity, setEditOutworkQuantity] = useState("1");
  const [editOutworkDateSentOut, setEditOutworkDateSentOut] = useState("");
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
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  // 2026-09-15, user request: "once a note is added [to an attachment],
  // allow a user to edit it as well." Mirrors the job-notes inline-edit
  // pattern (editingNoteId/editingNoteText/savingNoteEdit) below.
  const [editingAttachmentId, setEditingAttachmentId] = useState("");
  const [editingAttachmentNotes, setEditingAttachmentNotes] = useState("");
  const [savingAttachmentNotes, setSavingAttachmentNotes] = useState(false);
  // Activity history hidden behind a toggle instead of shown by default —
  // 2026-09-10, user request ("Active history also only to be visible on
  // click, not visible from beginning").
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState<{ jobNumber: string; supplierName: string; dateSentOut: string | null; items: Array<{ description: string; quantity: number }> } | null>(null);
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
  const [showRfqNewSupplierForm, setShowRfqNewSupplierForm] = useState(false);
  const [rfqNewSupplierName, setRfqNewSupplierName] = useState("");
  const [rfqNewSupplierEmail, setRfqNewSupplierEmail] = useState("");
  const [rfqNewSupplierSendEmail, setRfqNewSupplierSendEmail] = useState(true);
  // Outbound RFQ attachment (a drawing, spec sheet or photo sent WITH the
  // request) — added 2026-09-14. One file input shared by both the
  // "existing supplier" and "new supplier" request-quote actions below,
  // since only one of those is used per click.
  const [rfqAttachmentFile, setRfqAttachmentFile] = useState<File | null>(null);
  const [rfqQuoteEditId, setRfqQuoteEditId] = useState("");
  const [rfqQuoteNotes, setRfqQuoteNotes] = useState("");
  const [rfqQuoteFile, setRfqQuoteFile] = useState<File | null>(null);
  const [rfqPriceDrafts, setRfqPriceDrafts] = useState<Record<string, { unitPrice: string; available: boolean; notes: string }>>({});
  const [rfqGuessCount, setRfqGuessCount] = useState(0);
  const [rfqAnalyzing, setRfqAnalyzing] = useState(false);
  const [partsFollowupResult, setPartsFollowupResult] = useState<{ sent: { supplierName: string }[]; skipped: { supplierName: string; reason: string }[] } | null>(null);
  const [jobKitQuery, setJobKitQuery] = useState("");
  const [jobKitOptions, setJobKitOptions] = useState<JobKitOption[]>([]);
  const [jobKitId, setJobKitId] = useState("");
  // PexRecord linking — search for an unlinked PEX_RETURN job to attach to
  // this PEX_SUPPLY job (matches ModApp's LinkPexReturnJobForm combobox).
  const [pexReturnJobQuery, setPexReturnJobQuery] = useState("");
  const [pexReturnJobOptions, setPexReturnJobOptions] = useState<PexJobRef[]>([]);
  const [selectedPexReturnJobId, setSelectedPexReturnJobId] = useState("");
  // Shape matches getPexRecordHistory's actual (flat, not nested) return
  // value in pex/service.ts — see PexHistoryEntry/PexHistoryCycle above.
  const [pexHistory, setPexHistory] = useState<PexHistoryResponse | null>(null);
  const [pexHistoryLoading, setPexHistoryLoading] = useState(false);
  const [dialog, setDialog] = useState<null | "register" | "close" | "reopen" | "returned-unrepaired" | "pex-scrap">(null);
  // Inline note editing (2026-09-14, user request: "Notes need to be
  // editable once created") — editingNoteId tracks which of job.notes is
  // currently open for editing (its own textarea replaces the plain
  // display row; see the Notes panel in jobFormSections), editingNoteText
  // holds that in-progress edit separately from the "add a new note"
  // textarea (form.note), so editing an existing note never clobbers a
  // draft of a brand new one.
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editingNoteText, setEditingNoteText] = useState("");
  const [savingNoteEdit, setSavingNoteEdit] = useState(false);
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
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    salesRepresentative: "",
    registerStatus: "TO_BE_RECEIVED",
    closingOutcome: "",
    closingNote: "",
    reopenStatus: "TO_BE_RECEIVED",
    reopenReason: "",
    returnedUnrepairedReason: "",
    note: "",
    fieldSite: "",
    fieldTechnician: "",
    fieldVehicle: "",
    fieldHours: "",
    fieldReport: "",
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
        type: body.type || "STANDARD_REPAIR",
        etaDate: body.etaDate ? String(body.etaDate).slice(0, 10) : "",
        mechanicEtaDate: body.mechanicEtaDate ? String(body.mechanicEtaDate).slice(0, 10) : "",
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
        salesRepresentative: body.salesRepresentative || "",
        registerStatus: body.status === "DRAFT" ? statusStepsForJobType(body.type)[0] : body.status,
        reopenStatus: statusStepsForJobType(body.type)[0],
        fieldSite: body.fieldServiceReport?.site ? String(body.fieldServiceReport.site) : "",
        fieldTechnician: body.fieldServiceReport?.technician ? String(body.fieldServiceReport.technician) : "",
        fieldVehicle: body.fieldServiceReport?.vehicle ? String(body.fieldServiceReport.vehicle) : "",
        fieldHours: body.fieldServiceReport?.hours ? String(body.fieldServiceReport.hours) : "",
        fieldReport: body.fieldServiceReport?.report ? String(body.fieldServiceReport.report) : "",
        warrantyStatus: body.warranty?.status ? String(body.warranty.status) : "PENDING",
        warrantyNotes: body.warranty?.notes ? String(body.warranty.notes) : "",
        warrantyHistorical: body.warranty?.historicalSourceStatus ? String(body.warranty.historicalSourceStatus) : "",
        pexNotes: String((body.pexAsSupply?.notes ?? body.pexAsReturn?.notes) || ""),
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

  useEffect(() => {
    if (!rfqSupplierPickerOpen) { setRfqSupplierOptions([]); return; }
    const q = rfqSupplierQuery.trim();
    if (q.length < 2) { setRfqSupplierOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
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

  useEffect(() => {
    if (!jobId) return;
    const q = jobKitQuery.trim();
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
      type: form.type,
      etaDate: form.etaDate || null,
      mechanicEtaDate: form.mechanicEtaDate || null,
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
      paymentDateReceived: form.paymentDateReceived || null,
      paymentNotApplicable: form.paymentNotApplicable === "true",
      machineHours: form.machineHours || null,
      plantNumber: form.plantNumber || null,
      reportNumber: form.reportNumber || null,
      importTrackingNumber: form.importTrackingNumber || null,
      previousJobNumber: form.previousJobNumber || null,
      salesRepresentative: form.salesRepresentative || null,
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
    form.description, form.type, form.etaDate, form.mechanicEtaDate, form.relationshipNotes, form.quoteNumber,
    form.quoteDate, form.salesOrderNumber, form.salesOrderDate, form.invoiceNumber, form.invoiceDate,
    form.purchaseOrderNumber, form.purchaseOrderDate, form.purchaseOrderStatus, form.deliveryDate, form.deliveryType,
    form.receivingTransport, form.kmsTravelled, form.paymentDateReceived, form.paymentNotApplicable, form.machineHours,
    form.plantNumber, form.reportNumber, form.importTrackingNumber, form.previousJobNumber, form.salesRepresentative,
  ]);

  // Backs up the "Save failed — retrying" wording in the header (above)
  // with an actual retry — otherwise a save that failed once (e.g. a
  // dropped connection) would just sit there until the person happened to
  // touch a field again.
  useEffect(() => {
    if (autosaveState !== "error") return;
    const timer = setTimeout(() => { void runAutosave(); }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAutosave closes over the latest `form`/`jobId` on every render; only autosaveState should re-arm this timer.
  }, [autosaveState]);

  // Back-link guard (2026-09-14, user request: "make a popup if any
  // unsaved info will be lost"). Narrowed to autosave's own in-flight/
  // failed states rather than a general dirty-check, per the user's
  // explicit choice ("Full autosave, Save button removed") — with
  // autosave on, "unsaved changes" should only be a real possibility while
  // a save is actually in the air or just failed.
  function handleBackClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (mode !== "detail") return;
    if (autosaveState === "saving" && !window.confirm("Your changes are still saving. Leave this job anyway?")) {
      e.preventDefault();
    } else if (autosaveState === "error" && !window.confirm("Your last change failed to save. Leave anyway and lose it?")) {
      e.preventDefault();
    }
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

  async function putAction(path: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  // Parts list — paste box, one row per line ("partNumber, quantity[,
  // description]"), same shape as ModApp's AddPartLinesForm.
  async function addPartLines() {
    if (!jobId || !bulkPartLines.trim()) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add part lines.");
    } finally {
      setSaving(false);
    }
  }

  // Import a parts-list spreadsheet (.xlsx/.xls/.csv) — parsed server-side
  // by src/lib/jobs/parts-import.ts, same upload shape as the RFQ quote
  // file upload below (fileName/mimeType/contentBase64).
  async function importPartsFile(file: File) {
    if (!jobId) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to import parts file.");
    } finally {
      setSaving(false);
    }
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
      const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}/receive`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ receivedQty: Number(receiveQty) }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to record received quantity.");
      setReceivingLineId(""); setReceiveQty("");
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
  // so it's always sent back unchanged here).
  async function saveOrderNumberInline(lineId: string, currentSupplierId: string, value: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
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

  // 2026-09-15, user request: "make that the supplier field is also
  // editable without clicking the change supplier button." Mirrors
  // saveOrderNumberInline exactly, the other way round: always resends the
  // line's *current* order number unchanged so picking a supplier never
  // clobbers a typed-in PO number. Closes the row's picker (orderEditLineId)
  // on completion — see that state's declaration above for why this also
  // matters for the double-click glitch fix.
  async function saveSupplierInline(lineId: string, currentOrderNumber: string, supplierId: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/parts/${lineId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: currentOrderNumber || null, orderedFromSupplierId: supplierId || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save supplier.");
      setOrderEditLineId(""); setOrderSupplierId(""); setOrderSupplierQuery(""); setOrderSupplierOptions([]);
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
      setDeliveryNote({ jobNumber: job?.jobNumber || job?.draftNumber || "—", supplierName: outworkSupplierQuery || "—", dateSentOut: outworkDateSentOut || null, items: lines });
      setOutworkSupplierId(""); setOutworkSupplierQuery(""); setOutworkSupplierOptions([]); setOutworkSupplierPickerOpen(false); setOutworkDateSentOut(""); setOutworkLines([{ id: "row-1", description: "", quantity: "1" }]);
      setShowOutworkPopup(false);
      await load(true);
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
    if (!window.confirm("Remove this outwork item?")) return;
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
        body: JSON.stringify({ fileName: attachmentFile.name, mimeType: attachmentFile.type || "application/octet-stream", contentBase64, notes: attachmentNotes.trim() || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to upload attachment.");
      setAttachmentFile(null); setAttachmentNotes("");
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
    if (!window.confirm("Remove this attachment?")) return;
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
    setEditOutworkNotes(item.notes || "");
  }

  function cancelEditOutwork() {
    setEditingOutworkId(""); setEditOutworkSupplierId(""); setEditOutworkSupplierQuery(""); setEditOutworkSupplierOptions([]); setEditOutworkSupplierPickerOpen(false); setEditOutworkDescription(""); setEditOutworkQuantity("1"); setEditOutworkDateSentOut(""); setEditOutworkNotes("");
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
  function openDeliveryNoteForItem(item: OutworkItemRow) {
    const batchItems = item.batchId ? job?.outworkItems.filter((i) => i.batchId === item.batchId) ?? [item] : [item];
    setDeliveryNote({
      jobNumber: job?.jobNumber || job?.draftNumber || "—",
      supplierName: item.supplier?.name ? String(item.supplier.name) : "—",
      dateSentOut: item.dateSentOut ? String(item.dateSentOut) : null,
      items: batchItems.map((i) => ({ description: i.description || "—", quantity: Number(i.quantity ?? 0) })),
    });
  }

  // Checked / Vehicle reg / Dispatched by & Received by (name, signature,
  // date) — added 2026-09-10 at the user's request. All blank lines for
  // the printed sheet to be completed by hand at dispatch and on receipt;
  // there's no digital-signature capture anywhere in Apollo X, and this
  // whole delivery note is itself an unpersisted, on-demand print view
  // (see the comment above), so nothing here is saved back.
  function printDeliveryNote() {
    if (!deliveryNote) return;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the delivery note."); return; }
    const rows = deliveryNote.items.map((i) => `<tr><td>${escapeHtml(i.description)}</td><td>${i.quantity}</td><td class="checked-box"></td></tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>Outwork delivery note</title><meta charset="utf-8" /><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111}
      .note-head{display:flex;justify-content:space-between;align-items:flex-start}
      h1{font-size:18px;margin:0 0 12px}
      .job-number{font-size:16px;font-weight:bold;text-align:right}
      .meta{font-size:13px;color:#444;margin:2px 0}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}
      .checked-box{width:60px;text-align:center}
      .vehicle-reg{margin-top:28px;font-size:13px}
      .vehicle-reg .line{display:inline-block;min-width:220px;border-bottom:1px solid #111;margin-left:8px}
      .sign-blocks{display:flex;gap:40px;margin-top:36px}
      .sign-block{flex:1}
      .sign-block h2{font-size:13px;margin:0 0 18px}
      .sign-block .field{font-size:13px;margin-top:22px;border-bottom:1px solid #111;padding-bottom:4px}
    </style></head><body>
      <div class="note-head">
        <h1>Outwork delivery note</h1>
        <div class="job-number">Job ${escapeHtml(deliveryNote.jobNumber)}</div>
      </div>
      <p class="meta">Supplier: ${escapeHtml(deliveryNote.supplierName)}</p>
      <p class="meta">Date sent out: ${deliveryNote.dateSentOut ? new Date(deliveryNote.dateSentOut).toLocaleDateString("en-ZA") : "—"}</p>
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
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
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
  function printJobCard() {
    if (!job) return;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the job card."); return; }
    const fmt = (value: string) => value ? new Date(value).toLocaleDateString("en-ZA") : "—";
    const rows = (pairs: Array<[string, string]>) => pairs.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`).join("");
    win.document.write(`<!doctype html><html><head><title>Job card ${escapeHtml(String(job.jobNumber || job.draftNumber || ""))}</title><meta charset="utf-8" /><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111}
      .note-head{display:flex;justify-content:space-between;align-items:flex-start}
      h1{font-size:18px;margin:0 0 12px}
      h2{font-size:13px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.04em;color:#555}
      .job-number{font-size:16px;font-weight:bold;text-align:right}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:7px 9px;text-align:left;font-size:13px}
      th{width:38%;background:#f6f6f6;font-weight:600}
      .description{white-space:pre-wrap}
    </style></head><body>
      <div class="note-head">
        <h1>Job card — for workshop use</h1>
        <div class="job-number">Job ${escapeHtml(String(job.jobNumber || job.draftNumber || "—"))}</div>
      </div>
      <h2>Date in</h2>
      <table>${rows([["Date in", fmt(form.dateReceived)]])}</table>
      <h2>Machine / component details</h2>
      <table>${rows([
        ["Machine make", form.machineMake],
        ["Machine model", form.machineModel],
        ["Machine serial", form.machineSerial],
        ["Component", form.component],
        ["Component type", form.componentType],
        ["Component serial", form.componentSerial],
        ["Part number", form.componentPartNumber],
        ["Plant number", form.plantNumber],
        ["Machine hours", form.machineHours],
      ])}</table>
      <h2>Job details</h2>
      <table>
        ${rows([["Job type", JOB_TYPE_LABELS[job.type]]])}
        <tr><th>Job description</th><td class="description">${escapeHtml(form.description || "—")}</td></tr>
      </table>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
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
    setRfqSupplierId(""); setRfqSupplierQuery(""); setRfqSupplierOptions([]); setRfqSupplierPickerOpen(false); setRfqSendEmail(true); setRfqAttachmentFile(null);
  }

  // Inline "create a new supplier" from the RFQ panel — added 2026-09-09
  // (user request: "No inline 'create new supplier' from the RFQ panel").
  async function addNewSupplierAndRequestRfq() {
    if (!jobId || !rfqNewSupplierName.trim()) return;
    const attachment = rfqAttachmentFile
      ? { attachmentFileName: rfqAttachmentFile.name, attachmentMimeType: rfqAttachmentFile.type || "application/octet-stream", attachmentContentBase64: await fileToBase64(rfqAttachmentFile) }
      : {};
    await postAction(`/api/v1/jobs/${jobId}/rfq/new-supplier`, { supplierName: rfqNewSupplierName.trim(), supplierEmail: rfqNewSupplierEmail.trim() || null, sendEmail: rfqNewSupplierSendEmail, ...attachment });
    setRfqNewSupplierName(""); setRfqNewSupplierEmail(""); setRfqNewSupplierSendEmail(true); setShowRfqNewSupplierForm(false); setRfqAttachmentFile(null);
  }

  // Retries (or sends for the first time) the RFQ email for a request that
  // came back FAILED or was added as SKIPPED — added 2026-09-09 alongside
  // real email sending.
  async function resendRfq(rfqRequestId: string) {
    if (!jobId) return;
    await postAction(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/resend`, {});
  }

  async function removeRfq(rfqRequestId: string) {
    if (!jobId) return;
    if (!window.confirm("Remove this quote request?")) return;
    await deleteAction(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}`, {});
  }

  function openRecordQuote(request: RfqRequestRow) {
    setRfqQuoteEditId(String(request.id));
    setRfqQuoteNotes(request.quote?.notes || "");
    setRfqQuoteFile(null);
    const drafts: Record<string, { unitPrice: string; available: boolean; notes: string }> = {};
    for (const line of job?.partLines || []) {
      const existing = request.quote?.lines.find((l) => l.partLineId === String(line.id));
      drafts[String(line.id)] = {
        unitPrice: existing?.unitPrice != null ? String(existing.unitPrice) : "",
        available: existing?.available !== false,
        notes: existing?.notes ? String(existing.notes) : "",
      };
    }
    setRfqPriceDrafts(drafts);
    setRfqGuessCount(0);
  }

  function cancelRecordQuote() {
    setRfqQuoteEditId(""); setRfqQuoteNotes(""); setRfqQuoteFile(null); setRfqPriceDrafts({}); setRfqGuessCount(0);
  }

  // Best-effort price extraction — added 2026-09-09 (user request: "Prices
  // are typed in by hand, not extracted from uploaded files"). Runs as
  // soon as a file is attached (uploading it to recordRfqQuote, which both
  // stores it and returns guesses — see rfq/quote-extraction.ts) so the
  // person can see and correct the guesses in the price table below
  // *before* clicking Save — nothing is treated as a real price until
  // then. Only fills in lines that are still blank; it never overwrites a
  // price someone already typed.
  async function analyzeRfqQuoteFile(rfqRequestId: string, file: File) {
    if (!jobId) return;
    setRfqAnalyzing(true); setError("");
    try {
      const contentBase64 = await fileToBase64(file);
      const r = await fetch(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", contentBase64, notes: rfqQuoteNotes.trim() || null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to analyze the quote file.");
      const guesses = (b.guesses || {}) as Record<string, number>;
      let applied = 0;
      setRfqPriceDrafts((current) => {
        const next = { ...current };
        for (const [partLineId, price] of Object.entries(guesses)) {
          const existing = next[partLineId];
          if (existing && !existing.unitPrice) { next[partLineId] = { ...existing, unitPrice: String(price) }; applied += 1; }
        }
        return next;
      });
      setRfqGuessCount(applied);
    } catch (e) {
      // Extraction is best-effort — a failure here just means no guesses;
      // the file is still attached and priced by hand at Save time.
      setError(e instanceof Error ? e.message : "Unable to analyze the quote file.");
    } finally {
      setRfqAnalyzing(false);
    }
  }

  async function saveRfqQuote(rfqRequestId: string) {
    if (!jobId) return;
    setSaving(true); setError("");
    try {
      let filePayload: Record<string, unknown> = {};
      if (rfqQuoteFile) {
        filePayload = { fileName: rfqQuoteFile.name, mimeType: rfqQuoteFile.type || "application/octet-stream", contentBase64: await fileToBase64(rfqQuoteFile) };
      }
      let r = await fetch(`/api/v1/jobs/${jobId}/rfq/${rfqRequestId}/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...filePayload, notes: rfqQuoteNotes.trim() || null }),
      });
      let b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to record quote.");

      const lines = Object.entries(rfqPriceDrafts).map(([partLineId, draft]) => ({
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
      cancelRecordQuote();
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record quote.");
    } finally {
      setSaving(false);
    }
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
  async function sendPartsFollowup() {
    if (!jobId) return;
    setSaving(true); setError(""); setPartsFollowupResult(null);
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/parts-followup`, { method: "POST" });
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

  // CSV export of the quote comparison table — Blob + BOM, mirrors
  // ModApp's QuoteComparisonSection handleExportCsv().
  function exportQuoteComparisonCsv() {
    if (!job) return;
    const quotedRequests = job.rfqRequests.filter((r) => r.quote);
    if (quotedRequests.length === 0 || job.partLines.length === 0) return;
    const header = ["Part", "Description", ...quotedRequests.flatMap((r) => [`${r.supplier.name} (unit)`, `${r.supplier.name} (total)`])];
    const rows = job.partLines.map((line) => {
      const qty = Number(line.quantity ?? 0);
      const cells = quotedRequests.flatMap((request) => {
        const quoteLine = request.quote!.lines.find((l) => l.partLineId === String(line.id));
        if (!quoteLine || quoteLine.available === false || quoteLine.unitPrice == null || quoteLine.unitPrice === "") return ["", ""];
        const unit = Number(quoteLine.unitPrice);
        return [unit.toFixed(2), (unit * qty).toFixed(2)];
      });
      return [text(line.partNumber), text(line.description), ...cells];
    });
    downloadCsv(`quote-comparison-${job.jobNumber || job.draftNumber}.csv`, [header, ...rows]);
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

  // 2026-09-14, user request: "Notes need to be editable once created."
  // Separate saving flag (not the shared `saving`) so editing a note
  // doesn't grey out unrelated buttons elsewhere on the page, and doesn't
  // get tangled up with the job-edit-grid's own autosave indicator.
  async function saveNoteEdit(noteId: string) {
    if (!job) return;
    setSavingNoteEdit(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${job.id}/notes`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ noteId, note: editingNoteText }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to save the note.");
      setEditingNoteId(""); setEditingNoteText("");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the note.");
    } finally {
      setSavingNoteEdit(false);
    }
  }

  // 2026-09-15, user request: "Notes section, allow a user to delete
  // notes." Same savingNoteEdit flag as editing (not the shared `saving`)
  // so this doesn't grey out unrelated buttons elsewhere on the page.
  async function deleteNote(noteId: string) {
    if (!job) return;
    if (!window.confirm("Delete this note?")) return;
    setSavingNoteEdit(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${job.id}/notes`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ noteId }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to delete the note.");
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete the note.");
    } finally {
      setSavingNoteEdit(false);
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

  const jobFormSections = (
    <>
      <div className="job-edit-grid">
        {/* 2026-09-14, user request: "Move notes section next to Client
            Details on the right that it is visible as soon as you open a
            job". Customer details only shrinks to half-width (wide-panel)
            in detail mode, where there's a job (and its notes) to show
            beside it — in create mode there's no job yet, so it keeps the
            full-width layout it always had. */}
        <section className={`detail-panel ${job && mode === "detail" ? "wide-panel" : "full-row"}`}>
          <header><div><h2>Customer details</h2></div></header>
          <div className="drawer-fields customer-fields">
            <label className="wide party-selector">
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
            <label><span>Sales representative</span><input value={form.salesRepresentative} onChange={(e) => updateField("salesRepresentative", e.target.value)} /></label>
            <label><span>Report number</span><input value={form.reportNumber} onChange={(e) => updateField("reportNumber", e.target.value)} /></label>
          </div>
        </section>

        {job && mode === "detail" && (
          <section className="detail-panel wide-panel job-notes-panel">
            <header><div><h2>Notes</h2><p>Business-facing notes stay with the job and appear in history.</p></div></header>
            <div className="drawer-fields"><label className="wide"><span>New note</span><textarea rows={3} value={form.note} onChange={(e) => updateField("note", e.target.value)} /></label></div>
            <footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || form.note.trim().length < 2} onClick={async () => { await postAction(`/api/v1/jobs/${job.id}/notes`, { note: form.note }); updateField("note", ""); }}>Add note</button></footer>
            <div className="record-list job-notes-list">
              {job.notes.map((note) => {
                const noteId = String(note.id);
                const isEditing = editingNoteId === noteId;
                return (
                  <article key={noteId}>
                    <div className="record-icon"><Plus size={14} /></div>
                    <div>
                      {isEditing ? (
                        <textarea rows={3} value={editingNoteText} onChange={(e) => setEditingNoteText(e.target.value)} />
                      ) : (
                        <strong>{text(note.note)}</strong>
                      )}
                      <span>{note.createdBy?.displayName || "System"}</span>
                    </div>
                    <span>{new Date(String(note.createdAt)).toLocaleString("en-ZA")}</span>
                    {isEditing ? (
                      <div className="stack-row">
                        <button type="button" className="quiet-button" disabled={savingNoteEdit} onClick={() => { setEditingNoteId(""); setEditingNoteText(""); }}>Cancel</button>
                        <button type="button" className="gold-button" disabled={savingNoteEdit || editingNoteText.trim().length < 2} onClick={() => void saveNoteEdit(noteId)}>{savingNoteEdit ? "Saving…" : "Save"}</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="table-action" title="Edit note" aria-label="Edit note" onClick={() => { setEditingNoteId(noteId); setEditingNoteText(String(note.note || "")); }}><Pencil size={13} /></button>
                        <button type="button" className="table-action danger" title="Delete note" aria-label="Delete note" disabled={savingNoteEdit} onClick={() => void deleteNote(noteId)}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </article>
                );
              })}
              {job.notes.length === 0 && <p className="table-state compact-empty-state">No notes yet.</p>}
            </div>
          </section>
        )}

        <section className="detail-panel">
          <header><div><h2>Machine / component details</h2></div></header>
          <div className="drawer-fields">
            <label className="party-selector">
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
            <label><span>Component type</span><input value={form.componentType} onChange={(e) => updateField("componentType", e.target.value)} /></label>
            <label><span>Component serial</span><input value={form.componentSerial} onChange={(e) => updateField("componentSerial", e.target.value)} /></label>
            <label><span>Part number</span><input value={form.componentPartNumber} onChange={(e) => updateField("componentPartNumber", e.target.value)} /></label>
            <label><span>Plant number</span><input value={form.plantNumber} onChange={(e) => updateField("plantNumber", e.target.value)} /></label>
            <label><span>Machine hours</span><input type="number" min="0" step="0.01" value={form.machineHours} onChange={(e) => updateField("machineHours", e.target.value)} /></label>
          </div>
        </section>

        <section className="detail-panel">
          <header><div><h2>Job details</h2></div></header>
          <div className="drawer-fields">
            <label><span>Job type *</span><select value={form.type} onChange={(e) => updateField("type", e.target.value)}>{JOB_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>ETA date</span><input type="date" value={form.etaDate} onChange={(e) => updateField("etaDate", e.target.value)} /></label>
            <label><span>Mechanic ETA date</span><input type="date" value={form.mechanicEtaDate} onChange={(e) => updateField("mechanicEtaDate", e.target.value)} /></label>
            <label><span>Import tracking number</span><input value={form.importTrackingNumber} onChange={(e) => updateField("importTrackingNumber", e.target.value)} /></label>
            <label><span>Previous job number</span><input value={form.previousJobNumber} onChange={(e) => updateField("previousJobNumber", e.target.value)} />{job?.pexConsumedBy && <span className="muted small-line">Redeployed a PEX unit returned on {text(job?.pexConsumedBy?.returnJob?.jobNumber || job?.pexConsumedBy?.returnJob?.draftNumber)}.</span>}</label>
            <label className="wide"><span>Job description</span><textarea rows={2} value={form.description} onChange={(e) => updateField("description", e.target.value)} /></label>
          </div>
        </section>

        <section className="detail-panel wide-panel">
          <header><div><h2>Commercial &amp; logistics</h2></div></header>
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
            <span className="row-break" aria-hidden="true" />

            <label><span>Receiving transport</span><select value={form.receivingTransport} onChange={(e) => updateField("receivingTransport", e.target.value)}><option value="">—</option>{DELIVERY_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
            <label><span>Delivery type</span><select value={form.deliveryType} onChange={(e) => updateField("deliveryType", e.target.value)}><option value="">—</option>{DELIVERY_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
            <label><span>Delivery date</span><input type="date" value={form.deliveryDate} onChange={(e) => updateField("deliveryDate", e.target.value)} /></label>
          </div>
        </section>
      </div>
    </>
  );

  return (
    <div className="job-workspace">
      <div className="job-sticky-header" ref={setStickyHeaderNode}>
        <header className="page-header compact">
          <div>
            <Link href="/jobs" className="back-link" onClick={handleBackClick}><ArrowLeft size={15} /> Back to jobs</Link>
            <p className="eyebrow">Jobs</p>
            <h1>{title}</h1>
            {mode === "detail" && job?.customer && (
              <p className="header-customer-line"><Link href={`/customers/${job.customer.id}`}>{job.customer.name}</Link></p>
            )}
            <p>{mode === "create" ? "The job number is allocated immediately, using your Numbering settings." : `${JOB_TYPE_LABELS[(job?.type || "STANDARD_REPAIR") as keyof typeof JOB_TYPE_LABELS]} · ${JOB_STATUS_LABELS[(job?.status || "DRAFT") as keyof typeof JOB_STATUS_LABELS]}`}</p>
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
                <button type="button" className="table-action" onClick={printJobCard}><Printer size={14} /> Print job card</button>
                {job.status === "DRAFT" && <button type="button" className="gold-button" onClick={() => setDialog("register")}><Plus size={14} /> Register</button>}
                {canMarkReturnedUnrepaired(job.type) && !["DRAFT", "CLOSED", "CANCELLED", "COMPLETE", "RETURNED_UNREPAIRED"].includes(job.status) && <button type="button" className="table-action" onClick={() => setDialog("returned-unrepaired")}>Mark returned unrepaired</button>}
                {!["DRAFT", "CLOSED", "CANCELLED", "COMPLETE", "RETURNED_UNREPAIRED"].includes(job.status) && <button type="button" className="table-action danger" onClick={() => { if (window.confirm("Cancel this job?")) void postAction(`/api/v1/jobs/${job.id}/status`, { status: "CANCELLED", reason: null }); }}>Cancel job</button>}
                {!["DRAFT", "CLOSED", "CANCELLED", "COMPLETE", "RETURNED_UNREPAIRED"].includes(job.status) && <button type="button" className="table-action" onClick={() => setDialog("close")}>Close job</button>}
                {["CLOSED", "CANCELLED", "COMPLETE", "RETURNED_UNREPAIRED"].includes(job.status) && <button type="button" className="table-action" onClick={() => setDialog("reopen")}>Reopen job</button>}
              </>
            )}
          </div>
        </header>

        {error && <div className="inline-error">{error}</div>}

        {job && job.status !== "DRAFT" && (
          <section className="detail-panel">
            <header><div><h2>Job status</h2><p>Click a stage to move the job straight there — saves immediately.</p></div></header>
            {["CLOSED", "CANCELLED", "RETURNED_UNREPAIRED"].includes(job.status) ? (
              <p className="status-stepper-note">
                This job isn&apos;t on the normal status flow right now ({JOB_STATUS_LABELS[job.status]}) — use Reopen above to bring it back onto the stepper.
              </p>
            ) : (
              <StatusStepper
                steps={statusStepsForJobType(job.type)}
                labels={JOB_STATUS_LABELS}
                // WAITING_FOR_PARTS was folded into the AWAIT_OUTWORK
                // stepper stage on 2026-09-10 (see MAIN_WORKSHOP_STATUS_STEPS'
                // comment in @/lib/jobs/ui) — normalize it here so a job
                // still sitting on WAITING_FOR_PARTS highlights on that
                // merged step instead of showing no current stage at all
                // (StatusStepper's currentIndex is steps.indexOf(status),
                // and WAITING_FOR_PARTS is no longer in `steps`).
                status={job.status === "WAITING_FOR_PARTS" ? "AWAIT_OUTWORK" : job.status}
                disabled={saving}
                onSelect={(step) => void postAction(`/api/v1/jobs/${job.id}/status`, { status: step, reason: null })}
              />
            )}
          </section>
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
          <form className="job-layout" id="job-edit-form" onSubmit={submitDraft}>{jobFormSections}</form>

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
              <aside className="form-drawer compact-dialog">
                <header><div><p className="eyebrow">PEX</p><h2>PEX unit history</h2></div><button type="button" onClick={() => setPexHistory(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  <dl className="info-card-inline"><div><dt>Status</dt><dd><PexStatusPill status={pexHistory.status} /></dd></div><div><dt>Supply date</dt><dd>{pexHistory.supplyDate ? new Date(pexHistory.supplyDate).toLocaleDateString("en-ZA") : "—"}</dd></div><div><dt>Return date</dt><dd>{pexHistory.returnDate ? new Date(pexHistory.returnDate).toLocaleDateString("en-ZA") : "—"}</dd></div>{pexHistory.consumedByJobNumber && <div><dt>Redeployed on</dt><dd>{text(pexHistory.consumedByJobNumber)}</dd></div>}</dl>
                  {pexHistory.previousCycles.length > 0 && <div><p className="muted small-line">Previous cycles</p><div className="record-list">{pexHistory.previousCycles.map((cycle, idx) => <article key={idx}><div className="record-icon">PX</div><div><strong>{text(cycle.supplyJobNumber)}</strong><span>Return {text(cycle.returnJobNumber)}</span></div><span className="muted small-line">{cycle.returnDate ? new Date(cycle.returnDate).toLocaleDateString("en-ZA") : "—"}</span></article>)}</div></div>}
                  <div className="history-list">{pexHistory.entries.map((entry) => <article key={entry.id}><strong>{text(entry.description)}</strong><span>{text(entry.type).replaceAll("_", " ")} · {entry.userName || "System"}</span><time>{new Date(entry.createdAt).toLocaleString("en-ZA")}</time></article>)}
                  {pexHistory.entries.length === 0 && <p className="table-state compact-empty-state">No history recorded yet.</p>}</div>
                </div>
              </aside>
            </div>
          )}

          <section className="detail-panel">
            <header>
              <div><h2>Parts list</h2><p>Track ordering and receiving for this job&apos;s parts.</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {job.partLines.length > 0 && (
                  <button type="button" className="quiet-button" onClick={() => { setBulkEditMode((v) => !v); setBulkSelectedIds(new Set()); }}>{bulkEditMode ? "Cancel bulk update" : "Bulk update"}</button>
                )}
                <button type="button" className="section-action-button" onClick={() => setShowAddParts((v) => !v)}>{showAddParts ? "Cancel" : <><Plus size={15} /> Add parts to Job</>}</button>
              </div>
            </header>
            {showAddParts && (
              <>
                <div className="drawer-fields">
                  <label className="wide party-selector"><span>Apply job kit</span><div><Search size={15} /><input value={jobKitQuery} onChange={(e) => { setJobKitQuery(e.target.value); setJobKitId(""); }} placeholder="Search job kit name, make or model" /></div>{jobKitOptions.length > 0 && <div className="selector-results">{jobKitOptions.map((kit) => <button key={kit.id} type="button" onClick={() => { setJobKitId(kit.id); setJobKitQuery(`${kit.name}${kit.machineMake ? ` · ${kit.machineMake}` : ""}${kit.machineModel ? ` ${kit.machineModel}` : ""}`); setJobKitOptions([]); }}><strong>{kit.name}</strong><span>{[kit.machineMake, kit.machineModel, kit.componentType].filter(Boolean).join(" · ") || "Reusable standard kit"}</span></button>)}</div>}</label>
                  <label><span>&nbsp;</span><button type="button" className="quiet-button" disabled={saving || !jobKitId} onClick={() => void applyJobKit()}>Apply selected kit</button></label>
                  <label className="wide"><span>Paste parts list (one per line — part number and quantity are required; description is optional: &quot;PN-1001, 2, Hydraulic seal kit&quot;)</span><textarea rows={4} value={bulkPartLines} onChange={(e) => setBulkPartLines(e.target.value)} placeholder={"PN-1001, 2, Hydraulic seal kit\nPN-2044, 4"} /></label>
                  <label className="wide">
                    <span>Or import a parts list file (.xlsx, .xls or .csv — needs Part number / Qty / Description columns)</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setPartsImportFile(e.target.files?.[0] || null)} />
                      <button type="button" className="quiet-button" disabled={saving || !partsImportFile} onClick={() => partsImportFile && void importPartsFile(partsImportFile)}>Import</button>
                      <button type="button" className="quiet-button" title="Download a blank parts-list template" aria-label="Download parts-list template" onClick={downloadPartsTemplate}><FileText size={15} /></button>
                    </div>
                  </label>
                </div>
                <footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !bulkPartLines.trim()} onClick={() => void addPartLines()}><Plus size={15} /> Add / cross-check with stock</button></footer>
              </>
            )}
            {/* 2026-09-15, user request: "Parts list table, make it that
                bulk update can be done on the parts to add supplier and
                order number, instead of one at a time." A row checkbox
                column appears while this toolbar is open; leaving a field
                blank here leaves it unchanged on every selected line. */}
            {bulkEditMode && (
              <div className="drawer-fields" style={{ padding: "10px 14px", background: "#fbf8f0", borderBottom: "1px solid var(--ink-150)" }}>
                <label><span>Order number (optional)</span><input value={bulkOrderNumber} onChange={(e) => setBulkOrderNumber(e.target.value)} placeholder="Applies to every selected row" /></label>
                <label className="party-selector"><span>Supplier (optional)</span><div><Search size={15} /><input value={bulkSupplierQuery} onChange={(e) => { setBulkSupplierQuery(e.target.value); setBulkSupplierId(""); setBulkSupplierPickerOpen(true); }} onFocus={() => setBulkSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{bulkSupplierPickerOpen && bulkSupplierOptions.length > 0 && <div className="selector-results">{bulkSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setBulkSupplierId(s.id); setBulkSupplierQuery(s.name); setBulkSupplierOptions([]); setBulkSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}</div>}</label>
                <label><span>&nbsp;</span><button type="button" className="gold-button" disabled={bulkApplying || bulkSelectedIds.size === 0 || (!bulkOrderNumber.trim() && !bulkSupplierId)} onClick={() => void applyBulkPartUpdate()}>{bulkApplying ? "Applying…" : `Apply to ${bulkSelectedIds.size} selected`}</button></label>
              </div>
            )}
            <div className="data-table-wrap"><table className="data-table"><thead><tr>
              {bulkEditMode && <th><input type="checkbox" aria-label="Select all part lines" checked={bulkSelectedIds.size > 0 && bulkSelectedIds.size === job.partLines.length} onChange={(e) => setBulkSelectedIds(e.target.checked ? new Set(job.partLines.map((l) => String(l.id))) : new Set())} /></th>}
              <th>Part</th><th>Qty</th><th>Order</th><th>Supplier</th><th>Status</th><th></th>
            </tr></thead><tbody>
              {job.partLines.map((line) => {
                const lineId = String(line.id);
                const quantity = decimalText(line.quantity);
                const received = decimalText(line.receivedQuantity ?? 0);
                const outstanding = Math.max(0, Number(line.quantity ?? 0) - Number(line.receivedQuantity ?? 0));
                const hasReceivedSome = Number(line.receivedQuantity ?? 0) > 0;
                const fullyReceived = line.status === "RECEIVED";
                const supplierPickerOpenHere = orderEditLineId === lineId;
                return <tr key={line.id}>
                  {bulkEditMode && <td><input type="checkbox" aria-label={`Select ${line.partNumber}`} checked={bulkSelectedIds.has(lineId)} onChange={(e) => setBulkSelectedIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(lineId); else next.delete(lineId); return next; })} /></td>}
                  <td>
                    <strong>{text(line.partNumber)}</strong>
                    <div className="muted small-line">{line.description ? text(line.description) : <button type="button" className="quiet-button" onClick={() => void saveDescription(lineId)}>Add description</button>}</div>
                  </td>
                  <td>
                    {quantity}{hasReceivedSome ? <div className="muted small-line">Received {received} of {quantity}</div> : null}
                    {receivingLineId === lineId && <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <input type="number" min={1} max={outstanding} value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} style={{ width: 80 }} />
                      <button type="button" className="quiet-button" disabled={saving || !receiveQty} onClick={() => void receivePartLine(lineId)}>Confirm</button>
                      <button type="button" className="quiet-button" disabled={saving} onClick={() => { setReceivingLineId(""); setReceiveQty(""); }}>Cancel</button>
                    </div>}
                  </td>
                  <td>
                    {/* Always an editable input, matching ModApp's
                        PartLineOrderNumberField — no need to click a
                        button first. Uncontrolled (defaultValue, not
                        value) since it's one of many rows and doesn't need
                        to re-render on every keystroke; saves on blur. */}
                    <input
                      key={lineId}
                      defaultValue={line.orderNumber ? String(line.orderNumber) : ""}
                      placeholder="PO / order #"
                      disabled={saving}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next === (line.orderNumber ? String(line.orderNumber).trim() : "")) return;
                        void saveOrderNumberInline(lineId, line.orderedFromSupplier?.id ? String(line.orderedFromSupplier.id) : "", next);
                      }}
                    />
                  </td>
                  <td className="party-selector">
                    {/* 2026-09-15, user request: "make that the supplier
                        field is also editable without clicking the change
                        supplier button." Always an editable typeahead, no
                        "Change supplier" click first — mirrors the Order #
                        cell's always-inline pattern. orderEditLineId marks
                        which row's picker is open (see its declaration
                        above for the double-click-glitch fix this also
                        relies on). */}
                    <div><Search size={13} /><input
                      value={supplierPickerOpenHere ? orderSupplierQuery : (line.orderedFromSupplier?.name || "")}
                      onFocus={() => { setOrderEditLineId(lineId); setOrderSupplierQuery(line.orderedFromSupplier?.name || ""); setOrderSupplierId(""); }}
                      onChange={(e) => { setOrderSupplierQuery(e.target.value); setOrderSupplierId(""); }}
                      placeholder="Search active supplier"
                      disabled={saving}
                    /></div>
                    {supplierPickerOpenHere && orderSupplierOptions.length > 0 && <div className="selector-results">{orderSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => void saveSupplierInline(lineId, line.orderNumber ? String(line.orderNumber) : "", s.id)}><strong>{s.name}</strong></button>)}</div>}
                  </td>
                  <td><span className={`status-pill ${fullyReceived ? "" : "neutral"}`}>{text(line.status).replaceAll("_", " ")}</span></td>
                  <td className="actions">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {hasReceivedSome && <button type="button" className="table-action" disabled={saving} onClick={() => void unreceivePartLine(lineId)}>Undo receive</button>}
                      {outstanding > 0 && receivingLineId !== lineId && <button type="button" className="table-action" disabled={saving} onClick={() => { setReceivingLineId(lineId); setReceiveQty(String(outstanding)); }}>{hasReceivedSome ? "Receive outstanding" : "Mark received"}</button>}
                      <button type="button" className="table-action danger" onClick={() => void removePartLineRow(lineId)}>Remove</button>
                    </div>
                  </td>
                </tr>;
              })}
              {job.partLines.length === 0 && <tr><td colSpan={bulkEditMode ? 7 : 6} className="table-state compact-empty-state">No parts on this job yet.</td></tr>}
            </tbody></table></div>
            {job.partLines.length > 0 && (
              <div className="detail-actions" style={{ borderTop: "1px solid var(--ink-150)" }}>
                <button type="button" className="section-action-button" onClick={() => setShowRfqPopup(true)}><Mail size={15} /> Request quotes from suppliers</button>
              </div>
            )}
          </section>

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
              <label className="wide party-selector"><span>Add existing supplier</span><div><Search size={15} /><input value={rfqSupplierQuery} onChange={(e) => { setRfqSupplierQuery(e.target.value); setRfqSupplierId(""); setRfqSupplierPickerOpen(true); }} onFocus={() => setRfqSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{rfqSupplierPickerOpen && rfqSupplierOptions.length > 0 && <div className="selector-results">{rfqSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setRfqSupplierId(s.id); setRfqSupplierQuery(s.name); setRfqSupplierOptions([]); setRfqSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}</div>}</label>
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
                  <input type="file" onChange={(e) => setRfqAttachmentFile(e.target.files?.[0] || null)} />
                  {rfqAttachmentFile && <button type="button" className="quiet-button" onClick={() => setRfqAttachmentFile(null)}><X size={13} /> {rfqAttachmentFile.name}</button>}
                </div>
                <p className="muted small-line">Sent with the RFQ email (a drawing, spec sheet or photo) — applies to whichever supplier you request a quote from below.</p>
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
                      {(status === "FAILED" || status === "SKIPPED") && <button type="button" className="table-action" disabled={saving} onClick={() => void resendRfq(String(request.id))}><RefreshCw size={13} /> {status === "FAILED" ? "Retry" : "Send email"}</button>}
                      <button type="button" className="table-action" disabled={saving} onClick={() => openRecordQuote(request)}>{request.quote ? "Edit quote" : "Record quote"}</button>
                      <button type="button" className="table-action danger" onClick={() => void removeRfq(String(request.id))}>Remove</button>
                    </div>
                  </td>
                </tr>;
              })}
              {job.rfqRequests.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No suppliers have been asked to quote this job yet.</td></tr>}
            </tbody></table></div>

            {rfqQuoteEditId && (() => {
              const request = job.rfqRequests.find((r) => String(r.id) === rfqQuoteEditId);
              if (!request) return null;
              return <div className="drawer-fields" style={{ marginTop: 16 }}>
                <h3 style={{ gridColumn: "1 / -1" }}>Record quote — {text(request.supplier.name)}</h3>
                <label><span>Quote file (optional)</span><input type="file" onChange={(e) => { const file = e.target.files?.[0] || null; setRfqQuoteFile(file); if (file) void analyzeRfqQuoteFile(rfqQuoteEditId, file); }} /></label>
                <label className="wide"><span>Notes</span><textarea rows={2} value={rfqQuoteNotes} onChange={(e) => setRfqQuoteNotes(e.target.value)} /></label>
                {rfqAnalyzing && <p className="muted small-line wide">Analyzing file for prices…</p>}
                {!rfqAnalyzing && rfqGuessCount > 0 && <p className="muted small-line wide">Guessed {rfqGuessCount} price{rfqGuessCount === 1 ? "" : "s"} from the file — review before saving.</p>}
                <div className="wide">
                  <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Part</th><th>Available</th><th>Unit price</th><th>Notes</th></tr></thead><tbody>
                    {job.partLines.map((line) => {
                      const draft = rfqPriceDrafts[String(line.id)] || { unitPrice: "", available: true, notes: "" };
                      return <tr key={line.id}>
                        <td>{text(line.partNumber)}{line.description ? <div className="muted small-line">{text(line.description)}</div> : null}</td>
                        <td><input type="checkbox" checked={draft.available} onChange={(e) => setRfqPriceDrafts((d) => ({ ...d, [String(line.id)]: { ...draft, available: e.target.checked } }))} /></td>
                        <td><input type="number" min="0" step="0.01" disabled={!draft.available} value={draft.unitPrice} onChange={(e) => setRfqPriceDrafts((d) => ({ ...d, [String(line.id)]: { ...draft, unitPrice: e.target.value } }))} style={{ width: 100 }} /></td>
                        <td><input value={draft.notes} onChange={(e) => setRfqPriceDrafts((d) => ({ ...d, [String(line.id)]: { ...draft, notes: e.target.value } }))} /></td>
                      </tr>;
                    })}
                    {job.partLines.length === 0 && <tr><td colSpan={4} className="table-state compact-empty-state">No parts on this job to price yet.</td></tr>}
                  </tbody></table></div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="gold-button" disabled={saving} onClick={() => void saveRfqQuote(rfqQuoteEditId)}>Save quote</button>
                  <button type="button" className="quiet-button" disabled={saving} onClick={cancelRecordQuote}>Cancel</button>
                </div>
              </div>;
            })()}

            {job.rfqRequests.some((r) => r.quote) && job.partLines.length > 0 && (() => {
              const quotedRequests = job.rfqRequests.filter((r) => r.quote);
              const { total: preferredTotal, pickedCount } = preferredPurchaseSummary(job);
              return <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h3>Quote comparison</h3>
                  <button type="button" className="quiet-button" onClick={exportQuoteComparisonCsv}><Download size={14} /> Export CSV</button>
                </div>
                <div className="data-table-wrap"><table className="data-table quote-comparison-table"><thead>
                  <tr>
                    <th rowSpan={2}>Part</th>
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
                    <td><strong>Quote total</strong></td>
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
                    <td><strong>Preferred total ({pickedCount} of {job.partLines.length} picked)</strong></td>
                    <td colSpan={Math.max(1, quotedRequests.length * 2)}><strong>R{preferredTotal.toFixed(2)}</strong></td>
                  </tr>
                </tfoot></table></div>
                <p className="muted small-line" style={{ marginTop: 8 }}>Click <Star size={11} style={{ verticalAlign: "-1px" }} /> a price to mark it preferred for that part — this also fills in the part&apos;s &quot;ordered from&quot; supplier.</p>
              </div>;
            })()}
          </aside>
          </div>
          )}

          <section className="detail-panel">
            <header><div><h2>Parts follow-up</h2><p>Chase every supplier with outstanding ordered parts on this job — one email per supplier listing everything still outstanding from them.</p></div></header>
            <footer className="detail-actions"><button type="button" className="section-action-button" disabled={saving} onClick={() => void sendPartsFollowup()}><Mail size={15} /> Send follow-up to outstanding suppliers</button></footer>
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
                {partsFollowupResult.skipped.length > 0 && <div className="wide">{partsFollowupResult.skipped.map((s, idx) => <p key={idx} className="muted small-line">{s.supplierName}: {s.reason}</p>)}</div>}
                {partsFollowupResult.sent.length === 0 && partsFollowupResult.skipped.length === 0 && <p className="muted small-line wide">No outstanding ordered parts on this job.</p>}
              </div>
            )}
          </section>

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
                    <label className="party-selector"><span>Supplier</span><div><Search size={15} /><input value={outworkSupplierQuery} onChange={(e) => { setOutworkSupplierQuery(e.target.value); setOutworkSupplierId(""); setOutworkSupplierPickerOpen(true); }} onFocus={() => setOutworkSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{outworkSupplierPickerOpen && outworkSupplierOptions.length > 0 && <div className="selector-results">{outworkSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setOutworkSupplierId(s.id); setOutworkSupplierQuery(s.name); setOutworkSupplierOptions([]); setOutworkSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}</div>}</label>
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
                    <td className="party-selector"><div><Search size={14} /><input value={editOutworkSupplierQuery} onChange={(e) => { setEditOutworkSupplierQuery(e.target.value); setEditOutworkSupplierId(""); setEditOutworkSupplierPickerOpen(true); }} onFocus={() => setEditOutworkSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>{editOutworkSupplierPickerOpen && editOutworkSupplierOptions.length > 0 && <div className="selector-results">{editOutworkSupplierOptions.map((s) => <button key={s.id} type="button" onClick={() => { setEditOutworkSupplierId(s.id); setEditOutworkSupplierQuery(s.name); setEditOutworkSupplierOptions([]); setEditOutworkSupplierPickerOpen(false); }}><strong>{s.name}</strong></button>)}</div>}</td>
                    <td><input type="date" value={editOutworkDateSentOut} onChange={(e) => setEditOutworkDateSentOut(e.target.value)} /></td>
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

          <section className="detail-panel">
            <header>
              <div><h2>Attachments</h2><p>Photos, documents and other files kept with this job — stored with the job record itself (an object-storage move is planned; see the storage-architecture decision doc).</p></div>
            </header>
            <div className="drawer-fields">
              <label><span>Upload a file (max 8MB)</span><input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} /></label>
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

          {deliveryNote && (
            <div className="drawer-backdrop" role="dialog" aria-modal="true">
              <aside className="form-drawer compact-dialog">
                <header><div><p className="eyebrow">Outwork</p><h2>Delivery note</h2><p className="muted small-line">Job {deliveryNote.jobNumber}</p></div><button type="button" onClick={() => setDeliveryNote(null)} aria-label="Close dialog"><X size={18} /></button></header>
                <div className="drawer-fields">
                  <p className="muted small-line">Supplier: {deliveryNote.supplierName}</p>
                  <p className="muted small-line">Date sent out: {deliveryNote.dateSentOut ? new Date(deliveryNote.dateSentOut).toLocaleDateString("en-ZA") : "—"}</p>
                  <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Description</th><th>Quantity</th><th>Checked</th></tr></thead><tbody>
                    {deliveryNote.items.map((i, idx) => <tr key={idx}><td>{i.description}</td><td>{i.quantity}</td><td></td></tr>)}
                  </tbody></table></div>
                  {/* Vehicle reg + signature fields are print-only (see
                      printDeliveryNote) — this on-screen preview is just for
                      reviewing the batch before printing, not a form to
                      fill in on screen. */}
                </div>
                <footer className="detail-actions">
                  <button type="button" className="gold-button" onClick={printDeliveryNote}>Print</button>
                  <button type="button" className="quiet-button" onClick={() => setDeliveryNote(null)}>Close</button>
                </footer>
              </aside>
            </div>
          )}

          {job.type === "FIELD_SERVICE" && <section className="detail-panel"><header><div><h2>Field service</h2><p>Capture site, technician and report details for field-service work.</p></div></header><div className="drawer-fields"><label><span>Site</span><input value={form.fieldSite} onChange={(e) => updateField("fieldSite", e.target.value)} /></label><label><span>Technician</span><input value={form.fieldTechnician} onChange={(e) => updateField("fieldTechnician", e.target.value)} /></label><label><span>Vehicle</span><input value={form.fieldVehicle} onChange={(e) => updateField("fieldVehicle", e.target.value)} /></label><label><span>Hours</span><input type="number" min="0" step="0.25" value={form.fieldHours} onChange={(e) => updateField("fieldHours", e.target.value)} /></label>{/* Kms travelled only applies to field-service visits, so it lives here rather than in Commercial & logistics — matches ModApp's placement. It's a Job column, so it's saved via this same field-service action. */}<label><span>Kms travelled</span><input type="number" min="0" value={form.kmsTravelled} onChange={(e) => updateField("kmsTravelled", e.target.value)} /></label><label className="wide"><span>Report</span><textarea rows={4} value={form.fieldReport} onChange={(e) => updateField("fieldReport", e.target.value)} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving} onClick={() => void putAction(`/api/v1/jobs/${job.id}/field-service`, { site: form.fieldSite || null, technician: form.fieldTechnician || null, vehicle: form.fieldVehicle || null, hours: form.fieldHours ? Number(form.fieldHours) : null, report: form.fieldReport || null, kmsTravelled: form.kmsTravelled ? Number(form.kmsTravelled) : null })}>Save field-service info</button></footer></section>}

          {job.type === "WARRANTY" && <section className="detail-panel"><header><div><h2>Warranty</h2><p>Capture the current warranty state supported by Phase 4A.</p></div></header><div className="drawer-fields"><label><span>Warranty status</span><select value={form.warrantyStatus} onChange={(e) => updateField("warrantyStatus", e.target.value)}><option value="PENDING">Pending</option><option value="GRANTED">Granted</option><option value="DECLINED">Declined</option></select></label><label><span>Historical source status</span><input value={form.warrantyHistorical} onChange={(e) => updateField("warrantyHistorical", e.target.value)} /></label><label className="wide"><span>Warranty notes</span><textarea rows={4} value={form.warrantyNotes} onChange={(e) => updateField("warrantyNotes", e.target.value)} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving} onClick={() => void putAction(`/api/v1/jobs/${job.id}/warranty`, { status: form.warrantyStatus, notes: form.warrantyNotes || null, historicalSourceStatus: form.warrantyHistorical || null })}>Save warranty info</button></footer></section>}

          {job.type === "PEX_SUPPLY" && job.pexAsSupply && <section className="detail-panel"><header><div><h2>PEX Supply</h2><p>Track the linked return job and its redeployment cycle. Mirrors ModApp's PEX supply/return chain.</p></div></header>
            <div className="record-list pex-record-list"><article>
              <div className="record-icon">PX</div>
              <div><strong>{text(job.pexAsSupply.unitDescription || job.component)}</strong><span>Supplied {job.pexAsSupply.supplyDate ? new Date(String(job.pexAsSupply.supplyDate)).toLocaleDateString("en-ZA") : "—"}</span></div>
              <PexStatusPill status={job.pexAsSupply.status} />
              <div className="stack-grid pex-link-stack">
                {job.pexAsSupply.returnJob ? <><span className="muted small-line">Return job: {text(job.pexAsSupply.returnJob.jobNumber || job.pexAsSupply.returnJob.draftNumber)} ({text(job.pexAsSupply.returnJob.status)})</span><Link href={`/jobs/${job.pexAsSupply.returnJob.id}`} className="table-action">Open return</Link></> : <span className="muted small-line">No return job linked yet — it is created automatically once this job is completed, or link/create one below.</span>}
              </div>
              <div className="stack-row">
                <button type="button" className="quiet-button" disabled={saving} onClick={() => void openPexHistory(String(job.pexAsSupply?.id))}>View history</button>
                {job.pexAsSupply.returnJob && <button type="button" className="table-action" disabled={saving} onClick={() => { if (window.confirm("Unlink the return job? It will not be deleted — you can relink or create a new one afterwards.")) void deleteAction(`/api/v1/jobs/${job.id}/pex/link-return`, {}); }}>Unlink return job</button>}
              </div>
            </article></div>
            {!job.pexAsSupply.returnJob && <div className="drawer-fields">
              <label><span>Create linked return job now</span><div className="stack-row"><button type="button" className="quiet-button" disabled={saving} onClick={() => void postAction(`/api/v1/jobs/${job.id}/pex/create-return`, {})}>Create return job</button></div></label>
              <label className="wide party-selector"><span>Or link an existing unlinked PEX return job</span><div><Search size={14} /><input value={pexReturnJobQuery} onChange={(e) => { setPexReturnJobQuery(e.target.value); setSelectedPexReturnJobId(""); }} placeholder="Search unlinked PEX return jobs…" /></div>{pexReturnJobOptions.length > 0 && <div className="selector-results">{pexReturnJobOptions.map((option) => <button type="button" key={option.id} onClick={() => { setSelectedPexReturnJobId(option.id); setPexReturnJobQuery(text(option.jobNumber || option.draftNumber)); setPexReturnJobOptions([]); }}><strong>{text(option.jobNumber || option.draftNumber)}</strong><span>{text(option.customer?.name || option.customer?.tradingName)}</span></button>)}</div>}</label>
              <div className="stack-row"><button type="button" className="quiet-button" disabled={saving || !selectedPexReturnJobId} onClick={() => void postAction(`/api/v1/jobs/${job.id}/pex/link-return`, { returnJobId: selectedPexReturnJobId }).then(() => { setSelectedPexReturnJobId(""); setPexReturnJobQuery(""); })}>Link return job</button></div>
            </div>}
          </section>}

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
              </div>
            </article></div>
            <div className="drawer-fields"><label className="wide"><span>PEX notes</span><textarea rows={3} value={form.pexNotes} onChange={(e) => updateField("pexNotes", e.target.value)} /></label></div>
            <footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving} onClick={() => void patchAction(`/api/v1/pex/${job.pexAsReturn?.id}/notes`, { notes: form.pexNotes || null })}>Save PEX notes</button></footer>
          </section>}

          {job.status === "COMPLETE" && !job.pexAsSupply && !job.pexAsReturn && <section className="detail-panel"><header><div><h2>Send job to PEX Inventory</h2><p>Any completed job's unit can be allocated directly into PEX Inventory, without a supply/return chain — matches ModApp's manual stock intake.</p></div></header>
            <footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving} onClick={() => void postAction(`/api/v1/jobs/${job.id}/pex/allocate`, {})}>Send to PEX Inventory</button></footer>
          </section>}

          {/* Notes now render beside Customer details, at the top of
              jobFormSections above — see the job-notes-panel section
              there (2026-09-14, user request: "Move notes section next to
              Client Details on the right that it is visible as soon as
              you open a job"). */}

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
        </>
      )}
    </div>
  );
}
/* eslint-enable react-hooks/set-state-in-effect */

function Info({ title, values }: { title: string; values: Array<[string, unknown]> }) {
  return <section className="info-card"><header><h2>{title}</h2></header><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{text(value)}</dd></div>)}</dl></section>;
}