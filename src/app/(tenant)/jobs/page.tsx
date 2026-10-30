import { Fragment } from "react";
import { ChevronRight, FileText, Search, Plus } from "lucide-react";
import Link from "next/link";
import { StatusPill, ReturnUnrepairedPill, BreakdownPill, PexAllocatedPill, jobStatusLabel } from "@/components/StatusPill";
import { ItemsStatusBadge, itemsAreMixed } from "@/components/job-items/ItemsStatusBadge";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ScrollRestore } from "@/components/ScrollRestore";
import { RememberListUrl } from "@/components/RememberListUrl";
import { FitToViewportBottom } from "@/components/FitToViewportBottom";
import { LiveSearchInput } from "@/components/LiveSearchInput";
import { TableColumnFilters } from "@/components/TableColumnFilters";
import { JobsWipColumnPicker } from "@/components/JobsWipColumnPicker";
import { JobsWipColumnResize } from "@/components/JobsWipColumnResize";
import { JobsWipBulkBar } from "@/components/JobsWipBulkBar";
import { JobsWipPrintButton } from "@/components/JobsWipPrintButton";
import { JobsWipEmailButton } from "@/components/JobsWipEmailButton";
import { JobsWipItemsToggle } from "@/components/JobsWipItemsToggle";
import { itemTag, machinistSummary } from "@/lib/jobs/item-model";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { listJobs } from "@/lib/jobs/service";
import { JOB_TYPE_LABELS, etaOverdueDays, jobStatusLabelsFor, jobTypeLabelsFor } from "@/lib/jobs/ui";
import { PO_STATUS_LABELS } from "@/components/job-screen/job-facts";
import { getJobsWipColumns } from "@/lib/jobs/wip-columns-service";
import { JOBS_WIP_COLUMNS, filterColumnsByPermission, wipColumnLabelsFor, type JobsWipColumnId } from "@/lib/jobs/wip-columns";

export const dynamic = "force-dynamic";

type JobRow = Awaited<ReturnType<typeof listJobs>>["items"][number];

const COLUMN_DEFAULT_WIDTHS: Record<JobsWipColumnId, number | undefined> = Object.fromEntries(JOBS_WIP_COLUMNS.map((c) => [c.id, c.defaultWidth])) as Record<JobsWipColumnId, number | undefined>;
// Drag-to-resize (2026-09-14, user request) reads/writes this same
// localStorage key regardless of which columns are currently visible —
// see JobsWipColumnResize.tsx's own header comment for why this is
// per-browser rather than synced through wip-columns-service.ts.
const JOBS_WIP_COLUMN_WIDTHS_STORAGE_KEY = "apollox.jobsWipColumnWidths";

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-ZA");
}

function fmtEnum(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "—";
}

// 2026-10-09 — values the Status column's header filter offers for a job: its
// status label, plus "Return Unrepaired" / "Pex" for the flags that show as
// extra pills beside it (the old Status dropdown had both as entries). Kept
// in step with the pill conditions in renderCell below.
const FILTER_SEP = "|~|";
function statusFilterValues(job: JobRow, build?: string | null): string {
  const values = [jobStatusLabel(job.status, job.returnedUnrepaired, build)];
  // 2026-10-29, Engineering multi-item jobs: a job whose items are at different steps also answers to "Mixed".
  if (itemsAreMixed(job.jobItems?.map((item) => item.status))) values.push("Mixed");
  if (job.returnedUnrepaired && job.status !== "COMPLETE") values.push("Return Unrepaired");
  if (job.breakdown) values.push("Breakdown");
  if (job.pexAsReturn && job.pexAsReturn.status !== "SCRAPPED" && !job.pexAsReturn.consumedByJobId && (job.status !== "TO_BE_RECEIVED" || !job.pexAsReturn.supplyJobId)) values.push("Pex");
  return values.join(FILTER_SEP);
}

