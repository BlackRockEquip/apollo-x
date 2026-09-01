import { Search, Plus } from "lucide-react";
import Link from "next/link";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { listJobs } from "@/lib/jobs/service";
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS, JOB_WIP_FILTERS } from "@/lib/jobs/ui";

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const sp = await searchParams;
  const view = typeof sp.view === "string" ? sp.view : "all";
  const q = typeof sp.q === "string" ? sp.q : "";
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const data = await listJobs(ctx, { view: ["all", "wip", "completed"].includes(view) ? view : "all", q, type, status, sort: "newest", page: 1, pageSize: 50 });
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
            <input type="text" name="q" placeholder="Search BRE, draft, customer, machine, component or reference" defaultValue={q} />
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
          <button type="submit" form="jobs-filter-form" className="quiet-button">Apply</button>
          <span>{data.total} job{data.total === 1 ? "" : "s"}</span>
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
          <table className="data-table">
            <thead><tr><th>Job</th><th>Customer</th><th>Machine / component</th><th>Type</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id}>
                  <td><strong className="mono">{job.jobNumber || job.draftNumber}</strong><div className="muted small-line">{job.customerReference || job.customerPo || "No customer reference"}</div></td>
                  <td><div>{job.customer.name}</div><div className="muted small-line">{job.customer.accountCode || job.customer.tradingName || "—"}</div></td>
                  <td><div>{job.machineModel || "—"}</div><div className="muted small-line">{job.component || job.componentSerial || job.machineSerial || "—"}</div></td>
                  <td>{JOB_TYPE_LABELS[job.type]}</td>
                  <td><span className="status-pill">{JOB_STATUS_LABELS[job.status]}</span></td>
                  <td>{new Date(job.updatedAt).toLocaleString("en-ZA")}</td>
                  <td className="actions"><Link href={`/jobs/${job.id}`} className="table-action">Open</Link></td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={7} className="table-state compact-empty-state">No jobs match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}