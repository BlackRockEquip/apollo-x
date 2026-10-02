"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async list/option loading intentionally mirrors existing workspace patterns (MasterDataWorkspace, UsersWorkspace) */

import { useCallback, useEffect, useState } from "react";
import type { FocusEvent } from "react";
import Link from "next/link";
import { ClipboardCheck, Eye, Loader2, Plus, Printer, Search, Trash2, Upload, X } from "lucide-react";
import { STOCK_STATE_LABEL, STOCK_STATE_CLASS, type StockState } from "@/lib/inventory/stock-state";
import { ImportModule } from "@/components/ImportExportWorkspace";
import { PART_IMPORT_FIELDS } from "@/lib/import-export/fields";
import { useTenantPermissions } from "@/components/AppShell";
import { useConfirmDialog } from "@/components/ConfirmDialog";

// 2026-09-10 — Parts Catalog merged into Stock Levels at the user's request
// ("combine parts catalog to Stock levels... One page, Stock Levels only").
// This replaces the old server-rendered, read-only inventory/page.tsx with
// a client workspace (same pattern as MasterDataWorkspace/UsersWorkspace)
// so a part can be created, edited, and deleted without leaving this page,
// and so bin-location assignment (new this task) can offer "pick an
// existing location, create one inline, or leave blank" without a full
// page round-trip. Stock figures (on hand/reserved/available/state) still
// come from listInventoryPositions, now extended with the catalog fields
// and bin location (see src/lib/inventory/service.ts).
//
// 2026-09-14 — "make the stock levels page work the similar as modapp, one
// page that does all" (explicit request), ported from ModApp's own
// Inventory page (InventoryPickBar/InventoryPickProvider/PickSlipModal/
// BulkStockCheckModal/AddOrImportPartsModal — see workshop-track-progress
// docs) but adapted to Apollo X's multi-location stock model. Adds: search
// across part number/description/bin/manufacturer (extended in
// listInventoryPositions), a "Check stock" bulk part-number lookup, a Pick
// checkbox + quantity per row feeding a floating "N selected — Create
// picking slip" bar (allocates to a job, posts real ISSUE stock movements,
// prints, and is saved/reprintable from a new Picking Slip History tab —
// see createPickSlip/listPickSlips in inventory/service.ts), and an Adjust
// action per row (adjustStock already existed server-side, just had no UI).
// The standalone "Receive Stock" button (never wired to anything) is gone —
// "New Part" is now "Add or Import Part", a small popup offering the
// existing create-part drawer or the existing Import/Export parts wizard
// (ImportModule, reused as-is from Settings > Import/Export) side by side,
// so receiving stock happens either by editing a part's on-hand figure
// directly via Adjust, or by importing/creating parts with an opening
// quantity — there's no longer a separate manual "receive" form.

type PositionRow = {
  id: string;
  partNumber: string;
  description: string;
  manufacturerId: string | null;
  manufacturerName: string | null;
  manufacturerPartNumber: string | null;
  category: string | null;
  unitOfMeasure: string;
  notes: string | null;
  taxCodeId: string | null;
  taxCodeLabel: string | null;
  binLocationId: string | null;
  binLocationLabel: string | null;
  reorderMinimum: string | null;
  reorderMaximum: string | null;
  reorderQuantity: string | null;
  active: boolean;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  stockState: string;
  locationCount: number;
  cost: string | null;
  sellingPrice: string | null;
  // 2026-09-29 — user request: "how can we add additional part numbers
  // for parts that have superseded numbers and also have group numbers?"
  // Every alternate number recorded against this part (see
  // PartAlternateNumber in schema.prisma) — shown as small badges under
  // the part number below, and searchable/resolvable everywhere a part
  // number is typed (see findPartByNumber in inventory/parts-lookup.ts).
  alternateNumbers: AlternateNumber[];
};
type AlternateNumber = { id: string; number: string; kind: "SUPERSEDED" | "GROUP" };
const ALT_KIND_LABEL: Record<AlternateNumber["kind"], string> = { SUPERSEDED: "Superseded", GROUP: "Group" };
// 2026-09-22 — user request: "Stock Levels - add columns Cost Price and
// Selling Price, next to the bin locations column (These two columns only
// visible to company admins)." canViewCost mirrors listInventoryPositions'
// own new field (inventory/service.ts) — whether the two columns render AT
// ALL, not just whether a given row's cost/sellingPrice happens to be
// null. Gated server-side by the existing INVENTORY_VIEW_COST permission
// (already used the same way for Quotes/Sales Orders/Invoices cost
// visibility elsewhere in this app) rather than a new "is admin" check —
// Company Admin has it by default via ALL_TENANT, and, same as everywhere
// else this permission is used, a company can also extend it to another
// role (e.g. Finance) from Settings > Users without code changes.
// 2026-09-22, user request: "Stock Levels - add at the top right the total
// inventory cost price with a label 'Total Stock Price'." totalStockValue
// mirrors canViewCost's own gating (see listInventoryPositions) — null
// whenever the caller can't see cost prices, same as every per-row cost
// field, since this is just a sum of those.
type ListResponse = { items: PositionRow[]; total: number; page: number; pageSize: number; canViewCost: boolean; totalStockValue: string | null };
type Option = { id: string; label: string };

// 2026-09-16 — user request: "remove manufacturer part number from add
// import parts as its not used." Dropped from this form (and from the
// Add/Import Parts template — see PART_IMPORT_FIELDS in
// import-export/fields.ts) — the underlying Part.manufacturerPartNumber
// column and the Manufacturer field's own dropdown are untouched, so any
// part already carrying a value keeps it, it's just no longer editable
// from here.
type PartForm = {
  partNumber: string; description: string; manufacturerId: string;
  category: string; unitOfMeasure: string; taxCodeId: string;
  defaultPurchaseCost: string; defaultSellingPrice: string;
  reorderMinimum: string; reorderMaximum: string; reorderQuantity: string;
  notes: string; active: boolean; binLocationId: string;
};
const NEW_BIN = "__new__";
const BLANK_FORM: PartForm = {
  partNumber: "", description: "", manufacturerId: "",
  category: "", unitOfMeasure: "EA", taxCodeId: "",
  defaultPurchaseCost: "", defaultSellingPrice: "",
  reorderMinimum: "", reorderMaximum: "", reorderQuantity: "",
  notes: "", active: true, binLocationId: "",
};

type PickEntry = { partId: string; partNumber: string; description: string; binLocationLabel: string | null; quantityAvailable: number; quantity: number };
type JobOption = { id: string; jobNumber: string; customerName: string | null };
type PickSlipLineData = { partNumber: string; description: string; quantity: string; binLocationLabel: string | null };
type PickSlipData = { id: string; jobId: string; jobNumber: string; customerName: string | null; createdAt: string; status?: string; cancelledAt?: string | null; cancelReason?: string | null; lines: PickSlipLineData[] };
type BulkSearchRow = { partNumber: string; found: boolean; partId: string | null; description: string | null; binLocationLabel: string | null; quantityAvailable: string };
// 2026-10-02 — Stock Take tab types. systemQty is a snapshot taken when the
// location is opened for counting (for the printed sheet and the entry
// form's reference column) — the real expected quantity used to compute the
// posted variance is recomputed fresh at submit time by countCreate itself.
type StockTakeRow = { partId: string; partNumber: string; description: string; systemQty: string; actualQty: string };
type StockCountStatus = "OPEN" | "COMPLETED" | "APPROVED" | "CANCELLED";
type StockCountRow = { id: string; referenceNumber: string | null; location: { code: string; name: string } | null; status: StockCountStatus; startedAt: string; completedAt: string | null; approvedAt: string | null; lineCount: number };
const STOCK_COUNT_STATUS_LABEL: Record<StockCountStatus, string> = { OPEN: "Open", COMPLETED: "Completed", APPROVED: "Approved", CANCELLED: "Cancelled" };
const STOCK_COUNT_STATUS_TONE: Record<StockCountStatus, string> = { OPEN: "tone-amber", COMPLETED: "tone-blue", APPROVED: "tone-green", CANCELLED: "tone-neutral" };

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// 2026-09-18 — user report: "selling price decimals problem" on Add/Edit
// Part. defaultPurchaseCost/defaultSellingPrice are Decimal(19,4) columns
// (see prisma/schema.prisma), so Postgres always returns them with exactly
// four decimal places, and listInventoryPositions/getInventoryDetail just
// call .toString() on that Decimal — a part saved with "1200" round-trips
// back as "1200.0000" the moment you reopen it to edit. Trimming to a
// normal 2dp currency string here (only when repopulating the edit form —
// the value stored in the database is untouched) fixes the display without
// touching precision anywhere quantities actually need more than 2dp
// (reorder min/max/quantity are left alone).
function formatMoneyForInput(value: string | null | undefined): string {
  if (!value) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : value;
}

// 2026-09-22 — same ZAR currency formatting MasterDataWorkspace.tsx's
// "currency-zar" column format already uses elsewhere, for the new Cost
// Price / Selling Price columns below.
function formatMoney(value: string | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n) : "—";
}

