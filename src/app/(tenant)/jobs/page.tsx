import { Search, Plus } from "lucide-react";
import Link from "next/link";
import { StatusPill, ReturnUnrepairedPill, PexAllocatedPill } from "@/components/StatusPill";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ScrollRestore } from "@/components/ScrollRestore";
import { FitToViewportBottom } from "@/components/FitToViewportBottom";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { JobsWipColumnPicker } from "@/components/JobsWipColumnPicker";
import { JobsWipColumnResize } from "@/components/JobsWipColumnResize";
import { JobsWipBulkBar } from "@/components/JobsWipBulkBar";
import { JobsWipPrintButton } from "@/components/JobsWipPrintButton";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { listJobs } from "@/lib/jobs/service";
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS } from "@/lib/jobs/ui";
import { getJobsWipColumns } from "@/lib/jobs/wip-columns-service";
import { JOBS_WIP_COLUMNS, filterColumnsByPermission, type JobsWipColumnId } from "@/lib/jobs/wip-columns";

export const dynamic = "force-dynamic";

type JobRow = Awaited<ReturnType<typeof listJobs>>["items"][number];

const COLUMN_LABELS: Record<JobsWipColumnId, string> = Object.fromEntries(JOBS_WIP_COLUMNS.map((c) => [c.id, c.label])) as Record<JobsWipColumnId, string>;
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

