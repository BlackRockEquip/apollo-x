import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { listDeliveryNoteRegister } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

// 2026-10-29, user request (Engineering): the register of delivery notes. Every job delivery note printed is listed here, newest
// first, with its number (BRE1122-DN1 ...), delivery date, customer and what was on it. Open the job to reprint a note exactly
// as it was issued.
function fmtDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-ZA", { timeZone: "UTC" });
}

const field = (sp: Record<string, string | string[] | undefined>, key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : "");

export default async function DeliveryNoteRegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "JOBS_WIP");
  requireTenantPermission(ctx, "JOBS_VIEW");
  // Engineering only, and not for the view-only WIP user (who sees the work-in-progress table and nothing else).
  if (ctx.industryBuild !== "ENGINEERING" || ctx.tenantRole === "WIP_VIEWER") redirect("/jobs");
  const sp = await searchParams;
  const q = field(sp, "q");
  const from = field(sp, "from");
  const to = field(sp, "to");
  const page = Math.max(1, Number(field(sp, "page")) || 1);
  const data = await listDeliveryNoteRegister(ctx, { q, from, to, page, pageSize: 50 });
  const canSeeCustomers = ctx.tenantPermissions.has("CUSTOMERS_VIEW");
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/jobs/delivery-notes?${query}` : "/jobs/delivery-notes";
  };

  return (
    <div>
      <header className="page-header compact">
        <div>
          <Link href="/jobs" className="back-link"><ArrowLeft size={15} /> Back to jobs</Link>
          <p className="eyebrow">Jobs</p>
          <h1>Delivery notes</h1>
          <p>Every delivery note issued, newest first. Open the job to reprint a note exactly as it was issued.</p>
        </div>
      </header>

      <section className="master-panel jobs-panel">
        <div className="master-toolbar jobs-toolbar">
          <form method="GET" action="/jobs/delivery-notes" className="dn-filter">
            <label className="search-control inventory-search-control">
              <Search size={15} />
              <input name="q" defaultValue={q} placeholder={canSeeCustomers ? "Search note #, job # or customer" : "Search note # or job #"} aria-label="Search delivery notes" />
            </label>
            <label className="dn-date"><span>From</span><input type="date" name="from" defaultValue={from} /></label>
            <label className="dn-date"><span>To</span><input type="date" name="to" defaultValue={to} /></label>
            <button type="submit" className="quiet-button">Apply</button>
            {(q || from || to) && <Link href="/jobs/delivery-notes" className="quiet-button">Clear</Link>}
          </form>
          <span>{data.total} note{data.total === 1 ? "" : "s"}</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table" id="delivery-notes-table">
            <thead>
              <tr>
                <th>Note</th>
                <th>Job</th>
                {canSeeCustomers && <th>Customer</th>}
                <th>Delivery date</th>
                <th>Items</th>
                <th>What was on it</th>
                <th>Issued by</th>
                <th>Issued</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr><td colSpan={canSeeCustomers ? 8 : 7} className="table-state">{q || from || to ? "No delivery notes match." : "No delivery notes have been issued yet. They appear here when a job's delivery note is printed."}</td></tr>
              ) : data.items.map((note) => (
                <tr key={note.id} className="clickable-row">
                  <td><Link href={`/jobs/${note.jobId}`} className="stretched-link"><strong className="mono">{note.number}</strong></Link></td>
                  <td className="mono">{note.jobNumber}</td>
                  {canSeeCustomers && <td>{note.customerName || "—"}</td>}
                  <td>{fmtDate(note.deliveryDate)}</td>
                  <td>{note.itemCount > 0 ? note.itemCount : "—"}</td>
                  <td title={note.summary}>{note.summary || "—"}</td>
                  <td>{note.createdByName || "—"}</td>
                  <td>{fmtDate(note.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="dn-pager">
            {page > 1 ? <Link href={link(page - 1)} className="quiet-button">Previous</Link> : <span />}
            <span>Page {page} of {pages}</span>
            {page < pages ? <Link href={link(page + 1)} className="quiet-button">Next</Link> : <span />}
          </div>
        )}
      </section>
    </div>
  );
}