function printPickSlip(ps: PickSlipData) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return; // popup blocked — nothing more we can do here
  const rows = ps.lines
    .map((l) => `<tr><td>${escapeHtml(l.partNumber)}</td><td>${escapeHtml(l.description || "")}</td><td class="qty">${escapeHtml(l.quantity)}</td><td class="qty"></td><td>${escapeHtml(l.binLocationLabel || "—")}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><head><title>Pick slip - ${escapeHtml(ps.jobNumber)}</title><meta charset="utf-8" /><style>
    body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827}
    h1{font-size:20px;margin:0 0 4px;color:#7a5c14;border-bottom:3px solid #7a5c14;padding-bottom:10px}
    p.meta{color:#6b7280;font-size:12px;margin:2px 0}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:18px}
    th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left}
    th{background:#f9fafb;border-bottom:2px solid #7a5c14}
    td.qty{text-align:center;font-weight:600}
    .signoff{display:flex;gap:24px;margin-top:44px}
    .signoff .field{flex:1}
    .signoff .line{border-bottom:1px solid #1f2937;height:28px}
    .signoff .label{margin-top:4px;font-size:11px;color:#6b7280}
  </style></head><body>
    <h1>Pick slip — Job ${escapeHtml(ps.jobNumber)}</h1>
    <p class="meta">${ps.customerName ? `Client: ${escapeHtml(ps.customerName)}` : ""}</p>
    <p class="meta">Generated ${escapeHtml(new Date(ps.createdAt).toLocaleString())} · Pick slip ${escapeHtml(ps.id.slice(-8))}</p>
    <table><thead><tr><th>Part number</th><th>Description</th><th>Qty</th><th>Qty picked</th><th>Bin location</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="signoff">
      <div class="field"><div class="line"></div><p class="label">Who picked (print name)</p></div>
      <div class="field"><div class="line"></div><p class="label">Signature</p></div>
      <div class="field"><div class="line"></div><p class="label">Date</p></div>
    </div>
  </body></html>`;
  w.document.write(html);
  w.document.close();
  const doPrint = () => { try { w.focus(); w.print(); } catch { /* window may already be closed */ } };
  w.onload = doPrint;
  setTimeout(doPrint, 400);
}

// 2026-10-02 — Stock Take count sheet. Same window.open/document.write/
// window.onload-print convention as printPickSlip above — part number,
// description, system qty (for reference while counting) and a blank
// "Actual qty" column to fill in by hand, with a single sign-off block at
// the bottom (per the user's own spec: "list part number, qty, actual qty,
// and a sign off at the bottom of the page").
function printStockTakeSheet(locationLabel: string, rows: StockTakeRow[]) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return; // popup blocked — nothing more we can do here
  const trs = rows
    .map((r) => `<tr><td>${escapeHtml(r.partNumber)}</td><td>${escapeHtml(r.description || "")}</td><td class="qty">${escapeHtml(r.systemQty)}</td><td class="qty"></td></tr>`)
    .join("");
  const html = `<!doctype html><html><head><title>Stock take - ${escapeHtml(locationLabel)}</title><meta charset="utf-8" /><style>
    body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827}
    h1{font-size:20px;margin:0 0 4px;color:#7a5c14;border-bottom:3px solid #7a5c14;padding-bottom:10px}
    p.meta{color:#6b7280;font-size:12px;margin:2px 0}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:18px}
    th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left}
    th{background:#f9fafb;border-bottom:2px solid #7a5c14}
    td.qty{text-align:center;font-weight:600}
    .signoff{display:flex;gap:24px;margin-top:44px}
    .signoff .field{flex:1}
    .signoff .line{border-bottom:1px solid #1f2937;height:28px}
    .signoff .label{margin-top:4px;font-size:11px;color:#6b7280}
  </style></head><body>
    <h1>Stock take — ${escapeHtml(locationLabel)}</h1>
    <p class="meta">Generated ${escapeHtml(new Date().toLocaleString())}</p>
    <table><thead><tr><th>Part number</th><th>Description</th><th>System qty</th><th>Actual qty</th></tr></thead><tbody>${trs}</tbody></table>
    <div class="signoff">
      <div class="field"><div class="line"></div><p class="label">Counted by (print name)</p></div>
      <div class="field"><div class="line"></div><p class="label">Signature</p></div>
      <div class="field"><div class="line"></div><p class="label">Date</p></div>
    </div>
  </body></html>`;
  w.document.write(html);
  w.document.close();
  const doPrint = () => { try { w.focus(); w.print(); } catch { /* window may already be closed */ } };
  w.onload = doPrint;
  setTimeout(doPrint, 400);
}

