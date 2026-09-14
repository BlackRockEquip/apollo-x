import { Search, Plus } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { JobsWipColumnPicker } from "@/components/JobsWipColumnPicker";
import { JobsWipColumnResize } from "@/components/JobsWipColumnResize";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { listJobs } from "@/lib/jobs/service";
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, JOB_WIP_FILTERS } from "@/lib/jobs/ui";
import { getJobsWipColumns } from "@/lib/jobs/wip-columns-service";
import { JOBS_WIP_COLUMNS, type JobsWipColumnId } from "@/lib/jobs/wip-columns";

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
      return <StatusPill status={job.status} />;
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
      return job.salesRepresentative || "—";
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
  const status = typeof sp.status === "string" && sp.status ? sp.status : undefined;
  // pageSize is deliberately high, not the usual ~50 — there's no page-number
  // UI on this list, so it scrolls internally within a fixed-height panel
  // instead (see .jobs-panel .data-table-wrap in globals.css). 5000 is the
  // validated ceiling in jobsListQuery; see the comment there.
  const [data, columns] = await Promise.all([
    listJobs(ctx, { view: ["all", "wip", "completed"].includes(view) ? view : "all", q, type, status, sort: "newest", page: 1, pageSize: 5000 }),
    getJobsWipColumns(ctx),
  ]);
  const canCreate = ctx.tenantPermissions.has("JOBS_CREATE") && ctx.moduleAccess.get("JOBS_WIP") === "FULL";

  return (
    <div>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Jobs</p>
          <h1>Jobs & WIP</h1>
          <p>Create draft jobs, register authoritative BRE numbers, and work live status queues from one workspace.</p>
        </div>
        {canCreate && <Link href="/jobs/new" className="gold-button"><Plus size={16} /> New job</Link>}
      </header>

      <section className="master-panel jobs-panel">
        <div className="master-toolbar jobs-toolbar">
          <form id="jobs-filter-form" method="GET" action="/jobs" className="search-control inventory-search-control">
            <Search size={15} />
            <input type="text" name="q" placeholder="Search BRE, draft, linked job #, customer, machine, component or reference" defaultValue={q} />
            <input type="hidden" name="view" value={view} />
          </form>
          <select name="type" defaultValue={type || ""} form="jobs-filter-form">
            <option value="">All job types</option>
            {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select name="status" defaultValue={status || ""} form="jobs-filter-form">
            <option value="">All statuses</option>
            {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {/* 2026-09-14 — "Move the custom column button selctor and apply
              button to the far right" (explicit request). The item-count
              span already carries the shared .master-toolbar > span rule's
              margin-left:auto, which pushes it — and, in DOM/flex order,
              everything placed after it — to the toolbar's right edge. So
              Apply/Columns moved to after the count span rather than before
              it (their previous position, immediately after the filters). */}
          <span>{data.total} job{data.total === 1 ? "" : "s"}</span>
          <button type="submit" form="jobs-filter-form" className="quiet-button">Apply</button>
          <JobsWipColumnPicker selected={columns} />
        </div>

        <div className="jobs-filter-strip">
          {JOB_WIP_FILTERS.map((filter) => {
            const active = filter.key === "all" ? view === "all" : filter.key === "completed" ? view === "completed" : filter.key === "drafts" ? status === "DRAFT" : false;
            const href = filter.key === "all"
              ? `/jobs?view=all${q ? `&q=${encodeURIComponent(q)}` : ""}`
              : filter.key === "completed"
                ? `/jobs?view=completed${q ? `&q=${encodeURIComponent(q)}` : ""}`
                : filter.key === "drafts"
                  ? `/jobs?view=all&status=DRAFT${q ? `&q=${encodeURIComponent(q)}` : ""}`
                  : `/jobs?view=all&status=${encodeURIComponent(filter.statuses?.[0] ?? "")}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return <Link key={filter.key} href={href} className={active ? "status-chip active" : "status-chip"}>{filter.label}</Link>;
          })}
          <Link href="/jobs?view=wip" className={view === "wip" ? "status-chip active" : "status-chip"}>All WIP</Link>
        </div>

        <div className="data-table-wrap">
          {/* Drag-to-resize (2026-09-14, user request: "Make the job wip
              view table columns custom sizable") — table-layout: fixed
              (see .jobs-wip-resizable in globals.css) so each <col>'s width
              actually governs its column; JobsWipColumnResize wires up the
              per-<th> .col-resize-handle drag against these <col>s and
              restores any previously dragged widths from localStorage. */}
          <table id="jobs-wip-table" className="data-table jobs-wip-resizable">
            <colgroup>
              {columns.map((id) => <col key={id} data-col-id={id} style={{ width: `${COLUMN_DEFAULT_WIDTHS[id] ?? 140}px` }} />)}
              <col data-col-id="__actions" style={{ width: "70px" }} />
            </colgroup>
            <thead><tr>{columns.map((id) => <th key={id}>{COLUMN_LABELS[id]}<span className="col-resize-handle" data-col-id={id} aria-hidden="true" /></th>)}<th></th></tr></thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id} className="clickable-row">
                  {columns.map((id) => <td key={id}>{renderCell(id, job)}</td>)}
                  <td className="actions"><Link href={`/jobs/${job.id}`} className="table-action">Open</Link></td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={columns.length + 1} className="table-state compact-empty-state">No jobs match the current filters.</td></tr>}
            </tbody>
          </table>
          <JobsWipColumnResize tableId="jobs-wip-table" storageKey={JOBS_WIP_COLUMN_WIDTHS_STORAGE_KEY} columns={columns} />
        </div>
      </section>
    </div>
  );
}