// 2026-10-09 — what the in-browser search looks at for a job: the same fields
// the server search used (BRE / job number, linked job, references, machine,
// component, description, and — only for viewers allowed to see customers —
// the customer's name, trading name and account code), lower-cased, one per
// line so a match can't straddle two fields. See searchRows in
// TableColumnFilters.tsx.
function searchText(job: JobRow, canSearchCustomerName: boolean, build: string | null | undefined, allowed: ReadonlySet<string>): string {
  const typeLabels = jobTypeLabelsFor(build);
  const statusLabels = jobStatusLabelsFor(build);
  // A field that sits behind a column permission is only searchable by viewers who may see that column.
  const col = (id: JobsWipColumnId, value: string | null | undefined) => (allowed.has(id) && value ? value : "");
  const day = (id: JobsWipColumnId, value: Date | string | null | undefined) => (allowed.has(id) && value ? fmtDate(value) : "");
  return [
    // Job
    job.jobNumber, job.draftNumber, job.previousJobNumber, job.customerReference, job.customerPo, job.description,
    typeLabels[job.type], statusLabels[job.status],
    col("relationshipNotes", job.relationshipNotes), col("reportNumber", job.reportNumber), col("importTrackingNumber", job.importTrackingNumber), col("plantNumber", job.plantNumber),
    col("salesRepresentative", job.salesRepresentative?.name), job.stripMechanic?.name, job.buildMechanic?.name,
    // Machine and component
    col("machineMake", job.machineMake), job.machineModel, job.machineSerial, job.component, job.componentModel, col("componentType", job.componentType), job.componentSerial, job.componentPartNumber,
    col("machineHours", job.machineHours != null ? String(job.machineHours) : ""),
    // Commercial and logistics
    col("quoteNumber", job.quoteNumber), col("salesOrderNumber", job.salesOrderNumber), col("invoiceNumber", job.invoiceNumber), col("purchaseOrderNumber", job.purchaseOrderNumber),
    col("purchaseOrderStatus", PO_STATUS_LABELS[job.purchaseOrderStatus]), col("deliveryType", job.deliveryType), col("receivingTransport", job.receivingTransport),
    // Dates, written the way the table shows them (e.g. 2026/10/13)
    day("dateReceived", job.dateReceived), day("etaDate", job.etaDate), day("mechanicEtaDate", job.mechanicEtaDate), day("quoteDate", job.quoteDate), day("salesOrderDate", job.salesOrderDate),
    day("invoiceDate", job.invoiceDate), day("purchaseOrderDate", job.purchaseOrderDate), day("deliveryDate", job.deliveryDate), day("paymentDateReceived", job.paymentDateReceived),
    // Customer (only for viewers allowed to see customers)
    ...(canSearchCustomerName ? [job.customer.name, job.customer.tradingName, job.customer.accountCode] : []),
    // 2026-10-29: a multi-item job is found by what its items are too (they sit in the rows under it).
    ...(job.jobItems.length > 1 ? job.jobItems.flatMap((item) => [item.component, item.componentModel, item.componentSerial, item.componentPartNumber, item.machineMake, item.machineModel, item.plantNumber]) : []),
  ].filter(Boolean).join("\n").toLowerCase();
}