export function StockLevelsWorkspace({ hasManage }: { hasManage: boolean }) {
  // 2026-10-01 — user request: "Mechanic user ... make that a mechanic
  // user can not delete / edit / adjust parts, basically only check
  // whats in stock." A Mechanic (TenantRole.USER) already keeps
  // INVENTORY_VIEW + INVENTORY_ISSUE (the latter so they can still
  // create a picking slip from inside a job — see JobWorkspace.tsx — and
  // so adding a part line to a Parts List, which only needs JOBS_EDIT,
  // is unaffected either way), so this can't be done by just removing a
  // permission: it's the same deliberate role check used throughout
  // JobWorkspace.tsx's own mechanic lockdown (mechanicFieldsLocked)
  // rather than a new fine-grained permission nothing else would use.
  // `canManage` replaces every existing `hasManage`-gated control
  // (Adjust / Create picking slip / Delete picking slip) so a Mechanic
  // never sees them even though INVENTORY_ISSUE alone would otherwise
  // satisfy `hasManage`'s "any of RECEIVE/TRANSFER/ISSUE/ADJUST" check;
  // Edit / Delete / Delete all / Add or Import Part aren't gated by
  // `hasManage` at all today (every role sees them, relying entirely on
  // server-side PARTS_CREATE/PARTS_EDIT/PARTS_DEACTIVATE, none of which
  // USER holds) so those are gated directly off `mechanicReadOnly`
  // instead, below.
  const { tenantRole, tenantPermissions } = useTenantPermissions();
  const mechanicReadOnly = tenantRole === "USER";
  const canManage = hasManage && !mechanicReadOnly;
  // 2026-10-02 — new Stock Take tab (user request: "Create a tab for Stock
  // take (Admins / Store Controller only)"). INVENTORY_RECONCILE already
  // existed as a permission (it's what the count backend itself has always
  // required — see countCreate/countComplete/etc in inventory/service.ts)
  // and, before this feature, was already granted to exactly COMPANY_ADMIN
  // (via ALL_TENANT) and STORE_CONTROLLER (the STORES permission set) and
  // nobody else — see permissions.ts — a permission check here enforces
  // "Admins / Store Controller only" precisely, and (unlike a hardcoded
  // tenantRole check) still respects a company extending that permission to
  // another role later from Settings > Users.
  const canStockTake = tenantPermissions.has("INVENTORY_RECONCILE");
  // Same system-wide colored confirm dialog as everywhere else (see
  // ConfirmDialog.tsx) — this file's three window-less `confirm(...)`
  // calls (deletePickSlip/deleteRow/deleteAll below) were missed by that
  // earlier sweep because it searched for `window.confirm` specifically;
  // fixed here while already touching this file's delete actions.
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [tab, setTab] = useState<"stock" | "pickslips" | "stocktake">("stock");

  const [data, setData] = useState<ListResponse>({ items: [], total: 0, page: 1, pageSize: 25, canViewCost: false, totalStockValue: null });
  const [q, setQ] = useState("");
  const [stockState, setStockState] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 2026-10-02 — user request: "make the table filterable by each heading
  // (dropdown that lets you select etc)." listInventoryPositions
  // (inventory/service.ts) and its positionQuery validator already accepted
  // manufacturerId/locationId filters — used by nothing in this file until
  // now, since no dropdown ever set them. Wired up as a second header row
  // (the same "filter-row" convention RfqAllWorkspace/OutworkAllWorkspace
  // already use) under the two columns that actually have a finite,
  // dropdown-shaped set of values — Manufacturer and Bin locations — using
  // the same manufacturers/locations option lists the Add/Edit Part drawer
  // already loads. Part/Description are left to the existing search box
  // (which already matches both, plus bin code/name and manufacturer name,
  // in one field — a second, narrower per-column text filter for either
  // would just be a worse version of what's already there), and Cost
  // Price/Selling Price/On Hand/Reserved/Available have no natural
  // dropdown domain to filter by. State already has its own filter (the
  // radio buttons above the table) and is left as-is.
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const [manufacturers, setManufacturers] = useState<Option[]>([]);
  const [taxCodes, setTaxCodes] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PositionRow | null>(null);
  const [form, setForm] = useState<PartForm>(BLANK_FORM);
  const [newBinCode, setNewBinCode] = useState("");
  const [newBinName, setNewBinName] = useState("");
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  // 2026-09-29 — alternate (superseded/group) part numbers. Only
  // meaningful once a part actually exists (they attach to a partId), so
  // this list is only populated/editable when editing an existing part —
  // openCreate leaves it empty and the drawer explains why it's hidden
  // for a brand-new part.
  const [altNumbers, setAltNumbers] = useState<AlternateNumber[]>([]);
  const [newAltNumber, setNewAltNumber] = useState("");
  const [newAltKind, setNewAltKind] = useState<AlternateNumber["kind"]>("SUPERSEDED");
  const [altSaving, setAltSaving] = useState(false);
  const [altBusyId, setAltBusyId] = useState<string | null>(null);
  const [altError, setAltError] = useState("");

  // "Add or Import Part" popup — replaces the old standalone "Receive
  // Stock" button (never wired to anything) and "New Part" button.
  const [addImportOpen, setAddImportOpen] = useState(false);
  const [addImportTab, setAddImportTab] = useState<"choose" | "import">("choose");

  // Pick selection (checkbox + quantity per row) feeding the floating
  // picking-slip bar — page-local, in-memory only, same "short-lived cart"
  // approach ModApp's InventoryPickProvider uses.
  const [pick, setPick] = useState<Map<string, PickEntry>>(new Map());
  const [pickBarOpen, setPickBarOpen] = useState(false);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  // 2026-09-16 — user report: creating a pick slip for BRE1014 actually
  // saved against BRE1045. Same root cause as the earlier "double-click to
  // select a supplier" glitch elsewhere in the app: picking a job rewrites
  // jobQuery to show "JobNumber — Customer" (so the field reflects the
  // pick), but that rewrite itself re-armed this debounced search 250ms
  // later — re-querying on the display text (not the original typed
  // search) while the results list was still open and unchanged visually.
  // If the refreshed list reordered (easy with similar job numbers like
  // BRE1014/BRE1045), a still-open list at the same on-screen position
  // could take a next click for a different job than the one the user
  // actually saw and clicked. jobPickerOpen closes the list the moment a
  // job is picked — explicitly, not inferred from the options array — so
  // the post-selection query rewrite can never trigger another search.
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [jobId, setJobId] = useState("");
  const [pickSubmitting, setPickSubmitting] = useState(false);
  const [pickError, setPickError] = useState("");
  const [pickResult, setPickResult] = useState<PickSlipData | null>(null);
  const [pickNotice, setPickNotice] = useState<{ pickedCount: number; backorderCount: number } | null>(null);

  // "Check stock" — multiple part number search box.
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkText, setCheckText] = useState("");
  const [checkRows, setCheckRows] = useState<BulkSearchRow[] | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState("");

  // Adjust.
  const [adjustRow, setAdjustRow] = useState<PositionRow | null>(null);
  const [adjustDirection, setAdjustDirection] = useState<"IN" | "OUT" | "SCRAP">("IN");
  const [adjustQuantity, setAdjustQuantity] = useState("1");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLocationId, setAdjustLocationId] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  // Picking Slip History tab.
  const [history, setHistory] = useState<PickSlipData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  // 2026-09-29 — "Delete slip" (user request: "add a delete slip button
  // and allocate stock back") — id of the slip currently being cancelled,
  // so its own row can show a spinner without blocking the others.
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // 2026-10-02 — Stock Take tab. Flow confirmed with the user ("Yes —
  // print, count by hand, re-enter after"): pick a bin location, print a
  // sheet (part number / description / system qty / blank actual-qty
  // column / sign-off), count by hand, come back and key in what was
  // actually counted, submit. Submitting calls the existing countCreate +
  // countComplete backend (the StockCount/StockCountLine reconciliation
  // model already in this file's service — see inventory/service.ts's
  // "RECONCILIATION / STOCK COUNT" section) rather than anything new: the
  // print sheet's "system qty" is a read-only reference, not persisted
  // anywhere — the real expected quantity countCreate snapshots is computed
  // fresh, from the live balance, at the moment the count is submitted.
  const [stockTakeView, setStockTakeView] = useState<"new" | "history">("new");
  const [stockTakeStep, setStockTakeStep] = useState<"select" | "entry" | "result">("select");
  const [stockTakeLocationId, setStockTakeLocationId] = useState("");
  const [stockTakeReferenceNumber, setStockTakeReferenceNumber] = useState("");
  const [stockTakeRows, setStockTakeRows] = useState<StockTakeRow[]>([]);
  const [stockTakeLoading, setStockTakeLoading] = useState(false);
  const [stockTakeSubmitting, setStockTakeSubmitting] = useState(false);
  const [stockTakeError, setStockTakeError] = useState("");
  const [stockTakeResult, setStockTakeResult] = useState<{ countId: string; movementCount: number } | null>(null);
  const [stockTakeHistory, setStockTakeHistory] = useState<StockCountRow[]>([]);
  const [stockTakeHistoryLoading, setStockTakeHistoryLoading] = useState(false);
  const [stockTakeHistoryError, setStockTakeHistoryError] = useState("");
  const [stockTakeActionBusyId, setStockTakeActionBusyId] = useState<string | null>(null);

  // 2026-09-18 — user report: "when saving a part number, it jumps to the
  // top of the table again, does not carry on where we were." Root cause
  // (same pattern already fixed once for JobWorkspace.tsx's scroll-jump
  // bug): every load() call, including the background refresh right after
  // a save/delete/adjust, set loading=true, which swaps the entire tbody
  // for a single "Loading…" row — the table collapses to one row height and
  // back, which loses the page's/container's scroll position. `silent`
  // lets a post-action refresh re-fetch without ever showing that
  // full-table loading state, so the existing rows (and scroll position)
  // stay put until the fresh data is ready to swap in.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q, stockState, page: String(page), pageSize: "25" });
      if (manufacturerFilter) params.set("manufacturerId", manufacturerFilter);
      if (locationFilter) params.set("locationId", locationFilter);
      const response = await fetch(`/api/v1/inventory/positions?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load stock levels.");
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load stock levels."); }
    finally { if (!silent) setLoading(false); }
  }, [q, stockState, page, manufacturerFilter, locationFilter]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      // Locations and manufacturers come from INVENTORY-scoped endpoints
      // (/api/v1/inventory/locations, /api/v1/inventory/manufacturers —
      // not their master-data equivalents, each gated behind its own
      // separate module permission — see listStorageLocationOptions's and
      // listManufacturerOptions's comments) so these dropdowns work for
      // anyone who can already open Stock Levels, not just users also
      // granted separate Storage Locations / Manufacturers admin access.
      // 2026-09-16 — manufacturers switched over for the same reason
      // locations already were: "manufacturer field not populating" was
      // this exact 403-silently-swallowed bug.
      const [mfrRes, taxRes, locRes] = await Promise.all([
        fetch("/api/v1/inventory/manufacturers", { cache: "no-store" }),
        fetch("/api/v1/master-data/tax-codes?status=active&pageSize=200", { cache: "no-store" }),
        fetch("/api/v1/inventory/locations", { cache: "no-store" }),
      ]);
      const [mfrBody, taxBody, locBody] = await Promise.all([mfrRes.json(), taxRes.json(), locRes.json()]);
      if (mfrRes.ok) setManufacturers((mfrBody.items || []).map((m: { id: string; name: string }) => ({ id: m.id, label: m.name })));
      if (taxRes.ok) setTaxCodes((taxBody.items || []).map((t: { id: string; code: string }) => ({ id: t.id, label: t.code })));
      if (locRes.ok) setLocations((locBody.items || []).map((l: { id: string; code: string; name: string }) => ({ id: l.id, label: `${l.name} (${l.code})` })));
    } catch {
      // Dropdown options are a convenience for picking existing records —
      // if they fail to load the form still works (bin location falls back
      // to "no location assigned" / "create new").
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true); setHistoryError("");
    try {
      const r = await fetch("/api/v1/inventory/pick-slips?pageSize=50", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to load picking slip history.");
      setHistory(body.items || []);
    } catch (e) { setHistoryError(e instanceof Error ? e.message : "Unable to load picking slip history."); }
    finally { setHistoryLoading(false); }
  }, []);
  useEffect(() => { if (tab === "pickslips") void loadHistory(); }, [tab, loadHistory]);

  // 2026-10-02 — Stock Take: open a count for a location by snapshotting
  // every part that currently has stock there (reuses the same
  // /api/v1/inventory/positions endpoint and its locationId filter the
  // Stock tab's own table already relies on — quantityOnHand comes back
  // scoped to just this location when locationId is passed, not the part's
  // total across every location — see listInventoryPositions's own
  // comment). actualQty starts prefilled to the system quantity so an
  // unchanged row posts zero variance, rather than forcing every row to be
  // retyped even when the count matched.
  async function startStockTake() {
    if (!stockTakeLocationId) return;
    setStockTakeLoading(true); setStockTakeError("");
    try {
      const params = new URLSearchParams({ locationId: stockTakeLocationId, active: "active", pageSize: "500" });
      const r = await fetch(`/api/v1/inventory/positions?${params}`, { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to load parts for this location.");
      const rows: StockTakeRow[] = (body.items as PositionRow[]).map((p) => ({ partId: p.id, partNumber: p.partNumber, description: p.description, systemQty: p.quantityOnHand, actualQty: p.quantityOnHand }));
      setStockTakeRows(rows);
      setStockTakeStep("entry");
    } catch (e) { setStockTakeError(e instanceof Error ? e.message : "Unable to load parts for this location."); }
    finally { setStockTakeLoading(false); }
  }

  function updateStockTakeRow(index: number, actualQty: string) {
    setStockTakeRows((rows) => rows.map((row, i) => (i === index ? { ...row, actualQty } : row)));
  }

  function resetStockTake() {
    setStockTakeStep("select");
    setStockTakeLocationId("");
    setStockTakeReferenceNumber("");
    setStockTakeRows([]);
    setStockTakeResult(null);
    setStockTakeError("");
  }

  // Creates the count (countCreate snapshots the expected quantity fresh,
  // at this moment, from the live balance — not from the systemQty this
  // form prefilled when the location was first opened, which may be a
  // little stale if other stock activity happened in between) then
  // immediately completes it (countComplete posts a RECONCILIATION
  // movement per line with a real variance). Left at status COMPLETED, not
  // auto-APPROVED — approval is a deliberate separate step (see
  // approveStockCount below), same as the backend already models it.
  async function submitStockTake() {
    if (!stockTakeLocationId || stockTakeRows.length === 0) return;
    setStockTakeSubmitting(true); setStockTakeError("");
    try {
      const createRes = await fetch("/api/v1/inventory/counts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locationId: stockTakeLocationId,
          referenceNumber: stockTakeReferenceNumber || undefined,
          lines: stockTakeRows.map((row) => ({ partId: row.partId, countedQuantity: row.actualQty || "0" })),
        }),
      });
      const createBody = await createRes.json();
      if (!createRes.ok) throw new Error(createBody.error?.message || "Unable to save the stock count.");
      const countId = createBody.countId as string;
      const completeRes = await fetch(`/api/v1/inventory/counts/${countId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const completeBody = await completeRes.json();
      if (!completeRes.ok) throw new Error(completeBody.error?.message || "Unable to post the stock count adjustments.");
      setStockTakeResult({ countId, movementCount: (completeBody.movementIds || []).length });
      setStockTakeStep("result");
    } catch (e) { setStockTakeError(e instanceof Error ? e.message : "Unable to submit the stock count."); }
    finally { setStockTakeSubmitting(false); }
  }

  const loadStockTakeHistory = useCallback(async () => {
    setStockTakeHistoryLoading(true); setStockTakeHistoryError("");
    try {
      const r = await fetch("/api/v1/inventory/counts?pageSize=50", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to load stock take history.");
      setStockTakeHistory(body.items || []);
    } catch (e) { setStockTakeHistoryError(e instanceof Error ? e.message : "Unable to load stock take history."); }
    finally { setStockTakeHistoryLoading(false); }
  }, []);
  useEffect(() => { if (tab === "stocktake" && stockTakeView === "history") void loadStockTakeHistory(); }, [tab, stockTakeView, loadStockTakeHistory]);
  // The result screen (right after submitting) also needs an up to date
  // History tab the moment the user switches to it, without waiting for a
  // second tab click — refresh once whenever a submit completes.
  useEffect(() => { if (stockTakeResult) void loadStockTakeHistory(); }, [stockTakeResult, loadStockTakeHistory]);

  async function approveStockCount(id: string) {
    setStockTakeActionBusyId(id); setStockTakeHistoryError("");
    try {
      const r = await fetch(`/api/v1/inventory/counts/${id}/approve`, { method: "POST" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to approve this stock count.");
      await loadStockTakeHistory();
    } catch (e) { setStockTakeHistoryError(e instanceof Error ? e.message : "Unable to approve this stock count."); }
    finally { setStockTakeActionBusyId(null); }
  }

  async function cancelStockCount(id: string) {
    if (!(await confirm({ message: "Cancel this open stock count? Nothing has been posted to stock yet — it'll just be discarded.", tone: "warning", confirmLabel: "Cancel count" }))) return;
    setStockTakeActionBusyId(id); setStockTakeHistoryError("");
    try {
      const r = await fetch(`/api/v1/inventory/counts/${id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to cancel this stock count.");
      await loadStockTakeHistory();
    } catch (e) { setStockTakeHistoryError(e instanceof Error ? e.message : "Unable to cancel this stock count."); }
    finally { setStockTakeActionBusyId(null); }
  }

  // 2026-09-29 — reverses a picking slip: restores the stock it took (see
  // cancelPickSlip in inventory/service.ts — same action JobWorkspace's own
  // "Cancel" button on a freshly-created slip uses) and marks it cancelled
  // rather than actually removing the row, so it stays in this history as
  // a record of what happened, just no longer actionable.
  async function deletePickSlip(ps: PickSlipData) {
    if (!(await confirm({ message: `Permanently delete this picking slip for ${ps.jobNumber}? The stock it took will be allocated back onto the shelf, and the slip itself will be removed from this list for good.`, tone: "danger", confirmLabel: "Delete" }))) return;
    setCancellingId(ps.id); setHistoryError("");
    try {
      const r = await fetch(`/api/v1/inventory/pick-slips/${ps.id}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to delete picking slip.");
      await loadHistory();
      void load(true);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Unable to delete picking slip.");
    } finally {
      setCancellingId(null);
    }
  }

  function openCreate() {
    setEditing(null); setForm(BLANK_FORM); setNewBinCode(""); setNewBinName(""); setError("");
    setAltNumbers([]); setNewAltNumber(""); setNewAltKind("SUPERSEDED"); setAltError("");
    void loadOptions();
    setOpen(true);
  }
  function openEdit(row: PositionRow) {
    setEditing(row);
    setForm({
      partNumber: row.partNumber, description: row.description,
      manufacturerId: row.manufacturerId || "",
      category: row.category || "", unitOfMeasure: row.unitOfMeasure || "EA", taxCodeId: row.taxCodeId || "",
      defaultPurchaseCost: formatMoneyForInput(row.cost), defaultSellingPrice: formatMoneyForInput(row.sellingPrice),
      reorderMinimum: row.reorderMinimum || "", reorderMaximum: row.reorderMaximum || "", reorderQuantity: row.reorderQuantity || "",
      notes: row.notes || "", active: row.active, binLocationId: row.binLocationId || "",
    });
    setNewBinCode(""); setNewBinName(""); setError("");
    setAltNumbers(row.alternateNumbers); setNewAltNumber(""); setNewAltKind("SUPERSEDED"); setAltError("");
    void loadOptions();
    setOpen(true);
  }

  // 2026-09-29 — add/remove alternate (superseded/group) part numbers.
  // Only reachable once a part exists (see the drawer markup below), so
  // `editing` is always set here.
  async function addAltNumber() {
    if (!editing) return;
    if (!newAltNumber.trim()) { setAltError("Enter a part number."); return; }
    setAltSaving(true); setAltError("");
    try {
      const r = await fetch(`/api/v1/master-data/parts/${editing.id}/alternate-numbers`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ number: newAltNumber.trim(), kind: newAltKind }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to add that alternate number.");
      setAltNumbers((prev) => [...prev, { id: body.id, number: body.number, kind: body.kind }].sort((a, b) => a.number.localeCompare(b.number)));
      setNewAltNumber("");
      await load(true);
    } catch (e) { setAltError(e instanceof Error ? e.message : "Unable to add that alternate number."); }
    finally { setAltSaving(false); }
  }
  async function removeAltNumber(altId: string) {
    if (!editing) return;
    setAltBusyId(altId); setAltError("");
    try {
      const r = await fetch(`/api/v1/master-data/parts/${editing.id}/alternate-numbers/${altId}`, { method: "DELETE" });
      if (!r.ok) { const body = await r.json(); throw new Error(body.error?.message || "Unable to remove that alternate number."); }
      setAltNumbers((prev) => prev.filter((a) => a.id !== altId));
      await load(true);
    } catch (e) { setAltError(e instanceof Error ? e.message : "Unable to remove that alternate number."); }
    finally { setAltBusyId(null); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      let binLocationId: string | null = form.binLocationId === NEW_BIN ? null : (form.binLocationId || null);
      if (form.binLocationId === NEW_BIN) {
        if (!newBinCode.trim() || !newBinName.trim()) throw new Error("Enter a code and name for the new bin location, or pick an existing one / leave it blank.");
        const r = await fetch("/api/v1/master-data/storage-locations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: newBinCode.trim(), name: newBinName.trim(), type: "BIN", active: true }) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error?.message || "Unable to create the new bin location.");
        binLocationId = body.id as string;
      }
      const payload = {
        partNumber: form.partNumber, description: form.description,
        // manufacturerPartNumber deliberately omitted, not sent as null —
        // updateMaster merges {...before, ...raw} before validating, so a
        // key this object doesn't have at all leaves an existing part's
        // value untouched; sending it as null here would wipe it on every
        // edit even though this form no longer offers a way to set it.
        manufacturerId: form.manufacturerId || null,
        category: form.category || null, unitOfMeasure: form.unitOfMeasure || "EA", taxCodeId: form.taxCodeId || null,
        defaultPurchaseCost: form.defaultPurchaseCost || null, defaultSellingPrice: form.defaultSellingPrice || null,
        reorderMinimum: form.reorderMinimum || null, reorderMaximum: form.reorderMaximum || null, reorderQuantity: form.reorderQuantity || null,
        notes: form.notes || null, active: form.active, binLocationId,
      };
      const r = await fetch(`/api/v1/master-data/parts${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to save the part.");
      setOpen(false);
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the part."); }
    finally { setSaving(false); }
  }

  async function deleteRow(row: PositionRow) {
    if (!(await confirm({ message: `Delete ${row.partNumber}? Parts with stock or job history can't actually be removed — those are kept as a historical reference instead, and you'll be told which happened.`, tone: "danger", confirmLabel: "Delete" }))) return;
    setRowBusy(row.id); setError("");
    try {
      const r = await fetch(`/api/v1/master-data/parts/${row.id}`, { method: "DELETE" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to delete the part.");
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete the part."); }
    finally { setRowBusy(null); }
  }

  async function deleteAll() {
    if (!(await confirm({ message: `Delete all ${data.total} part${data.total === 1 ? "" : "s"}? Parts with stock or job history can't actually be removed — those are kept as a historical reference instead.`, tone: "danger", confirmLabel: "Delete all" }))) return;
    setDeletingAll(true); setError("");
    try {
      const r = await fetch("/api/v1/master-data/parts", { method: "DELETE" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to delete all parts.");
      setPage(1);
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete all parts."); }
    finally { setDeletingAll(false); }
  }

  // --- Pick selection ------------------------------------------------

  function togglePick(entry: Omit<PickEntry, "quantity">, checked: boolean) {
    setPick((prev) => {
      const next = new Map(prev);
      if (checked) next.set(entry.partId, { ...entry, quantity: 1 });
      else next.delete(entry.partId);
      return next;
    });
  }
  function setPickQuantity(partId: string, quantity: number) {
    setPick((prev) => {
      const existing = prev.get(partId);
      if (!existing) return prev;
      const next = new Map(prev);
      const cap = existing.quantityAvailable > 0 ? existing.quantityAvailable : Infinity;
      next.set(partId, { ...existing, quantity: Math.min(Math.max(1, quantity), cap) });
      return next;
    });
  }
  function clearPick() { setPick(new Map()); }

  async function loadJobs(query: string) {
    setJobsLoading(true);
    try {
      const params = new URLSearchParams({ view: "wip", pageSize: "50" });
      if (query) params.set("q", query);
      const r = await fetch(`/api/v1/jobs?${params}`, { cache: "no-store" });
      const body = await r.json();
      if (r.ok) {
        setJobs((body.items || []).map((j: { id: string; jobNumber: string | null; draftNumber: string; customer?: { name?: string; tradingName?: string | null } }) => ({
          id: j.id,
          jobNumber: j.jobNumber || j.draftNumber,
          customerName: j.customer?.tradingName || j.customer?.name || null,
        })));
      }
    } catch {
      // Job picker stays usable (just empty) if this fails — same
      // "options are a convenience" approach as loadOptions above.
    } finally { setJobsLoading(false); }
  }
  function closeDropdownUnlessWithin(close: () => void) {
    return (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      close();
    };
  }
  function openPickBar() {
    setPickError(""); setJobId(""); setJobQuery("");
    setPickBarOpen(true);
    setJobPickerOpen(true);
    void loadJobs("");
  }
  useEffect(() => {
    if (!pickBarOpen || !jobPickerOpen) return;
    const t = setTimeout(() => void loadJobs(jobQuery), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQuery, pickBarOpen, jobPickerOpen]);

  async function submitPickSlip() {
    if (!jobId) { setPickError("Choose a job to link this picking slip to."); return; }
    setPickSubmitting(true); setPickError("");
    try {
      const lines = Array.from(pick.values()).map((p) => ({ partId: p.partId, quantity: String(p.quantity) }));
      const r = await fetch("/api/v1/inventory/pick-slips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId, lines }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to create the picking slip.");
      setPickBarOpen(false);
      clearPick();
      await load(true);
      if (body.pickSlip) setPickResult(body.pickSlip);
      if (body.backorderCount > 0) setPickNotice({ pickedCount: body.pickedCount, backorderCount: body.backorderCount });
    } catch (e) { setPickError(e instanceof Error ? e.message : "Unable to create the picking slip."); }
    finally { setPickSubmitting(false); }
  }

  // --- Check stock (multiple part number search) ---------------------

  function openCheck() { setCheckOpen(true); setCheckText(""); setCheckRows(null); setCheckError(""); }
  async function runCheck() {
    const lines = checkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const partNumbers = Array.from(new Set(lines.map((l) => l.split(/[,\t]+/)[0]?.trim()).filter((v): v is string => Boolean(v))));
    if (partNumbers.length === 0) { setCheckError("Paste at least one part number, one per line."); return; }
    setCheckLoading(true); setCheckError("");
    try {
      const r = await fetch("/api/v1/inventory/bulk-search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partNumbers }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to check stock.");
      setCheckRows(body.rows);
    } catch (e) { setCheckError(e instanceof Error ? e.message : "Unable to check stock."); }
    finally { setCheckLoading(false); }
  }
  function toggleCheckRow(row: BulkSearchRow, checked: boolean) {
    if (!row.partId) return; // not in the catalog — nothing to select
    togglePick({ partId: row.partId, partNumber: row.partNumber, description: row.description || "", binLocationLabel: row.binLocationLabel, quantityAvailable: Number(row.quantityAvailable) || 0 }, checked);
  }

  // --- Adjust ----------------------------------------------------------

  function openAdjust(row: PositionRow) {
    setAdjustRow(row); setAdjustDirection("IN"); setAdjustQuantity("1"); setAdjustReason(""); setAdjustLocationId(row.binLocationId || ""); setAdjustError("");
    void loadOptions();
  }
  async function submitAdjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adjustRow) return;
    if (!adjustLocationId) { setAdjustError("Choose which location this adjustment applies to."); return; }
    if (!Number(adjustQuantity) || Number(adjustQuantity) <= 0) { setAdjustError("Enter a quantity greater than zero."); return; }
    if (adjustReason.trim().length < 3) { setAdjustError("Enter a reason for this adjustment (at least 3 characters)."); return; }
    setAdjustSaving(true); setAdjustError("");
    try {
      const r = await fetch("/api/v1/inventory/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partId: adjustRow.id, locationId: adjustLocationId, direction: adjustDirection, quantity: adjustQuantity, reason: adjustReason.trim() }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to adjust stock.");
      setAdjustRow(null);
      await load(true);
    } catch (e) { setAdjustError(e instanceof Error ? e.message : "Unable to adjust stock."); }
    finally { setAdjustSaving(false); }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pickItems = Array.from(pick.values());

  return (
    <div>
      <div className="page-header compact">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Stock Levels</h1>
          <p>Part catalog, bin locations, stock on hand, picking slips, and recent movements — all in one place.</p>
        </div>
        {/* 2026-09-22, user request: "add at the top right the total
            inventory cost price with a label 'Total Stock Price'." Same
            INVENTORY_VIEW_COST gate as the Cost Price/Selling Price columns
            below (data.canViewCost) — a total built from cost prices can't
            be shown to anyone those prices themselves are hidden from. */}
        {data.canViewCost && (
          <div className="stock-total-value">
            <p className="stock-total-value-label">Total Stock Price</p>
            <p className="stock-total-value-amount">{formatMoney(data.totalStockValue)}</p>
          </div>
        )}
      </div>

      {/* 2026-10-01 — user request: "users should not have be able to
          view picking slip history." A Mechanic now never sees this tab
          bar at all (nothing left to switch to besides Stock, the only
          tab this page ever shows them), and the content below falls
          back to the Stock view regardless of `tab` state as a second,
          defensive layer. */}
      {!mechanicReadOnly && (
        <div className="tab-strip">
          <button type="button" className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>Stock</button>
          <button type="button" className={tab === "pickslips" ? "active" : ""} onClick={() => setTab("pickslips")}>Picking Slip History</button>
          {/* 2026-10-02 — Stock Take (user request: "Admins / Store
              Controller only"). Gated by canStockTake (INVENTORY_RECONCILE)
              on top of the existing !mechanicReadOnly wrapper — a Manager or
              other non-Mechanic role without that permission still sees
              Stock and Picking Slip History, just not this tab. */}
          {canStockTake && <button type="button" className={tab === "stocktake" ? "active" : ""} onClick={() => setTab("stocktake")}><ClipboardCheck size={13} style={{ marginRight: 4, verticalAlign: "text-bottom" }} />Stock Take</button>}
        </div>
      )}

      {tab === "stock" || mechanicReadOnly ? (
        <section className="master-panel inventory-panel">
          <div className="master-toolbar inventory-toolbar">
            <label className="search-control inventory-search-control">
              <Search size={15} />
              <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search part number, description, bin location or manufacturer" />
            </label>
            <div className="stock-filters compact">
              {(["ALL", "OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"] as const).map((s) => (
                <label key={s}>
                  <input type="radio" name="stockState" checked={stockState === s} onChange={() => { setStockState(s); setPage(1); }} />
                  {s === "ALL" ? "All" : STOCK_STATE_LABEL[s as Exclude<StockState, "RESERVED" | "PARTIALLY_RESERVED" | "INACTIVE_PART">]}
                </label>
              ))}
            </div>
            <span>{data.total} item{data.total === 1 ? "" : "s"}</span>
            <button type="button" className="table-action" onClick={openCheck}><Search size={14} /> Check stock</button>
            {!mechanicReadOnly && <button type="button" className="table-action danger" disabled={deletingAll || data.total === 0} onClick={() => void deleteAll()}>{deletingAll ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />} Delete all</button>}
            {!mechanicReadOnly && <button type="button" className="gold-button" onClick={() => { setAddImportOpen(true); setAddImportTab("choose"); }}><Plus size={15} /> Add or Import Part</button>}
          </div>

          {error ? <div className="inline-error">{error}</div> : null}

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pick</th>
                  <th>Part</th>
                  <th>Description</th>
                  <th>Manufacturer</th>
                  {/* 2026-09-16 — plural: this cell can now list more than
                      one bin, comma-separated, when a part has stock
                      spread across several — see buildBinLocationLabel
                      in inventory/service.ts. */}
                  <th>Bin locations</th>
                  {data.canViewCost && <th className="numeric">Cost Price</th>}
                  {data.canViewCost && <th className="numeric">Selling Price</th>}
                  <th className="numeric">On Hand</th>
                  <th className="numeric">Reserved</th>
                  <th className="numeric">Available</th>
                  <th>State</th>
                  <th className="actions">Actions</th>
                </tr>
                {/* 2026-10-02 — per-column filter row (user request: "make
                    the table filterable by each heading"). Same filter-row
                    convention already used on the Suppliers RFQ/Outwork
                    tables — see this block's own state comment above for
                    why only Manufacturer and Bin locations get a control
                    here. */}
                <tr className="filter-row">
                  <th></th>
                  <th></th>
                  <th></th>
                  <th>
                    <select value={manufacturerFilter} onChange={(e) => { setManufacturerFilter(e.target.value); setPage(1); }} aria-label="Filter by manufacturer">
                      <option value="">All</option>
                      {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </th>
                  <th>
                    <select value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }} aria-label="Filter by bin location">
                      <option value="">All</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                  </th>
                  {data.canViewCost && <th></th>}
                  {data.canViewCost && <th></th>}
                  <th></th>
                  <th></th>
                  <th></th>
                  <th></th>
                  <th>{(manufacturerFilter || locationFilter) && <button type="button" className="quiet-button" onClick={() => { setManufacturerFilter(""); setLocationFilter(""); setPage(1); }} title="Clear filters"><X size={13} /></button>}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={data.canViewCost ? 12 : 10} className="table-state compact-empty-state"><Loader2 className="spin" size={18} /> Loading…</td></tr>
                ) : data.items.length === 0 ? (
                  <tr><td colSpan={data.canViewCost ? 12 : 10} className="table-state compact-empty-state"><span>No inventory items match the current filters.</span></td></tr>
                ) : data.items.map((row) => {
                  const available = Number(row.quantityAvailable) || 0;
                  const pickEntry = pick.get(row.id);
                  return (
                    <tr key={row.id} className={row.active ? "" : "inactive"}>
                      <td>
                        <div className="pick-cell">
                          <input
                            type="checkbox"
                            checked={!!pickEntry}
                            title={available <= 0 ? "Out of stock — select to backorder for a job" : "Select for picking"}
                            onChange={(e) => togglePick({ partId: row.id, partNumber: row.partNumber, description: row.description, binLocationLabel: row.binLocationLabel, quantityAvailable: available }, e.target.checked)}
                          />
                          {pickEntry && (
                            <input
                              type="number"
                              min={1}
                              max={available > 0 ? available : undefined}
                              value={pickEntry.quantity}
                              onChange={(e) => setPickQuantity(row.id, parseInt(e.target.value, 10) || 1)}
                              className="pick-qty-input"
                            />
                          )}
                        </div>
                      </td>
                      <td className="mono">
                        {row.partNumber}
                        {/* 2026-09-29 — user request: "how can we add
                            additional part numbers for parts that have
                            superseded numbers and also have group
                            numbers?" Small tags under the part number,
                            visible at a glance without a dedicated
                            column — see PartAlternateNumber in
                            schema.prisma. */}
                        {row.alternateNumbers.length > 0 && (
                          <div className="alt-number-badges">
                            {row.alternateNumbers.map((a) => (
                              <span key={a.id} className={`status-pill ${a.kind === "SUPERSEDED" ? "tone-amber" : "tone-purple"}`}>
                                {ALT_KIND_LABEL[a.kind]}: {a.number}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>{row.description}</td>
                      <td>{row.manufacturerName || "—"}</td>
                      <td>{row.binLocationLabel || "—"}</td>
                      {data.canViewCost && <td className="numeric">{formatMoney(row.cost)}</td>}
                      {data.canViewCost && <td className="numeric">{formatMoney(row.sellingPrice)}</td>}
                      <td className="numeric">{row.quantityOnHand}</td>
                      <td className="numeric">{row.quantityReserved}</td>
                      <td className="numeric">{row.quantityAvailable}</td>
                      <td><span className={`state-badge ${STOCK_STATE_CLASS[row.stockState as StockState]}`}>{STOCK_STATE_LABEL[row.stockState as StockState]}</span></td>
                      <td className="actions">
                        <Link href={`/inventory/parts/${row.id}`} className="action-link" title="View part detail"><Eye size={15} /></Link>
                        {canManage && <button type="button" className="table-action" onClick={() => openAdjust(row)}>Adjust</button>}
                        {!mechanicReadOnly && <button type="button" className="table-action" onClick={() => openEdit(row)}>Edit</button>}
                        {!mechanicReadOnly && <button type="button" className="table-action danger" disabled={rowBusy === row.id} onClick={() => void deleteRow(row)}>{rowBusy === row.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="table-footer inventory-footer">
            <span>Showing {data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1}-{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
            <div><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button><button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
          </footer>
        </section>
      ) : tab === "stocktake" && canStockTake ? (
        <section className="master-panel">
          <div className="tab-strip" style={{ margin: "12px 14px 0" }}>
            <button type="button" className={stockTakeView === "new" ? "active" : ""} onClick={() => setStockTakeView("new")}>New count</button>
            <button type="button" className={stockTakeView === "history" ? "active" : ""} onClick={() => setStockTakeView("history")}>History</button>
          </div>

          {stockTakeView === "new" ? (
            <div style={{ padding: 14 }}>
              {stockTakeError ? <div className="inline-error">{stockTakeError}</div> : null}

              {stockTakeStep === "select" && (
                <div>
                  <p className="hint-text">Pick a bin location to count. You'll get a printable sheet — part number, description, system quantity, and a blank column to write the actual count — then come back here and key in what was actually counted.</p>
                  <div className="header-actions">
                    <select value={stockTakeLocationId} onChange={(e) => setStockTakeLocationId(e.target.value)}>
                      <option value="">Select a bin location…</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                    <input type="text" placeholder="Reference number (optional)" value={stockTakeReferenceNumber} onChange={(e) => setStockTakeReferenceNumber(e.target.value)} />
                    <button type="button" className="gold-button" disabled={!stockTakeLocationId || stockTakeLoading} onClick={() => void startStockTake()}>{stockTakeLoading ? <Loader2 className="spin" size={14} /> : <ClipboardCheck size={15} />} Start count</button>
                  </div>
                </div>
              )}

              {stockTakeStep === "entry" && (
                <div>
                  <div className="header-actions">
                    <strong>{locations.find((l) => l.id === stockTakeLocationId)?.label || "Selected location"}</strong>
                    <span>{stockTakeRows.length} part{stockTakeRows.length === 1 ? "" : "s"}</span>
                    <button type="button" className="table-action" onClick={() => printStockTakeSheet(locations.find((l) => l.id === stockTakeLocationId)?.label || "", stockTakeRows)}><Printer size={14} /> Print count sheet</button>
                    <button type="button" className="quiet-button" onClick={resetStockTake}>Cancel</button>
                  </div>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Part number</th><th>Description</th><th className="numeric">System qty</th><th className="numeric">Actual qty</th><th className="numeric">Variance</th></tr></thead>
                      <tbody>
                        {stockTakeRows.length === 0 ? (
                          <tr><td colSpan={5} className="table-state compact-empty-state">No parts have stock at this location.</td></tr>
                        ) : stockTakeRows.map((row, i) => {
                          const variance = (Number(row.actualQty) || 0) - (Number(row.systemQty) || 0);
                          return (
                            <tr key={row.partId}>
                              <td className="mono">{row.partNumber}</td>
                              <td>{row.description}</td>
                              <td className="numeric">{row.systemQty}</td>
                              <td className="numeric"><input type="number" min={0} step="0.0001" value={row.actualQty} onChange={(e) => updateStockTakeRow(i, e.target.value)} style={{ width: 90 }} /></td>
                              <td className="numeric">{variance === 0 ? "—" : variance > 0 ? `+${variance}` : variance}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="header-actions" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    <button type="button" className="gold-button" disabled={stockTakeSubmitting || stockTakeRows.length === 0} onClick={() => void submitStockTake()}>{stockTakeSubmitting ? <Loader2 className="spin" size={14} /> : <ClipboardCheck size={15} />} Submit count &amp; post adjustments</button>
                  </div>
                </div>
              )}

              {stockTakeStep === "result" && stockTakeResult && (
                <div className="detail-panel">
                  <header><div><h2>Count posted</h2><p>{stockTakeResult.movementCount} adjustment{stockTakeResult.movementCount === 1 ? "" : "s"} posted to stock for the variances found. The count is saved under History as Completed until it's approved.</p></div></header>
                  <div className="header-actions">
                    <button type="button" className="gold-button" disabled={stockTakeActionBusyId === stockTakeResult.countId} onClick={() => void approveStockCount(stockTakeResult.countId)}>{stockTakeActionBusyId === stockTakeResult.countId ? <Loader2 className="spin" size={14} /> : null} Approve count</button>
                    <button type="button" className="quiet-button" onClick={resetStockTake}>Start another count</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: "0 14px 14px" }}>
              {stockTakeHistoryError ? <div className="inline-error">{stockTakeHistoryError}</div> : null}
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Location</th><th>Reference</th><th>Status</th><th>Started</th><th>Completed</th><th className="actions">Actions</th></tr></thead>
                  <tbody>
                    {stockTakeHistoryLoading ? (
                      <tr><td colSpan={6} className="table-state compact-empty-state"><Loader2 className="spin" size={18} /> Loading…</td></tr>
                    ) : stockTakeHistory.length === 0 ? (
                      <tr><td colSpan={6} className="table-state compact-empty-state">No stock counts yet.</td></tr>
                    ) : stockTakeHistory.map((c) => (
                      <tr key={c.id}>
                        <td>{c.location ? (c.location.name === c.location.code ? c.location.code : `${c.location.name} (${c.location.code})`) : "—"}</td>
                        <td>{c.referenceNumber || "—"}</td>
                        <td><span className={`status-pill ${STOCK_COUNT_STATUS_TONE[c.status]}`}>{STOCK_COUNT_STATUS_LABEL[c.status]}</span></td>
                        <td>{new Date(c.startedAt).toLocaleString()}</td>
                        <td>{c.completedAt ? new Date(c.completedAt).toLocaleString() : "—"}</td>
                        <td className="actions">
                          {c.status === "COMPLETED" && <button type="button" className="table-action" disabled={stockTakeActionBusyId === c.id} onClick={() => void approveStockCount(c.id)}>{stockTakeActionBusyId === c.id ? <Loader2 className="spin" size={14} /> : null} Approve</button>}
                          {c.status === "OPEN" && <button type="button" className="table-action danger" disabled={stockTakeActionBusyId === c.id} onClick={() => void cancelStockCount(c.id)}>{stockTakeActionBusyId === c.id ? <Loader2 className="spin" size={14} /> : <X size={14} />} Cancel</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="master-panel">
          {/* 2026-09-29 — user request: "deleted pickslips must delete
              completely from the system." Delete now genuinely removes the
              PickSlip row (see cancelPickSlip's own comment in
              inventory/service.ts), so every row this list can ever show is
              by definition still active — no more Status column/pill,
              which only ever existed to distinguish a soft-cancelled row
              from an active one. */}
          <p className="hint-text" style={{ padding: "12px 14px 0" }}>Every picking slip generated for this company, most recent first. Reprint shows it exactly as it would print today.</p>
          {historyError ? <div className="inline-error">{historyError}</div> : null}
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Job</th><th>Client</th><th>Generated</th><th>Lines</th><th className="actions">Actions</th></tr></thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={5} className="table-state compact-empty-state"><Loader2 className="spin" size={18} /> Loading…</td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={5} className="table-state compact-empty-state"><span>No picking slips have been generated yet.</span></td></tr>
                ) : history.map((ps) => (
                  <tr key={ps.id}>
                    {/* 2026-10-02 — user report: this link "looks like a button
                        hidden behind the text." .action-link (globals.css) is a
                        fixed 28x28px square icon-button style, built for an
                        icon-only link like the "view part" link elsewhere on
                        this same page — wrong shape entirely for a multi-
                        character job number. Every other job-number-as-link in
                        the app (RfqAllWorkspace, OutworkAllWorkspace,
                        DashboardWorkspace) uses a plain, unstyled Link. */}
                    <td><Link href={`/jobs/${ps.jobId}`}>{ps.jobNumber}</Link></td>
                    <td>{ps.customerName || "—"}</td>
                    <td>{new Date(ps.createdAt).toLocaleString()}</td>
                    <td>{ps.lines.length}</td>
                    <td className="actions">
                      <button type="button" className="table-action" onClick={() => setPickResult(ps)}><Printer size={14} /> Reprint</button>
                      {canManage && (
                        <button type="button" className="table-action" disabled={cancellingId === ps.id} onClick={() => void deletePickSlip(ps)}>
                          {cancellingId === ps.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />} Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Floating "N parts selected" bar — appears whenever the pick
          selection is non-empty, on either tab, since Check stock can add
          to it too. */}
      {pickItems.length > 0 && (
        <div className="pick-bar">
          <span>{pickItems.length} part{pickItems.length === 1 ? "" : "s"} selected</span>
          {canManage && <button type="button" className="gold-button" onClick={openPickBar}>Create picking slip</button>}
          <button type="button" className="quiet-button" onClick={clearPick}>Clear</button>
        </div>
      )}

      {pickNotice && (
        <div className="pick-notice">
          <p>Picked {pickNotice.pickedCount} part{pickNotice.pickedCount === 1 ? "" : "s"} immediately.{pickNotice.backorderCount > 0 ? ` ${pickNotice.backorderCount} part${pickNotice.backorderCount === 1 ? "" : "s"} had nothing on hand and were added to the job's parts list as pending instead.` : ""}</p>
          <button type="button" aria-label="Dismiss" onClick={() => setPickNotice(null)}><X size={14} /></button>
        </div>
      )}

      {/* Create picking slip — job picker */}
      {pickBarOpen && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPickBarOpen(false); }}>
          <aside className="form-drawer compact-dialog" aria-modal="true">
            <header><div><p className="eyebrow">Stock Levels</p><h2>Create picking slip</h2></div><button aria-label="Close" onClick={() => setPickBarOpen(false)}><X size={18} /></button></header>
            <div className="drawer-body">
              <p className="hint-text">Link these parts to a job. A part with stock on hand at its bin location is picked immediately — stock is deducted right away. A part with nothing on hand is added to the job's parts list as a pending backorder instead.</p>
              <div className="pick-review">
                <table className="data-table">
                  <thead><tr><th>Part</th><th className="numeric">Qty</th></tr></thead>
                  <tbody>
                    {pickItems.map((p) => (
                      <tr key={p.partId}>
                        <td><span className="mono">{p.partNumber}</span><br /><span className="hint-text">{p.description}{p.quantityAvailable <= 0 ? " · Backorder" : ""}</span></td>
                        <td className="numeric">{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "grid", gap: 14 }} onBlur={closeDropdownUnlessWithin(() => setJobPickerOpen(false))}>
                <label><span>Job *</span>
                  <input value={jobQuery} onChange={(e) => { setJobQuery(e.target.value); setJobId(""); setJobPickerOpen(true); }} placeholder="Type to search open jobs…" />
                </label>
                {jobPickerOpen && (jobsLoading ? <p className="hint-text"><Loader2 className="spin" size={13} /> Searching…</p> : (
                  <ul className="job-picker-results">
                    {jobs.map((j) => (
                      <li key={j.id}>
                        <button type="button" className={jobId === j.id ? "active" : ""} onClick={() => { setJobId(j.id); setJobQuery(`${j.jobNumber}${j.customerName ? ` — ${j.customerName}` : ""}`); setJobPickerOpen(false); }}>
                          {j.jobNumber}{j.customerName ? ` — ${j.customerName}` : ""}
                        </button>
                      </li>
                    ))}
                    {!jobsLoading && jobs.length === 0 && <li className="hint-text">No open jobs found.</li>}
                  </ul>
                ))}
              </div>
              {pickError ? <div className="inline-error">{pickError}</div> : null}
            </div>
            <footer>
              <button type="button" className="quiet-button" onClick={() => setPickBarOpen(false)}>Cancel</button>
              <button type="button" className="gold-button" disabled={pickSubmitting || !jobId} onClick={() => void submitPickSlip()}>{pickSubmitting ? <Loader2 className="spin" size={15} /> : null}{pickSubmitting ? "Creating…" : "Create picking slip"}</button>
            </footer>
          </aside>
        </div>
      )}

      {/* Picking slip result — printable/saved preview */}
      {pickResult && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPickResult(null); }}>
          <aside className="form-drawer compact-dialog" aria-modal="true">
            <header><div><p className="eyebrow">Picking slip</p><h2>Job {pickResult.jobNumber}</h2></div><button aria-label="Close" onClick={() => setPickResult(null)}><X size={18} /></button></header>
            <div className="drawer-body">
              <p className="hint-text">{pickResult.customerName ? `${pickResult.customerName} · ` : ""}Generated {new Date(pickResult.createdAt).toLocaleString()}</p>
              <table className="data-table">
                <thead><tr><th>Part number</th><th>Description</th><th className="numeric">Qty</th><th>Bin location</th></tr></thead>
                <tbody>
                  {pickResult.lines.map((l, i) => (
                    <tr key={`${l.partNumber}-${i}`}>
                      <td className="mono">{l.partNumber}</td>
                      <td>{l.description}</td>
                      <td className="numeric">{l.quantity}</td>
                      <td>{l.binLocationLabel || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint-text">This picking slip is already saved — it's listed under Picking Slip History and can be reprinted any time.</p>
            </div>
            <footer>
              <button type="button" className="quiet-button" onClick={() => setPickResult(null)}>Close</button>
              <button type="button" className="gold-button" onClick={() => printPickSlip(pickResult)}><Printer size={15} /> Print / Save as PDF</button>
            </footer>
          </aside>
        </div>
      )}

      {/* Check stock — multiple part number search */}
      {checkOpen && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCheckOpen(false); }}>
          <aside className="form-drawer compact-dialog" aria-modal="true">
            <header><div><p className="eyebrow">Stock Levels</p><h2>Check stock</h2></div><button aria-label="Close" onClick={() => setCheckOpen(false)}><X size={18} /></button></header>
            <div className="drawer-body">
              {!checkRows ? (
                <>
                  <p className="hint-text">Paste a list of part numbers (one per line) to see what's on hand — this only checks stock, it never changes the catalog. Found parts can then be checked below and added to a picking slip.</p>
                  <textarea rows={10} className="mono" value={checkText} onChange={(e) => setCheckText(e.target.value)} placeholder={"PN-1234\nPN-5678\nPN-9012"} />
                  {checkError ? <div className="inline-error">{checkError}</div> : null}
                </>
              ) : (
                <>
                  <p className="hint-text">{checkRows.filter((r) => r.found).length} of {checkRows.length} part{checkRows.length === 1 ? "" : "s"} found. Check a row to add it to your pick selection.</p>
                  <table className="data-table">
                    <thead><tr><th></th><th>Part</th><th>Bin</th><th className="numeric">Available</th></tr></thead>
                    <tbody>
                      {checkRows.map((row) => (
                        <tr key={row.partNumber}>
                          <td>{row.found && <input type="checkbox" checked={pick.has(row.partId!)} onChange={(e) => toggleCheckRow(row, e.target.checked)} />}</td>
                          <td><span className="mono">{row.partNumber}</span>{row.description ? <><br /><span className="hint-text">{row.description}</span></> : null}</td>
                          <td>{row.binLocationLabel || "—"}</td>
                          <td className="numeric">{row.found ? row.quantityAvailable : "Not found"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <footer>
              {checkRows ? (
                <>
                  <button type="button" className="quiet-button" onClick={() => setCheckRows(null)}>Check another list</button>
                  <button type="button" className="gold-button" onClick={() => setCheckOpen(false)}>Done</button>
                </>
              ) : (
                <>
                  <button type="button" className="quiet-button" onClick={() => setCheckOpen(false)}>Cancel</button>
                  <button type="button" className="gold-button" disabled={checkLoading || !checkText.trim()} onClick={() => void runCheck()}>{checkLoading ? <Loader2 className="spin" size={15} /> : null}{checkLoading ? "Checking…" : "Check stock"}</button>
                </>
              )}
            </footer>
          </aside>
        </div>
      )}

      {/* Adjust */}
      {adjustRow && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAdjustRow(null); }}>
          <aside className="form-drawer compact-dialog" aria-modal="true">
            <header><div><p className="eyebrow">Stock Levels</p><h2>Adjust stock — {adjustRow.partNumber}</h2></div><button aria-label="Close" onClick={() => setAdjustRow(null)}><X size={18} /></button></header>
            <form onSubmit={submitAdjust}>
              <div className="drawer-body">
                <p className="hint-text">Every adjustment needs a location and a reason, so it stays traceable in this part's movement history.</p>
                <label><span>Location *</span>
                  <select value={adjustLocationId} onChange={(e) => setAdjustLocationId(e.target.value)}>
                    <option value="">Choose a location…</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </label>
                <label><span>Direction *</span>
                  <select value={adjustDirection} onChange={(e) => setAdjustDirection(e.target.value as typeof adjustDirection)}>
                    <option value="IN">Add stock (IN)</option>
                    <option value="OUT">Remove stock (OUT)</option>
                    <option value="SCRAP">Scrap / write off</option>
                  </select>
                </label>
                <label><span>Quantity *</span><input type="number" min="0" step="0.0001" value={adjustQuantity} onChange={(e) => setAdjustQuantity(e.target.value)} /></label>
                <label className="wide"><span>Reason *</span><input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Stock count correction, damaged unit written off…" /></label>
                {adjustError ? <div className="inline-error">{adjustError}</div> : null}
              </div>
              <footer><button type="button" className="quiet-button" onClick={() => setAdjustRow(null)}>Cancel</button><button className="gold-button" disabled={adjustSaving}>{adjustSaving ? <Loader2 className="spin" size={15} /> : null}{adjustSaving ? "Saving…" : "Apply adjustment"}</button></footer>
            </form>
          </aside>
        </div>
      )}

      {/* Add or Import Part */}
      {addImportOpen && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setAddImportOpen(false); void load(true); } }}>
          <aside className="form-drawer wide-drawer" aria-modal="true">
            <header><div><p className="eyebrow">Stock Levels</p><h2>Add or import parts</h2></div><button aria-label="Close" onClick={() => { setAddImportOpen(false); void load(true); }}><X size={18} /></button></header>
            <div className="drawer-body">
              {addImportTab === "choose" ? (
                <div className="add-import-choices">
                  <button type="button" className="add-import-choice" onClick={() => { setAddImportOpen(false); openCreate(); }}>
                    <Plus size={22} />
                    <span>Add a part</span>
                    <p>Create a single part, or receive stock against an existing one via Edit / Adjust.</p>
                  </button>
                  <button type="button" className="add-import-choice" onClick={() => setAddImportTab("import")}>
                    <Upload size={22} />
                    <span>Import from spreadsheet</span>
                    <p>Upload a file, map its columns, and bulk-create or update parts — including opening quantity and bin location.</p>
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="quiet-button" style={{ marginBottom: 12 }} onClick={() => setAddImportTab("choose")}>&larr; Back</button>
                  <ImportModule kind="parts" moduleLabel="part" rowLabelHeader="Part number" fields={PART_IMPORT_FIELDS} checkNewLocations />
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {open && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <aside className="form-drawer wide-drawer" aria-modal="true">
            <header><div><p className="eyebrow">Stock Levels</p><h2>{editing ? "Edit" : "New"} Part</h2></div><button aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></header>
            <form onSubmit={submit}>
              <div className="drawer-fields">
                <label><span>Part number *</span><input required value={form.partNumber} onChange={(e) => setForm((f) => ({ ...f, partNumber: e.target.value }))} /></label>
                <label><span>Description *</span><input required value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
                <label><span>Manufacturer</span>
                  <select value={form.manufacturerId} onChange={(e) => setForm((f) => ({ ...f, manufacturerId: e.target.value }))}>
                    <option value="">—</option>
                    {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
                <label><span>Category</span><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></label>
                <label><span>Unit of measure *</span><input required value={form.unitOfMeasure} onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} /></label>
                <label><span>Tax code</span>
                  <select value={form.taxCodeId} onChange={(e) => setForm((f) => ({ ...f, taxCodeId: e.target.value }))}>
                    <option value="">—</option>
                    {taxCodes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                <label><span>Default purchase cost</span><input type="number" step="0.01" value={form.defaultPurchaseCost} onChange={(e) => setForm((f) => ({ ...f, defaultPurchaseCost: e.target.value }))} /></label>
                <label><span>Default selling price</span><input type="number" step="0.01" value={form.defaultSellingPrice} onChange={(e) => setForm((f) => ({ ...f, defaultSellingPrice: e.target.value }))} /></label>
                <label><span>Reorder minimum</span><input type="number" step="0.0001" value={form.reorderMinimum} onChange={(e) => setForm((f) => ({ ...f, reorderMinimum: e.target.value }))} /></label>
                <label><span>Reorder maximum</span><input type="number" step="0.0001" value={form.reorderMaximum} onChange={(e) => setForm((f) => ({ ...f, reorderMaximum: e.target.value }))} /></label>
                <label><span>Reorder quantity</span><input type="number" step="0.0001" value={form.reorderQuantity} onChange={(e) => setForm((f) => ({ ...f, reorderQuantity: e.target.value }))} /></label>
                <label><span>Bin location</span>
                  <select value={form.binLocationId} onChange={(e) => setForm((f) => ({ ...f, binLocationId: e.target.value }))}>
                    <option value="">No location assigned</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    <option value={NEW_BIN}>+ Create new bin location…</option>
                  </select>
                </label>
                {form.binLocationId === NEW_BIN && (
                  <>
                    <label><span>New location code *</span><input value={newBinCode} onChange={(e) => setNewBinCode(e.target.value)} placeholder="e.g. A1-03" /></label>
                    <label><span>New location name *</span><input value={newBinName} onChange={(e) => setNewBinName(e.target.value)} placeholder="e.g. Aisle 1 Bin 3" /></label>
                  </>
                )}
                <label className="wide"><span>Notes</span><textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
                <label><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /><span>Active</span></label>

                {/* 2026-09-29 — user request: "how can we add additional
                    part numbers for parts that have superseded numbers
                    and also have group numbers... two different numbers
                    but have multiple entries?" Any number of extra
                    numbers can be attached to this same part — a
                    Superseded number it used to be known by, or a Group
                    number a wider interchangeable range shares — and
                    scanning/typing/importing either one finds this exact
                    part (same stock, same history), not a separate
                    record. Only shown once the part actually exists,
                    since an alternate number attaches to a real partId —
                    a brand-new, unsaved part has nowhere to attach it. */}
                <div className="wide alt-number-editor">
                  <span>Alternate part numbers</span>
                  {!editing ? (
                    <p className="hint-text">Save this part first — you can then edit it to add a superseded or group number.</p>
                  ) : (
                    <>
                      {altNumbers.length > 0 && (
                        <ul className="alt-number-list">
                          {altNumbers.map((a) => (
                            <li key={a.id}>
                              <span className={`status-pill ${a.kind === "SUPERSEDED" ? "tone-amber" : "tone-purple"}`}>{ALT_KIND_LABEL[a.kind]}</span>
                              <span className="mono">{a.number}</span>
                              <button type="button" className="table-action danger" disabled={altBusyId === a.id} onClick={() => void removeAltNumber(a.id)}>
                                {altBusyId === a.id ? <Loader2 className="spin" size={13} /> : <Trash2 size={13} />}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="alt-number-add-row">
                        <select value={newAltKind} onChange={(e) => setNewAltKind(e.target.value as AlternateNumber["kind"])}>
                          <option value="SUPERSEDED">Superseded</option>
                          <option value="GROUP">Group</option>
                        </select>
                        <input value={newAltNumber} onChange={(e) => setNewAltNumber(e.target.value)} placeholder="e.g. OLD-1234" />
                        <button type="button" className="table-action" disabled={altSaving} onClick={() => void addAltNumber()}>
                          {altSaving ? <Loader2 className="spin" size={13} /> : <Plus size={13} />} Add
                        </button>
                      </div>
                      {altError ? <div className="inline-error">{altError}</div> : null}
                      <p className="hint-text">Either number will find this same part everywhere one can be typed — search, jobs, RFQs, job kits, and imports.</p>
                    </>
                  )}
                </div>
              </div>
              {error ? <div className="inline-error">{error}</div> : null}
              <footer><button type="button" className="quiet-button" onClick={() => setOpen(false)}>Cancel</button><button className="gold-button" disabled={saving}>{saving ? <Loader2 className="spin" size={15} /> : null}{saving ? "Saving…" : "Save"}</button></footer>
            </form>
          </aside>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
