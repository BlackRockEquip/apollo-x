import { redirect } from "next/navigation";
import { Activity, AlertTriangle, Building2, Headset, ShieldCheck, Users } from "lucide-react";
import { getRequestContext } from "@/lib/auth/session";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { getPlatformOverview } from "@/lib/platform/admin-service";

type Overview = Awaited<ReturnType<typeof getPlatformOverview>>;

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  requirePlatformPermission(context, "PLATFORM_COMPANIES_VIEW");
  const overview: Overview = await getPlatformOverview(context);
  return <><div className="platform-notice"><ShieldCheck size={20} /><div><strong>Platform overview</strong><p>Summaries, support activity, licensing posture and recent platform operations.</p></div></div><section className="metric-grid compact"><article className="metric-card compact"><Building2 /><span>Total companies</span><strong>{overview.companies}</strong></article><article className="metric-card compact"><Building2 /><span>Active companies</span><strong>{overview.activeCompanies}</strong></article><article className="metric-card compact"><Users /><span>Total users</span><strong>{overview.users}</strong></article><article className="metric-card compact"><Headset /><span>Open support tickets</span><strong>{overview.openTickets}</strong></article><article className="metric-card compact"><AlertTriangle /><span>High / critical tickets</span><strong>{overview.highPriority}</strong></article><article className="metric-card compact"><Activity /><span>Active support sessions</span><strong>{overview.activeSupportSessions}</strong></article></section><section className="platform-grid"><article className="platform-card"><h3>Module entitlements</h3><div className="record-list">{overview.entitlementRows.map((row) => <article key={`${row.module}:${row.status}`}><div className="record-icon">M</div><div><strong>{row.module}</strong><span>{row.status.replaceAll("_", " ")}</span></div><span className="status-pill">{row._count._all}</span></article>)}</div></article><article className="platform-card"><h3>Recent platform activity</h3><div className="history-list">{overview.recentActivity.map((row) => <article key={row.id}><strong>{row.action.replaceAll("_", " ")}</strong><span>{row.entityType} · {row.actor?.displayName || "System"}</span><time>{new Date(row.occurredAt).toLocaleString("en-ZA")}</time></article>)}</div></article></section></>;
}
