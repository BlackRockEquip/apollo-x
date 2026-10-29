import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { PoweredByFlag } from "@/components/PoweredByFlag";
import { demoCtaUrl, demoViewKeyForRole, isDemoMode } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const context = await getRequestContext();
  // 2026-10-29: on the public view-only demo a signed-out visitor is signed in through /demo, never sent to the login screen.
  const demoMode = isDemoMode();
  if (!context) redirect(demoMode ? "/demo" : "/login");
  if (!context.companyId) redirect("/platform");
  const company = await prisma.company.findUnique({ where: { id: context.companyId }, select: { legalName: true, tradingName: true, settings: { select: { logoData: true, logoMimeType: true, hidePoweredBy: true, documentHeaderText: true, documentFooterText: true } } } });
  if (!company) redirect(demoMode ? "/demo" : "/login");
  const logoSrc = company.settings?.logoData && company.settings?.logoMimeType ? `data:${company.settings.logoMimeType};base64,${Buffer.from(company.settings.logoData).toString("base64")}` : null;
  const demo = demoMode ? { viewKey: demoViewKeyForRole(context.tenantRole), ctaUrl: demoCtaUrl() } : null;
  return <><PoweredByFlag hide={!!company.settings?.hidePoweredBy} headerText={company.settings?.documentHeaderText} footerText={company.settings?.documentFooterText} /><AppShell context={context} companyName={company.tradingName?.trim() || company.legalName} logoSrc={logoSrc} demo={demo}>{children}</AppShell></>;
}