// One cell per column id — the jobNumber cell also carries the row's
// whole-row click target (see .stretched-link/.clickable-row in
// globals.css, which positions relative to the <tr> so it works from any
// cell, not just the first one) since jobNumber is the one column that's
// always shown (see JOBS_WIP_COLUMNS' `locked: true`).
function renderCell(columnId: JobsWipColumnId, job: JobRow) {
  switch (columnId) {
    case "jobNumber":
      return <Link href={`/jobs/${job.id}`} className="stretched-link"><strong className="mono">{job.jobNumber || job.draftNumber}</strong></Link>;
    case "customerName":
      return job.customer.name;
    case "customerTradingName":
      return job.customer.tradingName || "—";
    case "customerReference":
      return job.customerReference || "—";
    case "customerPo":
      return job.customerPo || "—";
    case "type":
      return JOB_TYPE_LABELS[job.type];
    case "status":
      // 2026-10-01 — same "pill next to status, folded in once Completed"
      // treatment as the job detail header (JobWorkspace.tsx) — see
      // ReturnUnrepairedPill/jobStatusLabel's own comments in
      // StatusPill.tsx.
      return <>
        <StatusPill status={job.status} returnedUnrepaired={job.returnedUnrepaired} />
        {job.returnedUnrepaired && job.status !== "COMPLETE" && <> <ReturnUnrepairedPill /></>}
        {job.pexAsReturn && job.pexAsReturn.status !== "SCRAPPED" && !job.pexAsReturn.consumedByJobId && job.status !== "TO_BE_RECEIVED" && <> <PexAllocatedPill /></>}
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
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const sp = await searchParams;
  const view = typeof sp.view === "string" ? sp.view : "all";
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
  const [data, columns] = await Promise.all([
    listJobs(ctx, { view: ["all", "wip", "completed"].includes(view) ? view : "all", q, type, status, returnedUnrepaired: returnedUnrepaired || undefined, pexAllocated: pexAllocated || undefined, sort: "newest", page: 1, pageSize: 5000 }),
    getJobsWipColumns(ctx),
  ]);
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
    type ? `Type: ${JOB_TYPE_LABELS[type as keyof typeof JOB_TYPE_LABELS] ?? type}` : "",
    pexAllocated ? "Status: Pex" : returnedUnrepaired ? "Status: Returned unrepaired" : status ? `Status: ${JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS] ?? status}` : "",
    q ? `Search: "${q}"` : "",
  ].filter(Boolean);
  const clearViewParams = new URLSearchParams();
  if (q) clearViewParams.set("q", q);
  if (type) clearViewParams.set("type", type);
  const clearViewHref = clearViewParams.toString() ? `/jobs?${clearViewParams.toString()}` : "/jobs";
  const filterSummary = filterParts.length > 0 ? filterParts.join("  ·  ") : "No filters (all jobs)";

  return (
    <div>
      {/* 2026-09-15, user request: "Refresh faster with changes" — this is
          the main shared work queue, so it's the highest-value place for
          other people's status/field changes to show up without a manual
          reload. See AutoRefresh.tsx's own comment. */}
      <AutoRefresh intervalMs={20000} />
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Jobs</p>
          <h1>Jobs & WIP</h1>
          <p>Create jobs (numbered and registered straight away) and work live status queues from one workspace.</p>
        </div>
        {canCreate && <Link href="/jobs/new" className="gold-button"><Plus size={16} /> New job</Link>}
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
            <input type="text" name="q" placeholder={canSearchCustomerName ? "Search BRE, linked job #, customer, machine, component or reference" : "Search BRE, linked job #, machine, component or reference"} defaultValue={q} />
            {/* The view (WIP / completed) only rides along while no status is
                chosen — a status is the more specific filter, and keeping both
                made a later status pick combine with the old view. */}
            {view !== "all" && !rawStatus && <input type="hidden" name="view" value={view} />}
          </form>
          <AutoSubmitSelect name="type" defaultValue={type || ""} form="jobs-filter-form">
            <option value="">All job types</option>
            {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </AutoSubmitSelect>
          <AutoSubmitSelect name="status" dropWhenChanged="view" defaultValue={pexAllocated ? "PEX" : returnedUnrepaired ? "RETURNED_UNREPAIRED" : status || ""} form="jobs-filter-form">
            <option value="">All statuses</option>
            {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            <option value="PEX">Pex</option>
          </AutoSubmitSelect>
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
          {view !== "all" && VIEW_LABELS[view] && !rawStatus && <Link href={clearViewHref} className="status-chip active" title="Show all jobs">{VIEW_LABELS[view]} ✕</Link>}
          <span>{data.total} job{data.total === 1 ? "" : "s"}</span>
          <button type="submit" form="jobs-filter-form" className="quiet-button">Apply</button>
          {/* 2026-10-01 — `available` (the subset of JOBS_WIP_COLUMNS this
              viewer's role is entitled to) now travels down alongside
              `selected`, so e.g. a Mechanic never even sees "Customer" as a
              checkbox to turn back on — see filterColumnsByPermission in
              wip-columns.ts, and getJobsWipColumns above (the real
              enforcement: that column is never in `columns` to begin
              with). */}
          <JobsWipColumnPicker selected={columns} available={filterColumnsByPermission(JOBS_WIP_COLUMNS.map((c) => c.id), ctx.tenantPermissions)} />
          {/* 2026-10-06, user request: "Create a Print view of the table
              however the user filtered or saved the columns". */}
          <JobsWipPrintButton tableId="jobs-wip-table" filterSummary={filterSummary} />
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
              <col data-col-id="__actions" style={{ width: "70px" }} />
            </colgroup>
            <thead><tr>{showSelect && <th className="jobs-no-print jobs-select-cell"><input type="checkbox" className="jobs-select-all" aria-label="Select all jobs shown" /></th>}{columns.map((id) => <th key={id}>{COLUMN_LABELS[id]}<span className="col-resize-handle" data-col-id={id} aria-hidden="true" /></th>)}<th className="jobs-no-print"></th></tr></thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id} className="clickable-row">
                  {showSelect && <td className="jobs-no-print jobs-select-cell"><input type="checkbox" className="jobs-select" data-job-id={job.id} aria-label={`Select job ${job.jobNumber || job.draftNumber}`} /></td>}
                  {columns.map((id) => <td key={id}>{renderCell(id, job)}</td>)}
                  <td className="actions jobs-no-print"><Link href={`/jobs/${job.id}`} className="table-action">Open</Link></td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={columns.length + 1 + (showSelect ? 1 : 0)} className="table-state compact-empty-state">No jobs match the current filters.</td></tr>}
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
          <FitToViewportBottom selector=".jobs-panel .data-table-wrap" />
        </div>
      </section>
    </div>
  );
}
