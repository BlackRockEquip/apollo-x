import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth/session";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { listPlatformCompanies } from "@/lib/platform/admin-service";

export const dynamic = "force-dynamic";

export default async function PlatformCompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  requirePlatformPermission(context, "PLATFORM_COMPANIES_VIEW");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const companies = await listPlatformCompanies(context, { q, status });

  return <><header className="page-header compact"><div><p className="eyebrow">Platform</p><h1>Companies</h1><p>Tenant lifecycle, branding, licensing and support live here.</p></div><div className="header-actions"><Link href="/platform" className="quiet-button">Overview</Link>{/* 2026-09-22, user report: "when clicking add a company, it takes me to
    the overview menu, fix." Used to link to "/platform?create=1" — a query
    param nothing ever read (Overview has no create-company form) — so this
    just opened Overview with no way to actually add a company. Points at
    the new dedicated form instead; see that page's own comment. */}
<Link href="/platform/companies/new" className="gold-button"><Plus size={14} /> Add Company</Link></div></header><section className="master-panel platform-panel"><div className="master-toolbar jobs-toolbar"><form id="platform-company-filter-form" method="GET" action="/platform/companies" className="search-control inventory-search-control"><Search size={15} /><input type="text" name="q" placeholder="Search company name or immutable code" defaultValue={q} /></form><select name="status" defaultValue={status} form="platform-company-filter-form"><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Inactive</option></select><button type="submit" form="platform-company-filter-form" className="quiet-button">Apply</button><span>{companies.length} compan{companies.length === 1 ? "y" : "ies"}</span></div></section><section className="detail-panel"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Company</th><th>Code</th><th>Status</th><th>Users</th><th>Modules</th><th>Support</th><th></th></tr></thead><tbody>{companies.map((company) => <tr key={company.id} className="clickable-row"><td><Link href={`/platform/companies/${company.id}`} className="stretched-link"><strong>{company.tradingName ?? company.legalName}</strong></Link>{company.settings?.themeColor ? <div className="muted small-line">Branding configured</div> : null}</td><td>{company.internalCode}</td><td>{company.status}</td><td>{company._count.memberships}</td><td>{company.enabledModuleCount}</td><td>{company._count.supportTickets}</td><td className="actions"><Link href={`/platform/companies/${company.id}`} className="table-action">Open</Link></td></tr>)}{companies.length === 0 && <tr><td colSpan={7} className="table-state compact-empty-state">No companies found.</td></tr>}</tbody></table></div></section></>;
}
