import { redirect } from "next/navigation";
import { Building2, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/auth/session";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { SupportContextForm } from "@/components/SupportContextForm";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  requirePlatformPermission(context, "PLATFORM_COMPANIES_VIEW");
  const companies = await prisma.company.findMany({ orderBy: { legalName: "asc" }, select: { id: true, internalCode: true, legalName: true, tradingName: true, status: true } });
  return (
    <main className="platform-page">
      <header className="platform-header"><div><span className="brand-mark small">AX</span><div><p className="eyebrow">Apollo X Platform</p><h1>Company administration</h1></div></div><div><span>{context.displayName}</span><LogoutButton /></div></header>
      <div className="platform-notice"><ShieldCheck size={20} /><div><strong>Explicit tenant access</strong><p>Entering a company creates a short-lived, audited support context. Your platform identity remains visible.</p></div></div>
      <section className="company-list">
        {companies.map((company) => (
          <article key={company.id} className="company-row">
            <Building2 size={20} />
            <div><strong>{company.tradingName ?? company.legalName}</strong><span>{company.internalCode} · {company.status}</span></div>
            <SupportContextForm companyId={company.id} />
          </article>
        ))}
        {companies.length === 0 && <p className="empty-state">No companies have been created yet. Use the Phase 1 seed to create the internal tenant.</p>}
      </section>
    </main>
  );
}