// One cell per column id — the jobNumber cell also carries the row's
// whole-row click target (see .stretched-link/.clickable-row in
// globals.css, which positions relative to the <tr> so it works from any
// cell, not just the first one) since jobNumber is the one column that's
// always shown (see JOBS_WIP_COLUMNS' `locked: true`).
function renderCell(columnId: JobsWipColumnId, job: JobRow, build?: string | null, viewOnlyRows = false) {
  switch (columnId) {
    case "jobNumber":
      return <>
        {/* 2026-10-29, user request: a multi-item job opens into its items, like the list mockup (JobsWipItemsToggle flips the row). */}
        {job.jobItems.length > 1 && <button type="button" className="jobs-chev" aria-expanded="false" aria-label={`Show the ${job.jobItems.length} items of job ${job.jobNumber || job.draftNumber}`} title="Show items"><ChevronRight size={15} strokeWidth={2.5} aria-hidden="true" /></button>}
        {viewOnlyRows ? <strong className="mono">{job.jobNumber || job.draftNumber}</strong> : <Link href={`/jobs/${job.id}`} className="stretched-link"><strong className="mono">{job.jobNumber || job.draftNumber}</strong></Link>}
        {job.jobItems.length > 1 && <span className="ji-chip">{job.jobItems.length} items</span>}
      </>;
    case "customerName":
      return job.customer.name;
    case "customerTradingName":
      return job.customer.tradingName || "—";
    case "customerReference":
      return job.customerReference || "—";
    case "customerPo":
      return job.customerPo || "—";
    case "type":
      return jobTypeLabelsFor(build)[job.type];
    case "status":
      // 2026-10-01 — same "pill next to status, folded in once Completed"
      // treatment as the job detail header (JobWorkspace.tsx) — see
      // ReturnUnrepairedPill/jobStatusLabel's own comments in
      // StatusPill.tsx.
      return <>
        {itemsAreMixed(job.jobItems?.map((item) => item.status))
          ? <ItemsStatusBadge statuses={job.jobItems.map((item) => item.status)} jobType={job.type} build={build} size="compact" />
          : <StatusPill status={job.status} returnedUnrepaired={job.returnedUnrepaired} build={build} />}
        {job.returnedUnrepaired && job.status !== "COMPLETE" && <> <ReturnUnrepairedPill /></>}
        {job.breakdown && <> <BreakdownPill /></>}
        {job.pexAsReturn && job.pexAsReturn.status !== "SCRAPPED" && !job.pexAsReturn.consumedByJobId && (job.status !== "TO_BE_RECEIVED" || !job.pexAsReturn.supplyJobId) && <> <PexAllocatedPill /></>}
      </>;
    case "dateReceived":
      return fmtDate(job.dateReceived);
    case "machineMake":
      return job.machineMake || "—";
    case "machineModel":
      return job.machineModel || "—";
    case "machineSerial":
      return job.machineSerial || "—";
    case "component":
      return job.component || "—";
    case "componentType":
      return job.componentType || "—";
    case "componentSerial":
      return job.componentSerial || "—";
    case "componentPartNumber":
      return job.componentPartNumber || "—";
    case "description":
      return job.description || "—";
    case "etaDate":
      return fmtDate(job.etaDate);
    case "mechanicEtaDate":
      return fmtDate(job.mechanicEtaDate);
    case "etaOverdue": {
      // 2026-10-20: days past the ETA, "-" while not yet overdue.
      const days = etaOverdueDays(job.mechanicEtaDate, job.status);
      return days === null ? "-" : <strong>{days}</strong>;
    }
    case "relationshipNotes":
      return job.relationshipNotes || "—";
    case "quoteNumber":
      return job.quoteNumber || "—";
    case "quoteDate":
      return fmtDate(job.quoteDate);
    case "salesOrderNumber":
      return job.salesOrderNumber || "—";
    case "salesOrderDate":
      return fmtDate(job.salesOrderDate);
    case "invoiceNumber":
      return job.invoiceNumber || "—";
    case "invoiceDate":
      return fmtDate(job.invoiceDate);
    case "purchaseOrderNumber":
      return job.purchaseOrderNumber || "—";
    case "purchaseOrderDate":
      return fmtDate(job.purchaseOrderDate);
    case "purchaseOrderStatus":
      return fmtEnum(job.purchaseOrderStatus);
    case "deliveryDate":
      return fmtDate(job.deliveryDate);
    case "deliveryType":
      return fmtEnum(job.deliveryType);
    case "receivingTransport":
      return fmtEnum(job.receivingTransport);
    case "kmsTravelled":
      return job.kmsTravelled != null ? String(job.kmsTravelled) : "—";
    case "paymentDateReceived":
      return fmtDate(job.paymentDateReceived);
    case "machineHours":
      return job.machineHours != null ? job.machineHours.toString() : "—";
    case "plantNumber":
      return job.plantNumber || "—";
    case "reportNumber":
      return job.reportNumber || "—";
    case "importTrackingNumber":
      return job.importTrackingNumber || "—";
    case "previousJobNumber":
      return job.previousJobNumber || "—";
    case "salesRepresentative":
      return job.salesRepresentative?.name || "—";
    case "createdAt":
      return fmtDate(job.createdAt);
    case "updatedAt":
      return new Date(job.updatedAt).toLocaleString("en-ZA");
    default:
      return "—";
  }
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  const COLUMN_LABELS = wipColumnLabelsFor(ctx.industryBuild);
  // Which job fields this viewer may search (the same column permissions as the table).
  const searchableColumns = new Set<string>(filterColumnsByPermission(JOBS_WIP_COLUMNS.map((c) => c.id), ctx.tenantPermissions));
  requireTenantModulePage(ctx, "JOBS_WIP");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const sp = await searchParams;
  // 2026-10-20: the WIP View user type sees the work in progress only (the server enforces it too), in a fixed set of columns.
  const wipViewOnly = ctx.tenantRole === "WIP_VIEWER";
  const view = wipViewOnly ? "wip" : typeof sp.view === "string" ? sp.view : "all";
  const q = typeof sp.q === "string" ? sp.q : "";
  // "" (the unselected-option value on both <select>s below) means "no
  // filter", same as the param being absent entirely — without this,
  // submitting the search form with a filter left on "All ..." passed ""
  // straight through to listJobs's enum validation and threw. See the
  // matching comment on jobsListQuery in src/lib/jobs/validation.ts.
  const type = typeof sp.type === "string" && sp.type ? sp.type : undefined;
  const rawStatus = typeof sp.status === "string" && sp.status ? sp.status : undefined;
  // 2026-10-05 — "PEX" and "RETURNED_UNREPAIRED" in the status dropdown are
  // flag filters, not real JobStatus values: PEX = directly allocated to PEX
  // Inventory, RETURNED_UNREPAIRED = the returnedUnrepaired flag (the
  // chip that used to do this was removed with the filter strip). Everything
  // else passes through as a status as before.
  const pexAllocated = rawStatus === "PEX";
  const status = rawStatus === "PEX" || rawStatus === "RETURNED_UNREPAIRED" ? undefined : rawStatus;
  // 2026-10-01 — backs the "Returned unrepaired" filter chip below, now a
  // flag rather than a status (see JOB_WIP_FILTERS' own comment in
  // jobs/ui.ts).
  const returnedUnrepaired = sp.returnedUnrepaired === "true" || rawStatus === "RETURNED_UNREPAIRED";
  // pageSize is deliberately high, not the usual ~50 — there's no page-number
  // UI on this list, so it scrolls internally within a fixed-height panel
  // instead (see .jobs-panel .data-table-wrap in globals.css). 5000 is the
  // validated ceiling in jobsListQuery; see the comment there.
  // 2026-10-09, user request: Job type and Status filters moved off the toolbar
  // into the table's own column headers (Excel-style, TableColumnFilters.tsx),
  // which filter the rows already on the page. So the page now loads every job
  // that matches the search/view and a ?type= / ?status= link (the dashboard
  // cards use these) just pre-ticks that value in the header filter instead of
  // filtering on the server.
  const include: Record<string, string[]> = {};
  const typeLabels = jobTypeLabelsFor(ctx.industryBuild);
  if (type) include[COLUMN_LABELS.type] = [typeLabels[type as keyof typeof JOB_TYPE_LABELS] ?? type];
  if (pexAllocated) include[COLUMN_LABELS.status] = ["Pex"];
  else if (returnedUnrepaired) include[COLUMN_LABELS.status] = ["Return Unrepaired", jobStatusLabel("COMPLETE", true)];
  else if (status) include[COLUMN_LABELS.status] = status === "COMPLETE" ? [jobStatusLabel("COMPLETE", false, ctx.industryBuild), jobStatusLabel("COMPLETE", true)] : [jobStatusLabel(status, false, ctx.industryBuild)];
  // 2026-10-09, user report: "job wip search bar is very slow". The search now
  // runs in the browser over the loaded rows (LiveSearchInput + TableColumnFilters)
  // instead of asking the server on every keystroke, so the page loads every job
  // for the view WITHOUT the search text. Only if the company has more jobs than
  // one page load can hold (the 5000 cap) does the server keep doing the search.
  const jobsBase = { view: ["all", "wip", "completed"].includes(view) ? view : "all", sort: "newest", page: 1, pageSize: 5000 } as const;
  const [firstLoad, columns] = await Promise.all([
    listJobs(ctx, jobsBase),
    getJobsWipColumns(ctx),
  ]);
  const serverSearch = firstLoad.total > jobsBase.pageSize;
  const data = serverSearch && q ? await listJobs(ctx, { ...jobsBase, q }) : firstLoad;
  const canCreate = ctx.tenantPermissions.has("JOBS_CREATE") && ctx.moduleAccess.get("JOBS_WIP") === "FULL";
  const canSearchCustomerName = ctx.tenantPermissions.has("CUSTOMERS_VIEW");
  // 2026-10-06 — bulk update (see JobsWipBulkBar.tsx). Mirrors the server-side
  // gates in lib/jobs/bulk.ts: status/close/cancel need JOBS_EDIT with a fully
  // licensed Jobs module and are not offered to the restricted USER (mechanic)
  // role; Send to PEX needs PEX_STOCK_TRANSFER_IN with PEX Stock licensed.
  const canBulkEdit = ctx.tenantPermissions.has("JOBS_EDIT") && ctx.moduleAccess.get("JOBS_WIP") === "FULL" && ctx.tenantRole !== "USER";
  const canBulkPex = ctx.tenantPermissions.has("PEX_STOCK_TRANSFER_IN") && ctx.moduleAccess.get("PEX_STOCK") === "FULL" && ctx.tenantRole !== "USER";
  const showSelect = canBulkEdit || canBulkPex;
  // Plain-words description of what's filtered, printed on the Print view.
  const VIEW_LABELS: Record<string, string> = { wip: "Work in progress", completed: "Completed" };
  const filterParts = [
    view !== "all" && VIEW_LABELS[view] ? `View: ${VIEW_LABELS[view]}` : "",
  ].filter(Boolean);
  const clearViewParams = new URLSearchParams();
  if (q) clearViewParams.set("q", q);
  const clearViewHref = clearViewParams.toString() ? `/jobs?${clearViewParams.toString()}` : "/jobs";
  const filterSummary = filterParts.length > 0 ? filterParts.join("  ·  ") : "No filters (all jobs)";

  return (
    <div>
      {/* 2026-09-15, user request: "Refresh faster with changes" — this is
          the main shared work queue, so it's the highest-value place for
          other people's status/field changes to show up without a manual
          reload. See AutoRefresh.tsx's own comment. */}
      {/* 2026-10-20, user request: the WIP View screen should pick up changes quicker - every 10 seconds instead of 20. */}
      <AutoRefresh intervalMs={wipViewOnly ? 10000 : 20000} />
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Jobs</p>
          <h1>Jobs & WIP</h1>
          <p>Create jobs (numbered and registered straight away) and work live status queues from one workspace.</p>
        </div>
        <div className="header-actions">
          {/* 2026-10-29, Engineering: the register of every delivery note issued. */}
          {ctx.industryBuild === "ENGINEERING" && !wipViewOnly && <Link href="/jobs/delivery-notes" className="quiet-button"><FileText size={14} /> Delivery notes</Link>}
          {canCreate && <Link href="/jobs/new" className="gold-button"><Plus size={16} /> New job</Link>}
        </div>
      </header>

      <section className="master-panel jobs-panel">
        <div className="master-toolbar jobs-toolbar">
          <form id="jobs-filter-form" method="GET" action="/jobs" className="search-control inventory-search-control">
            <Search size={15} />
            {/* 2026-10-01 — user request ("Mechanic users - search fields, by
                customer name need to be removed"): the placeholder itself
                advertised "customer" as a searchable field — misleading once
                listJobs stopped matching on it for anyone without
                CUSTOMERS_VIEW (see mapListWhere's own comment in
                jobs/service.ts), so the hint drops "customer" for that same
                audience. */}
            <LiveSearchInput tableId="jobs-wip-table" serverMode={serverSearch} name="q" placeholder={canSearchCustomerName ? "Search anything: job #, customer, machine, component, quote, invoice, PO, status…" : "Search anything: job #, machine, component, quote, invoice, PO, status…"} defaultValue={q} />
            {/* The view (WIP / completed) only rides along while no status is
                chosen — a status is the more specific filter, and keeping both
                made a later status pick combine with the old view. */}
            {!wipViewOnly && view !== "all" && !rawStatus && <input type="hidden" name="view" value={view} />}
          </form>
          {/* 2026-10-09 — Job type / Status dropdowns removed: both now live in the table headers (Excel-style filters). */}
          {/* 2026-09-14 — "Move the custom column button selctor and apply
              button to the far right" (explicit request). The item-count
              span already carries the shared .master-toolbar > span rule's
              margin-left:auto, which pushes it — and, in DOM/flex order,
              everything placed after it — to the toolbar's right edge. So
              Apply/Columns moved to after the count span rather than before
              it (their previous position, immediately after the filters). */}
          {/* Shows (and lets you clear) the WIP / Completed view a dashboard
              link or the old chips can set — otherwise the list is narrower
              than the dropdowns say. */}
          {!wipViewOnly && view !== "all" && VIEW_LABELS[view] && !rawStatus && <Link href={clearViewHref} className="status-chip active" title="Show all jobs">{VIEW_LABELS[view]} ✕</Link>}
          <span>{data.total} job{data.total === 1 ? "" : "s"}</span>
          <JobsWipItemsToggle tableId="jobs-wip-table" />
          {/* 2026-10-01 — `available` (the subset of JOBS_WIP_COLUMNS this
              viewer's role is entitled to) now travels down alongside
              `selected`, so e.g. a Mechanic never even sees "Customer" as a
              checkbox to turn back on — see filterColumnsByPermission in
              wip-columns.ts, and getJobsWipColumns above (the real
              enforcement: that column is never in `columns` to begin
              with). */}
          {!wipViewOnly && <JobsWipColumnPicker build={ctx.industryBuild} selected={columns} available={filterColumnsByPermission(JOBS_WIP_COLUMNS.map((c) => c.id), ctx.tenantPermissions)} />}
          {/* 2026-10-06, user request: "Create a Print view of the table
              however the user filtered or saved the columns". */}
          <JobsWipPrintButton tableId="jobs-wip-table" filterSummary={filterSummary} />
          {/* 2026-10-20, user request: an Email button next to Print that emails the current table view as a PDF. Not for the view-only WIP View user. */}
          {!wipViewOnly && <JobsWipEmailButton tableId="jobs-wip-table" filterSummary={filterSummary} />}
          <TableColumnFilters tableId="jobs-wip-table" storageKey="jobs-wip" noun="job" initialSearch={serverSearch ? "" : q} initialInclude={include} stripParams={["type", "status", "returnedUnrepaired"]} />
        </div>

        {/* 2026-10-05 — user request: "remove the search pills under search
            bar in jobs/wip". The chip strip (All jobs / Collection /
            ... / Completed / All WIP) is gone; the status dropdown above
            covers single statuses, plus the "Pex" and "Returned unrepaired"
            entries, which are flags rather than statuses. */}
        <div className="data-table-wrap">
          {/* Drag-to-resize (2026-09-14, user request: "Make the job wip
              view table columns custom sizable") — table-layout: fixed
              (see .jobs-wip-resizable in globals.css) so each <col>'s width
              actually governs its column; JobsWipColumnResize wires up the
              per-<th> .col-resize-handle drag against these <col>s and
              restores any previously dragged widths from localStorage. */}
          <table id="jobs-wip-table" className="data-table jobs-wip-resizable">
            <colgroup>
              {showSelect && <col data-col-id="__select" style={{ width: "34px" }} />}
              {columns.map((id) => <col key={id} data-col-id={id} style={{ width: `${COLUMN_DEFAULT_WIDTHS[id] ?? 140}px` }} />)}
              {!wipViewOnly && <col data-col-id="__actions" style={{ width: "70px" }} />}
            </colgroup>
            <thead><tr>{showSelect && <th className="jobs-no-print jobs-select-cell"><input type="checkbox" className="jobs-select-all" aria-label="Select all jobs shown" /></th>}{columns.map((id) => <th key={id}>{COLUMN_LABELS[id]}<span className="col-resize-handle" data-col-id={id} aria-hidden="true" /></th>)}{!wipViewOnly && <th className="jobs-no-print"></th>}</tr></thead>
            <tbody>
              {data.items.map((job) => {
                const multi = job.jobItems.length > 1;
                const columnSpan = columns.length + (wipViewOnly ? 0 : 1) + (showSelect ? 1 : 0);
                return (
                  <Fragment key={job.id}>
                    <tr className={wipViewOnly ? undefined : "clickable-row"} data-search={searchText(job, canSearchCustomerName, ctx.industryBuild, searchableColumns)} data-job={(job.jobNumber || "").toLowerCase()} data-prev={(job.previousJobNumber || "").toLowerCase()} data-multi-item={multi ? "1" : undefined} data-job-id={multi ? job.id : undefined}>
                      {showSelect && <td className="jobs-no-print jobs-select-cell"><input type="checkbox" className="jobs-select" data-job-id={job.id} aria-label={`Select job ${job.jobNumber || job.draftNumber}`} /></td>}
                      {columns.map((id) => <td key={id} data-filter-values={id === "status" ? statusFilterValues(job, ctx.industryBuild) : undefined}>{renderCell(id, job, ctx.industryBuild, wipViewOnly)}</td>)}
                      {!wipViewOnly && <td className="actions jobs-no-print"><Link href={`/jobs/${job.id}`} className="table-action">Open</Link></td>}
                    </tr>
                    {/* The items of a multi-item job: one cell across the table (so the column filters, print and email, which read
                        ordinary rows, skip it), shown only while the job row above is expanded. */}
                    {multi && (
                      <tr className="jobs-item-row">
                        <td className="table-state jobs-item-cell" colSpan={columnSpan}>
                          <ul className="jobs-item-list" aria-label={`Items of job ${job.jobNumber || job.draftNumber}`}>
                            {job.jobItems.map((item) => {
                              const eta = item.etaDate ?? job.etaDate;
                              const late = etaOverdueDays(eta, item.status);
                              const machine = [item.machineMake, item.machineModel].filter(Boolean).join(" ") || job.machineModel || "";
                              return (
                                <li key={item.id} className="jobs-item">
                                  <span className="ji-tag">{itemTag(job.jobNumber || job.draftNumber, item.sequence)}</span>
                                  <span className="jobs-item-what"><strong>{item.component || job.component || "Item"}</strong>{item.componentModel ? <span className="jobs-item-model"> {item.componentModel}</span> : null}{item.componentSerial ? <span className="jobs-item-model"> · S/N {item.componentSerial}</span> : null}</span>
                                  <StatusPill status={item.status} build={ctx.industryBuild} />
                                  <span className="jobs-item-machine">{machine || "—"}</span>
                                  <span className="jobs-item-mach" title="Machinists (Assess / Final)">{machinistSummary(item.stripMechanic?.name ?? job.stripMechanic?.name, item.buildMechanic?.name ?? job.buildMechanic?.name) || "—"}</span>
                                  <span className={`jobs-item-eta${late ? " late" : ""}`}>ETA {fmtDate(eta)}{late ? ` · ${late}d late` : ""}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {data.items.length === 0 && <tr><td colSpan={columns.length + (wipViewOnly ? 0 : 1) + (showSelect ? 1 : 0)} className="table-state compact-empty-state">No jobs match the current filters.</td></tr>}
            </tbody>
          </table>
          {showSelect && <JobsWipBulkBar tableId="jobs-wip-table" canEdit={canBulkEdit} canPex={canBulkPex} />}
          <JobsWipColumnResize tableId="jobs-wip-table" storageKey={JOBS_WIP_COLUMN_WIDTHS_STORAGE_KEY} columns={columns} />
          {/* 2026-09-15, user request: "Back button to take you back to
              where you last were." Search/view/type/status are already in
              the URL (this whole page is server-rendered off them), so
              browser Back already restores those correctly — only the
              table's own internal scroll position needed fixing. */}
          <ScrollRestore selector=".jobs-panel .data-table-wrap" storageKey="jobs-wip" />
          {/* 2026-10-09 — remembers this exact filtered URL so a job's "Back to jobs" link returns here, not to a bare /jobs. */}
          <RememberListUrl storageKey="jobs" />
          <FitToViewportBottom selector=".jobs-panel .data-table-wrap" />
        </div>
      </section>
    </div>
  );
}
